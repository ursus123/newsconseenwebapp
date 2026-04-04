import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_json_to_df
from config import settings
from config.taxonomy import (
    ENTERPRISE_ACTIVE_STATUSES as ACTIVE_STATUSES,
    ENTERPRISE_INACTIVE_STATUSES as INACTIVE_STATUSES,
    normalize_enterprise_type,
)

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = {"id"}


def extract_enterprises() -> pd.DataFrame:
    """
    Extract all enterprise records from Base44.
    Returns raw DataFrame — no transformation applied here.
    """
    return fetch_json_to_df(settings.base44_enterprises_url)


def transform_enterprises(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform raw enterprise records into a summary suitable for
    appending to analytics.enterprise_summary.

    IMPORTANT: This transform does NOT group. It produces one row
    per enterprise, preserving all identifying columns. Grouping
    would destroy the ability to join other summary tables back to
    a specific named enterprise.

    Produces one row per enterprise with:
        id                  — Base44 enterprise ID (join key for all other tables)
        company_id          — tenant identifier (scopes all other tables)
        name                — enterprise display name
        enterprise_type     — type from the 40+ type taxonomy
        status              — operating status
        parent_id           — parent enterprise ID (null for root enterprises)
        is_root             — True if no parent_id (top-level enterprise)
        is_active           — True if status is an active status
        primary_address     — primary address string for geospatial
        created_date        — when this enterprise was created
        days_since_created  — age of the enterprise record in days
        operating_status    — normalized to "active" or "inactive"
        naics_code          — 2–6 digit NAICS industry code (optional)
        naics_title         — NAICS industry title (optional)
        sic_code            — 4-digit SIC code (optional)
        sic_description     — SIC industry description (optional)

    Snapshot date and loaded_at are added by load_dataframe().
    """
    if df.empty:
        logger.warning("transform_enterprises: received empty DataFrame")
        return _empty_summary()

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        logger.error(
            "transform_enterprises: missing required columns %s — returning empty",
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
    status_col = df.get("status", pd.Series("", index=df.index))

    df["is_active"] = status_col.isin(ACTIVE_STATUSES)
    df["is_root"] = df.get("parent_id", pd.Series(None, index=df.index)).isna()

    df["operating_status"] = status_col.apply(
        lambda s: "active" if s in ACTIVE_STATUSES
        else "inactive" if s in INACTIVE_STATUSES
        else "unknown"
    )

    df["days_since_created"] = (
        (now - df["created_date"]).dt.days
        .where(df["created_date"].notna())
        .fillna(0)
        .astype(int)
    )

    # ----------------------------------------------------------
    # Normalise enterprise_type to canonical taxonomy values
    # Maps "business" → "commercial", "ngo" → "nonprofit", etc.
    # ----------------------------------------------------------
    enterprise_type_col = df.get("enterprise_type")
    if enterprise_type_col is not None:
        enterprise_type_col = enterprise_type_col.apply(
            lambda x: normalize_enterprise_type(x) if pd.notna(x) and x else x
        )

    # ----------------------------------------------------------
    # Select and order output columns.
    # Use .get() pattern for every column so missing fields
    # produce NaN rows rather than KeyErrors.
    # ----------------------------------------------------------
    output_cols = {
        "id":               df.get("id"),
        "company_id":       df.get("company_id"),
        "name":             df.get("name"),
        "enterprise_type":  enterprise_type_col,
        "status":           df.get("status"),
        "operating_status": df["operating_status"],
        "is_active":        df["is_active"],
        "is_root":          df["is_root"],
        "parent_id":        df.get("parent_id"),
        "primary_address":  df.get("primary_address"),
        "phone":            df.get("phone"),
        "email":            df.get("email"),
        "website":          df.get("website"),
        "created_date":     df.get("created_date"),
        "days_since_created": df["days_since_created"],
        "naics_code":       df.get("naics_code"),
        "naics_title":      df.get("naics_title"),
        "sic_code":         df.get("sic_code"),
        "sic_description":  df.get("sic_description"),
    }

    summary = pd.DataFrame({
        k: v for k, v in output_cols.items() if v is not None
    })

    logger.info(
        "transform_enterprises: produced %d enterprise rows from %d raw records",
        len(summary), len(df),
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
        "name",
        "enterprise_type",
        "status",
        "operating_status",
        "is_active",
        "is_root",
        "parent_id",
        "primary_address",
        "phone",
        "email",
        "website",
        "created_date",
        "days_since_created",
        "naics_code",
        "naics_title",
        "sic_code",
        "sic_description",
    ])
