import logging
import requests
from typing import Optional

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15

CENSUS_API   = "https://api.census.gov/data"
HUD_API      = "https://www.huduser.gov/hudapi/public/fmr"

# Census ACS 5-year estimates — most reliable small-area data
ACS_YEAR = "2022"

# Key demographic variables for enterprise market sizing
ACS_VARS = {
    "total_population":    "B01003_001E",
    "median_age":          "B01002_001E",
    "pop_65_plus":         "B01001_020E",  # Male 65+
    "pop_65_plus_female":  "B01001_044E",  # Female 65+
    "median_household_income": "B19013_001E",
    "per_capita_income":   "B19301_001E",
    "total_households":    "B11001_001E",
    "pop_under_18":        "B09001_001E",
    "pop_in_poverty":      "B17001_002E",
    "total_housing_units": "B25001_001E",
    "owner_occupied":      "B25003_002E",
    "renter_occupied":     "B25003_003E",
    "bachelors_or_higher": "B15003_022E",
}


def _get(url: str, params: dict = None) -> Optional[dict]:
    try:
        r = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning("demographics._get failed %s: %s", url, e)
        return None


# ----------------------------------------------------------
# census_acs
# American Community Survey 5-year estimates
# ----------------------------------------------------------
def get_census_acs(
    zip_code: str = None,
    county_fips: str = None,
    state_fips: str = None,
    variables: list[str] = None,
) -> dict:
    """
    Get ACS demographic data for a ZIP code, county, or state.

    zip_code:    5-digit ZIP (e.g. '20850')
    county_fips: 5-digit county FIPS (e.g. '24031' for Montgomery County MD)
    state_fips:  2-digit state FIPS (e.g. '24' for Maryland)
    variables:   list of ACS variable names from ACS_VARS keys
                 (defaults to all variables in ACS_VARS)
    """
    vars_to_fetch = variables or list(ACS_VARS.keys())
    census_vars = [ACS_VARS[v] for v in vars_to_fetch if v in ACS_VARS]

    if not census_vars:
        return {"error": "no valid variables requested"}

    get_param = "NAME," + ",".join(census_vars)

    # Determine geography
    if zip_code:
        geo_for = f"zip code tabulation area:{zip_code}"
        geo_in  = None
    elif county_fips and len(county_fips) == 5:
        geo_for = f"county:{county_fips[2:]}"
        geo_in  = f"state:{county_fips[:2]}"
    elif state_fips:
        geo_for = f"state:{state_fips}"
        geo_in  = None
    else:
        return {"error": "provide zip_code, county_fips, or state_fips"}

    params = {
        "get": get_param,
        "for": geo_for,
        "key": "",  # No key required for public endpoints
    }
    if geo_in:
        params["in"] = geo_in

    url = f"{CENSUS_API}/{ACS_YEAR}/acs/acs5"
    data = _get(url, params)

    if not data or len(data) < 2:
        return {"error": "no Census data returned", "zip": zip_code}

    headers = data[0]
    values  = data[1]
    result  = dict(zip(headers, values))

    # Map Census variable codes back to human-readable names
    readable = {"geography": result.get("NAME", "")}
    for name, code in ACS_VARS.items():
        if code in result:
            try:
                readable[name] = int(result[code]) if result[code] not in ("-", None) else None
            except (ValueError, TypeError):
                readable[name] = result[code]

    # Compute derived metrics
    total = readable.get("total_population", 0) or 1
    elderly = (readable.get("pop_65_plus", 0) or 0) + (readable.get("pop_65_plus_female", 0) or 0)
    readable["pop_65_plus_total"] = elderly
    readable["elderly_pct"] = round(elderly / total * 100, 1)
    readable["poverty_pct"] = round(
        (readable.get("pop_in_poverty", 0) or 0) / total * 100, 1
    )

    logger.info("census_acs: data returned for %s", readable.get("geography"))
    return readable


# ----------------------------------------------------------
# census_population
# Population estimates by county and state
# ----------------------------------------------------------
def get_census_population(state_fips: str = None, limit: int = 50) -> list[dict]:
    """
    Get Census population estimates by county.
    Returns population, change from prior year, and components of change.
    """
    geo_for = f"county:*"
    geo_in  = f"state:{state_fips}" if state_fips else None

    params = {
        "get": "NAME,POP_2022,NPOPCHG_2022,DOMESTICMIG2022,INTERNATIONALMIG2022",
        "for": geo_for,
    }
    if geo_in:
        params["in"] = geo_in

    url = f"{CENSUS_API}/2022/pep/population"
    data = _get(url, params)

    if not data or len(data) < 2:
        return []

    headers = data[0]
    rows    = data[1:limit + 1]

    results = []
    for row in rows:
        record = dict(zip(headers, row))
        results.append({
            "name":              record.get("NAME", ""),
            "population":        _safe_int(record.get("POP_2022")),
            "pop_change":        _safe_int(record.get("NPOPCHG_2022")),
            "domestic_migration":_safe_int(record.get("DOMESTICMIG2022")),
            "international_migration": _safe_int(record.get("INTERNATIONALMIG2022")),
        })

    logger.info("census_population: %d counties returned", len(results))
    return results


# ----------------------------------------------------------
# census_business
# County Business Patterns — establishments and employment by industry
# ----------------------------------------------------------
def get_census_business(
    state_fips: str = None,
    naics_code: str = None,
    limit: int = 50,
) -> list[dict]:
    """
    Get Census County Business Patterns data.
    naics_code: 2-6 digit NAICS code (e.g. '621' for ambulatory health care)
    Common NAICS codes:
      621  Ambulatory Health Care Services
      6231 Nursing Care Facilities
      624  Social Assistance
      611  Educational Services
      111  Crop Production
      112  Animal Production
      813  Religious, Civic, Professional Organizations
    """
    params = {
        "get": "NAME,NAICS2017_LABEL,ESTAB,EMP,PAYANN",
        "for": f"county:*",
        "NAICS2017": naics_code or "621",
    }
    if state_fips:
        params["in"] = f"state:{state_fips}"

    url = f"{CENSUS_API}/2021/cbp"
    data = _get(url, params)

    if not data or len(data) < 2:
        return []

    headers = data[0]
    results = []
    for row in data[1:limit + 1]:
        record = dict(zip(headers, row))
        results.append({
            "county":       record.get("NAME", ""),
            "industry":     record.get("NAICS2017_LABEL", ""),
            "naics_code":   record.get("NAICS2017", naics_code),
            "establishments": _safe_int(record.get("ESTAB")),
            "employees":    _safe_int(record.get("EMP")),
            "annual_payroll_thousands": _safe_int(record.get("PAYANN")),
        })

    logger.info("census_business: %d records for NAICS %s", len(results), naics_code)
    return results


# ----------------------------------------------------------
# hud_housing
# HUD Fair Market Rents
# ----------------------------------------------------------
def get_hud_fair_market_rents(state: str = None, year: int = 2024) -> list[dict]:
    """
    Get HUD Fair Market Rents by metro area.
    Returns 0BR through 4BR rent estimates.
    Useful for: shelter/housing nonprofits, property managers,
    enterprises evaluating new location costs.
    """
    params = {"year": year}
    if state:
        params["state_alpha"] = state.upper()

    data = _get(f"{HUD_API}/listCounties/{state.upper() if state else 'US'}", params)

    if not data:
        # HUD API requires token for some endpoints — return guidance
        return [{
            "note": "HUD FMR data available at https://www.huduser.gov/portal/datasets/fmr.html",
            "state": state,
            "year": year,
        }]

    results = data.get("data", [])
    logger.info("hud_housing: %d FMR records for state=%s", len(results), state)
    return results


def _safe_int(val) -> Optional[int]:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None
