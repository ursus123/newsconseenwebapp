import logging
import requests
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15

# ----------------------------------------------------------
# CMS Data API base — all CMS open datasets
# ----------------------------------------------------------
CMS_API = "https://data.cms.gov/provider-data/api/1/datastore/query"
CMS_HOME_HEALTH_ID = "6jpm-sxkc"
CMS_HOSPICE_ID     = "252m-zjp7"
CMS_NURSING_ID     = "4pq5-n9py"

# NPI Registry
NPPES_API = "https://npiregistry.cms.hhs.gov/api"

# FDA device recalls
FDA_DEVICE_API = "https://api.fda.gov/device/recall.json"

# CMS quality measures
CMS_QUALITY_API = "https://data.cms.gov/provider-data/api/1/datastore/query/97k6-zzx3/0"


def _get(url: str, params: dict = None) -> Optional[dict]:
    try:
        r = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning("healthcare._get failed %s: %s", url, e)
        return None


# ----------------------------------------------------------
# cms_home_health
# CMS Home Health Compare — agency star ratings and outcomes
# ----------------------------------------------------------
def get_home_health(state: str = None, limit: int = 100) -> list[dict]:
    """
    Fetch CMS Home Health Compare data.
    Filterable by state abbreviation (e.g. 'MD', 'VA', 'NY').
    Returns agency name, address, star ratings, quality measures.
    """
    conditions = []
    if state:
        conditions.append({
            "property": "State",
            "value": state.upper(),
            "operator": "=",
        })

    payload = {
        "limit": limit,
        "offset": 0,
        "conditions": conditions,
    }

    try:
        r = requests.post(
            f"{CMS_API}/{CMS_HOME_HEALTH_ID}/0",
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        results = data.get("results", [])
        logger.info("cms_home_health: %d agencies returned for state=%s", len(results), state)
        return results
    except Exception as e:
        logger.warning("cms_home_health failed: %s", e)
        return []


# ----------------------------------------------------------
# cms_providers
# All CMS-certified providers by state and provider type
# ----------------------------------------------------------
def get_cms_providers(
    state: str = None,
    provider_type: str = None,
    limit: int = 100,
) -> list[dict]:
    """
    Search CMS-certified healthcare providers.
    provider_type examples: 'Home Health Agency', 'Hospice',
    'Nursing Facility', 'Clinic'
    """
    conditions = []
    if state:
        conditions.append({"property": "State", "value": state.upper(), "operator": "="})
    if provider_type:
        conditions.append({"property": "Provider Type", "value": provider_type, "operator": "LIKE"})

    try:
        r = requests.post(
            f"{CMS_API}/{CMS_NURSING_ID}/0",
            json={"limit": limit, "offset": 0, "conditions": conditions},
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        results = r.json().get("results", [])
        logger.info("cms_providers: %d providers returned", len(results))
        return results
    except Exception as e:
        logger.warning("cms_providers failed: %s", e)
        return []


# ----------------------------------------------------------
# npi_registry
# NPPES NPI Registry — individual and org provider lookup
# ----------------------------------------------------------
def get_npi_providers(
    name: str = None,
    state: str = None,
    taxonomy: str = None,
    limit: int = 20,
) -> list[dict]:
    """
    Search NPPES NPI registry by name, state, or taxonomy code.
    taxonomy examples: '251E00000X' (home health), '207Q00000X' (family medicine)
    Returns NPI, name, address, taxonomy, and phone.
    """
    params = {
        "version": "2.1",
        "limit": limit,
        "skip": 0,
    }
    if name:
        params["organization_name"] = name
    if state:
        params["state"] = state.upper()
    if taxonomy:
        params["taxonomy_description"] = taxonomy

    data = _get(NPPES_API, params)
    if not data:
        return []

    results = data.get("results", [])
    cleaned = []
    for r in results:
        basic = r.get("basic", {})
        addresses = r.get("addresses", [{}])
        taxonomies = r.get("taxonomies", [{}])
        cleaned.append({
            "npi":            r.get("number"),
            "name":           basic.get("organization_name") or
                              f"{basic.get('first_name', '')} {basic.get('last_name', '')}".strip(),
            "entity_type":    "organization" if r.get("enumeration_type") == "NPI-2" else "individual",
            "address":        addresses[0].get("address_1", "") if addresses else "",
            "city":           addresses[0].get("city", "") if addresses else "",
            "state":          addresses[0].get("state", "") if addresses else "",
            "zip":            addresses[0].get("postal_code", "") if addresses else "",
            "phone":          addresses[0].get("telephone_number", "") if addresses else "",
            "taxonomy":       taxonomies[0].get("desc", "") if taxonomies else "",
            "taxonomy_code":  taxonomies[0].get("code", "") if taxonomies else "",
            "is_primary":     taxonomies[0].get("primary", False) if taxonomies else False,
        })

    logger.info("npi_registry: %d providers returned for name=%s state=%s", len(cleaned), name, state)
    return cleaned


# ----------------------------------------------------------
# fda_devices
# FDA medical device recalls and safety alerts
# ----------------------------------------------------------
def get_fda_device_recalls(
    device_name: str = None,
    limit: int = 10,
) -> list[dict]:
    """
    Search FDA device recall database.
    Returns product description, reason, classification, status.
    """
    search = f'product_res_number:"{device_name}"' if device_name else "status:Ongoing"

    data = _get(FDA_DEVICE_API, {"search": search, "limit": limit})
    if not data:
        return []

    results = data.get("results", [])
    return [
        {
            "recall_number":     r.get("product_res_number", ""),
            "device_name":       r.get("product_description", ""),
            "reason":            r.get("reason_for_recall", ""),
            "classification":    r.get("classification", ""),
            "status":            r.get("status", ""),
            "recall_date":       r.get("event_date_initiated", ""),
            "firm":              r.get("firm_fei_number", ""),
            "is_active":         r.get("status", "").upper() == "ONGOING",
        }
        for r in results
    ]


# ----------------------------------------------------------
# cms_quality
# CMS quality outcome measures per home health provider
# ----------------------------------------------------------
def get_cms_quality_measures(state: str = None, limit: int = 50) -> list[dict]:
    """
    CMS home health quality outcome measures by provider.
    Returns improvement in ambulation, hospitalization rates,
    emergency department visits, and patient satisfaction scores.
    """
    conditions = []
    if state:
        conditions.append({"property": "State", "value": state.upper(), "operator": "="})

    try:
        r = requests.post(
            CMS_QUALITY_API,
            json={"limit": limit, "offset": 0, "conditions": conditions},
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        results = r.json().get("results", [])
        logger.info("cms_quality: %d measure rows for state=%s", len(results), state)
        return results
    except Exception as e:
        logger.warning("cms_quality failed: %s", e)
        return []
