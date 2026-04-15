"""
enrichment/company_lookup.py
-----------------------------
Company registration lookup via OpenCorporates public API.
Free tier — no API key required for basic name search.
Rate limit: conservatively 1 req/sec.

Adds: reg_number, reg_status, jurisdiction, incorporation_date,
      company_type, registered_address, opencorporates_url.
"""

import time
import logging

import httpx

logger = logging.getLogger(__name__)

_BASE_URL     = "https://api.opencorporates.com/v0.4/companies/search"
_LAST_CALL    = 0.0
_MIN_INTERVAL = 1.2   # 1 req/sec with buffer


def lookup_company(name: str, country_code: str = None) -> dict:
    """
    Search OpenCorporates for a company by name.
    country_code: ISO 2-letter code e.g. 'ke', 'gb', 'ng', 'za'.
    Returns enrichment dict.
    """
    name = str(name or "").strip()
    if not name or len(name) < 3:
        return {"enrichment_status": "skipped", "reason": "name_too_short"}

    global _LAST_CALL
    _throttle()

    params: dict = {
        "q":        name,
        "per_page": 1,
        "sparse":   True,
        "inactive": False,   # prefer active companies
    }
    if country_code:
        jcode = country_code.lower().strip()[:2]
        params["jurisdiction_code"] = jcode

    try:
        r = httpx.get(
            _BASE_URL,
            params=params,
            timeout=12,
            headers={"User-Agent": "Newsconseen/1.0 (contact@newsconseen.com)"},
        )
        if r.status_code == 200:
            companies = r.json().get("results", {}).get("companies", [])
            if companies:
                c = companies[0].get("company", {})
                return {
                    "oc_name":            c.get("name", ""),
                    "reg_number":         c.get("company_number", ""),
                    "reg_status":         c.get("current_status", ""),
                    "jurisdiction":       c.get("jurisdiction_code", ""),
                    "incorporation_date": c.get("incorporation_date", ""),
                    "company_type":       c.get("company_type", ""),
                    "registered_address": c.get("registered_address_in_full", ""),
                    "opencorporates_url": c.get("opencorporates_url", ""),
                    "enrichment_source":  "opencorporates",
                    "enrichment_status":  "enriched",
                }
            return {"enrichment_status": "not_found"}

        elif r.status_code == 429:
            logger.warning("company_lookup: rate limited by OpenCorporates")
            return {"enrichment_status": "rate_limited"}
        else:
            logger.debug("company_lookup(%s): HTTP %d", name, r.status_code)

    except Exception as e:
        logger.debug("company_lookup(%s): %s", name, e)

    return {"enrichment_status": "error"}


def _throttle():
    global _LAST_CALL
    wait = _MIN_INTERVAL - (time.time() - _LAST_CALL)
    if wait > 0:
        time.sleep(wait)
    _LAST_CALL = time.time()
