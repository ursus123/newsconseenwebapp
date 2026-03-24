from fastapi import APIRouter, Query
from typing import Optional
from open_data.education import (
    get_nces_schools,
    get_ipeds_colleges,
    get_ed_finance,
    get_nces_districts,
)

router = APIRouter(prefix="/education", tags=["Education"])


@router.get("/schools")
def nces_schools(
    state: Optional[str] = Query(None, description="State abbreviation e.g. MD"),
    county_fips: Optional[str] = Query(None, description="5-digit county FIPS"),
    school_level: Optional[str] = Query(None, description="elementary, middle, high, other"),
    limit: int = Query(50, ge=1, le=200),
):
    """
    NCES K-12 school profiles — enrollment, type, location.
    SELECT * FROM nces_schools WHERE state = 'MD' AND school_level = 'elementary'
    """
    return {"results": get_nces_schools(
        state=state, county_fips=county_fips,
        school_level=school_level, limit=limit,
    )}


@router.get("/colleges")
def ipeds_colleges(
    state: Optional[str] = Query(None),
    institution_type: Optional[str] = Query(None, description="public, private_nonprofit, private_forprofit"),
    limit: int = Query(30, ge=1, le=100),
):
    """
    IPEDS postsecondary institutions — enrollment, tuition, graduation rates.
    SELECT * FROM ipeds_colleges WHERE state = 'MD' AND institution_type = 'public'
    """
    return {"results": get_ipeds_colleges(
        state=state, institution_type=institution_type, limit=limit
    )}


@router.get("/finance")
def ed_finance(
    state_fips: Optional[str] = Query(None, description="2-digit state FIPS"),
    limit: int = Query(50, ge=1, le=200),
):
    """
    Per-pupil expenditure and revenue by school district.
    SELECT * FROM ed_finance WHERE state_fips = '24'
    """
    return {"results": get_ed_finance(state_fips=state_fips, limit=limit)}


@router.get("/districts")
def nces_districts(
    state: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """
    School district profiles — enrollment, school count, locale.
    SELECT * FROM nces_districts WHERE state = 'MD'
    """
    return {"results": get_nces_districts(state=state, limit=limit)}
