"""
enrichment/geocoder.py
-----------------------
Address geocoding + timezone + administrative hierarchy.

Forward geocoding  : OSM Nominatim (free, no key, 1 req/sec limit).
Reverse geocoding  : OSM Nominatim reverse endpoint.
Timezone           : timezonefinder Python library (offline, no API).

Returns: lat, lon, timezone, admin_level1 (country), admin_level2 (state/region),
         admin_level3 (city/district), country_code, postcode, formatted_address.
"""

import time
import logging

import httpx

logger = logging.getLogger(__name__)

_NOM_BASE     = "https://nominatim.openstreetmap.org"
_LAST_NOM     = 0.0
_MIN_INTERVAL = 1.1   # OSM requires ≥ 1 req/sec

try:
    from timezonefinder import TimezoneFinder
    _TF = TimezoneFinder()
    _TF_AVAILABLE = True
except ImportError:
    _TF = None
    _TF_AVAILABLE = False
    logger.warning("enrichment/geocoder: 'timezonefinder' not installed — timezone skipped")


# ── Public entry point ────────────────────────────────────────────────────────

def enrich_address(
    address_str: str = None,
    lat: float = None,
    lon: float = None,
) -> dict:
    """
    Given an address string OR existing coordinates, return:
      lat, lon, timezone, admin_level1/2/3, country_code, postcode, formatted_address.

    If lat/lon provided: skip forward geocode, do reverse + timezone only.
    If only address_str: forward geocode to get coordinates, then reverse.
    """
    result: dict = {}

    # ── Step 1: Resolve coordinates ───────────────────────────────────────────
    if lat is not None and lon is not None:
        result["lat"] = float(lat)
        result["lon"] = float(lon)
    elif address_str:
        fwd = _forward_geocode(str(address_str).strip())
        if not fwd.get("lat"):
            return {"enrichment_status": "geocode_failed", "reason": "nominatim_no_result"}
        result.update(fwd)
        lat = result["lat"]
        lon = result["lon"]
    else:
        return {"enrichment_status": "skipped", "reason": "no_input"}

    # ── Step 2: Reverse geocode for admin hierarchy ───────────────────────────
    if lat is not None and lon is not None:
        rev = _reverse_geocode(float(lat), float(lon))
        # Only fill fields not already set by forward geocode
        for k, v in rev.items():
            if k not in result or not result[k]:
                result[k] = v

    # ── Step 3: Timezone (offline) ────────────────────────────────────────────
    if _TF_AVAILABLE and lat is not None and lon is not None:
        try:
            tz = _TF.timezone_at(lat=float(lat), lng=float(lon))
            result["timezone"] = tz or ""
        except Exception:
            result["timezone"] = ""
    else:
        result.setdefault("timezone", "")

    result["enrichment_status"] = "enriched"
    return result


# ── Internal helpers ──────────────────────────────────────────────────────────

def _forward_geocode(address: str) -> dict:
    _throttle()
    try:
        r = httpx.get(
            f"{_NOM_BASE}/search",
            params={
                "q":             address,
                "format":        "json",
                "limit":         1,
                "addressdetails": 1,
            },
            headers={"User-Agent": "Newsconseen/1.0 (contact@newsconseen.com)"},
            timeout=12,
        )
        if r.status_code == 200:
            results = r.json()
            if results:
                d    = results[0]
                addr = d.get("address", {})
                return _parse_address(d, addr)
    except Exception as e:
        logger.debug("_forward_geocode(%s): %s", address[:80], e)
    return {}


def _reverse_geocode(lat: float, lon: float) -> dict:
    _throttle()
    try:
        r = httpx.get(
            f"{_NOM_BASE}/reverse",
            params={
                "lat":           lat,
                "lon":           lon,
                "format":        "json",
                "addressdetails": 1,
            },
            headers={"User-Agent": "Newsconseen/1.0 (contact@newsconseen.com)"},
            timeout=12,
        )
        if r.status_code == 200:
            d    = r.json()
            addr = d.get("address", {})
            return _parse_address(d, addr)
    except Exception as e:
        logger.debug("_reverse_geocode(%s, %s): %s", lat, lon, e)
    return {}


def _parse_address(d: dict, addr: dict) -> dict:
    return {
        "lat":               float(d.get("lat", 0) or 0),
        "lon":               float(d.get("lon", 0) or 0),
        "formatted_address": d.get("display_name", ""),
        "admin_level1":      addr.get("country", ""),
        "admin_level2":      addr.get("state") or addr.get("region") or addr.get("county") or "",
        "admin_level3":      addr.get("city") or addr.get("town") or addr.get("village") or addr.get("suburb") or "",
        "country_code":      (addr.get("country_code") or "").upper(),
        "postcode":          addr.get("postcode", ""),
    }


def _throttle():
    global _LAST_NOM
    wait = _MIN_INTERVAL - (time.time() - _LAST_NOM)
    if wait > 0:
        time.sleep(wait)
    _LAST_NOM = time.time()
