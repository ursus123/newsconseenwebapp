from fastapi import APIRouter, Query
from typing import Optional
from open_data.market import (
    get_stock_quote,
    search_stocks,
    search_news,
    get_world_bank,
    get_exchange_rates,
)

router = APIRouter(prefix="/market", tags=["Market"])


@router.get("/stock")
def stock_quote(
    ticker: str = Query(..., description="Stock ticker symbol e.g. AAPL, UNH, AMZN"),
    period: str = Query("1mo", description="1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y"),
):
    """
    Live and historical stock quotes from Yahoo Finance.
    SELECT * FROM stock_quote WHERE ticker = 'UNH' AND period = '1y'
    """
    return get_stock_quote(ticker=ticker, period=period)


@router.get("/stock/search")
def stock_search(
    query: str = Query(..., description="Company name or partial ticker"),
    limit: int = Query(10, ge=1, le=20),
):
    """
    Search for stock tickers by company name.
    SELECT * FROM stock_search WHERE query = 'BrightSpring Health'
    """
    return {"results": search_stocks(query=query, limit=limit)}


@router.get("/news")
def news_search(
    query: str = Query(..., description="Search terms e.g. 'home care industry'"),
    timespan: str = Query("1week", description="1day, 1week, 1month, 3months"),
    limit: int = Query(10, ge=1, le=50),
):
    """
    News articles and sentiment from GDELT.
    SELECT * FROM news_search WHERE query = 'home care industry' AND timespan = '1month'
    """
    return {"results": search_news(query=query, limit=limit, timespan=timespan)}


@router.get("/news/volume")
def news_volume(
    query: str = Query(..., description="Search terms"),
    timespan: str = Query("1month"),
):
    """
    News volume timeline — how much coverage a topic gets over time.
    SELECT * FROM news_volume WHERE query = 'home care staffing'
    """
    return {"results": search_news(query=query, mode="timelinevol", timespan=timespan)}


@router.get("/world-bank")
def world_bank(
    indicator: str = Query("NY.GDP.MKTP.CD", description="World Bank indicator code"),
    country: str = Query("US", description="ISO 2-letter country code or 'all'"),
    limit: int = Query(10, ge=1, le=50),
):
    """
    World Bank development indicators — GDP, health spending, education, unemployment.
    SELECT * FROM world_bank WHERE indicator = 'SP.POP.65UP.TO.ZS' AND country = 'US'
    """
    return get_world_bank(indicator=indicator, country=country, limit=limit)


@router.get("/exchange-rates")
def exchange_rates(
    base: str = Query("USD", description="Base currency ISO code e.g. USD, EUR, NGN"),
):
    """
    Live exchange rates relative to a base currency.
    SELECT * FROM exchange_rates WHERE base = 'USD'
    """
    return get_exchange_rates(base=base)
