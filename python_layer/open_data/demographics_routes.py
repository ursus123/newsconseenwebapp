from fastapi import APIRouter, Query
from typing import Optional, List
from open_data.demographics import (
    get_census_acs,
    get_census_population,
    get_census_business,
    get_hud_fair_market_rents,
    ACS_VARS,
)

router = APIRouter(prefix="/demographics", tags=["Demographics"])


@router.get("/acs")
def census_acs(
    zip_code: Optional[str] = Query(None, description="5-digit ZIP code e.g. 20850"),
    county_fips: Optional[str] = Query(None, description="5-digit county FIPS e.g. 24031"),
    state_fips: Optional[str] = Query(None, description="2-digit state FIPS e.g. 24"),
    variables: Optional[str] = Query(None, description="Comma-separated variable names"),
):
    """
    ACS demographic profile — age, income, household, education.
    SELECT * FROM census_acs WHERE zip_code = '20850'
    """
    var_list = variables.split(",") if variables else None
    return get_census_acs(
        zip_code=zip_code,
        county_fips=county_fips,
        state_fips=state_fips,
        variables=var_list,
    )


@router.get("/population")
def census_population(
    state_fips: Optional[str] = Query(None, description="2-digit state FIPS"),
    limit: int = Query(50, ge=1, le=500),
):
    """
    Census population estimates with migration components by county.
    SELECT * FROM census_population WHERE state_fips = '24'
    """
    return {"results": get_census_population(state_fips=state_fips, limit=limit)}


@router.get("/business")
def census_business(
    state_fips: Optional[str] = Query(None),
    naics_code: Optional[str] = Query("621", description="NAICS code e.g. 621 = health care"),
    limit: int = Query(50, ge=1, le=500),
):
    """
    Census County Business Patterns — establishments, employees, payroll by industry.
    SELECT * FROM census_business WHERE state_fips = '24' AND naics_code = '621'
    """
    return {"results": get_census_business(
        state_fips=state_fips, naics_code=naics_code, limit=limit
    )}


@router.get("/housing")
def hud_housing(
    state: Optional[str] = Query(None, description="State abbreviation e.g. MD"),
    year: int = Query(2024, ge=2020, le=2025),
):
    """
    HUD Fair Market Rents — studio through 4-bedroom by metro area.
    SELECT * FROM hud_housing WHERE state = 'MD'
    """
    return {"results": get_hud_fair_market_rents(state=state, year=year)}


@router.get("/variables")
def acs_variables():
    """List all available ACS demographic variable names."""
    return {"variables": list(ACS_VARS.keys())}
