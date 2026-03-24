from fastapi import APIRouter, Query
from typing import Optional
from open_data.geospatial import (
    geocode,
    reverse_geocode,
    get_competitors,
    get_geo_overview,
    get_isochrone,
)

router = APIRouter(prefix="/geo", tags=["Geospatial"])


@router.get("/geocode")
def geo_geocode(
    address: str = Query(..., description="Full address string e.g. '123 Main St, Bethesda MD'"),
):
    """
    Convert address to lat/lon.
    SELECT * FROM geo_geocode WHERE address = '123 Main St Bethesda MD'
    """
    return geocode(address)


@router.get("/reverse")
def geo_reverse(
    lat: float = Query(...),
    lon: float = Query(...),
):
    """
    Convert lat/lon to address.
    SELECT * FROM geo_reverse WHERE lat = 38.98 AND lon = -77.10
    """
    return reverse_geocode(lat, lon)


@router.get("/competitors")
def geo_competitors(
    lat: float = Query(...),
    lon: float = Query(...),
    category: str = Query("healthcare", description="healthcare, home_care, pharmacy, school, church, restaurant, farm_supply, bank, shelter, gym"),
    radius_meters: int = Query(5000, ge=500, le=25000),
    limit: int = Query(20, ge=1, le=100),
):
    """
    Nearby businesses by type from OpenStreetMap.
    SELECT * FROM geo_competitors WHERE lat=38.98 AND lon=-77.10 AND category='home_care' AND radius_meters=5000
    """
    return {"results": get_competitors(
        lat=lat, lon=lon,
        category=category,
        radius_meters=radius_meters,
        limit=limit,
    )}


@router.get("/overview")
def geo_overview(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_meters: int = Query(5000, ge=500, le=25000),
):
    """
    Area overview — counts of nearby amenities by category.
    SELECT * FROM geo_overview WHERE lat=38.98 AND lon=-77.10 AND radius_meters=5000
    """
    return get_geo_overview(lat=lat, lon=lon, radius_meters=radius_meters)


@router.get("/isochrone")
def geo_isochrone(
    lat: float = Query(...),
    lon: float = Query(...),
    minutes: int = Query(15, ge=5, le=60),
    mode: str = Query("driving", description="driving, walking, cycling"),
):
    """
    Drive/walk-time catchment area polygon.
    SELECT * FROM geo_isochrone WHERE lat=38.98 AND lon=-77.10 AND minutes=15 AND mode='driving'
    """
    return get_isochrone(lat=lat, lon=lon, minutes=minutes, mode=mode)
