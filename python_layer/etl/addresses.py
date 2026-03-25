import logging
import time
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
import requests

from etl.base import fetch_json_to_df
from config import settings

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Nominatim configuration
# Used as a FALLBACK for addresses that are missing coordinates
# in Base44. If lat/lon are already stored, we use those and
# skip Nominatim entirely for that record.
#
# Nominatim ToS:
#   - Max 1 request per second
#   - Must identify your app via User-Agent header
#   - Do not geocode the same address repeatedly
#
# NOMINATIM_CONTACT_EMAIL is read from .env so the User-Agent
# header always reflects your real contact info.
# ----------------------------------------------------------
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_USER_AGENT = (
    f"newsconseen-app/1.0 ({getattr(settings, 'nominatim_contact_email', 'contact@newsconseen.com')})"
)
NOMINATIM_RATE_LIMIT_SECONDS = 1.1   # slightly over 1s to stay safe
NOMINATIM_TIMEOUT = 10               # seconds per request

# ----------------------------------------------------------
# Address type classification
# Mirrors the address label types defined in the Address Form.
# An address can serve multiple roles — this normalises the
# label into a standard type for dashboard grouping.
# ----------------------------------------------------------
ENTERPRISE_ADDRESS_TYPES = {
    "hq", "headquarters", "main", "main office", "office",
    "branch", "shop", "store", "warehouse", "depot",
    "factory", "workshop", "site", "location",
}

PEOPLE_ADDRESS_TYPES = {
    "home", "residential", "personal", "mailing",
    "billing", "delivery", "work",
}

# ----------------------------------------------------------
# Required columns for a meaningful transform.
# id is the only hard requirement — everything else degrades
# gracefully to None rather than crashing.
# ----------------------------------------------------------
REQUIRED_COLUMNS = {"id"}


def extract_addresses() -> pd.DataFrame:
    """
    Extract all address records from Base44.
    Returns raw DataFrame — no transformation applied here.
    """
    return fetch_json_to_df(settings.base44_addresses_url)


def transform_addresses(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform raw address records into a clean summary suitable
    for appending to analytics.address_summary.

    IMPORTANT: This transform does NOT group. It produces one row
    per address record, preserving all identifying columns so
    other summary tables can join back via address_id.

    Coordinate strategy (in priority order):
        1. Use lat/lon already stored in Base44 — no API call needed
        2. If lat/lon missing → geocode via Nominatim using full_address
        3. If Nominatim fails → leave as null, log warning

    This means:
        - Records with coordinates in Base44 → zero API calls
        - Records missing coordinates → Nominatim fills the gap
        - etl/geospatial.py uses this table as its coordinate source
          for DBSCAN clustering and distance calculations

    Produces one row per address with:
        id                  — Base44 address ID (join key)
        company_id          — tenant identifier
        label               — human-readable name (Main Office, Home, etc.)
        address_line_1      — street address
        address_line_2      — apartment, suite, floor (optional)
        city                — city or town
        state_region        — state, province, or region
        postal_code         — ZIP or postal code
        country             — country name or ISO code
        full_address        — concatenated string for geocoding and display
        latitude            — coordinate (from Base44 or Nominatim)
        longitude           — coordinate (from Base44 or Nominatim)
        has_coordinates     — True if both lat and lon are present
        coordinate_source   — "base44", "nominatim", or "missing"
        address_type        — normalised: "enterprise", "people", or "general"
        linked_entity_type  — "enterprise", "person", "both", or "unlinked"
        enterprise_id       — linked enterprise (if any)
        person_id           — linked person (if any)
        status              — active / inactive / archived
        is_active           — True if status is active
        created_date        — when this address was created
        days_since_created  — age of the address record in days

    Snapshot date and loaded_at are added by load_dataframe().
    """
    if df.empty:
        logger.warning("transform_addresses: received empty DataFrame")
        return _empty_summary()

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        logger.error(
            "transform_addresses: missing required columns %s — returning empty",
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
    # Parse and validate stored coordinates from Base44
    # Coerce to float so bad values (empty string, "N/A") → NaN.
    # Validate ranges — reject physically impossible values rather
    # than silently keeping bad data.
    # ----------------------------------------------------------
    df["latitude"] = pd.to_numeric(
        df.get("latitude"), errors="coerce"
    )
    df["longitude"] = pd.to_numeric(
        df.get("longitude"), errors="coerce"
    )

    # Latitude must be -90 to 90
    df.loc[
        df["latitude"].notna() & (
            (df["latitude"] < -90) | (df["latitude"] > 90)
        ),
        "latitude"
    ] = None

    # Longitude must be -180 to 180
    df.loc[
        df["longitude"].notna() & (
            (df["longitude"] < -180) | (df["longitude"] > 180)
        ),
        "longitude"
    ] = None

    # ----------------------------------------------------------
    # Normalise text fields
    # Handle alternate field names Base44 might use.
    # Strip whitespace so downstream joins don't break on
    # invisible whitespace differences.
    # ----------------------------------------------------------
    field_aliases = {
        "address_line_1": ["address_line_1", "street", "address1", "line1"],
        "address_line_2": ["address_line_2", "address2", "line2", "suite"],
        "city":           ["city", "town", "locality"],
        "state_region":   ["state_region", "state", "region", "province"],
        "postal_code":    ["postal_code", "zip", "postcode", "zip_code"],
        "country":        ["country", "country_name"],
        "label":          ["label", "address_label", "name", "title"],
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
    # Build full address string
    # Used for Nominatim geocoding and for display in dashboards.
    # Built from resolved fields so alias handling is already done.
    # ----------------------------------------------------------
    def _build_full_address(idx: int) -> str:
        parts = [
            str(resolved["address_line_1"].iloc[idx] or ""),
            str(resolved["address_line_2"].iloc[idx] or ""),
            str(resolved["city"].iloc[idx] or ""),
            str(resolved["state_region"].iloc[idx] or ""),
            str(resolved["postal_code"].iloc[idx] or ""),
            str(resolved["country"].iloc[idx] or ""),
        ]
        return ", ".join(
            p for p in parts if p and p.lower() not in ("none", "nan", "")
        ).strip(", ")

    df["full_address"] = [_build_full_address(i) for i in range(len(df))]

    # ----------------------------------------------------------
    # Geocode addresses missing coordinates via Nominatim
    #
    # Strategy:
    #   - Records where Base44 already has valid lat+lon → skip
    #   - Records with no/invalid coordinates → call Nominatim
    #   - Records with no full_address to geocode → mark "missing"
    #
    # Rate limiting: sleep NOMINATIM_RATE_LIMIT_SECONDS between
    # each API call. Only the records that NEED geocoding incur
    # the delay — records served from Base44 are instant.
    # ----------------------------------------------------------
    needs_geocoding_mask = (
        df["latitude"].isna() | df["longitude"].isna()
    )
    needs_geocoding_indices = df.index[needs_geocoding_mask].tolist()

    coordinate_source = []
    for i in range(len(df)):
        lat = df["latitude"].iloc[i]
        lon = df["longitude"].iloc[i]
        if pd.notna(lat) and pd.notna(lon):
            coordinate_source.append("base44")
        else:
            coordinate_source.append(None)  # filled in loop below

    geocoded_count = 0
    failed_count = 0

    for position, idx in enumerate(needs_geocoding_indices):
        full_address = df.at[idx, "full_address"]

        if not full_address:
            coordinate_source[df.index.get_loc(idx)] = "missing"
            failed_count += 1
            logger.debug(
                "transform_addresses: skipping geocode for id=%s — no address text",
                df.at[idx, "id"],
            )
            continue

        result = _geocode_address(full_address)

        if result:
            df.at[idx, "latitude"] = result[0]
            df.at[idx, "longitude"] = result[1]
            coordinate_source[df.index.get_loc(idx)] = "nominatim"
            geocoded_count += 1
            logger.info(
                "transform_addresses: geocoded id=%s → (%.4f, %.4f)",
                df.at[idx, "id"], result[0], result[1],
            )
        else:
            coordinate_source[df.index.get_loc(idx)] = "missing"
            failed_count += 1
            logger.warning(
                "transform_addresses: geocoding failed for id=%s address='%s'",
                df.at[idx, "id"], full_address,
            )

        # Rate limit — pause between requests, not after the last one
        if position < len(needs_geocoding_indices) - 1:
            time.sleep(NOMINATIM_RATE_LIMIT_SECONDS)

    df["coordinate_source"] = coordinate_source
    df["has_coordinates"] = (
        df["latitude"].notna() & df["longitude"].notna()
    )

    if needs_geocoding_indices:
        logger.info(
            "transform_addresses: geocoding complete — "
            "%d from Base44, %d via Nominatim, %d failed/missing",
            sum(1 for s in coordinate_source if s == "base44"),
            geocoded_count,
            failed_count,
        )

    # ----------------------------------------------------------
    # Normalise address type from label field
    # The Address Form uses a free-text label (Main Office, Home,
    # Branch). We bucket these into three standard types so
    # dashboards can filter without matching raw strings.
    # ----------------------------------------------------------
    label_lower = resolved.get(
        "label", pd.Series("", index=df.index)
    ).fillna("").str.lower().str.strip()

    def _classify_type(label: str) -> str:
        if label in ENTERPRISE_ADDRESS_TYPES:
            return "enterprise"
        if label in PEOPLE_ADDRESS_TYPES:
            return "people"
        return "general"

    df["address_type"] = label_lower.apply(_classify_type)

    # ----------------------------------------------------------
    # Determine linked entity type
    # An address can be linked to a person, an enterprise, or both.
    # We derive this from which foreign key columns are populated.
    # ----------------------------------------------------------
    has_enterprise = (
        df.get("enterprise_id", pd.Series(None, index=df.index))
        .notna()
        .astype(bool)
    )
    has_person = (
        df.get("person_id", pd.Series(None, index=df.index))
        .notna()
        .astype(bool)
    )

    def _linked_entity_type(ent: bool, per: bool) -> str:
        if ent and per:
            return "both"
        if ent:
            return "enterprise"
        if per:
            return "person"
        return "unlinked"

    df["linked_entity_type"] = [
        _linked_entity_type(e, p)
        for e, p in zip(has_enterprise, has_person)
    ]

    # ----------------------------------------------------------
    # Status and active flag
    # ----------------------------------------------------------
    status_col = df.get(
        "status", pd.Series("active", index=df.index)
    ).fillna("active").str.lower().str.strip()

    df["status"] = status_col
    df["is_active"] = status_col.isin({"active", "open", "live"})

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
    # Select and order output columns
    # ----------------------------------------------------------
    output_cols = {
        # Identity
        "id":                 df.get("id"),
        "company_id":         df.get("company_id"),
        "label":              resolved.get("label"),

        # Address fields
        "address_line_1":     resolved.get("address_line_1"),
        "address_line_2":     resolved.get("address_line_2"),
        "city":               resolved.get("city"),
        "state_region":       resolved.get("state_region"),
        "postal_code":        resolved.get("postal_code"),
        "country":            resolved.get("country"),
        "full_address":       df["full_address"],

        # Coordinates
        "latitude":           df["latitude"],
        "longitude":          df["longitude"],
        "has_coordinates":    df["has_coordinates"],
        "coordinate_source":  df["coordinate_source"],

        # Classification
        "address_type":       df["address_type"],
        "linked_entity_type": df["linked_entity_type"],

        # Foreign keys
        "enterprise_id":      df.get("enterprise_id"),
        "person_id":          df.get("person_id"),

        # Status
        "status":             df["status"],
        "is_active":          df["is_active"],

        # Timing
        "created_date":       df.get("created_date"),
        "days_since_created": df["days_since_created"],
    }

    summary = pd.DataFrame({
        k: v for k, v in output_cols.items() if v is not None
    })

    # ----------------------------------------------------------
    # Final logging summary
    # ----------------------------------------------------------
    total = len(summary)
    with_coords = int(summary["has_coordinates"].sum())
    enterprise_linked = int(
        summary["linked_entity_type"].isin({"enterprise", "both"}).sum()
    )
    person_linked = int(
        summary["linked_entity_type"].isin({"person", "both"}).sum()
    )
    active = int(summary["is_active"].sum())

    logger.info(
        "transform_addresses: produced %d address rows — "
        "%d active, %d with coordinates, "
        "%d linked to enterprises, %d linked to people",
        total, active, with_coords,
        enterprise_linked, person_linked,
    )

    if with_coords < total:
        logger.warning(
            "transform_addresses: %d of %d addresses still missing "
            "coordinates after geocoding — check address text quality",
            total - with_coords, total,
        )

    return summary


# ----------------------------------------------------------
# Internal helpers
# ----------------------------------------------------------

def _geocode_address(address: str) -> Optional[tuple[float, float]]:
    """
    Geocode a single address string using Nominatim.

    Called ONLY for addresses that are missing coordinates in Base44.
    Addresses that already have valid lat/lon skip this entirely.

    Returns (latitude, longitude) on success.
    Returns None on failure — callers treat None as a geocoding miss.
    Never raises — failures are logged and handled gracefully.
    """
    try:
        response = requests.get(
            NOMINATIM_URL,
            params={"q": address, "format": "json", "limit": 1},
            headers={"User-Agent": NOMINATIM_USER_AGENT},
            timeout=NOMINATIM_TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()

        if not data:
            logger.debug("_geocode_address: no results for '%s'", address)
            return None

        return float(data[0]["lat"]), float(data[0]["lon"])

    except requests.exceptions.Timeout:
        logger.warning(
            "_geocode_address: timeout after %ss for '%s'",
            NOMINATIM_TIMEOUT, address,
        )
        return None
    except requests.exceptions.HTTPError as e:
        logger.warning(
            "_geocode_address: HTTP %s for '%s'",
            e.response.status_code if e.response else "unknown", address,
        )
        return None
    except (KeyError, ValueError, IndexError) as e:
        logger.warning(
            "_geocode_address: parse error for '%s': %s", address, e
        )
        return None
    except Exception as e:
        logger.warning(
            "_geocode_address: unexpected error for '%s': %s", address, e
        )
        return None


def _empty_summary() -> pd.DataFrame:
    """
    Typed empty DataFrame matching the transform output schema.
    load_dataframe() skips writing this — no false zero snapshots.
    """
    return pd.DataFrame(columns=[
        "id",
        "company_id",
        "label",
        "address_line_1",
        "address_line_2",
        "city",
        "state_region",
        "postal_code",
        "country",
        "full_address",
        "latitude",
        "longitude",
        "has_coordinates",
        "coordinate_source",
        "address_type",
        "linked_entity_type",
        "enterprise_id",
        "person_id",
        "status",
        "is_active",
        "created_date",
        "days_since_created",
    ])
