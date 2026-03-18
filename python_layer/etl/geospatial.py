import time
import pandas as pd
from shapely.geometry import Point
import geopandas as gpd
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


def enrich_enterprises_with_coordinates(df: pd.DataFrame) -> gpd.GeoDataFrame:
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

    gdf = gpd.GeoDataFrame(
        df,
        geometry=[
            Point(lon, lat) if lat and lon else None
            for lat, lon in zip(latitudes, longitudes)
        ],
        crs="EPSG:4326",
    )
    return gdf


def cluster_enterprises(gdf: gpd.GeoDataFrame, eps_meters: float = 500) -> gpd.GeoDataFrame:
    from sklearn.cluster import DBSCAN
    gdf = gdf.to_crs(epsg=3857)
    coords = gdf.geometry.apply(lambda p: (p.x, p.y) if p else (0, 0)).tolist()
    clustering = DBSCAN(eps=eps_meters, min_samples=2).fit(coords)
    gdf["cluster_id"] = clustering.labels_
    return gdf.to_crs(epsg=4326)


def extract() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_enterprises_url)


def transform(df: pd.DataFrame) -> pd.DataFrame:
    gdf = enrich_enterprises_with_coordinates(df)
    gdf = cluster_enterprises(gdf)
    return pd.DataFrame(gdf.drop(columns=["geometry"]))