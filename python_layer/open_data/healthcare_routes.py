from fastapi import APIRouter, Query
from typing import Optional
from open_data.healthcare import (
    get_home_health,
    get_cms_providers,
    get_npi_providers,
    get_fda_device_recalls,
    get_cms_quality_measures,
)

router = APIRouter(prefix="/healthcare", tags=["Healthcare"])


@router.get("/home-health")
def home_health(
    state: Optional[str] = Query(None, description="State abbreviation e.g. MD"),
    limit: int = Query(100, ge=1, le=500),
):
    """
    CMS Home Health Compare — agency star ratings and quality outcomes.
    SELECT * FROM cms_home_health WHERE state = 'MD'
    """
    return {"results": get_home_health(state=state, limit=limit)}


@router.get("/providers")
def cms_providers(
    state: Optional[str] = Query(None),
    provider_type: Optional[str] = Query(None, description="e.g. 'Home Health Agency'"),
    limit: int = Query(100, ge=1, le=500),
):
    """
    CMS-certified providers by state and type.
    SELECT * FROM cms_providers WHERE state = 'MD' AND provider_type = 'Home Health Agency'
    """
    return {"results": get_cms_providers(state=state, provider_type=provider_type, limit=limit)}


@router.get("/npi")
def npi_registry(
    name: Optional[str] = Query(None, description="Organization or provider name"),
    state: Optional[str] = Query(None),
    taxonomy: Optional[str] = Query(None, description="Taxonomy description e.g. 'home health'"),
    limit: int = Query(20, ge=1, le=100),
):
    """
    NPPES NPI registry provider lookup.
    SELECT * FROM npi_registry WHERE name = 'Sunrise Health' AND state = 'MD'
    """
    return {"results": get_npi_providers(name=name, state=state, taxonomy=taxonomy, limit=limit)}


@router.get("/device-recalls")
def device_recalls(
    device_name: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=50),
):
    """
    FDA medical device recalls and safety alerts.
    SELECT * FROM fda_devices WHERE device_name = 'insulin pump'
    """
    return {"results": get_fda_device_recalls(device_name=device_name, limit=limit)}


@router.get("/quality-measures")
def quality_measures(
    state: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """
    CMS home health quality outcome measures per provider.
    SELECT * FROM cms_quality WHERE state = 'MD'
    """
    return {"results": get_cms_quality_measures(state=state, limit=limit)}
