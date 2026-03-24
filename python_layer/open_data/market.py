import logging
import requests
from typing import Optional

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15

# Yahoo Finance — unofficial but reliable, no key required
YAHOO_QUERY_API = "https://query1.finance.yahoo.com/v8/finance/chart"
YAHOO_SEARCH_API = "https://query1.finance.yahoo.com/v1/finance/search"

# GDELT — Global Database of Events, Language, and Tone
GDELT_API = "https://api.gdeltproject.org/api/v2/doc/doc"

# World Bank Open Data
WORLDBANK_API = "https://api.worldbank.org/v2"

# Open Exchange Rates — free tier, no key required for latest rates
OPENEXCHANGE_API = "https://open.er-api.com/v6/latest"

# Alpha Vantage — free tier (25 req/day) for fundamentals
# Users can configure ALPHA_VANTAGE_KEY for higher limits


def _get(url: str, params: dict = None, headers: dict = None) -> Optional[dict]:
    try:
        r = requests.get(
            url, params=params,
            headers=headers or {"User-Agent": "newsconseen/1.0"},
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning("market._get failed %s: %s", url, e)
        return None


# ----------------------------------------------------------
# stock_quote
# Yahoo Finance live and historical quotes
# ----------------------------------------------------------
def get_stock_quote(ticker: str, period: str = "1mo") -> dict:
    """
    Get stock quote and price history for a ticker symbol.

    ticker: stock symbol e.g. 'AAPL', 'AMZN', 'UNH'
    period: '1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y'

    Returns current price, change, volume, and OHLCV history.
    Useful for: tracking publicly traded competitors, supplier stocks,
    insurance companies, healthcare systems.
    """
    data = _get(
        f"{YAHOO_QUERY_API}/{ticker.upper()}",
        params={"range": period, "interval": "1d"},
    )

    if not data:
        return {"ticker": ticker, "error": "data unavailable"}

    result = data.get("chart", {}).get("result", [])
    if not result:
        return {"ticker": ticker, "error": f"ticker '{ticker}' not found"}

    meta = result[0].get("meta", {})
    timestamps = result[0].get("timestamp", [])
    quotes = result[0].get("indicators", {}).get("quote", [{}])[0]

    history = []
    for i, ts in enumerate(timestamps):
        from datetime import datetime, timezone
        date_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        history.append({
            "date":   date_str,
            "open":   _safe_round(quotes.get("open", [None])[i]),
            "high":   _safe_round(quotes.get("high", [None])[i]),
            "low":    _safe_round(quotes.get("low", [None])[i]),
            "close":  _safe_round(quotes.get("close", [None])[i]),
            "volume": quotes.get("volume", [None])[i],
        })

    logger.info("stock_quote: %d data points for %s", len(history), ticker)

    return {
        "ticker":          ticker.upper(),
        "name":            meta.get("longName", ""),
        "exchange":        meta.get("exchangeName", ""),
        "currency":        meta.get("currency", "USD"),
        "current_price":   _safe_round(meta.get("regularMarketPrice")),
        "previous_close":  _safe_round(meta.get("chartPreviousClose")),
        "market_cap":      meta.get("marketCap"),
        "52w_high":        _safe_round(meta.get("fiftyTwoWeekHigh")),
        "52w_low":         _safe_round(meta.get("fiftyTwoWeekLow")),
        "period":          period,
        "history":         history,
    }


def search_stocks(query: str, limit: int = 10) -> list[dict]:
    """Search for stock tickers by company name or partial symbol."""
    data = _get(
        YAHOO_SEARCH_API,
        params={"q": query, "quotesCount": limit, "newsCount": 0},
    )

    if not data:
        return []

    quotes = data.get("quotes", [])
    return [
        {
            "ticker":   q.get("symbol"),
            "name":     q.get("longname") or q.get("shortname"),
            "exchange": q.get("exchDisp"),
            "type":     q.get("quoteType"),
        }
        for q in quotes
        if q.get("quoteType") in ("EQUITY", "ETF")
    ][:limit]


# ----------------------------------------------------------
# news_search
# GDELT news and sentiment analysis
# ----------------------------------------------------------
def search_news(
    query: str,
    mode: str = "artlist",
    limit: int = 10,
    timespan: str = "1week",
) -> list[dict]:
    """
    Search news articles via GDELT.

    query:    search terms (e.g. 'home care industry', 'BrightStar Care')
    mode:     'artlist' (articles) or 'timelinevol' (volume over time)
    timespan: '1day', '1week', '1month', '3months'

    Returns article title, URL, source, date, and tone score.
    Tone: negative = critical/negative coverage, positive = favorable.
    """
    params = {
        "query":    query,
        "mode":     mode,
        "maxrecords": limit,
        "timespan": timespan,
        "format":   "json",
        "sort":     "datedesc",
    }

    data = _get(GDELT_API, params)

    if not data:
        return []

    if mode == "artlist":
        articles = data.get("articles", [])
        return [
            {
                "title":   a.get("title"),
                "url":     a.get("url"),
                "source":  a.get("domain"),
                "date":    a.get("seendate", "")[:8],
                "language":a.get("language"),
                "tone":    _safe_round(a.get("tone")),
                "positive_score": _safe_round(a.get("positive")),
                "negative_score": _safe_round(a.get("negative")),
            }
            for a in articles
        ]

    return data.get("timeline", [])


# ----------------------------------------------------------
# world_bank
# World Bank development indicators
# ----------------------------------------------------------
def get_world_bank(
    indicator: str = "NY.GDP.MKTP.CD",
    country: str = "US",
    limit: int = 10,
) -> dict:
    """
    Get World Bank development indicator data.

    Common indicators:
      NY.GDP.MKTP.CD   GDP (current USD)
      SP.POP.65UP.TO.ZS  Population ages 65+ (% of total)
      SH.XPD.CHEX.GD.ZS  Health expenditure (% of GDP)
      SE.XPD.TOTL.GD.ZS  Education expenditure (% of GDP)
      SL.UEM.TOTL.ZS   Unemployment rate
      FP.CPI.TOTL.ZG   Inflation (CPI)

    country: ISO 2-letter country code or 'all'
    """
    url = f"{WORLDBANK_API}/country/{country}/indicator/{indicator}"
    params = {
        "format":   "json",
        "per_page": limit,
        "mrv":      limit,   # most recent values
    }

    data = _get(url, params)

    if not data or len(data) < 2:
        return {"indicator": indicator, "country": country, "data": []}

    metadata = data[0]
    observations = data[1]

    results = []
    for obs in observations:
        results.append({
            "year":    obs.get("date"),
            "value":   obs.get("value"),
            "country": obs.get("country", {}).get("value"),
        })

    return {
        "indicator":      indicator,
        "indicator_name": metadata.get("lastupdated", ""),
        "country":        country,
        "source":         "World Bank Open Data",
        "data":           results,
    }


# ----------------------------------------------------------
# exchange_rates
# Open Exchange Rates — live currency conversion
# ----------------------------------------------------------
def get_exchange_rates(base: str = "USD") -> dict:
    """
    Get current exchange rates relative to a base currency.
    Uses Open Exchange Rates free tier — no key required.

    base: ISO currency code (e.g. 'USD', 'EUR', 'GBP', 'NGN', 'KES')

    Useful for: international enterprises, remittance tracking,
    multi-currency financial reporting.
    """
    data = _get(f"{OPENEXCHANGE_API}/{base.upper()}")

    if not data:
        return {"base": base, "rates": {}, "error": "data unavailable"}

    return {
        "base":          data.get("base_code", base),
        "last_updated":  data.get("time_last_update_utc", ""),
        "next_update":   data.get("time_next_update_utc", ""),
        "rates":         data.get("rates", {}),
    }


def _safe_round(val, digits: int = 2) -> Optional[float]:
    try:
        return round(float(val), digits) if val is not None else None
    except (TypeError, ValueError):
        return None
