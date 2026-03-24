import logging
import requests
from typing import Optional

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15

# ProPublica Nonprofit Explorer API — IRS 990 data, no key required
PROPUBLICA_API = "https://projects.propublica.org/nonprofits/api/v2"

# IRS Tax Exempt Organization Search API
IRS_TEO_API = "https://efts.irs.gov/LATEST/search-index"

# Grants.gov API — federal grant listings
GRANTS_API = "https://apply07.grants.gov/grantsws/rest/opportunities/search"

# NCCS National Center for Charitable Statistics (Urban Institute)
NCCS_API = "https://urbaninstitute.github.io/nccs-legacy/rdata"


def _get(url: str, params: dict = None) -> Optional[dict]:
    try:
        r = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning("nonprofit._get failed %s: %s", url, e)
        return None


# ----------------------------------------------------------
# irs_990
# ProPublica Nonprofit Explorer — IRS 990 filing data
# ----------------------------------------------------------
def search_nonprofits(
    name: str = None,
    state: str = None,
    ntee_code: str = None,
    limit: int = 20,
) -> list[dict]:
    """
    Search IRS 990 filers via ProPublica Nonprofit Explorer.

    name:      organization name (partial match)
    state:     2-letter state abbreviation
    ntee_code: NTEE major category code
               A=Arts, B=Education, C=Environment, D=Animals,
               E=Health, F=Mental Health, G=Diseases, H=Medical Research,
               I=Crime, J=Employment, K=Food, L=Housing, M=Public Safety,
               N=Recreation, O=Youth, P=Human Services, Q=International,
               R=Civil Rights, S=Community, T=Philanthropy,
               U=Science, V=Social Science, W=Public Benefit,
               X=Religion, Y=Mutual Benefit, Z=Unknown

    Returns EIN, name, state, revenue, assets, and NTEE classification.
    """
    params = {}
    if name:
        params["q"] = name
    if state:
        params["state[]"] = state.upper()
    if ntee_code:
        params["ntee[]"] = ntee_code.upper()

    url = f"{PROPUBLICA_API}/search.json"
    data = _get(url, params)

    if not data:
        return []

    organizations = data.get("organizations", [])
    cleaned = []
    for org in organizations[:limit]:
        cleaned.append({
            "ein":              org.get("ein"),
            "name":             org.get("name"),
            "state":            org.get("state"),
            "city":             org.get("city"),
            "ntee_code":        org.get("ntee_code"),
            "subsection_code":  org.get("subsection_code"),
            "total_revenue":    org.get("income_amount"),
            "total_assets":     org.get("asset_amount"),
            "ruling_date":      org.get("ruling_date"),
            "exempt_status":    org.get("exempt_status_code"),
            "filing_required":  org.get("filing_requirement_code"),
        })

    logger.info("irs_990: %d organizations returned for name=%s state=%s", len(cleaned), name, state)
    return cleaned


def get_nonprofit_filings(ein: str, limit: int = 5) -> list[dict]:
    """
    Get recent 990 filings for a specific organization by EIN.
    Returns financial summary for each filing year.
    """
    url = f"{PROPUBLICA_API}/organizations/{ein}.json"
    data = _get(url)

    if not data:
        return []

    org = data.get("organization", {})
    filings = data.get("filings_with_data", [])

    results = []
    for filing in filings[:limit]:
        results.append({
            "ein":              org.get("ein"),
            "name":             org.get("name"),
            "tax_year":         filing.get("tax_prd_yr"),
            "total_revenue":    filing.get("totrevenue"),
            "total_expenses":   filing.get("totfuncexpns"),
            "total_assets":     filing.get("totassetsend"),
            "total_liabilities":filing.get("totliabend"),
            "net_assets":       filing.get("totnetassetend"),
            "employees":        filing.get("noemployees"),
            "volunteers":       filing.get("nvolunteers"),
            "pdf_url":          filing.get("pdf_url"),
        })

    logger.info("nonprofit_filings: %d filings for EIN %s", len(results), ein)
    return results


# ----------------------------------------------------------
# irs_exempt_orgs
# IRS Tax Exempt Organization Search
# ----------------------------------------------------------
def search_irs_exempt(
    name: str = None,
    state: str = None,
    org_type: str = None,
    limit: int = 20,
) -> list[dict]:
    """
    Search IRS Tax Exempt Organization database.

    org_type: '501c3', '501c4', '501c6', '501c7' etc.
    Returns EIN, name, exempt status, ruling date, and address.
    """
    params = {
        "q":    name or "",
        "rows": limit,
    }
    if state:
        params["stateAbbr"] = state.upper()

    data = _get(IRS_TEO_API, params)

    if not data:
        return []

    hits = data.get("hits", {}).get("hits", [])
    results = []
    for hit in hits:
        source = hit.get("_source", {})
        results.append({
            "ein":          source.get("EIN"),
            "name":         source.get("NAME"),
            "state":        source.get("STATE"),
            "city":         source.get("CITY"),
            "zip":          source.get("ZIP"),
            "org_type":     source.get("ORG"),
            "ruling_date":  source.get("RULING"),
            "ntee_code":    source.get("NTEE_CD"),
            "activity":     source.get("ACTIVITY"),
            "deductibility":source.get("DEDUCTIBILITY"),
            "status":       source.get("STATUS"),
        })

    logger.info("irs_exempt: %d orgs returned", len(results))
    return results


# ----------------------------------------------------------
# grants_gov
# Federal grant listings from Grants.gov
# ----------------------------------------------------------
def search_grants(
    keyword: str = None,
    agency: str = None,
    eligibility: str = None,
    limit: int = 20,
) -> list[dict]:
    """
    Search federal grant opportunities on Grants.gov.

    keyword:     search term (e.g. 'home care', 'education', 'food bank')
    agency:      agency code (e.g. 'HHS', 'USDA', 'DOE', 'DOJ')
    eligibility: '25' = nonprofits, '12' = state gov, '04' = city gov

    Returns opportunity title, agency, deadline, award ceiling, and synopsis.
    """
    payload = {
        "keyword":          keyword or "",
        "oppNum":           "",
        "cfda":             "",
        "agencyCode":       agency or "",
        "eligibilities":    eligibility or "",
        "fundingCategories":"",
        "fundingInstruments":"",
        "dateRange":        "",
        "startRecordNum":   0,
        "rows":             limit,
        "oppStatuses":      "forecasted|posted",
        "sortBy":           "openDate|desc",
    }

    try:
        r = requests.post(
            GRANTS_API,
            json=payload,
            timeout=REQUEST_TIMEOUT,
            headers={"Content-Type": "application/json"},
        )
        r.raise_for_status()
        data = r.json()
        opps = data.get("oppHits", [])

        results = []
        for opp in opps:
            results.append({
                "opportunity_id":     opp.get("id"),
                "title":              opp.get("oppTitle"),
                "agency":             opp.get("agencyCode"),
                "agency_name":        opp.get("agencyName"),
                "cfda_number":        opp.get("cfdaNumbers"),
                "open_date":          opp.get("openDate"),
                "close_date":         opp.get("closeDate"),
                "award_ceiling":      opp.get("awardCeiling"),
                "award_floor":        opp.get("awardFloor"),
                "expected_awards":    opp.get("expectedNumberAwards"),
                "eligibilities":      opp.get("eligibilities"),
                "category":           opp.get("fundingCategories"),
                "status":             opp.get("oppStatus"),
                "synopsis":           opp.get("synopsis", "")[:500],
            })

        logger.info("grants_gov: %d opportunities for keyword='%s'", len(results), keyword)
        return results

    except Exception as e:
        logger.warning("grants_gov failed: %s", e)
        return []


# ----------------------------------------------------------
# giving_stats
# National Philanthropic Trust charitable giving statistics
# ----------------------------------------------------------
def get_giving_statistics() -> dict:
    """
    Returns national charitable giving statistics.
    Source: National Philanthropic Trust Giving USA data.
    These are the most recent published figures (2023 report).

    Used by nonprofits and faith organizations for
    benchmarking their fundraising against national trends.
    """
    return {
        "source":   "Giving USA 2023 Annual Report",
        "year":     2022,
        "note":     "Most recent full-year data available",
        "total_giving_billions": 499.33,
        "by_source": {
            "individuals":   "64%",
            "foundations":   "19%",
            "bequests":      "9%",
            "corporations":  "8%",
        },
        "by_recipient": {
            "religion":                 "27%",
            "education":                "14%",
            "human_services":           "14%",
            "foundations":              "12%",
            "health":                   "9%",
            "public_society_benefit":   "9%",
            "arts_culture":             "5%",
            "environment_animals":      "3%",
            "international_affairs":    "3%",
            "individuals":              "2%",
        },
        "trend": {
            "2020": 471.44,
            "2021": 484.85,
            "2022": 499.33,
            "inflation_adjusted_change_pct": -3.4,
        },
    }
