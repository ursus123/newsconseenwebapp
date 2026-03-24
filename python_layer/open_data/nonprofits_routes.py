from fastapi import APIRouter, Query
from typing import Optional
from open_data.nonprofit import (
    search_nonprofits,
    get_nonprofit_filings,
    search_irs_exempt,
    search_grants,
    get_giving_statistics,
)

router = APIRouter(prefix="/nonprofit", tags=["Nonprofit"])


@router.get("/search")
def irs_990_search(
    name: Optional[str] = Query(None, description="Organization name"),
    state: Optional[str] = Query(None, description="State abbreviation"),
    ntee_code: Optional[str] = Query(None, description="NTEE major code e.g. X=Religion, E=Health, K=Food"),
    limit: int = Query(20, ge=1, le=100),
):
    """
    Search IRS 990 filers — revenue, assets, employees by organization.
    SELECT * FROM irs_990 WHERE state = 'MD' AND ntee_code = 'X'
    """
    return {"results": search_nonprofits(name=name, state=state, ntee_code=ntee_code, limit=limit)}


@router.get("/filings/{ein}")
def nonprofit_filings(
    ein: str,
    limit: int = Query(5, ge=1, le=10),
):
    """
    Get recent 990 filing history for a specific organization by EIN.
    SELECT * FROM irs_990_filings WHERE ein = '526049537'
    """
    return {"results": get_nonprofit_filings(ein=ein, limit=limit)}


@router.get("/exempt-orgs")
def irs_exempt_orgs(
    name: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    org_type: Optional[str] = Query(None, description="501c3, 501c4, 501c6 etc."),
    limit: int = Query(20, ge=1, le=100),
):
    """
    IRS Tax Exempt Organization database — 501c status, EIN, ruling date.
    SELECT * FROM irs_exempt_orgs WHERE name = 'Bethel' AND state = 'MD'
    """
    return {"results": search_irs_exempt(name=name, state=state, org_type=org_type, limit=limit)}


@router.get("/grants")
def grants_gov(
    keyword: Optional[str] = Query(None, description="Search term e.g. 'home care', 'food bank'"),
    agency: Optional[str] = Query(None, description="Agency code e.g. HHS, USDA, DOE"),
    eligibility: Optional[str] = Query(None, description="25=nonprofits, 12=state, 04=city"),
    limit: int = Query(20, ge=1, le=100),
):
    """
    Federal grant opportunities from Grants.gov.
    SELECT * FROM grants_gov WHERE keyword = 'home care' AND agency = 'HHS'
    """
    return {"results": search_grants(keyword=keyword, agency=agency, eligibility=eligibility, limit=limit)}


@router.get("/giving-stats")
def giving_statistics():
    """
    National charitable giving statistics from Giving USA.
    SELECT * FROM giving_stats
    """
    return get_giving_statistics()
