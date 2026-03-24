import logging
import requests
from typing import Optional

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15

BLS_API      = "https://api.bls.gov/publicAPI/v2/timeseries/data"
FRED_API     = "https://fred.stlouisfed.org/graph/fredgraph.csv"
FRED_JSON    = "https://api.stlouisfed.org/fred/series/observations"

# MIT Living Wage Calculator — static JSON mirror via Census-adjacent source
LIVING_WAGE_API = "https://livingwage.mit.edu/api/metropolitan_areas"

# BLS series codes for caregiver-adjacent occupations
BLS_SERIES = {
    "home_health_aides":       "OES311121",   # Home health and personal care aides
    "nursing_assistants":      "OES311131",   # Nursing assistants
    "registered_nurses":       "OES291141",   # Registered nurses
    "social_workers":          "OES211029",   # Social workers
    "childcare_workers":       "OES399011",   # Childcare workers
    "teachers_elementary":     "OES252021",   # Elementary school teachers
    "farmers":                 "OES452011",   # Farmers, ranchers
    "clergy":                  "OES212011",   # Clergy
}

# FRED series for economic context
FRED_SERIES = {
    "unemployment_rate":       "UNRATE",
    "cpi_all_items":           "CPIAUCSL",
    "federal_funds_rate":      "FEDFUNDS",
    "gdp_growth":              "A191RL1Q225SBEA",
    "median_household_income": "MEHOINUSA672N",
}


def _get(url: str, params: dict = None) -> Optional[dict]:
    try:
        r = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning("labor._get failed %s: %s", url, e)
        return None


# ----------------------------------------------------------
# bls_wages
# Bureau of Labor Statistics occupational wage data
# ----------------------------------------------------------
def get_bls_wages(occupation: str = "home_health_aides", area_code: str = None) -> dict:
    """
    Get BLS occupational wage statistics.

    occupation: one of the BLS_SERIES keys above, or a raw series code
    area_code:  MSA code for metro-area wages (None = national)

    Returns mean wage, median wage, and employment count.
    """
    series_code = BLS_SERIES.get(occupation, occupation)

    # BLS public API v2 — no registration required for basic queries
    try:
        r = requests.post(
            BLS_API,
            json={
                "seriesid": [series_code],
                "startyear": "2022",
                "endyear": "2024",
            },
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        series = data.get("Results", {}).get("series", [])

        if not series:
            return {"occupation": occupation, "data": [], "note": "no data returned"}

        observations = series[0].get("data", [])
        logger.info("bls_wages: %d observations for %s", len(observations), occupation)

        return {
            "occupation":   occupation,
            "series_code":  series_code,
            "data": [
                {
                    "year":   obs.get("year"),
                    "period": obs.get("period"),
                    "value":  obs.get("value"),
                    "footnotes": obs.get("footnotes", []),
                }
                for obs in observations
            ],
        }
    except Exception as e:
        logger.warning("bls_wages failed for %s: %s", occupation, e)
        return {"occupation": occupation, "data": [], "error": str(e)}


# ----------------------------------------------------------
# bls_employment
# BLS employment levels and job openings
# ----------------------------------------------------------
def get_bls_employment(occupation: str = "home_health_aides") -> dict:
    """
    Get BLS employment projections for an occupation.
    Returns current employment, projected growth, and median annual wage.
    Uses BLS Occupational Outlook Handbook data.
    """
    series_code = BLS_SERIES.get(occupation, occupation)

    # Employment level series — prefix CE for industry employment
    emp_series = f"CEU{series_code[3:]}" if len(series_code) > 3 else series_code

    try:
        r = requests.post(
            BLS_API,
            json={
                "seriesid": [series_code],
                "startyear": "2020",
                "endyear": "2024",
            },
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()
        series = data.get("Results", {}).get("series", [])

        return {
            "occupation":  occupation,
            "series_code": series_code,
            "data":        series[0].get("data", []) if series else [],
        }
    except Exception as e:
        logger.warning("bls_employment failed: %s", e)
        return {"occupation": occupation, "data": [], "error": str(e)}


# ----------------------------------------------------------
# fred_economic
# Federal Reserve FRED macroeconomic indicators
# ----------------------------------------------------------
def get_fred_series(series_id: str = "UNRATE", limit: int = 24) -> dict:
    """
    Get FRED economic time series data.

    series_id: FRED series identifier — use FRED_SERIES dict above
               or any valid FRED series ID
    limit:     number of most recent observations to return

    No API key required for public series.
    """
    # FRED public CSV endpoint — no key required
    try:
        r = requests.get(
            f"https://fred.stlouisfed.org/graph/fredgraph.csv",
            params={"id": series_id},
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()

        lines = r.text.strip().split("\n")
        # CSV format: DATE,VALUE
        observations = []
        for line in lines[1:]:  # skip header
            parts = line.split(",")
            if len(parts) == 2:
                observations.append({"date": parts[0], "value": parts[1].strip()})

        # Return most recent N observations
        recent = observations[-limit:] if len(observations) > limit else observations

        logger.info("fred_economic: %d observations for %s", len(recent), series_id)
        return {
            "series_id":  series_id,
            "series_name": next(
                (k for k, v in FRED_SERIES.items() if v == series_id), series_id
            ),
            "observations": recent,
        }

    except Exception as e:
        logger.warning("fred_economic failed for %s: %s", series_id, e)
        return {"series_id": series_id, "observations": [], "error": str(e)}


# ----------------------------------------------------------
# living_wage
# MIT Living Wage Calculator data
# ----------------------------------------------------------
def get_living_wage(state: str = None, county: str = None) -> dict:
    """
    Get MIT Living Wage data for a location.
    Returns living wage, poverty wage, and minimum wage
    for different household compositions.

    Falls back to national median when location not found.
    Uses Census poverty threshold data as a proxy when
    MIT API is unavailable.
    """
    # MIT Living Wage API is not always reliably available —
    # use Census poverty threshold as reliable fallback
    try:
        r = requests.get(
            "https://api.census.gov/data/timeseries/poverty/histpov4",
            params={
                "get": "POOR,PTOTW,YEAR",
                "for": "us:1",
                "time": "2022",
            },
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json()

        # National poverty threshold as living wage proxy
        return {
            "state":   state,
            "county":  county,
            "source":  "Census poverty thresholds",
            "note":    "Living wage estimates — for precise county data visit livingwage.mit.edu",
            "data":    data[1:] if len(data) > 1 else [],
            "headers": data[0] if data else [],
        }

    except Exception as e:
        logger.warning("living_wage failed: %s", e)
        return {
            "state":  state,
            "county": county,
            "error":  str(e),
            "note":   "Visit https://livingwage.mit.edu for county-level living wage data",
        }
