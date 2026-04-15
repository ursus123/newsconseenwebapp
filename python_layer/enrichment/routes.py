"""
enrichment/routes.py
---------------------
FastAPI router for Phase A enrichment endpoints.

Mounted at: /enrichment/* and /open-data/* (enrichment primitives)

Endpoints:
  GET  /enrichment/status          — coverage stats per entity
  POST /enrichment/run             — trigger full enrichment for a company
  GET  /enrichment/people          — read analytics.person_enrichment
  GET  /enrichment/enterprises     — read analytics.enterprise_enrichment
  GET  /enrichment/products        — read analytics.product_enrichment
  GET  /enrichment/transactions    — read analytics.transaction_enrichment
  GET  /enrichment/addresses       — read analytics.address_enrichment

  GET  /open-data/exchange-rates   — FX rates (open.er-api.com, 24h cache)
  GET  /open-data/barcode/{ean}    — barcode lookup (Open Food Facts / UPC Item DB)
  GET  /open-data/company-lookup   — company registration (OpenCorporates)
"""

import logging
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from database import get_engine_safe
from sqlalchemy import text

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Enrichment"])


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _read_enrichment_table(table: str, company_id: Optional[str]) -> list:
    """Read from analytics.<table>, filtered by company_id."""
    engine = get_engine_safe()
    if engine is None:
        return []
    try:
        q = f"SELECT * FROM analytics.{table}"
        params = {}
        if company_id:
            q += " WHERE company_id = :cid"
            params["cid"] = company_id
        df = pd.read_sql(text(q), engine, params=params)
        return df.where(df.notna(), None).to_dict(orient="records")
    except Exception as exc:
        logger.warning("enrichment.routes: could not read %s — %s", table, exc)
        return []


# ------------------------------------------------------------------
# Coverage / Status
# ------------------------------------------------------------------

@router.get("/enrichment/status")
def enrichment_status(company_id: str = Query(...)):
    """Return enrichment coverage stats for all 5 entities."""
    try:
        from enrichment.engine import get_enrichment_coverage
        return get_enrichment_coverage(company_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ------------------------------------------------------------------
# Trigger enrichment
# ------------------------------------------------------------------

@router.post("/enrichment/run")
def enrichment_run(
    company_id: str = Query(...),
    force: bool = Query(False),
):
    """
    Trigger Phase A enrichment for a company.
    Fetches raw data from PostgreSQL raw.* tables, enriches all 5 entities,
    and writes to analytics.*_enrichment tables.
    """
    try:
        engine = get_engine_safe()
        raw_data: dict = {}

        entity_tables = {
            "people":       "people",
            "enterprises":  "enterprises",
            "products":     "products",
            "transactions": "transactions",
            "addresses":    "addresses",
        }

        if engine:
            for key, tbl in entity_tables.items():
                try:
                    df = pd.read_sql(
                        text("SELECT * FROM raw." + tbl + " WHERE company_id = :cid"),
                        engine,
                        params={"cid": company_id},
                    )
                    raw_data[key] = df
                except Exception:
                    raw_data[key] = pd.DataFrame()
        else:
            raw_data = {k: pd.DataFrame() for k in entity_tables}

        from enrichment.engine import run_enrichment
        summary = run_enrichment(raw_data, company_id, force=force)
        return {"company_id": company_id, "enrichment": summary}

    except Exception as exc:
        logger.exception("enrichment/run failed for company=%s", company_id)
        raise HTTPException(status_code=500, detail=str(exc))


# ------------------------------------------------------------------
# Per-entity read endpoints
# ------------------------------------------------------------------

@router.get("/enrichment/people")
def get_people_enrichment(company_id: str = Query(...)):
    return _read_enrichment_table("person_enrichment", company_id)


@router.get("/enrichment/enterprises")
def get_enterprise_enrichment(company_id: str = Query(...)):
    return _read_enrichment_table("enterprise_enrichment", company_id)


@router.get("/enrichment/products")
def get_product_enrichment(company_id: str = Query(...)):
    return _read_enrichment_table("product_enrichment", company_id)


@router.get("/enrichment/transactions")
def get_transaction_enrichment(company_id: str = Query(...)):
    return _read_enrichment_table("transaction_enrichment", company_id)


@router.get("/enrichment/addresses")
def get_address_enrichment(company_id: str = Query(...)):
    return _read_enrichment_table("address_enrichment", company_id)


# ------------------------------------------------------------------
# Open Data proxy endpoints (gateway — never call from frontend directly)
# ------------------------------------------------------------------

@router.get("/open-data/exchange-rates")
def get_exchange_rates(base: str = Query("USD")):
    """Return live FX rates. Cached 24h (in-process). Source: open.er-api.com"""
    try:
        from enrichment.exchange_rates import get_rates
        rates = get_rates(base=base.upper())
        return {"base": base.upper(), "rates": rates}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"FX rates unavailable: {exc}")


@router.get("/open-data/barcode/{ean}")
def get_barcode(ean: str):
    """Return barcode product data. Sources: Open Food Facts → UPC Item DB."""
    try:
        from enrichment.barcode import lookup_barcode
        return lookup_barcode(ean)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Barcode lookup failed: {exc}")


@router.get("/open-data/company-lookup")
def get_company_lookup(
    name: str = Query(..., description="Company name to search"),
    country: Optional[str] = Query(None, description="Two-letter country code (e.g. gb, us, ke)"),
):
    """Return company registration data. Source: OpenCorporates (free tier)."""
    try:
        from enrichment.company_lookup import lookup_company
        return lookup_company(name, country)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Company lookup failed: {exc}")


# ------------------------------------------------------------------
# Phase B — Domain-specific open-data proxy endpoints
# ------------------------------------------------------------------

@router.get("/open-data/medication/{name}")
def get_medication(name: str):
    """Drug data from NIH RxNorm: RxCUI, generic name, drug class, ingredients."""
    try:
        from enrichment.product_domain.medications import enrich_medication
        return enrich_medication(name, {})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"RxNorm lookup failed: {exc}")


@router.get("/open-data/food/{name}")
def get_food(name: str):
    """Food/nutrition data from USDA FoodData Central: calories, macros, food group."""
    try:
        from enrichment.product_domain.food import enrich_food
        return enrich_food(name, {})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"USDA FoodData lookup failed: {exc}")


@router.get("/open-data/vehicle/vin/{vin}")
def get_vehicle_vin(vin: str):
    """Decode a 17-character VIN via NHTSA vPIC: make, model, year, fuel type."""
    try:
        from enrichment.product_domain.vehicles import enrich_vehicle
        return enrich_vehicle(vin, {"vin": vin})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"NHTSA VIN decode failed: {exc}")


@router.get("/open-data/vehicle/recalls")
def get_vehicle_recalls(
    make: str = Query(...),
    model: str = Query(...),
):
    """NHTSA safety recall history for a make + model combination."""
    try:
        from enrichment.product_domain.vehicles import enrich_vehicle
        return enrich_vehicle(f"{make} {model}", {"make": make, "model": model})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"NHTSA recalls lookup failed: {exc}")


@router.get("/open-data/chemical/{name}")
def get_chemical(name: str):
    """Chemical compound data from PubChem: formula, molecular weight, GHS hazard."""
    try:
        from enrichment.product_domain.chemicals import enrich_chemical
        return enrich_chemical(name, {})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"PubChem lookup failed: {exc}")


@router.get("/open-data/medical-device/{name}")
def get_medical_device(name: str):
    """FDA device classification: device class (I/II/III), product code, specialty."""
    try:
        from enrichment.product_domain.devices import enrich_device
        return enrich_device(name, {})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"FDA openFDA lookup failed: {exc}")


@router.get("/open-data/software/{name}")
def get_software(name: str):
    """Software package data from npm registry and PyPI: version, license, description."""
    try:
        from enrichment.product_domain.software import enrich_software
        return enrich_software(name, {})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Package registry lookup failed: {exc}")


@router.get("/open-data/npi/organization")
def get_npi_organization(
    name: str = Query(...),
    state: Optional[str] = Query(None, description="US state code, e.g. NY, CA"),
):
    """NPPES NPI lookup for healthcare organisations: NPI number, taxonomy, license."""
    try:
        from enrichment.enterprise_domain.npi_lookup import lookup_npi_organization
        return lookup_npi_organization(name, state=state)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"NPI organisation lookup failed: {exc}")


@router.get("/open-data/npi/provider")
def get_npi_provider(
    name: str = Query(...),
    state: Optional[str] = Query(None, description="US state code, e.g. NY, CA"),
):
    """NPPES NPI lookup for individual healthcare providers: NPI number, taxonomy, license."""
    try:
        from enrichment.enterprise_domain.npi_lookup import lookup_npi_person
        return lookup_npi_person(name, state=state)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"NPI provider lookup failed: {exc}")


# ------------------------------------------------------------------
# Phase C — Compliance & Risk Intelligence proxy endpoints
# ------------------------------------------------------------------

@router.get("/open-data/sanctions/{name}")
def get_sanctions_screening(name: str):
    """
    Screen a person or entity name against the OFAC SDN (Specially Designated Nationals) list.
    Source: US Treasury — updated daily. Cached 24 h in-process. No API key required.
    Returns: sanctions_hit, sanctions_list, sanctions_score (0–1), pep_flag.
    """
    try:
        from enrichment.compliance.sanctions import screen_name
        return screen_name(name)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Sanctions screening failed: {exc}")


@router.get("/open-data/country-risk/{iso2}")
def get_country_risk(iso2: str):
    """
    Governance risk score for a 2-letter ISO country code.
    Source: World Bank Governance Indicators (WGI) — 6 dimensions averaged.
    Returns: country_risk_score (0–100, higher=safer), country_risk_label, country_governance_index.
    Cached 7 days per country.
    """
    try:
        from enrichment.compliance.country_risk import get_country_risk as _get
        result = _get(iso2)
        if not result:
            raise HTTPException(status_code=404, detail=f"No WGI data for country: {iso2}")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Country risk lookup failed: {exc}")


@router.get("/open-data/news/{entity}")
def get_news_mentions(entity: str):
    """
    News mention count and sentiment for an entity name (last 30 days).
    Source: GDELT Project DOC 2.0 API — global news corpus. No API key required.
    Returns: news_mention_count, news_sentiment (positive|neutral|negative), news_avg_tone.
    Cached 24 h per entity.
    """
    try:
        from enrichment.compliance.news_mentions import get_news_mentions as _get
        result = _get(entity)
        if not result:
            return {"news_mention_count": 0, "news_sentiment": "neutral", "news_avg_tone": 0.0}
        return result
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"News mentions lookup failed: {exc}")
