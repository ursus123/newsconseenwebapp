from fastapi import APIRouter, Query
from typing import Optional
from open_data.agriculture import (
    get_usda_prices,
    get_usda_nass,
    get_usda_market_news,
    get_agricultural_weather,
    get_soil_data,
    get_faostat,
    get_nasa_power,
    NASS_COMMODITIES,
)

router = APIRouter(prefix="/agriculture", tags=["Agriculture"])


@router.get("/prices")
def usda_prices(
    commodity: str = Query("corn", description=f"Commodity name. Options: {list(NASS_COMMODITIES.keys())}"),
    state: Optional[str] = Query(None, description="State abbreviation e.g. IA"),
):
    """
    USDA AMS commodity spot prices and market reports.
    SELECT * FROM usda_prices WHERE commodity = 'corn' AND state = 'IA'
    """
    return {"results": get_usda_prices(commodity=commodity, state=state)}


@router.get("/nass")
def usda_nass(
    commodity: str = Query("corn"),
    state: Optional[str] = Query(None),
    year: int = Query(2023, ge=2015, le=2024),
    api_key: Optional[str] = Query(None, description="NASS API key from quickstats.nass.usda.gov"),
):
    """
    USDA NASS crop and livestock survey data — production, yield, price received.
    SELECT * FROM usda_nass WHERE commodity = 'cattle' AND state = 'TX' AND year = 2023
    """
    return {"results": get_usda_nass(
        commodity=commodity, state=state, year=year, api_key=api_key
    )}


@router.get("/market-news")
def usda_market_news(
    commodity: str = Query("cattle"),
    limit: int = Query(10, ge=1, le=50),
):
    """
    USDA AMS weekly market news reports.
    SELECT * FROM usda_market_news WHERE commodity = 'cattle'
    """
    return {"results": get_usda_market_news(commodity=commodity, limit=limit)}


@router.get("/weather")
def agricultural_weather(
    lat: float = Query(..., description="Latitude of farm location"),
    lon: float = Query(..., description="Longitude of farm location"),
    forecast_days: int = Query(7, ge=1, le=16),
):
    """
    Agricultural weather forecast — temperature, precipitation, evapotranspiration, soil moisture.
    SELECT * FROM noaa_weather WHERE lat = 41.87 AND lon = -93.09 AND forecast_days = 7
    """
    return get_agricultural_weather(lat=lat, lon=lon, forecast_days=forecast_days)


@router.get("/commodities")
def commodity_list():
    """List all supported commodity names."""
    return {"commodities": list(NASS_COMMODITIES.keys())}


@router.get("/soil")
def soil_data(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
):
    """
    Soil composition at a location — pH, organic carbon, clay, sand, silt at 0-5cm depth.
    Source: SoilGrids ISRIC (free, no key required).
    """
    return get_soil_data(lat=lat, lon=lon)


@router.get("/faostat")
def faostat(
    item: str = Query("Wheat", description="Commodity/crop name e.g. Wheat, Maize, Cattle"),
    area: str = Query("World", description="Country name or 'World'"),
    year: int = Query(2022, ge=2015, le=2023, description="Data year"),
    element: str = Query("Production", description="Production, Area harvested, or Yield"),
):
    """
    FAOSTAT crop and livestock production data by country.
    Source: FAO (fao.org) — free, no key required.
    """
    return {"results": get_faostat(item=item, area=area, year=year, element=element)}


@router.get("/nasa-power")
def nasa_power(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    start: str = Query("20230101", description="Start date YYYYMMDD"),
    end: str   = Query("20231231", description="End date YYYYMMDD"),
):
    """
    NASA POWER agro-meteorological data — daily temperature, precipitation,
    humidity, wind speed, solar radiation.
    Source: NASA POWER (power.larc.nasa.gov) — free, no key required.
    """
    return get_nasa_power(lat=lat, lon=lon, start=start, end=end)
