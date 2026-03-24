import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_json_to_df
from config import settings

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Person type classification
# Mirrors the STAFF_TYPES and PARTICIPANT_TYPES arrays
# defined in the EntityGraph.jsx frontend fix.
# Keep these in sync when new person types are added.
# ----------------------------------------------------------
STAFF_TYPES = {
    "staff", "caregiver", "nurse", "doctor", "therapist",
    "coordinator", "manager", "admin", "teacher", "instructor",
    "coach", "volunteer", "contractor", "employee",
}

PARTICIPANT_TYPES = {
    "client", "patient", "student", "member", "resident",
    "participant", "beneficiary", "customer", "attendee",
}

REQUIRED_COLUMNS = {"id", "status"}

GROUP_COLUMNS = [
    "enterprise_id",
    "company_id",
    "person_type",
    "status",
]


def extract_people() -> pd.DataFrame:
    """
    Extract all people records from Base44.
    Returns raw DataFrame — no transformation applied here.
    """
    return fetch_json_to_df(settings.base44_people_url)


def transform_people(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform raw people records into a summary suitable for
    appending to analytics.people_summary.

    Produces per-group metrics:
        people_count            — total people in this group
        active_count            — people with status = "active"
        inactive_count          — people with status = "inactive"
        retention_rate_pct      — active / total * 100, rounded to 1dp
        is_staff                — True if person_type is a staff type
        is_participant          — True if person_type is a participant type
        avg_tenure_days         — mean days since created_date for active people
        new_last_30d            — people created in the last 30 days
        new_last_7d             — people created in the last 7 days

    Groups by: enterprise_id, company_id, person_type, status
    """
    if df.empty:
        logger.warning("transform_people: received empty DataFrame")
        return _empty_summary()

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        logger.error(
            "transform_people: missing required columns %s — returning empty",
            missing,
        )
        return _empty_summary()

    df = df.copy()

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
    person_type = df.get("person_type", pd.Series("", index=df.index))

    df["is_staff"] = person_type.isin(STAFF_TYPES)
    df["is_participant"] = person_type.isin(PARTICIPANT_TYPES)
    df["is_active"] = df["status"] == "active"
    df["is_inactive"] = df["status"] == "inactive"

    # Tenure in days — only meaningful for active people
    df["tenure_days"] = (
        (now - df["created_date"]).dt.days
        .where(df["created_date"].notna() & df["is_active"])
    )

    df["new_last_7d"] = (
        df["created_date"].notna()
        & (df["created_date"] >= now - pd.Timedelta(days=7))
    )

    df["new_last_30d"] = (
        df["created_date"].notna()
        & (df["created_date"] >= now - pd.Timedelta(days=30))
    )

    # ----------------------------------------------------------
    # Safe groupBy
    # ----------------------------------------------------------
    group_cols = [c for c in GROUP_COLUMNS if c in df.columns]

    summary = (
        df.groupby(group_cols, dropna=False)
        .agg(
            people_count=("id", "count"),
            active_count=("is_active", "sum"),
            inactive_count=("is_inactive", "sum"),
            avg_tenure_days=("tenure_days", "mean"),
            new_last_7d=("new_last_7d", "sum"),
            new_last_30d=("new_last_30d", "sum"),
        )
        .reset_index()
    )

    # ----------------------------------------------------------
    # Retention rate — active / total, safe against zero
    # ----------------------------------------------------------
    summary["retention_rate_pct"] = (
        (summary["active_count"] / summary["people_count"].replace(0, pd.NA))
        * 100
    ).round(1).fillna(0.0)

    # ----------------------------------------------------------
    # Re-derive classification flags on summary rows
    # ----------------------------------------------------------
    if "person_type" in summary.columns:
        summary["is_staff"] = summary["person_type"].isin(STAFF_TYPES)
        summary["is_participant"] = summary["person_type"].isin(PARTICIPANT_TYPES)
    else:
        summary["is_staff"] = False
        summary["is_participant"] = False

    # ----------------------------------------------------------
    # Clean up numeric types
    # ----------------------------------------------------------
    summary["avg_tenure_days"] = summary["avg_tenure_days"].round(1).fillna(0.0)

    for col in ["people_count", "active_count", "inactive_count",
                "new_last_7d", "new_last_30d"]:
        summary[col] = summary[col].fillna(0).astype(int)

    logger.info(
        "transform_people: produced %d summary rows from %d raw records",
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
        "person_type",
        "status",
        "people_count",
        "active_count",
        "inactive_count",
        "retention_rate_pct",
        "is_staff",
        "is_participant",
        "avg_tenure_days",
        "new_last_7d",
        "new_last_30d",
    ])
