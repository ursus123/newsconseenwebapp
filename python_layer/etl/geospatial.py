import pandas as pd
from shapely.geometry import Point
import geopandas as gpd
import requests
from typing import Optional


# ------------------------------------------------------------
# Helper: Geocode an address using OpenStreetMap Nominatim
# ------------------------------------------------------------
def geocode_address(address: str) -> Optional[tuple]:
    """
    Returns (latitude, longitude) for a given address using OSM Nominatim.
    Returns None if not found.
    """
    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": address,
            "format": "json",
            "limit": 1
        }
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()

        data = response.json()
        if not data:
            return None

        return float(data[0]["lat"]), float(data[0]["lon"])

    except Exception:
        return None


# ------------------------------------------------------------
# Enrich enterprises with coordinates
# ------------------------------------------------------------
def enrich_enterprises_with_coordinates(df: pd.DataFrame) -> gpd.GeoDataFrame:
    """
    Adds latitude, longitude, and geometry columns to enterprise data.
    Expects df to contain an 'address' column.
    """
    df = df.copy()

    latitudes = []
    longitudes = []

    for address in df["address"]:
        result = geocode_address(address)
        if result:
            lat, lon = result
        else:
            lat, lon = None, None

        latitudes.append(lat)
        longitudes.append(lon)

    df["latitude"] = latitudes
    df["longitude"] = longitudes

    # Convert to GeoDataFrame
    gdf = gpd.GeoDataFrame(
        df,
        geometry=[Point(lon, lat) if lat and lon else None for lat, lon in zip(latitudes, longitudes)],
        crs="EPSG:4326"
    )

    return gdf


# ------------------------------------------------------------
# Compute distances between enterprises and service locations
# ------------------------------------------------------------
def compute_distances(enterprises_gdf: gpd.GeoDataFrame, services_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
    """
    Computes distance (in km) between each enterprise and each service location.
    Returns a DataFrame with:
    - enterprise_id
    - service_type
    - distance_km
    """
    enterprises_gdf = enterprises_gdf.to_crs(epsg=3857)
    services_gdf = services_gdf.to_crs(epsg=3857)

    rows = []

    for _, ent in enterprises_gdf.iterrows():
        for _, svc in services_gdf.iterrows():
            if ent.geometry and svc.geometry:
                distance_m = ent.geometry.distance(svc.geometry)
                distance_km = distance_m / 1000.0

                rows.append({
                    "enterprise_id": ent["enterprise_id"],
                    "service_type": svc["service_type"],
                    "distance_km": distance_km
                })

    return pd.DataFrame(rows)


# ------------------------------------------------------------
# Cluster enterprises (optional)
# ------------------------------------------------------------
def cluster_enterprises(gdf: gpd.GeoDataFrame, eps_meters: float = 500) -> gpd.GeoDataFrame:
    """
    Performs DBSCAN clustering on enterprise coordinates.
    eps_meters: cluster radius in meters.
    """
    from sklearn.cluster import DBSCAN

    gdf = gdf.to_crs(epsg=3857)

    coords = gdf.geometry.apply(lambda p: (p.x, p.y)).tolist()

    clustering = DBSCAN(eps=eps_meters, min_samples=2).fit(coords)

    gdf["cluster_id"] = clustering.labels_

    return gdf.to_crs(epsg=4326)
