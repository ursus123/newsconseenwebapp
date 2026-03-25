import logging
import time
from typing import Optional

import pandas as pd
import requests

from etl.base import fetch_json_to_df
from config import settings

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Nominatim configuration
# Nominatim ToS: max 1 request/second, must identify app
# ----------------------------------------------------------
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_USER_AGENT = "newsconseen-app/1.0 (contact@newsconseen.com)"
NOMINATIM_RATE_LIMIT_SECONDS = 1.1
NOMINATIM_TIMEOUT = 10

# ----------------------------------------------------------
# DBSCAN clustering default radius
# 500 metres — enterprises within this radius form a cluster
# ----------------------------------------------------------
DEFAULT_EPS_METERS = 500


def extract_geospatial() -> pd.DataFrame:
    """
    Extract all enterprise records from Base44.
    Geospatial enrichment reads from the enterprises entity —
    the same source as etl/enterprises.py.
    """
    return fetch_json_to_df(settings.base44_enterprises_url)


def transform_geospatial(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform enterprise records into a geospatial reference table
    suitable for REPLACING analytics.geospatial_summary.

    NOTE: This table uses load_dataframe_replace() not load_dataframe().
    Enterprise locations do not change daily — there is no time series
    dimension. Appending daily would grow the table with duplicate rows.

    Coordinate strategy (in priority order):
        1. address_summary table in Railway — populated by etl/addresses.py
           which already geocodes via Base44 frontend or Nominatim fallback.
           This is the preferred source — avoids duplicate Nominatim calls.
        2. Legacy geocode cache from geospatial_summary — used for addresses
           that predate the address_summary table.
        3. Nominatim fallback — only for addresses with no coordinates in
           either Railway table. Rate-limited to 1 req/second.

    Steps:
        1. Load coordinates from address_summary (joined by enterprise_id)
        2. For any enterprises with no match, fall back to geocode cache
        3. For remaining gaps, call Nominatim
        4. Run DBSCAN clustering on all coordinates
        5. Return one row per enterprise with lat/lon/cluster

    Output columns:
        enterprise_id, company_id, name, enterprise_type, status,
        primary_address, latitude, longitude, geocoded_at,
        geocode_source, cluster_id
    """
    if df.empty:
        logger.warning("transform_geospatial: received empty DataFrame")
        return _empty_summary()

    df = df.copy()

    # ----------------------------------------------------------
    # Ensure identifying columns exist
    # ----------------------------------------------------------
    if "id" not in df.columns:
        logger.error("transform_geospatial: missing 'id' column — returning empty")
        return _empty_summary()

    df["primary_address"] = df.get(
        "primary_address", pd.Series("", index=df.index)
    )

    # ----------------------------------------------------------
    # Step 1 — load coordinates from address_summary
    # etl/addresses.py already geocoded these via Base44 or Nominatim.
    # Join on enterprise_id to pull lat/lon without re-geocoding.
    # ----------------------------------------------------------
    address_coords = _load_address_summary_coords()

    latitudes = []
    longitudes = []
    geocoded_at_list = []
    geocode_sources = []

    ids = df["id"].tolist()
    addresses = df["primary_address"].tolist()

    geocode_needed_indices = []

    for i, (eid, address) in enumerate(zip(ids, addresses)):
        address_str = str(address).strip() if pd.notna(address) else ""

        # address_summary hit — best source, no Nominatim call needed
        if eid in address_coords:
            coords = address_coords[eid]
            latitudes.append(coords["latitude"])
            longitudes.append(coords["longitude"])
            geocoded_at_list.append(coords["geocoded_at"])
            geocode_sources.append("address_summary")
            logger.debug("geospatial: address_summary hit for enterprise %s", eid)
            continue

        if not address_str or address_str.lower() in ("none", "nan", ""):
            latitudes.append(None)
            longitudes.append(None)
            geocoded_at_list.append(None)
            geocode_sources.append("skipped_no_address")
            continue

        # No match in address_summary — flag for cache/Nominatim fallback
        geocode_needed_indices.append(i)
        latitudes.append(None)
        longitudes.append(None)
        geocoded_at_list.append(None)
        geocode_sources.append("nominatim")

    # ----------------------------------------------------------
    # Step 2 — legacy geocode cache fallback
    # For any enterprise not in address_summary, check the existing
    # geospatial_summary cache before calling Nominatim.
    # ----------------------------------------------------------
    if geocode_needed_indices:
        legacy_cache = _load_geocode_cache()
        still_needed = []

        for i in geocode_needed_indices:
            eid = ids[i]
            address_str = str(addresses[i]).strip()

            if eid in legacy_cache and legacy_cache[eid]["address"] == address_str:
                latitudes[i] = legacy_cache[eid]["latitude"]
                longitudes[i] = legacy_cache[eid]["longitude"]
                geocoded_at_list[i] = legacy_cache[eid]["geocoded_at"]
                geocode_sources[i] = "cache"
                logger.debug("geospatial: legacy cache hit for enterprise %s", eid)
            else:
                still_needed.append(i)

        geocode_needed_indices = still_needed

    # ----------------------------------------------------------
    # Step 3 — Nominatim fallback for remaining gaps
    # Rate-limited to respect Nominatim ToS (1 req/second)
    # ----------------------------------------------------------
    now_ts = pd.Timestamp.now(tz="UTC")

    for idx, i in enumerate(geocode_needed_indices):
        address_str = str(addresses[i]).strip()
        result = geocode_address(address_str)

        if result:
            latitudes[i] = result[0]
            longitudes[i] = result[1]
            geocoded_at_list[i] = now_ts
            logger.info(
                "geospatial: geocoded enterprise %s → (%.4f, %.4f)",
                ids[i], result[0], result[1],
            )
        else:
            geocode_sources[i] = "nominatim_failed"
            logger.warning(
                "geospatial: geocoding failed for enterprise %s address='%s'",
                ids[i], address_str,
            )

        # Rate limit — pause between requests, not after the last one
        if idx < len(geocode_needed_indices) - 1:
            time.sleep(NOMINATIM_RATE_LIMIT_SECONDS)

    logger.info(
        "geospatial: coordinate sources — "
        "address_summary=%d, cache=%d, nominatim=%d, failed=%d, skipped=%d",
        sum(1 for s in geocode_sources if s == "address_summary"),
        sum(1 for s in geocode_sources if s == "cache"),
        sum(1 for s in geocode_sources if s == "nominatim"),
        sum(1 for s in geocode_sources if s == "nominatim_failed"),
        sum(1 for s in geocode_sources if s == "skipped_no_address"),
    )

    # ----------------------------------------------------------
    # Build enriched DataFrame
    # ----------------------------------------------------------
    df["latitude"] = latitudes
    df["longitude"] = longitudes
    df["geocoded_at"] = geocoded_at_list
    df["geocode_source"] = geocode_sources

    # ----------------------------------------------------------
    # Step 4 — DBSCAN clustering on geocoded coordinates
    # ----------------------------------------------------------
    df = _cluster_enterprises(df)

    # ----------------------------------------------------------
    # Select output columns
    # ----------------------------------------------------------
    output_cols = {
        "enterprise_id":   df.get("id"),
        "company_id":      df.get("company_id"),
        "name":            df.get("name"),
        "enterprise_type": df.get("enterprise_type"),
        "status":          df.get("status"),
        "primary_address": df["primary_address"],
        "latitude":        df["latitude"],
        "longitude":       df["longitude"],
        "geocoded_at":     df["geocoded_at"],
        "geocode_source":  df["geocode_source"],
        "cluster_id":      df.get("cluster_id"),
    }

    summary = pd.DataFrame({
        k: v for k, v in output_cols.items() if v is not None
    })

    logger.info(
        "transform_geospatial: produced %d geospatial rows, "
        "%d with valid coordinates",
        len(summary),
        summary["latitude"].notna().sum(),
    )

    return summary


# ----------------------------------------------------------
# Internal helpers
# ----------------------------------------------------------

def _load_address_summary_coords() -> dict:
    """
    Load enterprise coordinates from analytics.address_summary.
    This is populated by etl/addresses.py and is the preferred
    coordinate source — avoids duplicate Nominatim calls.

    Returns dict keyed by enterprise_id:
        { enterprise_id: { latitude, longitude, geocoded_at } }

    Returns empty dict if address_summary does not exist yet
    (e.g. first run before addresses ETL has run).
    """
    try:
        from database import get_engine
        from sqlalchemy import text

        engine = get_engine()
        with engine.connect() as conn:
            result = conn.execute(text(
                "SELECT enterprise_id, latitude, longitude, created_date "
                "FROM analytics.address_summary "
                "WHERE enterprise_id IS NOT NULL "
                "AND latitude IS NOT NULL "
                "AND longitude IS NOT NULL"
            ))
            rows = result.fetchall()

        coords = {}
        for row in rows:
            # If an enterprise has multiple addresses, last one wins.
            # Primary address is preferred — future improvement: filter
            # on address_type = 'enterprise' when that column is reliable.
            coords[row.enterprise_id] = {
                "latitude":   row.latitude,
                "longitude":  row.longitude,
                "geocoded_at": row.created_date,
            }

        logger.info(
            "geospatial: loaded %d enterprise coordinates from address_summary",
            len(coords),
        )
        return coords

    except Exception as e:
        logger.info(
            "geospatial: address_summary unavailable (%s) — "
            "falling back to geocode cache and Nominatim", e
        )
        return {}


def geocode_address(address: str) -> Optional[tuple[float, float]]:
    """
    Geocode a single address string using Nominatim.

    Returns (latitude, longitude) on success.
    Returns None on failure — logs the specific reason.
    Never raises — callers treat None as a geocoding miss.
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
            logger.debug("geocode_address: no results for '%s'", address)
            return None

        return float(data[0]["lat"]), float(data[0]["lon"])

    except requests.exceptions.Timeout:
        logger.warning("geocode_address: timeout for '%s'", address)
        return None
    except requests.exceptions.HTTPError as e:
        logger.warning("geocode_address: HTTP %s for '%s'", e.response.status_code, address)
        return None
    except (KeyError, ValueError, IndexError) as e:
        logger.warning("geocode_address: parse error for '%s': %s", address, e)
        return None
    except Exception as e:
        logger.warning("geocode_address: unexpected error for '%s': %s", address, e)
        return None


def _load_geocode_cache() -> dict:
    """
    Load existing geocoded coordinates from analytics.geospatial_summary.
    Legacy fallback for enterprises not yet in address_summary.

    Returns dict keyed by enterprise_id:
        { enterprise_id: { address, latitude, longitude, geocoded_at } }

    Returns empty dict if Railway is unavailable or table does not exist yet.
    """
    try:
        from database import get_engine
        from sqlalchemy import text

        engine = get_engine()
        with engine.connect() as conn:
            result = conn.execute(text(
                "SELECT enterprise_id, primary_address, latitude, longitude, geocoded_at "
                "FROM analytics.geospatial_summary "
                "WHERE latitude IS NOT NULL"
            ))
            rows = result.fetchall()

        cache = {}
        for row in rows:
            cache[row.enterprise_id] = {
                "address":    row.primary_address,
                "latitude":   row.latitude,
                "longitude":  row.longitude,
                "geocoded_at": row.geocoded_at,
            }

        logger.info(
            "geospatial: loaded %d entries from legacy geocode cache", len(cache)
        )
        return cache

    except Exception as e:
        logger.info(
            "geospatial: legacy cache unavailable (%s) — will geocode from scratch", e
        )
        return {}


def _cluster_enterprises(df: pd.DataFrame, eps_meters: float = DEFAULT_EPS_METERS) -> pd.DataFrame:
    """
    Run DBSCAN spatial clustering on enterprise coordinates.

    Enterprises within eps_meters of each other are assigned
    the same cluster_id. Isolated enterprises get cluster_id = -1.

    Lazy imports geopandas and sklearn so the app starts cleanly
    in environments where these packages are not installed.
    """
    df = df.copy()

    valid = df["latitude"].notna() & df["longitude"].notna()

    if valid.sum() < 2:
        logger.info(
            "geospatial: fewer than 2 geocoded addresses — skipping clustering"
        )
        df["cluster_id"] = -1
        return df

    try:
        import geopandas as gpd
        from shapely.geometry import Point
        from sklearn.cluster import DBSCAN

        gdf = gpd.GeoDataFrame(
            df[valid].copy(),
            geometry=[
                Point(lon, lat)
                for lat, lon in zip(df.loc[valid, "latitude"], df.loc[valid, "longitude"])
            ],
            crs="EPSG:4326",
        ).to_crs(epsg=3857)

        coords = [(p.x, p.y) for p in gdf.geometry]
        labels = DBSCAN(eps=eps_meters, min_samples=2).fit(coords).labels_

        df.loc[valid, "cluster_id"] = labels
        df["cluster_id"] = df["cluster_id"].fillna(-1).astype(int)

        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        logger.info(
            "geospatial: DBSCAN found %d cluster(s) across %d geocoded enterprises",
            n_clusters, valid.sum(),
        )

    except ImportError:
        logger.warning(
            "geospatial: geopandas/sklearn not available — skipping clustering"
        )
        df["cluster_id"] = -1

    except Exception as e:
        logger.warning("geospatial: clustering failed (%s) — setting cluster_id = -1", e)
        df["cluster_id"] = -1

    return df


def _empty_summary() -> pd.DataFrame:
    """
    Typed empty DataFrame matching the transform output schema.
    """
    return pd.DataFrame(columns=[
        "enterprise_id",
        "company_id",
        "name",
        "enterprise_type",
        "status",
        "primary_address",
        "latitude",
        "longitude",
        "geocoded_at",
        "geocode_source",
        "cluster_id",
    ])
