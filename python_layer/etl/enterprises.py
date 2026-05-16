import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_supabase_entity_to_df
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
    return fetch_supabase_entity_to_df("enterprises")


def enrich_enterprise_coords(
    enterprise_df: pd.DataFrame,
    relationship_df: pd.DataFrame,
    address_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Enrich enterprise_summary with latitude/longitude pulled from linked
    Address records via enterprise_address Relationships.

    Priority order per enterprise:
        1. Coordinates already on the Enterprise record (latitude/longitude columns)
        2. Coordinates from the linked Address (via enterprise_address relationship)
        3. Leave null — downstream Nominatim geocoding in address ETL will handle it

    Uses enterprise_id if present on the relationship (stored since the ID-capture
    fix), falls back to matching on enterprise_name string for older records.

    Modifies enterprise_df in-place and returns it.
    """
    if enterprise_df.empty or relationship_df.empty or address_df.empty:
        return enterprise_df

    # ── Ensure coordinate columns exist ──────────────────────────────────────
    for col in ("latitude", "longitude"):
        if col not in enterprise_df.columns:
            enterprise_df[col] = None

    enterprise_df["latitude"]  = pd.to_numeric(enterprise_df["latitude"],  errors="coerce")
    enterprise_df["longitude"] = pd.to_numeric(enterprise_df["longitude"], errors="coerce")

    # ── Build address coord lookup: address_id → (lat, lon) ──────────────────
    addr_lat = pd.to_numeric(address_df.get("latitude",  pd.Series()), errors="coerce")
    addr_lon = pd.to_numeric(address_df.get("longitude", pd.Series()), errors="coerce")
    addr_has_coords = addr_lat.notna() & addr_lon.notna()

    addr_coords = {}   # address_id → (lat, lon)
    for _, row in address_df[addr_has_coords].iterrows():
        addr_coords[row["id"]] = (float(addr_lat[row.name]), float(addr_lon[row.name]))

    if not addr_coords:
        logger.info("enrich_enterprise_coords: no addresses have coordinates — skipping enrichment")
        return enterprise_df

    # ── Filter to active enterprise_address relationships ────────────────────
    ea_rels = relationship_df[
        relationship_df.get("relationship_type", pd.Series()).eq("enterprise_address") &
        relationship_df.get("status", pd.Series("active")).ne("ended")
    ].copy() if "relationship_type" in relationship_df.columns else pd.DataFrame()

    if ea_rels.empty:
        logger.info("enrich_enterprise_coords: no enterprise_address relationships found — skipping enrichment")
        return enterprise_df

    # ── Build enterprise → coords map ────────────────────────────────────────
    # enterprise_id preferred, enterprise_name fallback (one entry per enterprise, first wins)
    ent_coords_by_id   = {}   # enterprise_id → (lat, lon)
    ent_coords_by_name = {}   # enterprise_name → (lat, lon)

    for _, rel in ea_rels.iterrows():
        addr_id  = rel.get("address_id")
        ent_id   = rel.get("enterprise_id")
        ent_name = rel.get("enterprise_name")
        if not addr_id or addr_id not in addr_coords:
            continue
        coords = addr_coords[addr_id]
        if ent_id and ent_id not in ent_coords_by_id:
            ent_coords_by_id[str(ent_id)] = coords
        if ent_name and ent_name not in ent_coords_by_name:
            ent_coords_by_name[str(ent_name)] = coords

    enriched = 0
    missing_mask = enterprise_df["latitude"].isna() | enterprise_df["longitude"].isna()

    for idx in enterprise_df[missing_mask].index:
        eid   = str(enterprise_df.at[idx, "id"] or "")
        ename = str(enterprise_df.at[idx, "name"] or enterprise_df.at[idx].get("enterprise_name", "") or "")
        coords = ent_coords_by_id.get(eid) or ent_coords_by_name.get(ename)
        if coords:
            enterprise_df.at[idx, "latitude"]         = coords[0]
            enterprise_df.at[idx, "longitude"]        = coords[1]
            enterprise_df.at[idx, "coord_source"]     = "address_relationship"
            enriched += 1

    logger.info(
        "enrich_enterprise_coords: enriched %d of %d enterprises with address coordinates",
        enriched, int(missing_mask.sum()),
    )
    return enterprise_df


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
        # Coordinates — populated directly on Enterprise record;
        # enrich_enterprise_coords() fills gaps from linked addresses after transform
        "latitude":         pd.to_numeric(df.get("latitude"),  errors="coerce") if df.get("latitude") is not None else None,
        "longitude":        pd.to_numeric(df.get("longitude"), errors="coerce") if df.get("longitude") is not None else None,
        "coord_source":     pd.Series("enterprise", index=df.index),
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
        "latitude",
        "longitude",
        "coord_source",
    ])
