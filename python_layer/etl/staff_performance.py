"""
etl/staff_performance.py
------------------------
analytics.staff_performance — one row per (company_id, person_id) for every
staff member.

Powers the Staffing Agent, copilot get_staff_performance tool, and the
staffing intelligence dashboard widget.

Columns produced:
    company_id
    person_id
    person_name
    person_subtype          (role/job title from MasterDataOption)
    enterprise_name         primary linked enterprise

    -- Task throughput --
    tasks_assigned_total     total tasks assigned to this person
    tasks_completed_total    total tasks completed
    tasks_open               currently open/in_progress
    tasks_overdue            tasks past due_date not completed
    completion_rate_pct      completed / assigned * 100
    avg_completion_days      mean days from task created → completed

    -- Time windows --
    tasks_completed_30d      tasks completed in last 30 days
    tasks_completed_7d       tasks completed in last 7 days

    -- SLA --
    sla_breach_count         tasks completed after their due_date
    sla_breach_rate_pct      sla_breach_count / tasks_completed * 100
    on_time_rate_pct         complement of sla_breach_rate_pct

    -- Utilization --
    tasks_per_day_30d        tasks_completed_30d / 30
    workload_score           open tasks / avg peer open tasks (>1 = overloaded)

    -- Status --
    availability_status      from Person.availability_status
    current_status           from Person.status
"""

import logging

import pandas as pd

logger = logging.getLogger(__name__)

_STAFF_TYPES = {
    "staff", "employee", "contractor", "freelancer",
    "driver", "teacher", "nurse", "agent",
}


def transform_staff_performance(
    people_df: pd.DataFrame,
    tasks_df: pd.DataFrame,
    relationships_df: pd.DataFrame,
) -> pd.DataFrame:
    """Build analytics.staff_performance — one row per staff member per company."""
    now_ts = pd.Timestamp.now(tz="UTC")

    if people_df.empty:
        logger.warning("transform_staff_performance: empty people_df — returning empty")
        return pd.DataFrame()

    # ── Filter to staff ───────────────────────────────────────────────────────
    ppl = people_df.copy()
    pt_col = ppl.get("person_type", pd.Series("", index=ppl.index)).fillna("").str.lower().str.strip()
    staff = ppl[pt_col.isin(_STAFF_TYPES)].copy()

    if staff.empty:
        logger.info("transform_staff_performance: no staff-type people found")
        return pd.DataFrame()

    # ── Build name column ─────────────────────────────────────────────────────
    if "full_name" in staff.columns:
        staff["_name"] = staff["full_name"].fillna("")
    else:
        fn = staff.get("first_name", pd.Series("", index=staff.index)).fillna("")
        ln = staff.get("last_name",  pd.Series("", index=staff.index)).fillna("")
        staff["_name"] = (fn + " " + ln).str.strip()

    # ── Build primary enterprise from relationships ───────────────────────────
    ent_map: dict = {}
    if not relationships_df.empty and "relationship_type" in relationships_df.columns:
        pe_rels = relationships_df[
            relationships_df["relationship_type"].isin({
                "person_enterprise", "employment", "staff_assignment",
            })
            & (relationships_df.get("status", pd.Series("", index=relationships_df.index))
               .fillna("").str.lower() != "ended")
        ]
        if "person_id" in pe_rels.columns and "enterprise_name" in pe_rels.columns:
            for _, r in pe_rels.iterrows():
                pid = r.get("person_id")
                ename = r.get("enterprise_name")
                if pid and ename and str(pid) not in ent_map:
                    ent_map[str(pid)] = str(ename)

    # ── Index tasks by assigned person ───────────────────────────────────────
    # Tasks link to staff via assigned_to_email or assigned_to (name string)
    tasks_by_email: dict = {}
    tasks_by_name:  dict = {}
    if not tasks_df.empty:
        tsk = tasks_df.copy()
        tsk["_due"]       = pd.to_datetime(tsk.get("due_date"),     errors="coerce", utc=True)
        tsk["_created"]   = pd.to_datetime(tsk.get("created_date"), errors="coerce", utc=True)
        tsk["_updated"]   = pd.to_datetime(tsk.get("updated_date"), errors="coerce", utc=True)
        tsk["_st"]        = tsk.get("status", pd.Series("", index=tsk.index)).fillna("").str.lower().str.strip()

        if "assigned_to_email" in tsk.columns:
            for email, grp in tsk.groupby("assigned_to_email", dropna=True):
                tasks_by_email[str(email).lower()] = grp

        assigned_col = next((c for c in ["assigned_to", "assigned_staff", "staff_name"]
                             if c in tsk.columns), None)
        if assigned_col:
            for name, grp in tsk.groupby(assigned_col, dropna=True):
                tasks_by_name[str(name).strip().lower()] = grp

    # ── Per-company average open tasks (for workload_score) ───────────────────
    company_avg_open: dict = {}  # cid -> avg open tasks per staff

    # ── Build one row per staff member ────────────────────────────────────────
    rows = []
    for _, person in staff.iterrows():
        cid   = str(person.get("company_id", "") or "")
        pid   = str(person.get("id", "") or "")
        pname = str(person.get("_name", "") or "")
        email = str(person.get("email", "") or "").lower()

        # Get tasks for this person
        ptx = (
            tasks_by_email.get(email)
            if email
            else None
        ) or tasks_by_name.get(pname.lower(), pd.DataFrame())

        # Filter to same company
        if not ptx.empty and "company_id" in ptx.columns:
            ptx = ptx[ptx["company_id"] == cid]

        row: dict = {
            "company_id":           cid,
            "person_id":            pid,
            "person_name":          pname,
            "person_subtype":       str(person.get("person_subtype", "") or ""),
            "enterprise_name":      ent_map.get(pid, ""),
            "availability_status":  str(person.get("availability_status", "") or ""),
            "current_status":       str(person.get("status", "") or ""),
        }

        if not ptx.empty:
            cutoff_30d = now_ts - pd.Timedelta(days=30)
            cutoff_7d  = now_ts - pd.Timedelta(days=7)

            total    = len(ptx)
            completed_mask = ptx["_st"] == "completed"
            open_mask      = ptx["_st"].isin({"open", "in_progress"})
            overdue_mask   = (
                ptx["_due"].notna()
                & (ptx["_due"] < now_ts)
                & ~ptx["_st"].isin({"completed", "cancelled"})
            )
            completed_30d_mask = completed_mask & ptx["_updated"].notna() & (ptx["_updated"] >= cutoff_30d)
            completed_7d_mask  = completed_mask & ptx["_updated"].notna() & (ptx["_updated"] >= cutoff_7d)

            row["tasks_assigned_total"]  = total
            row["tasks_completed_total"] = int(completed_mask.sum())
            row["tasks_open"]            = int(open_mask.sum())
            row["tasks_overdue"]         = int(overdue_mask.sum())
            row["tasks_completed_30d"]   = int(completed_30d_mask.sum())
            row["tasks_completed_7d"]    = int(completed_7d_mask.sum())
            row["completion_rate_pct"]   = (
                round(row["tasks_completed_total"] / total * 100, 1) if total > 0 else 0.0
            )
            row["tasks_per_day_30d"] = round(row["tasks_completed_30d"] / 30, 2)

            # Avg completion days
            comp = ptx[completed_mask & ptx["_created"].notna() & ptx["_updated"].notna()]
            if not comp.empty:
                days = (comp["_updated"] - comp["_created"]).dt.total_seconds().div(86400)
                row["avg_completion_days"] = round(float(days.mean()), 1)
            else:
                row["avg_completion_days"] = None

            # SLA breach: completed after due_date
            sla_breach = ptx[
                completed_mask
                & ptx["_due"].notna()
                & ptx["_updated"].notna()
                & (ptx["_updated"] > ptx["_due"])
            ]
            row["sla_breach_count"]    = len(sla_breach)
            comp_total = row["tasks_completed_total"]
            row["sla_breach_rate_pct"] = (
                round(len(sla_breach) / comp_total * 100, 1) if comp_total > 0 else 0.0
            )
            row["on_time_rate_pct"] = round(100.0 - row["sla_breach_rate_pct"], 1)
        else:
            row.update({
                "tasks_assigned_total": 0, "tasks_completed_total": 0,
                "tasks_open": 0, "tasks_overdue": 0,
                "tasks_completed_30d": 0, "tasks_completed_7d": 0,
                "completion_rate_pct": 0.0, "tasks_per_day_30d": 0.0,
                "avg_completion_days": None,
                "sla_breach_count": 0, "sla_breach_rate_pct": 0.0, "on_time_rate_pct": 100.0,
            })

        rows.append(row)

    if not rows:
        return pd.DataFrame()

    df_out = pd.DataFrame(rows)

    # ── Workload score per company ─────────────────────────────────────────────
    for cid, grp in df_out.groupby("company_id", dropna=True):
        avg_open = grp["tasks_open"].mean()
        company_avg_open[cid] = avg_open if avg_open > 0 else 1
    df_out["workload_score"] = df_out.apply(
        lambda r: round(r["tasks_open"] / company_avg_open.get(r["company_id"], 1), 2),
        axis=1,
    )

    logger.info(
        "transform_staff_performance: produced %d rows across %d companies",
        len(df_out), df_out["company_id"].nunique(),
    )
    return df_out
