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
