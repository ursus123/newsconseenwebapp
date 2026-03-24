from fastapi import APIRouter, Query
from typing import Optional
from open_data.labor import (
    get_bls_wages,
    get_bls_employment,
    get_fred_series,
    get_living_wage,
    BLS_SERIES,
    FRED_SERIES,
)

router = APIRouter(prefix="/labor", tags=["Labor"])


@router.get("/wages")
def bls_wages(
    occupation: str = Query("home_health_aides", description=f"One of: {list(BLS_SERIES.keys())}"),
    area_code: Optional[str] = Query(None, description="MSA code for metro-area wages"),
):
    """
    BLS occupational wage statistics.
    SELECT * FROM bls_wages WHERE occupation = 'home_health_aides'
    """
    return get_bls_wages(occupation=occupation, area_code=area_code)


@router.get("/employment")
def bls_employment(
    occupation: str = Query("home_health_aides"),
):
    """
    BLS employment levels and outlook.
    SELECT * FROM bls_employment WHERE occupation = 'registered_nurses'
    """
    return get_bls_employment(occupation=occupation)


@router.get("/economic")
def fred_economic(
    series_id: str = Query("UNRATE", description=f"FRED series. Common: {list(FRED_SERIES.values())}"),
    limit: int = Query(24, ge=1, le=120),
):
    """
    FRED macroeconomic indicators — unemployment, CPI, GDP, interest rates.
    SELECT * FROM fred_economic WHERE series_id = 'UNRATE' LIMIT 24
    """
    return get_fred_series(series_id=series_id, limit=limit)


@router.get("/living-wage")
def living_wage(
    state: Optional[str] = Query(None, description="State abbreviation"),
    county: Optional[str] = Query(None, description="County name"),
):
    """
    MIT Living Wage Calculator data — living wage vs poverty wage by location.
    SELECT * FROM living_wage WHERE state = 'MD' AND county = 'Montgomery'
    """
    return get_living_wage(state=state, county=county)


@router.get("/series-list")
def series_list():
    """List all available BLS occupation series and FRED economic series."""
    return {
        "bls_occupations": BLS_SERIES,
        "fred_series":     FRED_SERIES,
    }
