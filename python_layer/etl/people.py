import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_json_to_df
from config import settings
from config.taxonomy import (
    PERSON_TYPE_SETS,
    PERSON_TYPE_MAP,
    ACTIVE_STATUSES,
    INACTIVE_STATUSES,
)

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Person type classification — imported from config.taxonomy
# PERSON_TYPE_SETS["staff"]     — staff, employee, contractor, etc.
# PERSON_TYPE_SETS["client"]    — client, patient, student, etc.
# PERSON_TYPE_SETS["contact"]   — vendor, partner, donor, etc.
# PERSON_TYPE_SETS["volunteer"] — volunteer, community_worker, etc.
# ----------------------------------------------------------
STAFF_TYPES       = PERSON_TYPE_SETS["staff"]
PARTICIPANT_TYPES = PERSON_TYPE_SETS["client"]
CONTACT_TYPES     = PERSON_TYPE_SETS["contact"]

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


def enrich_people_enterprise(
    people_df: pd.DataFrame,
    relationship_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Enrich people_summary rows with enterprise_name and role pulled from
    active person_enterprise Relationships.

    The people_summary table groups by (enterprise_id, company_id, person_type, status).
    For rows where enterprise_id is null or the enterprise_name is missing, this
    function looks up the first active person_enterprise relationship for any person
    in that group and fills in:
        - primary_enterprise_name  — display name of the linked enterprise
        - primary_role             — role within that relationship

    Uses person_id on the relationship if present (stored since the ID-capture fix),
    falls back to person_name string matching for older records.

    Also adds a flat per-person enrichment for non-aggregated use:
    when people_df contains individual person rows (id column present and unique),
    attaches enterprise_name and role directly to each person row.

    Modifies people_df in-place and returns it.
    """
    if people_df.empty or relationship_df.empty:
        return people_df

    if "relationship_type" not in relationship_df.columns:
        return people_df

    # ── Filter to active person_enterprise relationships ─────────────────────
    pe_rels = relationship_df[
        relationship_df["relationship_type"].isin({
            "person_enterprise", "employment", "membership", "enrollment",
            "care_assignment", "staff_assignment", "client_enrollment",
        }) &
        relationship_df.get("status", pd.Series("active")).ne("ended")
    ].copy()

    if pe_rels.empty:
        logger.info("enrich_people_enterprise: no active person_enterprise relationships found")
        return people_df

    # Normalise key columns
    pe_rels["_person_id"]   = pe_rels.get("person_id",   pd.Series(None)).astype(str).str.strip()
    pe_rels["_person_name"] = pe_rels.get("person_name", pd.Series(None)).astype(str).str.strip()
    pe_rels["_ent_name"]    = pe_rels.get("enterprise_name", pd.Series(None)).astype(str).str.strip()
    pe_rels["_role"]        = pe_rels.get("role", pd.Series(None)).astype(str).str.strip()

    # Build lookup: person_id → (enterprise_name, role), person_name → (enterprise_name, role)
    person_id_lookup   = {}
    person_name_lookup = {}
    for _, r in pe_rels.iterrows():
        pid   = r["_person_id"]
        pname = r["_person_name"]
        ent   = r["_ent_name"]   if r["_ent_name"]   not in ("", "nan", "None") else None
        role  = r["_role"]       if r["_role"]        not in ("", "nan", "None") else None
        if pid and pid not in ("", "nan", "None") and pid not in person_id_lookup:
            person_id_lookup[pid] = (ent, role)
        if pname and pname not in ("", "nan", "None") and pname not in person_name_lookup:
            person_name_lookup[pname] = (ent, role)

    # ── Enrich individual person rows (when id column is present) ────────────
    if "id" in people_df.columns:
        enriched = 0
        for col in ("primary_enterprise_name", "primary_role"):
            if col not in people_df.columns:
                people_df[col] = None

        for idx, row in people_df.iterrows():
            # Skip if already populated
            if pd.notna(row.get("primary_enterprise_name")):
                continue
            pid   = str(row.get("id", ""))
            pname = str(row.get("preferred_name") or
                        f"{row.get('first_name', '')} {row.get('last_name', '')}".strip())
            match = person_id_lookup.get(pid) or person_name_lookup.get(pname)
            if match:
                people_df.at[idx, "primary_enterprise_name"] = match[0]
                people_df.at[idx, "primary_role"]            = match[1]
                enriched += 1

        logger.info(
            "enrich_people_enterprise: enriched %d individual person rows with enterprise/role",
            enriched,
        )

    # ── Enrich aggregated summary rows (grouped by enterprise_id) ────────────
    # For summary rows, attach the enterprise_name to enterprise_id so
    # dashboards can display the name without a separate join.
    if "enterprise_id" in people_df.columns and "enterprise_id" in pe_rels.columns:
        eid_to_name = (
            pe_rels[pe_rels.get("enterprise_id", pd.Series()).notna()]
            .drop_duplicates("enterprise_id")
            .set_index("enterprise_id")["_ent_name"]
            .to_dict()
        )
        if "enterprise_name" not in people_df.columns:
            people_df["enterprise_name"] = None
        people_df["enterprise_name"] = people_df.apply(
            lambda r: r["enterprise_name"] if pd.notna(r.get("enterprise_name"))
                      else eid_to_name.get(str(r.get("enterprise_id", "")), None),
            axis=1,
        )

    return people_df


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
    # Debug: log column names so we can verify company_id and
    # enterprise_id are present in the Base44 response
    # ----------------------------------------------------------
    logger.info(
        "transform_people: raw columns from Base44: %s",
        sorted(df.columns.tolist()),
    )
    if "company_id" in df.columns:
        logger.info(
            "transform_people: company_id present — %d non-null values",
            df["company_id"].notna().sum(),
        )
    else:
        logger.warning("transform_people: company_id NOT in Base44 response")

    if "enterprise_id" not in df.columns:
        logger.warning("transform_people: enterprise_id NOT in Base44 response — will be null in analytics")
        df["enterprise_id"] = None

    # ----------------------------------------------------------
    # Normalise person_type to canonical taxonomy values
    # Maps "employee" → "staff", "patient" → "client", etc.
    # Uses PERSON_TYPE_MAP from taxonomy so analytics tables store
    # canonical values regardless of what Base44 returns.
    # ----------------------------------------------------------
    person_type_raw = (
        df.get("person_type", pd.Series("", index=df.index))
        .fillna("").str.lower().str.strip()
    )
    df["person_type"] = person_type_raw.map(
        lambda x: PERSON_TYPE_MAP.get(x, x) if x else "staff"
    )

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
    # Derived columns — use raw aliases for classification so all
    # legacy values (employee, patient, vendor) are correctly bucketed
    # ----------------------------------------------------------
    person_type = person_type_raw  # use raw for isin() checks (sets include aliases)

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
    ).fillna(0.0).round(1)

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
    summary["avg_tenure_days"] = summary["avg_tenure_days"].fillna(0.0).round(1)

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
