"""
Public Data Connector Routes
=============================
FastAPI endpoints for the three public data connectors.
All data is free and requires no API key.

Endpoints:
  GET /public-data/cms/pharmacies          — CMS-certified pharmacy locations
  GET /public-data/cms/partd-spending      — Medicare Part D drug spending
  GET /public-data/cms/prescribers         — Part D prescriber patterns
  GET /public-data/dea/pharmacies          — DEA/NPPES registered pharmacies
  GET /public-data/dea/opioid-dispensing   — ARCOS county-level opioid data
  GET /public-data/dea/pharmacy-count      — Pharmacy count by city
  GET /public-data/state/pharmacies        — State board licensed pharmacies
  GET /public-data/state/summary           — License summary statistics
"""

import logging
from typing import Optional

from fastapi import APIRouter, Query, HTTPException
from database import _clean_df

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public-data", tags=["Public Data Connectors"])


# ── CMS Medicare ──────────────────────────────────────────────────────────────

@router.get("/cms/pharmacies")
def cms_pharmacies(
    state:  str           = Query(..., description="Two-letter state code (e.g. ME)"),
    city:   Optional[str] = Query(None, description="City name filter"),
    limit:  int           = Query(200, ge=1, le=500, description="Max records"),
):
    """
    CMS-certified pharmacy locations from Provider of Services file.
    Source: CMS Open Data (public, no API key).
    """
    try:
        from connectors.public_data.cms_medicare import CMSMedicareConnector
        conn = CMSMedicareConnector()
        df = conn.get_pharmacy_providers(state=state, city=city, limit=limit)
        records = df.pipe(_clean_df).to_dict(orient="records") if not df.empty else []
        return {
            "state":   state,
            "count":   len(records),
            "source":  "CMS Provider of Services",
            "data":    records,
        }
    except Exception as e:
        logger.error("GET /public-data/cms/pharmacies failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cms/partd-spending")
def cms_partd_spending(
    drug_name: Optional[str] = Query(None, description="Drug name filter (brand or generic)"),
    limit:     int           = Query(50, ge=1, le=200, description="Max records"),
):
    """
    Medicare Part D drug spending and utilisation data.
    Source: CMS Open Data (public, no API key).
    """
    try:
        from connectors.public_data.cms_medicare import CMSMedicareConnector
        conn = CMSMedicareConnector()
        df = conn.get_partd_drug_spending(drug_name=drug_name, limit=limit)
        records = df.pipe(_clean_df).to_dict(orient="records") if not df.empty else []
        return {
            "drug_filter": drug_name,
            "count":       len(records),
            "source":      "CMS Part D Drug Spending",
            "data":        records,
        }
    except Exception as e:
        logger.error("GET /public-data/cms/partd-spending failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cms/prescribers")
def cms_prescribers(
    state:     Optional[str] = Query(None, description="State filter (e.g. ME)"),
    drug_name: Optional[str] = Query(None, description="Drug name filter"),
    limit:     int           = Query(100, ge=1, le=500, description="Max records"),
):
    """
    Medicare Part D prescriber patterns by provider and drug.
    Source: CMS Open Data (public, no API key).
    """
    try:
        from connectors.public_data.cms_medicare import CMSMedicareConnector
        conn = CMSMedicareConnector()
        df = conn.get_prescriber_patterns(state=state, drug_name=drug_name, limit=limit)
        records = df.pipe(_clean_df).to_dict(orient="records") if not df.empty else []
        return {
            "state":      state,
            "drug_filter": drug_name,
            "count":      len(records),
            "source":     "CMS Part D Prescribers",
            "data":       records,
        }
    except Exception as e:
        logger.error("GET /public-data/cms/prescribers failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── DEA / NPPES ───────────────────────────────────────────────────────────────

@router.get("/dea/pharmacies")
def dea_pharmacies(
    state: str           = Query(..., description="Two-letter state code (e.g. ME)"),
    city:  Optional[str] = Query(None, description="City name filter"),
    limit: int           = Query(200, ge=1, le=200, description="Max records"),
):
    """
    DEA/NPPES-registered pharmacy locations.
    Source: CMS NPPES NPI Registry (public, no API key).
    """
    try:
        from connectors.public_data.dea_registrant import DEARegistrantConnector
        conn = DEARegistrantConnector()
        df = conn.get_pharmacies_by_state(state=state, city=city, limit=limit)
        records = df.pipe(_clean_df).to_dict(orient="records") if not df.empty else []
        return {
            "state":  state,
            "count":  len(records),
            "source": "CMS NPPES NPI Registry",
            "data":   records,
        }
    except Exception as e:
        logger.error("GET /public-data/dea/pharmacies failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dea/opioid-dispensing")
def dea_opioid_dispensing(
    state: str          = Query(..., description="Two-letter state code (e.g. ME)"),
    year:  Optional[int]= Query(None, description="Year filter (2006–2019)"),
):
    """
    County-level opioid dispensing data from DEA ARCOS.
    Source: Washington Post ARCOS API (public, no API key).
    Critical context for Maine pharmacy market analysis.
    """
    try:
        from connectors.public_data.dea_registrant import DEARegistrantConnector
        conn = DEARegistrantConnector()
        df = conn.get_opioid_dispensing_by_county(state=state, year=year)
        records = df.pipe(_clean_df).to_dict(orient="records") if not df.empty else []
        return {
            "state":  state,
            "year":   year,
            "count":  len(records),
            "source": "DEA ARCOS via Washington Post API",
            "data":   records,
        }
    except Exception as e:
        logger.error("GET /public-data/dea/opioid-dispensing failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dea/pharmacy-count")
def dea_pharmacy_count(
    state: str = Query(..., description="Two-letter state code (e.g. ME)"),
):
    """
    Pharmacy count by city for a state.
    Source: CMS NPPES NPI Registry (public, no API key).
    """
    try:
        from connectors.public_data.dea_registrant import DEARegistrantConnector
        conn = DEARegistrantConnector()
        df = conn.get_pharmacy_count_by_city(state=state)
        records = df.pipe(_clean_df).to_dict(orient="records") if not df.empty else []
        return {
            "state":  state,
            "count":  len(records),
            "source": "CMS NPPES NPI Registry",
            "data":   records,
        }
    except Exception as e:
        logger.error("GET /public-data/dea/pharmacy-count failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── State Pharmacy Board ──────────────────────────────────────────────────────

@router.get("/state/pharmacies")
def state_pharmacies(
    state:       str           = Query(..., description="Two-letter state code (e.g. ME)"),
    city:        Optional[str] = Query(None,  description="City filter"),
    active_only: bool          = Query(True,  description="Active licenses only"),
    limit:       int           = Query(500,   ge=1, le=1000, description="Max records"),
):
    """
    State pharmacy board licensed pharmacies.
    Tries Maine Open Data, then NABP locator, then NPPES fallback.
    Source: State board open data + NABP + CMS NPPES (all public, no API key).
    """
    try:
        from connectors.public_data.state_pharmacy import StatePharmacyConnector
        conn = StatePharmacyConnector()
        df = conn.get_licensed_pharmacies(state=state, city=city, active_only=active_only, limit=limit)
        records = df.pipe(_clean_df).to_dict(orient="records") if not df.empty else []
        return {
            "state":  state,
            "count":  len(records),
            "source": "State Pharmacy Board / NABP / NPPES",
            "data":   records,
        }
    except Exception as e:
        logger.error("GET /public-data/state/pharmacies failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/state/summary")
def state_pharmacy_summary(
    state: str = Query(..., description="Two-letter state code (e.g. ME)"),
):
    """
    Pharmacy license summary statistics for a state.
    Returns total, active count, and breakdown by city.
    """
    try:
        from connectors.public_data.state_pharmacy import StatePharmacyConnector
        conn = StatePharmacyConnector()
        summary = conn.get_license_summary(state=state)
        return summary
    except Exception as e:
        logger.error("GET /public-data/state/summary failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
