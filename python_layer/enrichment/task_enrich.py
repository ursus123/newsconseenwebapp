"""
enrichment/task_enrich.py
---------------------------
Phase D — Enrich Task records with operational intelligence.

No external APIs — derived from:
  - task fields (due_date, status, assigned_to, task_type, priority)
  - analytics.staff_performance (completion rates per assignee)

Writes to analytics.task_enrichment — one row per task.

Columns produced:
  overdue_days              Days past due_date (negative = still in future)
  is_overdue                True if due_date has passed and status != done/completed
  completion_likelihood     0–100: based on assignee's historical completion rate
  assignee_workload         Count of open tasks assigned to same person
  sla_risk                  green | amber | red
  priority_score            0–100 derived from priority field + overdue_days
"""

import logging
from datetime import datetime, timezone

import pandas as pd

logger = logging.getLogger(__name__)

_NOW = datetime.now(timezone.utc).date()

_DONE_STATUSES = frozenset([
    "done", "completed", "closed", "resolved", "finished",
    "approved", "delivered", "achieved",
])

_PRIORITY_WEIGHTS = {
    "critical": 100, "urgent": 85, "high": 65,
    "medium": 40, "normal": 40, "low": 20, "": 30,
}


def enrich_tasks(
    tasks_df: pd.DataFrame,
    staff_performance_df: pd.DataFrame,   # analytics.staff_performance (optional)
    company_id: str,
    force: bool = False,
) -> pd.DataFrame:
    """
    Enrich task records for a given company_id.

    Parameters
    ----------
    tasks_df             : raw.tasks for this company
    staff_performance_df : analytics.staff_performance (for completion rate lookup)
    company_id           : tenant filter
    """
    if tasks_df.empty:
        return pd.DataFrame()

    tsk = tasks_df[tasks_df["company_id"] == company_id].copy() \
          if "company_id" in tasks_df.columns else tasks_df.copy()
    if tsk.empty:
        return pd.DataFrame()

    # Build assignee workload map (count of open tasks per person)
    workload_map = _build_workload_map(tsk)

    # Build completion rate map from staff_performance
    completion_map = _build_completion_map(staff_performance_df, company_id)

    rows = []
    for _, t in tsk.iterrows():
        row: dict = {
            "company_id": company_id,
            "task_id":    str(t.get("id", "") or ""),
            "task_type":  str(t.get("task_type", "") or ""),
            "status":     str(t.get("status", "") or "").lower(),
            "priority":   str(t.get("priority", "") or "").lower(),
            "assigned_to": str(t.get("assigned_to", t.get("person_id", "")) or ""),
        }

        is_done = row["status"] in _DONE_STATUSES

        # ── Overdue ───────────────────────────────────────────────────────────
        due_date = _parse_date(t.get("due_date") or t.get("deadline"))
        if due_date and not is_done:
            overdue_days = (_NOW - due_date).days
            row["overdue_days"] = overdue_days
            row["is_overdue"]   = overdue_days > 0
        else:
            row["overdue_days"] = 0
            row["is_overdue"]   = False

        # ── Assignee workload ─────────────────────────────────────────────────
        assignee = row["assigned_to"]
        row["assignee_workload"] = workload_map.get(assignee, 0) if assignee else 0

        # ── Completion likelihood ─────────────────────────────────────────────
        base_rate = completion_map.get(assignee, 75.0)   # default 75% if no history
        # Adjust for workload pressure
        workload_penalty = min(30, row["assignee_workload"] * 3)
        overdue_boost    = min(10, max(0, -row["overdue_days"]) * 2)   # future due = slight boost
        likelihood = round(max(0.0, min(100.0, base_rate - workload_penalty + overdue_boost)), 1)
        row["completion_likelihood"] = likelihood

        # ── Priority score ────────────────────────────────────────────────────
        base_priority = _PRIORITY_WEIGHTS.get(row["priority"], 30)
        overdue_boost  = min(40, max(0, row["overdue_days"]) * 2) if row["is_overdue"] else 0
        row["priority_score"] = min(100, base_priority + overdue_boost)

        # ── SLA risk ──────────────────────────────────────────────────────────
        overdue = row["overdue_days"]
        if is_done:
            sla_risk = "green"
        elif overdue > 7:
            sla_risk = "red"
        elif overdue > 0 or row["assignee_workload"] > 10 or likelihood < 50:
            sla_risk = "amber"
        else:
            sla_risk = "green"
        row["sla_risk"] = sla_risk

        row["enriched_at"] = pd.Timestamp.now(tz="UTC").isoformat()
        rows.append(row)

    logger.info("task_enrich: %d tasks processed (company=%s)", len(rows), company_id)
    return pd.DataFrame(rows)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _build_workload_map(df: pd.DataFrame) -> dict:
    """Count of open (not-done) tasks per assigned_to person."""
    result: dict = {}
    done = _DONE_STATUSES
    for _, t in df.iterrows():
        status   = str(t.get("status", "") or "").lower()
        assignee = str(t.get("assigned_to", t.get("person_id", "")) or "")
        if assignee and status not in done:
            result[assignee] = result.get(assignee, 0) + 1
    return result


def _build_completion_map(perf_df: pd.DataFrame, company_id: str) -> dict:
    """Map person_id → completion_rate from analytics.staff_performance."""
    if perf_df is None or perf_df.empty:
        return {}
    mask = perf_df["company_id"] == company_id if "company_id" in perf_df.columns else pd.Series([True] * len(perf_df))
    subset = perf_df[mask]
    result: dict = {}
    for _, s in subset.iterrows():
        pid  = str(s.get("person_id", "") or "")
        rate = s.get("task_completion_rate") or s.get("completion_rate")
        if pid and rate is not None:
            try:
                result[pid] = float(rate)
            except (TypeError, ValueError):
                pass
    return result


def _parse_date(val) -> "datetime.date | None":
    if not val:
        return None
    try:
        return datetime.fromisoformat(str(val)[:10]).date()
    except (ValueError, TypeError):
        return None
