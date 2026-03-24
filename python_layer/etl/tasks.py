import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_json_to_df
from config import settings

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
    return fetch_json_to_df(settings.base44_tasks_url)


def transform_tasks(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform raw task records into a summary suitable for
    appending to the Railway analytics.task_summary table.

    Produces per-group metrics:
        total_tasks         — all tasks in this group
        completed_tasks     — tasks with status = "completed"
        completion_rate_pct — completed / total * 100, rounded to 1dp
        overdue_tasks       — past due_date and not completed
        tasks_last_7d       — created in the last 7 days
        tasks_last_30d      — created in the last 30 days

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
                "tasks_last_7d", "tasks_last_30d"]:
        summary[col] = summary[col].fillna(0).astype(int)

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
    ])
