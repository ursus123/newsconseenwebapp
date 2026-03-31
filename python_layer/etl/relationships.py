import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_json_to_df
from config import settings
from config.taxonomy import (
    RELATIONSHIP_ACTIVE_STATUSES,
    RELATIONSHIP_ENDED_STATUSES,
)

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Relationship type classification
# Mirrors the relationship_type values defined in Base44
# and the Relationships.jsx page TYPE_CONFIG.
# ----------------------------------------------------------

# Connects a person to an enterprise (staff, clients, members, etc.)
PERSON_ENTERPRISE_TYPES = {
    "person_enterprise",
    "employment",
    "membership",
    "enrollment",
    "care_assignment",
    "staff_assignment",
    "client_enrollment",
    "volunteer",
    "participant",
}

# Connects an item/product to an enterprise (ownership, stock location)
ITEM_ENTERPRISE_TYPES = {
    "item_enterprise",
}

# Connects an item/product to a person (custody, assignment)
ITEM_PERSON_TYPES = {
    "item_person",
}

# Connects a person or enterprise to a service
SERVICE_TYPES = {
    "person_service",
    "enterprise_service",
}

# Connects a person or enterprise to an address
ADDRESS_TYPES = {
    "person_address",
    "enterprise_address",
}

# All known types — anything outside this is classified as "other"
ALL_KNOWN_TYPES = (
    PERSON_ENTERPRISE_TYPES
    | ITEM_ENTERPRISE_TYPES
    | ITEM_PERSON_TYPES
    | SERVICE_TYPES
    | ADDRESS_TYPES
)

# Active/ended relationship statuses — imported from config.taxonomy
ACTIVE_STATUSES = RELATIONSHIP_ACTIVE_STATUSES
ENDED_STATUSES  = RELATIONSHIP_ENDED_STATUSES

# ----------------------------------------------------------
# Required columns for a meaningful transform
# ----------------------------------------------------------
REQUIRED_COLUMNS = {"id"}


def extract_relationships() -> pd.DataFrame:
    """
    Extract all relationship records from Base44.
    Returns raw DataFrame — no transformation applied here.
    Returns empty DataFrame if BASE44_RELATIONSHIPS_URL is not configured.
    """
    if not settings.base44_relationships_url:
        logger.warning("BASE44_RELATIONSHIPS_URL not set — skipping relationship extract")
        return pd.DataFrame()
    return fetch_json_to_df(settings.base44_relationships_url)


def transform_relationships(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform raw relationship records into a summary suitable for
    appending to analytics.relationship_summary.

    IMPORTANT: This transform does NOT group. It produces one row
    per relationship record, preserving all identifying columns so
    dashboards can answer:
        - Who works at which enterprise?
        - Which items are assigned to which enterprise or person?
        - Which addresses are linked to which entity?
        - How many relationships does each enterprise have?
        - Which relationships are active vs ended?

    This table is the join backbone for all cross-entity dashboards.
    Without it, the following cannot be built:
        - Enterprise People Dashboard
        - Item Assignment Dashboard
        - Role Gaps Dashboard
        - Accountability Dashboard
        - People Distribution Dashboard

    Produces one row per relationship with:
        id                      — Base44 relationship ID (join key)
        company_id              — tenant identifier
        relationship_type       — raw type from Base44
        relationship_category   — normalised: person_enterprise,
                                  item_enterprise, item_person,
                                  service, address, or other
        person_name             — linked person (if any)
        enterprise_name         — linked enterprise (if any)
        item_name               — linked item/product (if any)
        service_name            — linked service (if any)
        address_label           — linked address label (if any)
        role                    — role within this relationship
        status                  — raw status from Base44
        is_active               — True if status is an active status
        is_ended                — True if status is an ended status
        start_date              — when the relationship began
        end_date                — when the relationship ended (if any)
        duration_days           — days between start and end (or today)
        has_end_date            — True if an end_date is set
        created_date            — when this record was created
        days_since_created      — age of the record in days

    Snapshot date and loaded_at are added by load_dataframe().
    """
    if df.empty:
        logger.warning("transform_relationships: received empty DataFrame")
        return _empty_summary()

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        logger.error(
            "transform_relationships: missing required columns %s — returning empty",
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

    df["start_date"] = pd.to_datetime(
        df.get("start_date"), errors="coerce", utc=True
    )

    df["end_date"] = pd.to_datetime(
        df.get("end_date"), errors="coerce", utc=True
    )

    # ----------------------------------------------------------
    # Relationship category
    # Normalise the raw relationship_type into a small set of
    # categories so dashboards can filter without matching every
    # possible type string.
    # ----------------------------------------------------------
    rel_type = df.get(
        "relationship_type",
        pd.Series("", index=df.index)
    ).fillna("").str.lower().str.strip()

    def _classify_category(rtype: str) -> str:
        if rtype in PERSON_ENTERPRISE_TYPES:
            return "person_enterprise"
        if rtype in ITEM_ENTERPRISE_TYPES:
            return "item_enterprise"
        if rtype in ITEM_PERSON_TYPES:
            return "item_person"
        if rtype in SERVICE_TYPES:
            return "service"
        if rtype in ADDRESS_TYPES:
            return "address"
        return "other"

    df["relationship_category"] = rel_type.apply(_classify_category)

    # ----------------------------------------------------------
    # Status and active/ended flags
    # ----------------------------------------------------------
    status_col = df.get(
        "status", pd.Series("active", index=df.index)
    ).fillna("active").str.lower().str.strip()

    df["status"] = status_col
    df["is_active"] = status_col.isin(ACTIVE_STATUSES)
    df["is_ended"] = status_col.isin(ENDED_STATUSES)

    # ----------------------------------------------------------
    # Duration calculation
    # For active relationships: days from start_date to today.
    # For ended relationships: days from start_date to end_date.
    # If no start_date: duration is 0.
    # ----------------------------------------------------------
    df["has_end_date"] = df["end_date"].notna()

    def _calc_duration(row) -> int:
        if pd.isna(row["start_date"]):
            return 0
        end = row["end_date"] if pd.notna(row["end_date"]) else now
        delta = (end - row["start_date"]).days
        return max(0, int(delta))

    df["duration_days"] = df.apply(_calc_duration, axis=1)

    # ----------------------------------------------------------
    # Days since created
    # ----------------------------------------------------------
    df["days_since_created"] = (
        (now - df["created_date"]).dt.days
        .where(df["created_date"].notna())
        .fillna(0)
        .astype(int)
    )

    # ----------------------------------------------------------
    # Normalise linked entity name fields
    # Base44 may use different field names for the linked entities.
    # We resolve aliases so the output is consistent regardless of
    # how the Base44 schema is named.
    # ----------------------------------------------------------
    field_aliases = {
        "person_name":    ["person_name", "primary_person", "staff_name", "client_name"],
        "enterprise_name":["enterprise_name", "enterprise", "company_name"],
        "item_name":      ["item_name", "product_name", "asset_name", "item"],
        "service_name":   ["service_name", "service"],
        "address_label":  ["address_label", "address_name", "location_label", "label"],
        "role":           ["role", "relationship_role", "position", "job_title"],
    }

    resolved = {}
    for canonical, aliases in field_aliases.items():
        for alias in aliases:
            if alias in df.columns:
                resolved[canonical] = (
                    df[alias].astype(str).str.strip().replace("nan", None)
                )
                break
        if canonical not in resolved:
            resolved[canonical] = pd.Series(None, index=df.index)

    # ----------------------------------------------------------
    # Select and order output columns
    # ----------------------------------------------------------
    output_cols = {
        # Identity
        "id":                    df.get("id"),
        "company_id":            df.get("company_id"),

        # Relationship definition
        "relationship_type":     df.get("relationship_type"),
        "relationship_category": df["relationship_category"],

        # Linked entities
        "person_name":           resolved.get("person_name"),
        "enterprise_name":       resolved.get("enterprise_name"),
        "item_name":             resolved.get("item_name"),
        "service_name":          resolved.get("service_name"),
        "address_label":         resolved.get("address_label"),
        "role":                  resolved.get("role"),

        # Status
        "status":                df["status"],
        "is_active":             df["is_active"],
        "is_ended":              df["is_ended"],

        # Timing
        "start_date":            df["start_date"],
        "end_date":              df["end_date"],
        "has_end_date":          df["has_end_date"],
        "duration_days":         df["duration_days"],
        "created_date":          df.get("created_date"),
        "days_since_created":    df["days_since_created"],
    }

    summary = pd.DataFrame({
        k: v for k, v in output_cols.items() if v is not None
    })

    # ----------------------------------------------------------
    # Logging summary
    # ----------------------------------------------------------
    total = len(summary)
    active = int(summary["is_active"].sum())
    ended = int(summary["is_ended"].sum())

    category_counts = (
        summary["relationship_category"]
        .value_counts()
        .to_dict()
    )

    logger.info(
        "transform_relationships: produced %d relationship rows — "
        "%d active, %d ended | categories: %s",
        total, active, ended,
        ", ".join(f"{k}={v}" for k, v in category_counts.items()),
    )

    if total == 0:
        logger.warning(
            "transform_relationships: zero relationships found — "
            "cross-entity dashboards will have no data. "
            "Confirm the Base44 Relationship entity is populated."
        )

    return summary


def _empty_summary() -> pd.DataFrame:
    """
    Typed empty DataFrame matching the transform output schema.
    load_dataframe() skips writing this — no false zero snapshots.
    """
    return pd.DataFrame(columns=[
        "id",
        "company_id",
        "relationship_type",
        "relationship_category",
        "person_name",
        "enterprise_name",
        "item_name",
        "service_name",
        "address_label",
        "role",
        "status",
        "is_active",
        "is_ended",
        "start_date",
        "end_date",
        "has_end_date",
        "duration_days",
        "created_date",
        "days_since_created",
    ])
