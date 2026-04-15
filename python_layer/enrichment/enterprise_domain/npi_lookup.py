"""
enrichment/enterprise_domain/npi_lookup.py
--------------------------------------------
NPPES National Provider Identifier (NPI) registry lookup.
Free, no API key required. US healthcare providers and organisations.

Covers: hospitals, clinics, pharmacies, labs, nursing homes, dental practices,
        mental health centres — any US healthcare enterprise or individual provider.

Returns: npi_number, npi_type, npi_provider_name, npi_taxonomy_code,
         npi_taxonomy_desc, npi_state, npi_city, npi_enumeration_date,
         domain_status, _source
"""

import time
import logging
import httpx

logger = logging.getLogger(__name__)

_BASE = "https://npiregistry.cms.hhs.gov/api/"
_LAST_CALL = 0.0
_MIN_INTERVAL = 0.5


def lookup_npi_organization(name: str, state: str = None) -> dict:
    """Look up a healthcare organisation by name in the NPPES NPI registry."""
    result: dict = {"_source": "nppes_npi"}
    if not name or len(name) < 3:
        result["domain_status"] = "name_too_short"
        return result

    _wait()
    params = {
        "version":          "2.1",
        "enumeration_type": "NPI-2",      # Organisation NPI
        "organization_name": name,
        "limit":            5,
    }
    if state:
        params["state"] = state[:2].upper()

    try:
        r = httpx.get(_BASE, params=params, timeout=12)
        if r.status_code == 429:
            result["domain_status"] = "rate_limited"
            return result

        results = r.json().get("results", [])
        if not results:
            result["domain_status"] = "not_found"
            return result

        return _extract(results[0], result)

    except Exception as exc:
        logger.warning("npi_lookup.org: %s — %s", name, exc)
        result["domain_status"] = "error"
        result["domain_error"]  = str(exc)[:120]
        return result


def lookup_npi_person(full_name: str, state: str = None) -> dict:
    """Look up an individual healthcare provider by name in the NPPES NPI registry."""
    result: dict = {"_source": "nppes_npi"}
    if not full_name or len(full_name) < 3:
        result["domain_status"] = "name_too_short"
        return result

    parts = full_name.strip().split()
    _wait()
    params = {
        "version":          "2.1",
        "enumeration_type": "NPI-1",      # Individual NPI
        "limit":            5,
    }
    if len(parts) >= 2:
        params["last_name"]  = parts[-1]
        params["first_name"] = parts[0]
    else:
        params["last_name"]  = parts[0]

    if state:
        params["state"] = state[:2].upper()

    try:
        r = httpx.get(_BASE, params=params, timeout=12)
        if r.status_code == 429:
            result["domain_status"] = "rate_limited"
            return result

        results = r.json().get("results", [])
        if not results:
            result["domain_status"] = "not_found"
            return result

        return _extract(results[0], result)

    except Exception as exc:
        logger.warning("npi_lookup.person: %s — %s", full_name, exc)
        result["domain_status"] = "error"
        result["domain_error"]  = str(exc)[:120]
        return result


def _extract(provider: dict, result: dict) -> dict:
    basic      = provider.get("basic", {})
    taxonomies = provider.get("taxonomies", [])
    addresses  = provider.get("addresses", [])
    primary_tax = next((t for t in taxonomies if t.get("primary")), taxonomies[0] if taxonomies else {})
    primary_adr = next((a for a in addresses if a.get("address_purpose") == "LOCATION"), addresses[0] if addresses else {})

    result["npi_number"]          = provider.get("number", "")
    result["npi_type"]            = provider.get("enumeration_type", "")
    result["npi_provider_name"]   = (
        basic.get("organization_name")
        or f"{basic.get('first_name', '')} {basic.get('last_name', '')}".strip()
    )
    result["npi_taxonomy_code"]   = primary_tax.get("code", "")
    result["npi_taxonomy_desc"]   = primary_tax.get("desc", "")
    result["npi_taxonomy_license"]= primary_tax.get("license", "")
    result["npi_state"]           = primary_adr.get("state", "")
    result["npi_city"]            = primary_adr.get("city", "")
    result["npi_country"]         = primary_adr.get("country_name", "")
    result["npi_enumeration_date"]= basic.get("enumeration_date", "")
    result["npi_status"]          = basic.get("status", "")

    result["domain_status"]       = "enriched"
    return result


def _wait():
    global _LAST_CALL
    elapsed = time.time() - _LAST_CALL
    if elapsed < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - elapsed)
    _LAST_CALL = time.time()
