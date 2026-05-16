import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_supabase_entity_to_df

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Columns required for a meaningful transform.
# If Base44 returns a partial response missing these,
# we log a warning and return empty rather than crash.
# ----------------------------------------------------------
REQUIRED_COLUMNS = {"id", "status"}

# ----------------------------------------------------------
# Columns used in groupBy — only included if present in df.
# This makes the transform safe against partial Base44 responses.
# ----------------------------------------------------------
GROUP_COLUMNS = [
    "enterprise_id",
    "company_id",
    "task_type",
    "status",
]


def extract_tasks() -> pd.DataFrame:
    """
    Extract all task records from Base44.
    Returns raw DataFrame — no transformation applied here.
    """
    return fetch_supabase_entity_to_df("tasks")


def transform_tasks(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform raw task records into a summary suitable for
    appending to the Railway analytics.task_summary table.

    Produces per-group metrics:
        total_tasks              — all tasks in this group
        completed_tasks          — tasks with status = "completed"
        completion_rate_pct      — completed / total * 100, rounded to 1dp
        overdue_tasks            — past due_date and not completed
        tasks_last_7d            — created in the last 7 days
        tasks_last_30d           — created in the last 30 days
        refused_tasks            — outcome = "refused"
        missed_tasks             — outcome = "missed"
        avg_completion_delay_mins — mean delta between scheduled_time and
                                   actual_completion_time (minutes, completed tasks)
        total_quantity_used      — sum of quantity_used across completed tasks

    Groups by: enterprise_id, company_id, task_type, status
    (any group column missing from df is skipped safely)
    """
    if df.empty:
        logger.warning("transform_tasks: received empty DataFrame")
        return _empty_summary()

    # ----------------------------------------------------------
    # Validate required columns
    # ----------------------------------------------------------
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        logger.error(
            "transform_tasks: missing required columns %s — returning empty",
            missing,
        )
        return _empty_summary()

    df = df.copy()

    # ----------------------------------------------------------
    # Parse dates
    # ----------------------------------------------------------
    now = datetime.now(timezone.utc)

    df["created_date"] = pd.to_datetime(df.get("created_date"), errors="coerce", utc=True)
    df["due_date"] = pd.to_datetime(df.get("due_date"), errors="coerce", utc=True)

    # ----------------------------------------------------------
    # Derived boolean columns — computed once, aggregated below
    # ----------------------------------------------------------
    df["is_completed"] = df["status"] == "completed"

    df["is_overdue"] = (
        df["due_date"].notna()
        & (df["due_date"] < now)
        & ~df["is_completed"]
    )

    df["created_last_7d"] = (
        df["created_date"].notna()
        & (df["created_date"] >= now - pd.Timedelta(days=7))
    )

    df["created_last_30d"] = (
        df["created_date"].notna()
        & (df["created_date"] >= now - pd.Timedelta(days=30))
    )

    # ----------------------------------------------------------
    # Gap 1 — outcome reason: refused and missed counts
    # ----------------------------------------------------------
    outcome_col = df.get("outcome", pd.Series(dtype="object"))
    df["is_refused"] = outcome_col == "refused"
    df["is_missed"]  = outcome_col == "missed"

    # ----------------------------------------------------------
    # Gap 2 — schedule adherence: scheduled_time vs actual_completion_time
    # Parse both as today's date + time string → timedelta in minutes.
    # Only meaningful on completed tasks with both fields present.
    # ----------------------------------------------------------
    def _time_to_minutes(series):
        """Convert 'HH:MM' string series to minutes-since-midnight float."""
        def _parse(v):
            try:
                h, m = str(v).split(":")[:2]
                return int(h) * 60 + int(m)
            except Exception:
                return None
        return series.apply(_parse)

    if "scheduled_time" in df.columns and "actual_completion_time" in df.columns:
        sched_mins  = _time_to_minutes(df["scheduled_time"])
        actual_mins = _time_to_minutes(df["actual_completion_time"])
        delay = actual_mins - sched_mins
        # Only count delay on completed tasks where both values are present
        mask = df["is_completed"] & sched_mins.notna() & actual_mins.notna()
        df["completion_delay_mins"] = delay.where(mask)
    else:
        df["completion_delay_mins"] = None

    # ----------------------------------------------------------
    # Gap 3 — quantity consumed per task
    # ----------------------------------------------------------
    if "quantity_used" in df.columns:
        df["quantity_used_num"] = pd.to_numeric(df["quantity_used"], errors="coerce")
    else:
        df["quantity_used_num"] = 0.0

    # ----------------------------------------------------------
    # Safe groupBy — only use columns that exist in df
    # ----------------------------------------------------------
    group_cols = [c for c in GROUP_COLUMNS if c in df.columns]

    if not group_cols:
        logger.warning(
            "transform_tasks: none of %s found in df — "
            "summary will have no grouping keys",
            GROUP_COLUMNS,
        )

    summary = (
        df.groupby(group_cols, dropna=False)
        .agg(
            total_tasks=("id", "count"),
            completed_tasks=("is_completed", "sum"),
            overdue_tasks=("is_overdue", "sum"),
            tasks_last_7d=("created_last_7d", "sum"),
            tasks_last_30d=("created_last_30d", "sum"),
            refused_tasks=("is_refused", "sum"),
            missed_tasks=("is_missed", "sum"),
            avg_completion_delay_mins=("completion_delay_mins", "mean"),
            total_quantity_used=("quantity_used_num", "sum"),
        )
        .reset_index()
    )

    # ----------------------------------------------------------
    # Completion rate — safe division, 0.0 when total is zero
    # ----------------------------------------------------------
    summary["completion_rate_pct"] = (
        (summary["completed_tasks"] / summary["total_tasks"].replace(0, pd.NA))
        * 100
    ).round(1).fillna(0.0)

    # Cast integer columns — agg returns float when NaN is present
    for col in ["total_tasks", "completed_tasks", "overdue_tasks",
                "tasks_last_7d", "tasks_last_30d", "refused_tasks", "missed_tasks"]:
        summary[col] = summary[col].fillna(0).astype(int)

    summary["avg_completion_delay_mins"] = summary["avg_completion_delay_mins"].round(1)
    summary["total_quantity_used"] = summary["total_quantity_used"].fillna(0.0).round(2)

    logger.info(
        "transform_tasks: produced %d summary rows from %d raw records",
        len(summary), len(df),
    )

    return summary


def _empty_summary() -> pd.DataFrame:
    """
    Return a typed empty DataFrame matching the transform output schema.
    Used when input is empty or missing required columns.
    load_dataframe() will skip writing this — no false zero snapshots.
    """
    return pd.DataFrame(columns=[
        "enterprise_id",
        "company_id",
        "task_type",
        "status",
        "total_tasks",
        "completed_tasks",
        "completion_rate_pct",
        "overdue_tasks",
        "tasks_last_7d",
        "tasks_last_30d",
        "refused_tasks",
        "missed_tasks",
        "avg_completion_delay_mins",
        "total_quantity_used",
    ])
