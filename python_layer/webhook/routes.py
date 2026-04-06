"""
Webhook routes — event-driven ETL triggers.

POST /webhook/taxonomy
    Called by the frontend immediately after a MasterDataOption
    (taxonomy value) is created or updated.  Runs ETL for the
    affected entity so analytics tables are up-to-date before
    the user navigates to analytics or copilot.

GET  /webhook/etl-status
    Returns the last known ETL run status per entity.
    Frontend polls this to clear "pending sync" badges.
    State is in-memory — resets on server restart.

Entity-type mapping:
    Base44 entity_type → ETL module → analytics table

    person       → people       → analytics.people_summary
    enterprise   → enterprise   → analytics.enterprise_summary
    item         → product      → analytics.product_summary
    task         → task         → analytics.task_summary
    transaction  → transaction  → analytics.transaction_summary
    address      → address      → analytics.address_summary
    relationship → relationship → analytics.relationship_summary
    service      → service      → analytics.service_summary
"""

import logging
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# ETL modules
from etl import (
    addresses,
    enterprises,
    people,
    products,
    relationships,
    services,
    tasks,
    transactions,
)
from etl.load import load_dataframe

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook", tags=["Webhook"])

# ── Entity map ────────────────────────────────────────────────────────────────
# Maps Base44 entity_type → (extract_fn, transform_fn, analytics_table_name)
_ENTITY_MAP = {
    "person":       (people.extract_people,                 people.transform_people,                "people_summary"),
    "enterprise":   (enterprises.extract_enterprises,       enterprises.transform_enterprises,      "enterprise_summary"),
    "item":         (products.extract_products,             products.transform_products,            "product_summary"),
    "task":         (tasks.extract_tasks,                   tasks.transform_tasks,                  "task_summary"),
    "transaction":  (transactions.extract_transactions,     transactions.transform_transactions,    "transaction_summary"),
    "address":      (addresses.extract_addresses,           addresses.transform_addresses,          "address_summary"),
    "relationship": (relationships.extract_relationships,   relationships.transform_relationships,  "relationship_summary"),
    "service":      (services.extract_services,             services.transform_services,            "service_summary"),
}

# ── In-memory ETL status ──────────────────────────────────────────────────────
# Persists within a server session. Resets on restart.
# Structure: { entity_type: { status, last_triggered, last_completed, rows_loaded, error } }
_etl_status: dict = {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _filter_by_company(df: pd.DataFrame, company_id: Optional[str]) -> pd.DataFrame:
    if not company_id or "company_id" not in df.columns:
        return df
    return df[df["company_id"] == company_id].copy()


# ── Schemas ───────────────────────────────────────────────────────────────────

class TaxonomyWebhookPayload(BaseModel):
    entity_type: str                    # "person" | "enterprise" | "item" | "task" …
    field_name:  Optional[str] = None  # e.g. "person_subtype", "enterprise_subtype"
    value:       Optional[str] = None  # the new taxonomy value that was added
    company_id:  Optional[str] = None  # scope ETL to this tenant if provided


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/taxonomy")
def taxonomy_webhook(payload: TaxonomyWebhookPayload):
    """
    Trigger ETL immediately after a taxonomy (MasterDataOption) change.

    Called fire-and-forget from the frontend after addCustomOption() runs.
    Returns synchronously — ETL completes before the response is sent,
    so the frontend can clear the "pending sync" badge as soon as it
    receives a 200.

    Example payload:
        { "entity_type": "person", "field_name": "person_subtype",
          "value": "Custom Nurse Specialist", "company_id": "abc123" }
    """
    entity_type = payload.entity_type.lower().strip()

    mapping = _ENTITY_MAP.get(entity_type)
    if not mapping:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Unknown entity_type '{entity_type}'. "
                f"Valid values: {sorted(_ENTITY_MAP.keys())}"
            ),
        )

    extract_fn, transform_fn, table_name = mapping
    triggered_at = datetime.now(timezone.utc)

    # Mark as running
    _etl_status[entity_type] = {
        "status":          "running",
        "entity_type":     entity_type,
        "last_triggered":  triggered_at.isoformat(),
        "last_completed":  _etl_status.get(entity_type, {}).get("last_completed"),
        "rows_loaded":     None,
        "error":           None,
    }

    try:
        df      = extract_fn()
        df      = _filter_by_company(df, payload.company_id)
        summary = transform_fn(df)
        result  = load_dataframe(summary, table_name, company_id=payload.company_id)

        completed_at = datetime.now(timezone.utc)
        rows_loaded  = result.get("rows_loaded", 0)

        _etl_status[entity_type] = {
            "status":          "completed",
            "entity_type":     entity_type,
            "last_triggered":  triggered_at.isoformat(),
            "last_completed":  completed_at.isoformat(),
            "rows_loaded":     rows_loaded,
            "error":           None,
        }

        logger.info(
            "webhook/taxonomy: ETL completed for '%s' "
            "(field=%s value=%s company=%s rows=%d)",
            entity_type,
            payload.field_name,
            payload.value,
            payload.company_id,
            rows_loaded,
        )

        return {
            "status":       "completed",
            "entity_type":  entity_type,
            "table":        table_name,
            "triggered_by": {
                "field_name": payload.field_name,
                "value":      payload.value,
            },
            "triggered_at":  triggered_at.isoformat(),
            "completed_at":  completed_at.isoformat(),
            "rows_loaded":   rows_loaded,
        }

    except Exception as exc:
        _etl_status[entity_type] = {
            "status":         "error",
            "entity_type":    entity_type,
            "last_triggered": triggered_at.isoformat(),
            "last_completed": None,
            "rows_loaded":    None,
            "error":          str(exc),
        }
        logger.error("webhook/taxonomy: ETL failed for '%s' — %s", entity_type, exc)
        raise HTTPException(
            status_code=500,
            detail=f"ETL failed for '{entity_type}': {exc}",
        )


@router.get("/etl-status")
def etl_status():
    """
    Returns the last known ETL status for each entity, keyed by entity_type.

    Frontend uses this to:
      - Show a "pending sync" badge while status == "running"
      - Clear the badge when status == "completed"
      - Show an error badge when status == "error"

    Note: state is in-memory and resets on server restart.
    Use GET /health for persistent database connectivity status.
    """
    return {
        "entities":    _etl_status,
        "entity_types": sorted(_ENTITY_MAP.keys()),
        "note": (
            "In-memory only — resets on restart. "
            "Trigger ETL via POST /webhook/taxonomy or POST /cron/etl-all."
        ),
    }
