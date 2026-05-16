"""
python_layer/etl/time.py
========================
ETL for analytics.time_summary — daily attendance and clock-in/out analysis.

Clock data lives in Base44 Tasks as rows where:
  task_type IN ('clock_in', 'clock_out', 'break_start', 'break_end')

One row per person per day is produced, with:
  total_hours  = clock_out - clock_in (wall time)
  break_hours  = sum of break durations
  net_hours    = total_hours - break_hours
  utilisation  = net_hours / scheduled_hours * 100  (if scheduled_hours set)
  is_overtime  = net_hours > 8
"""

import logging
from datetime import datetime, date, timezone, timedelta
from typing import Optional

import pandas as pd

from etl.base import fetch_supabase_entity_to_df

logger = logging.getLogger(__name__)

CLOCK_TYPES = {"clock_in", "clock_out", "break_start", "break_end"}

# Default scheduled shift (hours) when not on the record
DEFAULT_SCHEDULED_HOURS = 8.0
OVERTIME_THRESHOLD_HOURS = 8.0


def extract_time_tasks() -> pd.DataFrame:
    """
    Extract all task records from Base44, then filter to clock-related types.
    Returns raw DataFrame — no transformation applied here.
    """
    df = fetch_supabase_entity_to_df("tasks")
    if df.empty:
        return df
    if "task_type" not in df.columns:
        logger.warning("extract_time_tasks: 'task_type' column missing from tasks extract")
        return pd.DataFrame()
    clock_mask = df["task_type"].str.lower().isin(CLOCK_TYPES)
    return df[clock_mask].copy()


def _parse_datetime(date_str: Optional[str], time_str: Optional[str]) -> Optional[datetime]:
    """
    Combine a date string (YYYY-MM-DD) and optional time string (HH:MM or HH:MM:SS)
    into a UTC datetime. Returns None on any parse failure.
    """
    if not date_str:
        return None
    try:
        d = datetime.fromisoformat(str(date_str).split("T")[0]).date()
        if time_str:
            t_clean = str(time_str).strip()
            # Accept HH:MM or HH:MM:SS
            parts = t_clean.split(":")
            if len(parts) >= 2:
                h, m = int(parts[0]), int(parts[1])
                s = int(parts[2]) if len(parts) > 2 else 0
                return datetime(d.year, d.month, d.day, h, m, s, tzinfo=timezone.utc)
        # No time — use midnight
        return datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=timezone.utc)
    except Exception as e:
        logger.debug("_parse_datetime: could not parse date=%s time=%s: %s", date_str, time_str, e)
        return None


def transform_time_summary(df: pd.DataFrame) -> pd.DataFrame:
    """
    Collapse clock-in/out task rows into one summary row per (company_id, person_id, date).

    Returns a DataFrame matching analytics.time_summary schema.
    """
    if df.empty:
        return _empty_summary()

    df = df.copy()

    # Normalise task_type to lowercase
    df["task_type"] = df["task_type"].str.lower().fillna("")

    # Resolve person_id — try multiple column names
    for col in ("person_id", "assigned_to", "assignee_id"):
        if col in df.columns:
            df["_person_id"] = df[col].fillna("").astype(str)
            break
    else:
        df["_person_id"] = ""

    # Resolve person_name
    for col in ("assignee_name", "person_name", "assigned_to_name"):
        if col in df.columns:
            df["_person_name"] = df[col].fillna("").astype(str)
            break
    else:
        df["_person_name"] = df["_person_id"]

    # Resolve enterprise
    df["_enterprise_id"]   = df.get("enterprise_id",   pd.Series("", index=df.index)).fillna("").astype(str)
    df["_enterprise_name"] = df.get("enterprise_name", pd.Series("", index=df.index)).fillna("").astype(str)
    df["_company_id"]      = df.get("company_id",      pd.Series("", index=df.index)).fillna("").astype(str)

    # Parse datetime — combine scheduled_date + scheduled_time
    date_col = next((c for c in ("scheduled_date", "due_date", "created_date") if c in df.columns), None)
    time_col = next((c for c in ("scheduled_time", "start_time") if c in df.columns), None)

    df["_dt"] = df.apply(
        lambda r: _parse_datetime(
            r.get(date_col) if date_col else None,
            r.get(time_col) if time_col else None,
        ),
        axis=1,
    )

    # Drop rows with no parseable datetime
    df = df[df["_dt"].notna()].copy()
    if df.empty:
        logger.warning("transform_time_summary: no rows with parseable datetime")
        return _empty_summary()

    df["_date"] = df["_dt"].apply(lambda dt: dt.date())

    # Group key
    group_key = ["_company_id", "_person_id", "_date"]

    rows = []
    today = date.today()

    for (company_id, person_id, work_date), grp in df.groupby(group_key, dropna=False):
        if not person_id:
            continue  # skip unassigned clock events

        # ── Times for each event type ─────────────────────────────────────────
        clock_ins    = sorted(grp[grp["task_type"] == "clock_in"]["_dt"].dropna().tolist())
        clock_outs   = sorted(grp[grp["task_type"] == "clock_out"]["_dt"].dropna().tolist())
        break_starts = sorted(grp[grp["task_type"] == "break_start"]["_dt"].dropna().tolist())
        break_ends   = sorted(grp[grp["task_type"] == "break_end"]["_dt"].dropna().tolist())

        # First clock-in and last clock-out for the day
        first_in  = clock_ins[0]  if clock_ins  else None
        last_out  = clock_outs[-1] if clock_outs else None

        # Total wall-clock hours (clock_out - clock_in)
        total_hours: float = 0.0
        if first_in and last_out and last_out > first_in:
            total_hours = (last_out - first_in).total_seconds() / 3600

        # Break hours — pair break_start → break_end
        break_hours: float = 0.0
        for bs, be in zip(break_starts, break_ends):
            if be > bs:
                break_hours += (be - bs).total_seconds() / 3600

        net_hours = max(0.0, total_hours - break_hours)

        # Scheduled hours — from record if present, else default
        sched_col = next((c for c in ("scheduled_hours", "duration_hours", "estimated_hours") if c in grp.columns), None)
        if sched_col:
            sched_vals = grp[sched_col].dropna()
            scheduled_hours = float(sched_vals.iloc[0]) if not sched_vals.empty else DEFAULT_SCHEDULED_HOURS
        else:
            scheduled_hours = DEFAULT_SCHEDULED_HOURS

        utilisation_pct = round(net_hours / scheduled_hours * 100, 1) if scheduled_hours > 0 else None
        is_overtime     = net_hours > OVERTIME_THRESHOLD_HOURS

        # Week start (Monday)
        week_start = work_date - timedelta(days=work_date.weekday())

        # Person name — use most common non-empty value in the group
        person_names = grp["_person_name"].dropna().tolist()
        person_name  = max(set(person_names), key=person_names.count) if person_names else person_id

        ent_ids   = grp["_enterprise_id"].dropna().tolist()
        ent_names = grp["_enterprise_name"].dropna().tolist()
        enterprise_id   = max(set(ent_ids),   key=ent_ids.count)   if ent_ids   else ""
        enterprise_name = max(set(ent_names), key=ent_names.count) if ent_names else ""

        rows.append({
            "company_id":       company_id,
            "person_id":        person_id,
            "person_name":      person_name,
            "enterprise_id":    enterprise_id,
            "enterprise_name":  enterprise_name,
            "work_date":        work_date,
            "week_start":       week_start,
            "clock_in_time":    first_in.strftime("%H:%M")  if first_in  else None,
            "clock_out_time":   last_out.strftime("%H:%M")  if last_out  else None,
            "total_hours":      round(total_hours, 2),
            "break_hours":      round(break_hours, 2),
            "net_hours":        round(net_hours, 2),
            "is_overtime":      is_overtime,
            "scheduled_hours":  scheduled_hours,
            "utilisation_pct":  utilisation_pct,
            "snapshot_date":    today,
        })

    if not rows:
        return _empty_summary()

    summary = pd.DataFrame(rows)
    logger.info(
        "transform_time_summary: produced %d day-person rows from %d clock events",
        len(summary), len(df),
    )
    return summary


def _empty_summary() -> pd.DataFrame:
    """Typed empty DataFrame matching analytics.time_summary schema."""
    return pd.DataFrame(columns=[
        "company_id", "person_id", "person_name",
        "enterprise_id", "enterprise_name",
        "work_date", "week_start",
        "clock_in_time", "clock_out_time",
        "total_hours", "break_hours", "net_hours",
        "is_overtime", "scheduled_hours", "utilisation_pct",
        "snapshot_date",
    ])
