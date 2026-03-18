import time
import pandas as pd
import requests
from typing import Optional

from etl.base import fetch_json_to_df
from config import settings

NOMINATIM_USER_AGENT = "newsconseen-app/1.0"
NOMINATIM_RATE_LIMIT_SECONDS = 1.1


def geocode_address(address: str) -> Optional[tuple]:
    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {"q": address, "format": "json", "limit": 1}
        headers = {"User-Agent": NOMINATIM_USER_AGENT}
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        if not data:
            return None
        return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        return None


def enrich_enterprises_with_coordinates(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adds latitude and longitude columns to enterprise data.
    Throttles requests to comply with Nominatim's 1 req/sec policy.
    """
    df = df.copy()
    latitudes, longitudes = [], []

    for i, address in enumerate(df.get("primary_address", [])):
        result = geocode_address(str(address))
        lat, lon = result if result else (None, None)
        latitudes.append(lat)
        longitudes.append(lon)
        if i < len(df) - 1:
            time.sleep(NOMINATIM_RATE_LIMIT_SECONDS)

    df["latitude"] = latitudes
    df["longitude"] = longitudes
    return df


def cluster_enterprises(df: pd.DataFrame, eps_meters: float = 500) -> pd.DataFrame:
    """
    Performs DBSCAN clustering on enterprise coordinates.
    Lazy-imports geopandas and sklearn so DAG loading doesn't fail
    if these packages aren't available in the Airflow container.
    """
    try:
        import geopandas as gpd
        from shapely.geometry import Point
        from sklearn.cluster import DBSCAN

        gdf = gpd.GeoDataFrame(
            df,
            geometry=[
                Point(lon, lat) if lat and lon else None
                for lat, lon in zip(df["longitude"], df["latitude"])
            ],
            crs="EPSG:4326",
        )
        gdf = gdf.to_crs(epsg=3857)
        coords = gdf.geometry.apply(lambda p: (p.x, p.y) if p else (0, 0)).tolist()
        clustering = DBSCAN(eps=eps_meters, min_samples=2).fit(coords)
        df["cluster_id"] = clustering.labels_
    except ImportError:
        # geopandas/sklearn not available — skip clustering, add null column
        df["cluster_id"] = None

    return df


def extract() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_enterprises_url)


def transform(df: pd.DataFrame) -> pd.DataFrame:
    df = enrich_enterprises_with_coordinates(df)
    df = cluster_enterprises(df)
    return df