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

    Steps:
        1. Load existing geocoded coordinates from Railway (cache)
        2. Geocode only addresses not already cached or whose
           primary_address has changed since last geocode
        3. Run DBSCAN clustering on all coordinates
        4. Return one row per enterprise with lat/lon/cluster

    Output columns:
        enterprise_id, company_id, name, enterprise_type,
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

    df["primary_address"] = df.get("primary_address", pd.Series("", index=df.index))

    # ----------------------------------------------------------
    # Load existing geocode cache from Railway
    # Avoids re-geocoding unchanged addresses every night
    # ----------------------------------------------------------
    cached = _load_geocode_cache()

    # ----------------------------------------------------------
    # Geocode addresses that are new or have changed
    # ----------------------------------------------------------
    latitudes = []
    longitudes = []
    geocoded_at_list = []
    geocode_sources = []

    addresses = df["primary_address"].tolist()
    ids = df["id"].tolist()
    geocode_needed = []

    for i, (eid, address) in enumerate(zip(ids, addresses)):
        address_str = str(address).strip() if pd.notna(address) else ""

        if not address_str or address_str.lower() in ("none", "nan", ""):
            latitudes.append(None)
            longitudes.append(None)
            geocoded_at_list.append(None)
            geocode_sources.append("skipped_no_address")
            continue

        # Check cache — use cached coords if address unchanged
        if eid in cached and cached[eid]["address"] == address_str:
            latitudes.append(cached[eid]["latitude"])
            longitudes.append(cached[eid]["longitude"])
            geocoded_at_list.append(cached[eid]["geocoded_at"])
            geocode_sources.append("cache")
            logger.debug("geospatial: cache hit for enterprise %s", eid)
            continue

        # Address is new or changed — needs geocoding
        geocode_needed.append(i)
        latitudes.append(None)
        longitudes.append(None)
        geocoded_at_list.append(None)
        geocode_sources.append("nominatim")

    # ----------------------------------------------------------
    # Geocode only the addresses that need it
    # Rate-limited to respect Nominatim ToS
    # ----------------------------------------------------------
    now_ts = pd.Timestamp.now(tz="UTC")

    for idx, i in enumerate(geocode_needed):
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
        if idx < len(geocode_needed) - 1:
            time.sleep(NOMINATIM_RATE_LIMIT_SECONDS)

    if geocode_needed:
        logger.info(
            "geospatial: geocoded %d new/changed addresses, "
            "%d served from cache, %d skipped",
            len(geocode_needed),
            sum(1 for s in geocode_sources if s == "cache"),
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
    # DBSCAN clustering on geocoded coordinates
    # ----------------------------------------------------------
    df = _cluster_enterprises(df)

    # ----------------------------------------------------------
    # Select output columns using safe .get() pattern
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
    Load existing geocoded coordinates from Railway.
    Returns dict keyed by enterprise_id:
        { enterprise_id: { address, latitude, longitude, geocoded_at } }

    Returns empty dict if Railway is unavailable or table does not exist yet.
    This is safe — a cache miss just triggers a fresh geocode.
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

        logger.info("geospatial: loaded %d cached coordinates from Railway", len(cache))
        return cache

    except Exception as e:
        logger.info(
            "geospatial: cache unavailable (%s) — will geocode all addresses", e
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
