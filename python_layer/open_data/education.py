import logging
import requests
from typing import Optional

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15

# NCES Common Core of Data
NCES_API   = "https://educationdata.urban.org/api/v1"

# IPEDS — Integrated Postsecondary Education Data System
IPEDS_API  = "https://educationdata.urban.org/api/v1/college-university"

# US Department of Education College Scorecard
SCORECARD_API = "https://api.data.gov/ed/collegescorecard/v1/schools"


def _get(url: str, params: dict = None) -> Optional[dict]:
    try:
        r = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning("education._get failed %s: %s", url, e)
        return None


# ----------------------------------------------------------
# nces_schools
# NCES Common Core of Data — K-12 school profiles
# ----------------------------------------------------------
def get_nces_schools(
    state: str = None,
    county_fips: str = None,
    school_level: str = None,
    limit: int = 50,
) -> list[dict]:
    """
    Get K-12 school data from NCES Common Core of Data.

    state:        2-letter abbreviation (e.g. 'MD')
    county_fips:  5-digit FIPS code
    school_level: 'elementary', 'middle', 'high', 'other'
    """
    params = {
        "per_page": limit,
        "page":     1,
    }
    if state:
        params["fipst"] = _state_to_fips(state)
    if school_level:
        level_map = {"elementary": 1, "middle": 2, "high": 3, "other": 4}
        params["gslo"] = level_map.get(school_level.lower(), 1)

    url = f"{NCES_API}/schools/ccd/directory/2021-22"
    data = _get(url, params)

    if not data:
        return []

    results = data.get("results", [])
    cleaned = []
    for r in results:
        cleaned.append({
            "nces_id":        r.get("ncessch"),
            "name":           r.get("school_name"),
            "state":          r.get("state_location"),
            "county":         r.get("nmcnty"),
            "city":           r.get("city_location"),
            "zip":            r.get("zip_location"),
            "school_level":   r.get("school_level"),
            "school_type":    r.get("school_type"),
            "charter":        r.get("charter_school"),
            "magnet":         r.get("magnet"),
            "title_i":        r.get("title_i_school"),
            "phone":          r.get("phone"),
            "website":        r.get("website"),
            "lat":            r.get("latitude"),
            "lon":            r.get("longitude"),
        })

    logger.info("nces_schools: %d schools returned for state=%s", len(cleaned), state)
    return cleaned


# ----------------------------------------------------------
# ipeds_colleges
# IPEDS postsecondary institution data
# ----------------------------------------------------------
def get_ipeds_colleges(
    state: str = None,
    institution_type: str = None,
    limit: int = 30,
) -> list[dict]:
    """
    Get postsecondary institution data from IPEDS.

    institution_type: 'public', 'private_nonprofit', 'private_forprofit'
    Returns enrollment, graduation rate, tuition, and institutional info.
    """
    params = {
        "fields": (
            "school.name,school.state,school.city,school.ownership,"
            "school.locale,latest.student.size,latest.completion.rate_suppressed.overall,"
            "latest.cost.tuition.in_state,latest.cost.tuition.out_of_state,"
            "school.zip,school.phone,school.school_url"
        ),
        "per_page": limit,
        "page":     0,
        "api_key":  "DEMO_KEY",  # DEMO_KEY allows 40 req/hour — sufficient for demos
    }

    if state:
        params["school.state"] = state.upper()

    type_map = {
        "public":            1,
        "private_nonprofit": 2,
        "private_forprofit": 3,
    }
    if institution_type and institution_type in type_map:
        params["school.ownership"] = type_map[institution_type]

    data = _get(SCORECARD_API, params)

    if not data:
        return []

    results = data.get("results", [])
    cleaned = []
    for r in results:
        school = r.get("school", {})
        latest = r.get("latest", {})
        cleaned.append({
            "name":              school.get("name"),
            "state":             school.get("state"),
            "city":              school.get("city"),
            "zip":               school.get("zip"),
            "phone":             school.get("phone"),
            "website":           school.get("school_url"),
            "ownership":         school.get("ownership"),
            "locale":            school.get("locale"),
            "enrollment":        latest.get("student", {}).get("size"),
            "graduation_rate":   latest.get("completion", {}).get(
                "rate_suppressed", {}
            ).get("overall"),
            "tuition_in_state":  latest.get("cost", {}).get("tuition", {}).get("in_state"),
            "tuition_out_state": latest.get("cost", {}).get("tuition", {}).get("out_of_state"),
        })

    logger.info("ipeds_colleges: %d institutions returned for state=%s", len(cleaned), state)
    return cleaned


# ----------------------------------------------------------
# ed_finance
# Per-pupil expenditure and revenue by state
# ----------------------------------------------------------
def get_ed_finance(state_fips: str = None, limit: int = 50) -> list[dict]:
    """
    Get per-pupil education finance data by district.
    Returns total revenue, expenditure, and per-pupil breakdowns.
    """
    params = {"per_page": limit, "page": 1}
    if state_fips:
        params["fipst"] = state_fips

    url = f"{NCES_API}/schools/ccd/finance/2020-21"
    data = _get(url, params)

    if not data:
        return []

    results = data.get("results", [])
    cleaned = []
    for r in results:
        cleaned.append({
            "district_id":           r.get("leaid"),
            "district_name":         r.get("lea_name"),
            "state":                 r.get("state_abbr"),
            "total_revenue":         r.get("totalrev"),
            "federal_revenue":       r.get("tfedrev"),
            "state_revenue":         r.get("tstrev"),
            "local_revenue":         r.get("tlocrev"),
            "total_expenditure":     r.get("totalexp"),
            "instruction_exp":       r.get("tcurinst"),
            "support_exp":           r.get("tcurssvc"),
            "per_pupil_expenditure": r.get("ppcstot"),
        })

    logger.info("ed_finance: %d district finance records", len(cleaned))
    return cleaned


# ----------------------------------------------------------
# nces_districts
# School district boundaries and summary stats
# ----------------------------------------------------------
def get_nces_districts(state: str = None, limit: int = 50) -> list[dict]:
    """
    Get school district (LEA) profiles from NCES.
    Returns district name, enrollment, number of schools, and locale.
    """
    params = {"per_page": limit, "page": 1}
    if state:
        params["fipst"] = _state_to_fips(state)

    url = f"{NCES_API}/schools/ccd/lea_directory/2021-22"
    data = _get(url, params)

    if not data:
        return []

    results = data.get("results", [])
    return [
        {
            "district_id":    r.get("leaid"),
            "name":           r.get("lea_name"),
            "state":          r.get("state_abbr"),
            "city":           r.get("city_location"),
            "zip":            r.get("zip_location"),
            "enrollment":     r.get("student_count"),
            "school_count":   r.get("school_count"),
            "locale":         r.get("locale"),
            "district_type":  r.get("lea_type"),
            "phone":          r.get("phone"),
            "website":        r.get("website"),
        }
        for r in results
    ]


def _state_to_fips(abbr: str) -> str:
    mapping = {
        "AL":"01","AK":"02","AZ":"04","AR":"05","CA":"06","CO":"08","CT":"09",
        "DE":"10","FL":"12","GA":"13","HI":"15","ID":"16","IL":"17","IN":"18",
        "IA":"19","KS":"20","KY":"21","LA":"22","ME":"23","MD":"24","MA":"25",
        "MI":"26","MN":"27","MS":"28","MO":"29","MT":"30","NE":"31","NV":"32",
        "NH":"33","NJ":"34","NM":"35","NY":"36","NC":"37","ND":"38","OH":"39",
        "OK":"40","OR":"41","PA":"42","RI":"44","SC":"45","SD":"46","TN":"47",
        "TX":"48","UT":"49","VT":"50","VA":"51","WA":"53","WV":"54","WI":"55",
        "WY":"56","DC":"11",
    }
    return mapping.get(abbr.upper(), abbr)
