"""
proxy_routes.py
───────────────
Thin passthrough proxies so the React frontend never calls external
APIs directly.  All external HTTP calls must go through python_layer
(rate-limiting, caching, audit, provider-swap).

Rule: the React frontend calls ${RAILWAY_URL}/proxy/... instead of
      calling the upstream provider directly.
"""

from fastapi import APIRouter, Request
import httpx

router = APIRouter(prefix="/proxy", tags=["Proxy"])

_TIMEOUT = 10  # seconds


def _fwd(upstream_url: str, request: Request, extra_headers: dict | None = None) -> dict:
    """Forward all query params from the incoming request to upstream_url."""
    params = dict(request.query_params)
    headers = {"User-Agent": "newsconseen/1.0"}
    if extra_headers:
        headers.update(extra_headers)
    try:
        r = httpx.get(upstream_url, params=params, headers=headers, timeout=_TIMEOUT)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPStatusError as e:
        return {"error": f"upstream {e.response.status_code}", "detail": e.response.text[:200]}
    except Exception as e:
        return {"error": str(e)}


# ── Nominatim (OpenStreetMap geocoding) ───────────────────────────────────────

@router.get("/nominatim/search")
def nominatim_search(request: Request):
    """
    Geocode an address to lat/lon.
    Frontend replaces: https://nominatim.openstreetmap.org/search?...
    With:              ${RAILWAY_URL}/proxy/nominatim/search?...
    Same query-string interface, same raw response format.
    """
    return _fwd("https://nominatim.openstreetmap.org/search", request)


@router.get("/nominatim/reverse")
def nominatim_reverse(request: Request):
    """
    Reverse-geocode lat/lon to an address.
    Frontend replaces: https://nominatim.openstreetmap.org/reverse?...
    With:              ${RAILWAY_URL}/proxy/nominatim/reverse?...
    """
    return _fwd("https://nominatim.openstreetmap.org/reverse", request)


@router.get("/nominatim/details")
def nominatim_details(request: Request):
    """
    OSM object details (used for city population via extratags).
    Frontend replaces: https://nominatim.openstreetmap.org/details?...
    With:              ${RAILWAY_URL}/proxy/nominatim/details?...
    """
    return _fwd("https://nominatim.openstreetmap.org/details", request)


# ── World Bank ────────────────────────────────────────────────────────────────

@router.get("/worldbank/{country}/indicator/{indicator}")
def worldbank_indicator(country: str, indicator: str, request: Request):
    """
    World Bank development indicators — raw WB response format.
    Frontend replaces: https://api.worldbank.org/v2/country/{country}/indicator/{indicator}?...
    With:              ${RAILWAY_URL}/proxy/worldbank/{country}/indicator/{indicator}?...
    """
    url = f"https://api.worldbank.org/v2/country/{country}/indicator/{indicator}"
    params = dict(request.query_params)
    params.setdefault("format", "json")
    try:
        r = httpx.get(url, params=params, timeout=_TIMEOUT)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return [None, []]


# ── Exchange rates ────────────────────────────────────────────────────────────

@router.get("/exchange-rates")
def exchange_rates_raw(request: Request):
    """
    Raw exchange rates from open.er-api.com.
    Frontend replaces: https://open.er-api.com/v6/latest/{base}
    With:              ${RAILWAY_URL}/proxy/exchange-rates?base={base}
    Response: { rates: {USD: 1, EUR: 0.9, ...}, time_last_update_utc: "..." }
    """
    base = request.query_params.get("base", "USD")
    return _fwd(f"https://open.er-api.com/v6/latest/{base}", request)


# ── REST Countries ────────────────────────────────────────────────────────────

@router.get("/restcountries/alpha/{code}")
def restcountries_alpha(code: str, request: Request):
    """
    Country data by ISO alpha-2 or alpha-3 code.
    Frontend replaces: https://restcountries.com/v3.1/alpha/{code}
    With:              ${RAILWAY_URL}/proxy/restcountries/alpha/{code}
    """
    return _fwd(f"https://restcountries.com/v3.1/alpha/{code}", request)


@router.get("/restcountries/name/{name}")
def restcountries_name(name: str, request: Request):
    """
    Country data by name.
    Frontend replaces: https://restcountries.com/v3.1/name/{name}?...
    With:              ${RAILWAY_URL}/proxy/restcountries/name/{name}?...
    """
    return _fwd(f"https://restcountries.com/v3.1/name/{name}", request)


@router.get("/restcountries/region/{region}")
def restcountries_region(region: str, request: Request):
    return _fwd(f"https://restcountries.com/v3.1/region/{region}", request)


@router.get("/restcountries/all")
def restcountries_all(request: Request):
    return _fwd("https://restcountries.com/v3.1/all", request)


# ── Open-Meteo (weather + air quality) ───────────────────────────────────────

@router.get("/openmeteo/forecast")
def openmeteo_forecast(request: Request):
    """
    Open-Meteo weather forecast — arbitrary parameters forwarded.
    Frontend replaces: https://api.open-meteo.com/v1/forecast?...
    With:              ${RAILWAY_URL}/proxy/openmeteo/forecast?...
    """
    return _fwd("https://api.open-meteo.com/v1/forecast", request)


@router.get("/openmeteo/air-quality")
def openmeteo_air_quality(request: Request):
    """
    Open-Meteo air quality API.
    Frontend replaces: https://air-quality-api.open-meteo.com/v1/air-quality?...
    With:              ${RAILWAY_URL}/proxy/openmeteo/air-quality?...
    """
    return _fwd("https://air-quality-api.open-meteo.com/v1/air-quality", request)


# ── Overpass (OpenStreetMap POI queries) ──────────────────────────────────────

@router.get("/overpass")
def overpass_query(request: Request):
    """
    Overpass API for OSM point-of-interest queries.
    Frontend replaces: https://overpass-api.de/api/interpreter?data=...
    With:              ${RAILWAY_URL}/proxy/overpass?data=...
    """
    return _fwd("https://overpass-api.de/api/interpreter", request)


# ── FDA APIs ──────────────────────────────────────────────────────────────────

@router.get("/fda/device/recall")
def fda_device_recall(request: Request):
    """
    FDA device recalls (raw openFDA format).
    Frontend replaces: https://api.fda.gov/device/recall.json?...
    With:              ${RAILWAY_URL}/proxy/fda/device/recall?...
    """
    return _fwd("https://api.fda.gov/device/recall.json", request)


@router.get("/fda/food/enforcement")
def fda_food_enforcement(request: Request):
    """
    FDA food enforcement (raw openFDA format).
    Frontend replaces: https://api.fda.gov/food/enforcement.json?...
    With:              ${RAILWAY_URL}/proxy/fda/food/enforcement?...
    """
    return _fwd("https://api.fda.gov/food/enforcement.json", request)


@router.get("/fda/drug/label")
def fda_drug_label(request: Request):
    """
    FDA drug label (raw openFDA format).
    Frontend replaces: https://api.fda.gov/drug/label.json?...
    With:              ${RAILWAY_URL}/proxy/fda/drug/label?...
    """
    return _fwd("https://api.fda.gov/drug/label.json", request)


# ── US Census Bureau ──────────────────────────────────────────────────────────

@router.get("/census/acs5")
def census_acs5(request: Request):
    """
    US Census ACS5 — arbitrary variable/geography combinations.
    Frontend replaces: https://api.census.gov/data/2022/acs/acs5?...
    With:              ${RAILWAY_URL}/proxy/census/acs5?...
    Note: pass year=YYYY to override the 2022 default.
    """
    params = dict(request.query_params)
    year = params.pop("year", "2022")
    try:
        r = httpx.get(
            f"https://api.census.gov/data/{year}/acs/acs5",
            params=params,
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"error": str(e)}
