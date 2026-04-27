import logging
import requests
from typing import Optional

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15

# USDA Agricultural Marketing Service — commodity prices
USDA_AMS_API   = "https://marsapi.ams.usda.gov/services/v1.2/reports"

# USDA NASS QuickStats — crop and livestock survey data
USDA_NASS_API  = "https://quickstats.nass.usda.gov/api/api_GET"

# USDA ERS — Economic Research Service
USDA_ERS_API   = "https://apps.fas.usda.gov/psdonline/api/psd/commodity"

# NOAA Climate Data Online
NOAA_API       = "https://www.ncdc.noaa.gov/cdo-web/api/v2"

# Open-Meteo — free weather API, no key required
OPEN_METEO_API = "https://api.open-meteo.com/v1/forecast"

# Common commodity codes for NASS QuickStats
NASS_COMMODITIES = {
    "corn":       "CORN",
    "soybeans":   "SOYBEANS",
    "wheat":      "WHEAT",
    "cotton":     "COTTON",
    "cattle":     "CATTLE, INCL CALVES",
    "hogs":       "HOGS",
    "chickens":   "CHICKENS",
    "milk":       "MILK",
    "eggs":       "EGGS",
    "hay":        "HAY",
    "potatoes":   "POTATOES",
    "tomatoes":   "TOMATOES",
}


def _get(url: str, params: dict = None, headers: dict = None) -> Optional[dict]:
    try:
        r = requests.get(
            url, params=params,
            headers=headers or {},
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning("agriculture._get failed %s: %s", url, e)
        return None


# ----------------------------------------------------------
# usda_prices
# USDA AMS commodity spot prices
# ----------------------------------------------------------
def get_usda_prices(commodity: str = "corn", state: str = None) -> list[dict]:
    """
    Get USDA Agricultural Marketing Service commodity price reports.

    commodity: commodity name (see NASS_COMMODITIES keys)
    state:     2-letter state abbreviation to filter by region

    Returns current price, unit, market, and report date.
    Uses USDA AMS public API — no key required.
    """
    # AMS report search
    params = {
        "q":       commodity,
        "allSections": "true",
    }

    try:
        r = requests.get(
            f"{USDA_AMS_API}",
            params=params,
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        reports = r.json()

        if not reports:
            return _usda_nass_prices(commodity, state)

        results = []
        for report in reports[:10]:
            results.append({
                "commodity":    commodity,
                "report_title": report.get("reportTitle", ""),
                "report_date":  report.get("publishedDate", ""),
                "market":       report.get("marketType", ""),
                "state":        report.get("stateCode", ""),
                "slug_id":      report.get("slugId", ""),
            })

        logger.info("usda_prices: %d reports for %s", len(results), commodity)
        return results

    except Exception as e:
        logger.warning("usda_prices AMS failed, trying NASS: %s", e)
        return _usda_nass_prices(commodity, state)


def _usda_nass_prices(commodity: str, state: str = None) -> list[dict]:
    """
    Fallback: USDA NASS QuickStats price data.
    Note: NASS QuickStats requires a free API key for production.
    Returns guidance when key not configured.
    """
    nass_name = NASS_COMMODITIES.get(commodity.lower(), commodity.upper())

    return [{
        "commodity":    commodity,
        "nass_name":    nass_name,
        "state":        state,
        "note":         "USDA NASS QuickStats price data requires a free API key.",
        "register_at":  "https://quickstats.nass.usda.gov/api",
        "example_query": f"?key=YOUR_KEY&commodity_desc={nass_name}&statisticcat_desc=PRICE+RECEIVED&year=2024",
    }]


# ----------------------------------------------------------
# usda_nass
# USDA NASS crop and livestock survey data
# ----------------------------------------------------------
def get_usda_nass(
    commodity: str = "corn",
    state: str = None,
    year: int = 2023,
    api_key: str = None,
) -> list[dict]:
    """
    Get USDA NASS QuickStats survey data for a commodity.

    Requires a free NASS API key — register at quickstats.nass.usda.gov.
    Returns production, yield, area harvested, and price received.

    If no key is configured, returns instructions to register.
    """
    if not api_key:
        return [{
            "commodity":   commodity,
            "note":        "USDA NASS QuickStats requires a free API key",
            "register_at": "https://quickstats.nass.usda.gov/api",
            "year":        year,
        }]

    nass_name = NASS_COMMODITIES.get(commodity.lower(), commodity.upper())
    params = {
        "key":               api_key,
        "commodity_desc":    nass_name,
        "year":              year,
        "statisticcat_desc": "PRODUCTION",
        "format":            "JSON",
    }
    if state:
        params["state_alpha"] = state.upper()

    data = _get(USDA_NASS_API, params)
    if not data:
        return []

    return data.get("data", [])


# ----------------------------------------------------------
# usda_market_news
# USDA AMS weekly market news reports
# ----------------------------------------------------------
def get_usda_market_news(commodity: str = "cattle", limit: int = 10) -> list[dict]:
    """
    Get USDA AMS weekly market news reports.
    Returns the most recent market reports for a commodity
    including price ranges, volume, and market conditions.
    """
    try:
        r = requests.get(
            USDA_AMS_API,
            params={"q": commodity, "allSections": "false"},
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        reports = r.json()

        results = []
        for report in reports[:limit]:
            results.append({
                "commodity":     commodity,
                "title":         report.get("reportTitle", ""),
                "published":     report.get("publishedDate", ""),
                "market_type":   report.get("marketType", ""),
                "frequency":     report.get("reportFrequency", ""),
                "state":         report.get("stateCode", ""),
                "report_url":    f"https://www.ams.usda.gov/mnreports/{report.get('slugId', '')}.pdf",
            })

        logger.info("usda_market_news: %d reports for %s", len(results), commodity)
        return results

    except Exception as e:
        logger.warning("usda_market_news failed: %s", e)
        return []


# ----------------------------------------------------------
# noaa_weather / open_meteo_weather
# Agricultural weather forecasts — no key required via Open-Meteo
# ----------------------------------------------------------
def get_agricultural_weather(
    lat: float,
    lon: float,
    forecast_days: int = 7,
) -> dict:
    """
    Get weather forecast relevant to agricultural operations.
    Uses Open-Meteo — free, no API key required.

    Returns daily temperature, precipitation, wind speed,
    evapotranspiration, and soil moisture forecasts.
    """
    params = {
        "latitude":              lat,
        "longitude":             lon,
        "forecast_days":         forecast_days,
        "daily": ",".join([
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_sum",
            "wind_speed_10m_max",
            "et0_fao_evapotranspiration",  # crop water requirement
            "precipitation_probability_max",
            "soil_moisture_0_to_7cm",
        ]),
        "timezone": "auto",
    }

    data = _get(OPEN_METEO_API, params)

    if not data:
        return {"lat": lat, "lon": lon, "error": "weather data unavailable"}

    daily = data.get("daily", {})
    dates = daily.get("time", [])

    forecast = []
    for i, date in enumerate(dates):
        forecast.append({
            "date":                  date,
            "temp_max_c":            daily.get("temperature_2m_max", [None])[i],
            "temp_min_c":            daily.get("temperature_2m_min", [None])[i],
            "precipitation_mm":      daily.get("precipitation_sum", [None])[i],
            "wind_speed_kmh":        daily.get("wind_speed_10m_max", [None])[i],
            "evapotranspiration_mm": daily.get("et0_fao_evapotranspiration", [None])[i],
            "precip_probability_pct":daily.get("precipitation_probability_max", [None])[i],
            "soil_moisture":         daily.get("soil_moisture_0_to_7cm", [None])[i],
        })

    logger.info("agricultural_weather: %d day forecast for (%.4f, %.4f)", len(forecast), lat, lon)
    return {
        "lat":          lat,
        "lon":          lon,
        "timezone":     data.get("timezone", ""),
        "forecast":     forecast,
    }


# ----------------------------------------------------------
# soil_data
# SoilGrids ISRIC — soil composition by lat/lon
# ----------------------------------------------------------
SOILGRIDS_API = "https://rest.isric.org/soilgrids/v2.0/properties/query"

def get_soil_data(lat: float, lon: float, properties: list = None) -> dict:
    """
    Get soil composition data at a specific location from SoilGrids ISRIC.
    Free, no API key required.

    Returns: pH, soil organic carbon (SOC), clay %, sand %, silt %
    at 0-5cm depth.
    """
    if not properties:
        properties = ["phh2o", "soc", "clay", "sand", "silt"]

    params = {"lon": lon, "lat": lat, "depth": "0-5cm", "value": "mean"}
    for prop in properties:
        params[f"property"] = prop  # repeated param not supported this way

    # Build URL manually for repeated params
    prop_str = "&".join(f"property={p}" for p in properties)
    url = f"{SOILGRIDS_API}?lon={lon}&lat={lat}&{prop_str}&depth=0-5cm&value=mean"

    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        data = r.json()
        layers = data.get("properties", {}).get("layers", [])
        result = {}
        for layer in layers:
            name = layer.get("name")
            depths = layer.get("depths", [{}])
            mean_val = (depths[0].get("values", {}) or {}).get("mean")
            d_factor = layer.get("unit_measure", {}).get("d_factor", 1)
            result[name] = {
                "value": (mean_val / d_factor) if (mean_val is not None and d_factor) else mean_val,
                "unit":  layer.get("unit_measure", {}).get("mapped_units", ""),
                "depth": "0-5cm",
            }
        logger.info("soil_data: %d properties at (%.4f, %.4f)", len(result), lat, lon)
        return {"lat": lat, "lon": lon, "soil": result}
    except Exception as e:
        logger.warning("get_soil_data failed: %s", e)
        return {"lat": lat, "lon": lon, "error": str(e)}


# ----------------------------------------------------------
# faostat
# FAOSTAT — crop production by country and commodity
# ----------------------------------------------------------
FAOSTAT_API = "https://fenixservices.fao.org/faostat/api/v1/en/data/QCL"

def get_faostat(
    item: str = "Wheat",
    area: str = "World",
    year: int = 2022,
    element: str = "Production",
) -> list[dict]:
    """
    Get FAOSTAT crop production data.
    item:    commodity/crop name (e.g. "Wheat", "Maize", "Cattle")
    area:    country name (e.g. "Kenya", "Nigeria") or "World"
    year:    data year (2015–2022)
    element: "Production", "Area harvested", or "Yield"
    """
    try:
        params = {
            "area":        area,
            "item":        item,
            "element":     element,
            "year":        year,
            "output_type": "objects",
            "per_page":    30,
        }
        r = requests.get(FAOSTAT_API, params=params, timeout=20)
        r.raise_for_status()
        data = r.json()
        rows = data.get("data", [])
        result = [
            {
                "area":    row.get("Area"),
                "item":    row.get("Item"),
                "element": row.get("Element"),
                "year":    row.get("Year"),
                "value":   row.get("Value"),
                "unit":    row.get("Unit"),
                "flag":    row.get("Flag"),
            }
            for row in rows[:30]
        ]
        logger.info("faostat: %d rows for %s / %s / %d", len(result), item, area, year)
        return result
    except Exception as e:
        logger.warning("get_faostat failed: %s", e)
        return []


# ----------------------------------------------------------
# nasa_power
# NASA POWER — agro-meteorological data (daily climatology)
# ----------------------------------------------------------
NASA_POWER_API = "https://power.larc.nasa.gov/api/temporal/daily/point"

def get_nasa_power(
    lat: float,
    lon: float,
    start: str = "20230101",
    end: str   = "20231231",
) -> dict:
    """
    Get NASA POWER agro-meteorological data at a location.
    Returns daily solar radiation, temperature, humidity, wind speed.
    Free, no API key required.

    start/end: YYYYMMDD format
    """
    params = {
        "parameters": "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M,ALLSKY_SFC_SW_DWN",
        "community":  "AG",
        "longitude":  lon,
        "latitude":   lat,
        "start":      start,
        "end":        end,
        "format":     "JSON",
    }
    try:
        r = requests.get(NASA_POWER_API, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        daily_params = data.get("properties", {}).get("parameter", {})
        dates = list(next(iter(daily_params.values()), {}).keys()) if daily_params else []
        records = [
            {
                "date": d,
                "temp_avg_c":          daily_params.get("T2M", {}).get(d),
                "temp_max_c":          daily_params.get("T2M_MAX", {}).get(d),
                "temp_min_c":          daily_params.get("T2M_MIN", {}).get(d),
                "precipitation_mm":    daily_params.get("PRECTOTCORR", {}).get(d),
                "humidity_pct":        daily_params.get("RH2M", {}).get(d),
                "wind_speed_ms":       daily_params.get("WS2M", {}).get(d),
                "solar_radiation_mjm2":daily_params.get("ALLSKY_SFC_SW_DWN", {}).get(d),
            }
            for d in dates[:365]
        ]
        logger.info("nasa_power: %d daily records for (%.4f, %.4f)", len(records), lat, lon)
        return {"lat": lat, "lon": lon, "records": records}
    except Exception as e:
        logger.warning("get_nasa_power failed: %s", e)
        return {"lat": lat, "lon": lon, "error": str(e)}
