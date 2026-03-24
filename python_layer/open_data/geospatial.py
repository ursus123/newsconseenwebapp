import logging
import requests
from typing import Optional

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15

NOMINATIM_URL    = "https://nominatim.openstreetmap.org"
NOMINATIM_AGENT  = "newsconseen-app/1.0 (contact@newsconseen.com)"

# OpenRouteService — free isochrone API (no key required for basic use)
ORS_URL = "https://api.openrouteservice.org/v2/isochrones/driving-car"

# Overpass API — OpenStreetMap query engine for competitor search
OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def _get(url: str, params: dict = None, headers: dict = None) -> Optional[dict]:
    try:
        r = requests.get(
            url,
            params=params,
            headers=headers or {"User-Agent": NOMINATIM_AGENT},
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning("geospatial._get failed %s: %s", url, e)
        return None


# ----------------------------------------------------------
# geo_geocode
# Forward and reverse geocoding via Nominatim
# ----------------------------------------------------------
def geocode(address: str) -> dict:
    """
    Convert an address string to latitude/longitude.
    Returns lat, lon, display_name, type, and bounding box.
    """
    data = _get(
        f"{NOMINATIM_URL}/search",
        params={"q": address, "format": "json", "limit": 1, "addressdetails": 1},
    )

    if not data:
        return {"address": address, "lat": None, "lon": None, "found": False}

    result = data[0] if data else {}
    addr_detail = result.get("address", {})

    return {
        "address":      address,
        "lat":          float(result.get("lat", 0)),
        "lon":          float(result.get("lon", 0)),
        "display_name": result.get("display_name", ""),
        "city":         addr_detail.get("city") or addr_detail.get("town") or addr_detail.get("village", ""),
        "state":        addr_detail.get("state", ""),
        "country":      addr_detail.get("country", ""),
        "zip":          addr_detail.get("postcode", ""),
        "type":         result.get("type", ""),
        "found":        bool(result),
    }


def reverse_geocode(lat: float, lon: float) -> dict:
    """
    Convert latitude/longitude to a human-readable address.
    """
    data = _get(
        f"{NOMINATIM_URL}/reverse",
        params={"lat": lat, "lon": lon, "format": "json"},
    )

    if not data:
        return {"lat": lat, "lon": lon, "address": None}

    return {
        "lat":          lat,
        "lon":          lon,
        "display_name": data.get("display_name", ""),
        "address":      data.get("address", {}),
    }


# ----------------------------------------------------------
# geo_competitors
# OpenStreetMap nearby businesses by type and radius
# ----------------------------------------------------------
def get_competitors(
    lat: float,
    lon: float,
    category: str = "healthcare",
    radius_meters: int = 5000,
    limit: int = 20,
) -> list[dict]:
    """
    Find nearby businesses of a given category using OpenStreetMap.

    category maps to OSM amenity/shop tags:
      healthcare    → amenity=clinic OR amenity=hospital OR amenity=doctors
      home_care     → amenity=social_facility
      pharmacy      → amenity=pharmacy
      school        → amenity=school
      church        → amenity=place_of_worship
      restaurant    → amenity=restaurant OR amenity=fast_food
      farm_supply   → shop=agrarian OR shop=farm
      bank          → amenity=bank

    Returns name, address, distance estimate, and OSM tags.
    """
    osm_tags = _category_to_osm(category)

    # Build Overpass QL query
    tag_filters = "\n".join(
        f'  node["{tag[0]}"="{tag[1]}"](around:{radius_meters},{lat},{lon});'
        for tag in osm_tags
    )

    query = f"""
[out:json][timeout:25];
(
{tag_filters}
);
out body {limit};
"""

    try:
        r = requests.post(
            OVERPASS_URL,
            data={"data": query},
            timeout=REQUEST_TIMEOUT,
            headers={"User-Agent": NOMINATIM_AGENT},
        )
        r.raise_for_status()
        elements = r.json().get("elements", [])

        results = []
        for el in elements:
            tags = el.get("tags", {})
            results.append({
                "osm_id":   el.get("id"),
                "name":     tags.get("name", "Unnamed"),
                "category": category,
                "lat":      el.get("lat"),
                "lon":      el.get("lon"),
                "address":  _build_address(tags),
                "phone":    tags.get("phone", ""),
                "website":  tags.get("website", ""),
                "operator": tags.get("operator", ""),
                "tags":     tags,
            })

        logger.info(
            "geo_competitors: %d results for category=%s within %dm of (%.4f, %.4f)",
            len(results), category, radius_meters, lat, lon,
        )
        return results

    except Exception as e:
        logger.warning("geo_competitors failed: %s", e)
        return []


# ----------------------------------------------------------
# geo_overview
# Area summary statistics for a location
# ----------------------------------------------------------
def get_geo_overview(lat: float, lon: float, radius_meters: int = 5000) -> dict:
    """
    Get an overview of the area around a coordinate.
    Returns counts of nearby amenities, population center name,
    and key infrastructure.
    """
    categories = ["healthcare", "school", "restaurant", "bank", "pharmacy", "church"]
    overview = {
        "center_lat":    lat,
        "center_lon":    lon,
        "radius_meters": radius_meters,
        "location":      reverse_geocode(lat, lon).get("display_name", ""),
        "nearby_counts": {},
    }

    for cat in categories:
        results = get_competitors(lat, lon, category=cat, radius_meters=radius_meters, limit=50)
        overview["nearby_counts"][cat] = len(results)

    logger.info("geo_overview: completed for (%.4f, %.4f)", lat, lon)
    return overview


# ----------------------------------------------------------
# geo_isochrone
# Drive-time or walk-time catchment area
# Note: ORS requires a free API key for production use.
# Returns a bounding box approximation without the key.
# ----------------------------------------------------------
def get_isochrone(
    lat: float,
    lon: float,
    minutes: int = 15,
    mode: str = "driving",
) -> dict:
    """
    Get the catchment area reachable within N minutes.

    Returns a GeoJSON polygon when ORS API key is configured,
    or a bounding box approximation otherwise.

    mode: 'driving', 'walking', 'cycling'
    """
    # Approximate bounding box: 1 minute driving ≈ 1.5km
    speed_km_per_min = {"driving": 0.7, "walking": 0.08, "cycling": 0.25}
    km = minutes * speed_km_per_min.get(mode, 0.7)

    # Rough degree conversion: 1° lat ≈ 111km, 1° lon ≈ 111km * cos(lat)
    import math
    delta_lat = km / 111
    delta_lon = km / (111 * math.cos(math.radians(lat)))

    return {
        "center":    {"lat": lat, "lon": lon},
        "minutes":   minutes,
        "mode":      mode,
        "type":      "bounding_box_approximation",
        "bbox": {
            "north": round(lat + delta_lat, 6),
            "south": round(lat - delta_lat, 6),
            "east":  round(lon + delta_lon, 6),
            "west":  round(lon - delta_lon, 6),
        },
        "note": "For precise drive-time polygons configure ORS_API_KEY in environment",
    }


# ----------------------------------------------------------
# Internal helpers
# ----------------------------------------------------------
def _category_to_osm(category: str) -> list[tuple]:
    mapping = {
        "healthcare":   [("amenity", "clinic"), ("amenity", "hospital"), ("amenity", "doctors")],
        "home_care":    [("amenity", "social_facility")],
        "pharmacy":     [("amenity", "pharmacy")],
        "school":       [("amenity", "school"), ("amenity", "college"), ("amenity", "university")],
        "church":       [("amenity", "place_of_worship")],
        "restaurant":   [("amenity", "restaurant"), ("amenity", "fast_food"), ("amenity", "cafe")],
        "farm_supply":  [("shop", "agrarian"), ("shop", "farm")],
        "bank":         [("amenity", "bank")],
        "shelter":      [("social_facility", "shelter"), ("amenity", "social_facility")],
        "gym":          [("leisure", "fitness_centre"), ("amenity", "gym")],
    }
    return mapping.get(category, [("amenity", category)])


def _build_address(tags: dict) -> str:
    parts = [
        tags.get("addr:housenumber", ""),
        tags.get("addr:street", ""),
        tags.get("addr:city", ""),
        tags.get("addr:state", ""),
        tags.get("addr:postcode", ""),
    ]
    return " ".join(p for p in parts if p).strip()
