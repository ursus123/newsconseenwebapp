from fastapi import APIRouter, Query
from typing import Optional
from open_data.agriculture import (
    get_usda_prices,
    get_usda_nass,
    get_usda_market_news,
    get_agricultural_weather,
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
