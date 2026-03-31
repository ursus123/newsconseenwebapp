import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_json_to_df
from config import settings

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Service status classification
# Active services are currently being delivered and billing.
# Inactive services have been paused or discontinued.
# ----------------------------------------------------------
ACTIVE_STATUSES = {"active", "enabled", "live"}
INACTIVE_STATUSES = {"inactive", "disabled", "discontinued", "paused"}

REQUIRED_COLUMNS = {"id", "status"}

GROUP_COLUMNS = [
    "enterprise_id",
    "company_id",
    "service_type",
    "status",
    "category",
]


def extract_services() -> pd.DataFrame:
    """
    Extract all service records from Base44.
    Returns raw DataFrame — no transformation applied here.
    """
    return fetch_json_to_df(settings.base44_services_url)


def transform_services(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform raw service records into a summary suitable for
    appending to analytics.service_summary.

    Produces per-group metrics:
        service_count           — total services in this group
        active_service_count    — services with an active status
        inactive_service_count  — services with an inactive status
        total_billable_value    — sum of rate across all services in group
        avg_rate                — mean rate within this service type
        max_rate                — highest rate in this group
        min_rate                — lowest rate in this group
        is_billable             — True if any rate > 0 in this group
        new_last_30d            — services created in the last 30 days

    Groups by: enterprise_id, company_id, service_type, status, category
    (category is included only if present — safe against partial responses)
    """
    if df.empty:
        logger.warning("transform_services: received empty DataFrame")
        return _empty_summary()

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        logger.error(
            "transform_services: missing required columns %s — returning empty",
            missing,
        )
        return _empty_summary()

    df = df.copy()

    # ----------------------------------------------------------
    # Parse and clean numeric fields
    # rate is the billable amount per service delivery
    # ----------------------------------------------------------
    df["rate"] = pd.to_numeric(
        df["rate"] if "rate" in df.columns else pd.Series(0.0, index=df.index),
        errors="coerce",
    ).fillna(0)

    # ----------------------------------------------------------
    # Parse dates
    # ----------------------------------------------------------
    now = datetime.now(timezone.utc)

    df["created_date"] = pd.to_datetime(
        df.get("created_date"), errors="coerce", utc=True
    )

    # ----------------------------------------------------------
    # Derived columns
    # ----------------------------------------------------------
    df["is_active_status"] = df["status"].isin(ACTIVE_STATUSES)
    df["is_inactive_status"] = df["status"].isin(INACTIVE_STATUSES)
    df["is_billable"] = df["rate"] > 0

    df["new_last_30d"] = (
        df["created_date"].notna()
        & (df["created_date"] >= now - pd.Timedelta(days=30))
    )

    # ----------------------------------------------------------
    # Safe groupBy — only use columns that exist in df
    # category is included only if present — avoids KeyError
    # when newer enterprise types haven't configured categories
    # ----------------------------------------------------------
    group_cols = [c for c in GROUP_COLUMNS if c in df.columns]

    summary = (
        df.groupby(group_cols, dropna=False)
        .agg(
            service_count=("id", "count"),
            active_service_count=("is_active_status", "sum"),
            inactive_service_count=("is_inactive_status", "sum"),
            total_billable_value=("rate", "sum"),
            avg_rate=("rate", "mean"),
            max_rate=("rate", "max"),
            min_rate=("rate", "min"),
            any_billable=("is_billable", "any"),
            new_last_30d=("new_last_30d", "sum"),
        )
        .reset_index()
    )

    # ----------------------------------------------------------
    # Rename any_billable to is_billable for clarity
    # ----------------------------------------------------------
    summary = summary.rename(columns={"any_billable": "is_billable"})

    # ----------------------------------------------------------
    # Round monetary columns
    # ----------------------------------------------------------
    for col in ["total_billable_value", "avg_rate", "max_rate", "min_rate"]:
        summary[col] = summary[col].fillna(0.0).round(2)

    # Cast integer columns
    for col in ["service_count", "active_service_count",
                "inactive_service_count", "new_last_30d"]:
        summary[col] = summary[col].fillna(0).astype(int)

    logger.info(
        "transform_services: produced %d summary rows from %d raw records",
        len(summary), len(df),
    )

    return summary


def _empty_summary() -> pd.DataFrame:
    """
    Typed empty DataFrame matching the transform output schema.
    load_dataframe() skips writing this — no false zero snapshots.
    """
    return pd.DataFrame(columns=[
        "enterprise_id",
        "company_id",
        "service_type",
        "status",
        "category",
        "service_count",
        "active_service_count",
        "inactive_service_count",
        "total_billable_value",
        "avg_rate",
        "max_rate",
        "min_rate",
        "is_billable",
        "new_last_30d",
    ])
