"""
enrichment/exchange_rates.py
-----------------------------
FX rate fetching via open.er-api.com — free, no API key required.

Rates are cached in-process for 24 hours to avoid hammering the API.
Used by product_enrich (price_usd) and transaction_enrich (amount_usd).
"""

import time
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_BASE_URL     = "https://open.er-api.com/v6/latest"
_CACHE: dict  = {}          # {"USD": {rates_dict}, "KES": {...}}
_FETCHED_AT: dict = {}      # {"USD": float_timestamp}
_TTL_SECONDS  = 86400       # 24 hours


def get_rates(base: str = "USD") -> dict:
    """
    Return exchange rates relative to base currency.
    Result format: {"EUR": 0.92, "KES": 129.5, ...}
    Cached for 24 h. Returns {} on failure.
    """
    base = base.upper().strip()
    now  = time.time()
    if base in _CACHE and (now - _FETCHED_AT.get(base, 0)) < _TTL_SECONDS:
        return _CACHE[base]

    try:
        r = httpx.get(f"{_BASE_URL}/{base}", timeout=10)
        if r.status_code == 200:
            data = r.json()
            if data.get("result") == "success":
                rates = data.get("rates", {})
                _CACHE[base]      = rates
                _FETCHED_AT[base] = now
                logger.info("exchange_rates: fetched %d rates (base=%s)", len(rates), base)
                return rates
        logger.warning("exchange_rates: HTTP %d for base=%s", r.status_code, base)
    except Exception as e:
        logger.warning("exchange_rates: fetch failed — %s", e)

    return _CACHE.get(base, {})


def convert_to_base(amount: float, from_currency: str, to_currency: str = "USD") -> tuple:
    """
    Convert amount from from_currency to to_currency.
    Returns (converted_amount, fx_rate) or (None, None) on failure.
    """
    from_c = (from_currency or "USD").upper().strip()
    to_c   = (to_currency   or "USD").upper().strip()

    if from_c == to_c:
        return round(float(amount), 4), 1.0

    rates = get_rates(to_c)   # rates relative to to_currency
    rate  = rates.get(from_c)
    if rate and float(rate) > 0:
        converted = round(float(amount) / float(rate), 4)
        return converted, round(float(rate), 6)

    return None, None


def convert_to_usd(amount: float, currency: str) -> tuple:
    """Convenience wrapper: convert any currency to USD."""
    return convert_to_base(amount, currency, "USD")
