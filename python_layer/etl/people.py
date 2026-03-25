import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_json_to_df
from config import settings

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Person type classification
# Three buckets cover all enterprise verticals:
#   STAFF_TYPES       — people who work for or within the enterprise
#   PARTICIPANT_TYPES — people the enterprise serves or enrolls
#   CONTACT_TYPES     — external people linked to the enterprise
#                       (vendors, partners, board members, guarantors)
#
# Types not in any bucket get is_staff=False, is_participant=False,
# is_contact=False and are counted but not classified. This is
# intentional — unknown types surface in dashboards as "unclassified"
# rather than silently disappearing.
#
# Keep these in sync with person_type values used in Base44.
# ----------------------------------------------------------
STAFF_TYPES = {
    # Operations
    "staff", "employee", "contractor", "consultant", "temp",
    # Management
    "manager", "supervisor", "admin", "coordinator", "director",
    # Healthcare
    "caregiver", "nurse", "doctor", "therapist", "pharmacist",
    # Education
    "teacher", "instructor", "tutor", "coach", "trainer",
    # Community
    "volunteer", "intern",
}

PARTICIPANT_TYPES = {
    # Services
    "client", "customer", "patient", "resident",
    # Education
    "student", "learner", "trainee", "attendee",
    # Membership / programs
    "member", "participant", "beneficiary", "enrollee",
    "subscriber", "applicant",
}

CONTACT_TYPES = {
    # External relationships
    "vendor", "supplier", "partner", "donor", "sponsor",
    # Governance
    "board_member", "trustee", "shareholder", "investor",
    # Personal links
    "guarantor", "next_of_kin", "emergency_contact", "guardian",
    # Other external
    "referral", "prospect", "lead",
}

# Statuses that count as active — covers naming variations
# across different enterprise verticals
ACTIVE_STATUSES = {
    "active", "live", "current", "enrolled", "approved",
    "open", "engaged", "confirmed",
}

# Statuses that count as inactive
INACTIVE_STATUSES = {
    "inactive", "archived", "closed", "terminated", "discharged",
    "withdrawn", "suspended", "expired", "left", "graduated",
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
        people_count        — total people in this group
        active_count        — people with an active status
        inactive_count      — people with an inactive status
        retention_rate_pct  — active / total * 100, rounded to 1dp
        is_staff            — True if person_type is a staff type
        is_participant      — True if person_type is a participant type
        is_contact          — True if person_type is a contact type
        avg_tenure_days     — mean days since created_date for active people
        new_last_7d         — people created in the last 7 days
        new_last_30d        — people created in the last 30 days

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
    # Normalise status to lowercase for consistent matching
    # ----------------------------------------------------------
    df["status"] = (
        df["status"].fillna("unknown").str.lower().str.strip()
    )

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
    person_type = (
        df.get("person_type", pd.Series("", index=df.index))
        .fillna("").str.lower().str.strip()
    )

    df["is_staff"]       = person_type.isin(STAFF_TYPES)
    df["is_participant"] = person_type.isin(PARTICIPANT_TYPES)
    df["is_contact"]     = person_type.isin(CONTACT_TYPES)

    df["is_active"]   = df["status"].isin(ACTIVE_STATUSES)
    df["is_inactive"] = df["status"].isin(INACTIVE_STATUSES)

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
    # Log unclassified person types so operators can see what
    # is not matching any bucket — helps keep type lists in sync
    # ----------------------------------------------------------
    unclassified = (
        ~df["is_staff"] & ~df["is_participant"] & ~df["is_contact"]
        & person_type.ne("")
    )
    if unclassified.any():
        unknown_types = person_type[unclassified].value_counts().to_dict()
        logger.info(
            "transform_people: %d unclassified people with types: %s — "
            "add to STAFF_TYPES, PARTICIPANT_TYPES, or CONTACT_TYPES if needed",
            unclassified.sum(),
            ", ".join(f"{k}({v})" for k, v in unknown_types.items()),
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
    # Retention rate — active / total, safe against zero division
    # ----------------------------------------------------------
    summary["retention_rate_pct"] = (
        (summary["active_count"] / summary["people_count"].replace(0, pd.NA))
        * 100
    ).round(1).fillna(0.0)

    # ----------------------------------------------------------
    # Re-derive classification flags on summary rows
    # ----------------------------------------------------------
    if "person_type" in summary.columns:
        pt = summary["person_type"].fillna("").str.lower().str.strip()
        summary["is_staff"]       = pt.isin(STAFF_TYPES)
        summary["is_participant"] = pt.isin(PARTICIPANT_TYPES)
        summary["is_contact"]     = pt.isin(CONTACT_TYPES)
    else:
        summary["is_staff"]       = False
        summary["is_participant"] = False
        summary["is_contact"]     = False

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
        "is_contact",
        "avg_tenure_days",
        "new_last_7d",
        "new_last_30d",
    ])
