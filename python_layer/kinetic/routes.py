"""
Kinetic Layer — Action execution audit log and object type registry.

Endpoints:
  POST /kinetic/log          — Log a completed action execution (write-back record)
  GET  /kinetic/log          — Fetch audit log for a company
  GET  /kinetic/action-types — List all registered action types for a company
  GET  /kinetic/objects      — Ontology object type registry with counts
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/kinetic", tags=["Kinetic Layer"])


# ── Pydantic models ────────────────────────────────────────────────────────────

class ActionLogEntry(BaseModel):
    company_id:   str
    action_id:    str
    action_name:  str
    executed_by:  Optional[str] = None
    params:       Optional[Dict[str, Any]] = None
    result:       Optional[Dict[str, Any]] = None
    executed_at:  Optional[str] = None


# ── Ontology object type definitions ──────────────────────────────────────────

ONTOLOGY_OBJECT_TYPES = [
    {
        "key": "Person",
        "label": "People",
        "description": "Any human in any role — staff, client, contact, or volunteer",
        "primary_field": "full_name",
        "type_field": "person_type",
        "type_values": ["staff", "client", "contact", "volunteer"],
        "analytics_table": "analytics.people_summary",
        "raw_table": "raw.people",
        "links_to": ["Enterprise", "Product", "Address", "Task", "Transaction"],
        "supports_actions": True,
    },
    {
        "key": "Enterprise",
        "label": "Enterprises",
        "description": "Any organisation, location, or operational unit",
        "primary_field": "enterprise_name",
        "type_field": "enterprise_type",
        "type_values": ["commercial", "nonprofit", "government", "household", "cooperative", "trust"],
        "analytics_table": "analytics.enterprise_summary",
        "raw_table": "raw.enterprises",
        "links_to": ["Person", "Product", "Address", "Task", "Transaction"],
        "supports_actions": True,
    },
    {
        "key": "Product",
        "label": "Products",
        "description": "Any item, service, resource, or deliverable",
        "primary_field": "name",
        "type_field": "item_type",
        "type_values": ["physical", "living", "digital", "service_package", "financial_instrument"],
        "analytics_table": "analytics.product_summary",
        "raw_table": "raw.products",
        "links_to": ["Enterprise", "Person", "Transaction"],
        "supports_actions": False,
    },
    {
        "key": "Task",
        "label": "Tasks",
        "description": "Any activity, visit, appointment, shift, or work order",
        "primary_field": "title",
        "type_field": "task_type",
        "type_values": [],
        "analytics_table": "analytics.task_summary",
        "raw_table": "raw.tasks",
        "links_to": ["Person", "Enterprise"],
        "supports_actions": True,
    },
    {
        "key": "Transaction",
        "label": "Transactions",
        "description": "Any financial record — invoice, payment, expense, payroll",
        "primary_field": "description",
        "type_field": "transaction_type",
        "type_values": ["invoice", "payment", "expense", "payroll", "credit_note", "purchase_order"],
        "analytics_table": "analytics.transaction_summary",
        "raw_table": "raw.transactions",
        "links_to": ["Enterprise", "Person", "Product"],
        "supports_actions": True,
    },
    {
        "key": "Relationship",
        "label": "Relationships",
        "description": "Links any two entities — the join backbone of the ontology",
        "primary_field": "relationship_type",
        "type_field": "relationship_type",
        "type_values": [
            "person_enterprise", "item_enterprise", "item_person",
            "person_service", "enterprise_service", "person_address",
            "enterprise_address", "person_person", "enterprise_enterprise",
        ],
        "analytics_table": "analytics.relationship_summary",
        "raw_table": "raw.relationships",
        "links_to": ["Person", "Enterprise", "Product", "Address"],
        "supports_actions": False,
    },
    {
        "key": "Address",
        "label": "Addresses",
        "description": "Any physical or postal location with optional geocoordinates",
        "primary_field": "label",
        "type_field": "label",
        "type_values": [],
        "analytics_table": "analytics.address_summary",
        "raw_table": "raw.addresses",
        "links_to": ["Person", "Enterprise"],
        "supports_actions": False,
    },
]


# ── Helper: persist to DB if available, else in-memory ────────────────────────

_IN_MEMORY_LOG: list[dict] = []  # fallback when no DB

def _store_log(entry: dict) -> None:
    """Persist action log to DB raw schema, fall back to in-memory list."""
    try:
        from database import get_engine_safe
        from sqlalchemy import text as sqlt
        engine = get_engine_safe()
        if not engine:
            raise RuntimeError("no engine")
        with engine.begin() as conn:
            conn.execute(sqlt("""
                CREATE TABLE IF NOT EXISTS raw.kinetic_log (
                    id          SERIAL PRIMARY KEY,
                    company_id  TEXT,
                    action_id   TEXT,
                    action_name TEXT,
                    executed_by TEXT,
                    params_json TEXT,
                    result_json TEXT,
                    executed_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.execute(sqlt("""
                INSERT INTO raw.kinetic_log
                    (company_id, action_id, action_name, executed_by, params_json, result_json, executed_at)
                VALUES
                    (:company_id, :action_id, :action_name, :executed_by, :params_json, :result_json, :executed_at)
            """), {
                "company_id":   entry.get("company_id", ""),
                "action_id":    entry.get("action_id", ""),
                "action_name":  entry.get("action_name", ""),
                "executed_by":  entry.get("executed_by", ""),
                "params_json":  json.dumps(entry.get("params") or {}),
                "result_json":  json.dumps(entry.get("result") or {}),
                "executed_at":  entry.get("executed_at") or datetime.utcnow().isoformat(),
            })
    except Exception as e:
        logger.warning("kinetic log DB write failed — using in-memory fallback: %s", e)
        _IN_MEMORY_LOG.append(entry)
        if len(_IN_MEMORY_LOG) > 500:
            _IN_MEMORY_LOG.pop(0)


def _read_log(company_id: str, limit: int) -> list[dict]:
    """Read action log from DB, fall back to in-memory."""
    try:
        from database import get_engine_safe
        from sqlalchemy import text as sqlt
        engine = get_engine_safe()
        if not engine:
            raise RuntimeError("no engine")
        with engine.connect() as conn:
            rows = conn.execute(sqlt("""
                SELECT action_id, action_name, executed_by, params_json, result_json, executed_at
                FROM raw.kinetic_log
                WHERE company_id = :cid
                ORDER BY executed_at DESC
                LIMIT :limit
            """), {"cid": company_id, "limit": limit}).fetchall()
        return [
            {
                "action_id":    r[0],
                "action_name":  r[1],
                "executed_by":  r[2],
                "params":       json.loads(r[3] or "{}"),
                "result":       json.loads(r[4] or "{}"),
                "executed_at":  str(r[5]),
            }
            for r in rows
        ]
    except Exception as e:
        logger.warning("kinetic log DB read failed — using in-memory fallback: %s", e)
        return [
            e for e in reversed(_IN_MEMORY_LOG)
            if e.get("company_id") == company_id
        ][:limit]


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/log")
def log_action(entry: ActionLogEntry):
    """
    Log a completed kinetic action execution.
    Called by the frontend after every successful write-back.
    """
    _store_log(entry.model_dump())
    return {"status": "logged", "action_id": entry.action_id, "executed_at": entry.executed_at}


@router.get("/log")
def get_log(
    company_id: str = Query(..., description="Tenant company_id"),
    limit:      int = Query(20, le=100),
):
    """Return the kinetic action audit log for a company."""
    logs = _read_log(company_id, limit)
    return {"company_id": company_id, "count": len(logs), "logs": logs}


@router.get("/objects")
def get_object_types(
    company_id: Optional[str] = Query(None),
):
    """
    Return the full ontology object type registry.
    Optionally enriched with live counts from the raw schema.
    """
    types = list(ONTOLOGY_OBJECT_TYPES)

    if company_id:
        # Enrich with raw counts if DB is available
        try:
            from database import get_engine_safe
            from sqlalchemy import text as sqlt
            engine = get_engine_safe()
            if engine:
                raw_map = {
                    "Person":       "people",
                    "Enterprise":   "enterprises",
                    "Product":      "products",
                    "Task":         "tasks",
                    "Transaction":  "transactions",
                    "Relationship": "relationships",
                    "Address":      "addresses",
                }
                with engine.connect() as conn:
                    for t in types:
                        table = raw_map.get(t["key"])
                        if table:
                            try:
                                row = conn.execute(sqlt(
                                    f"SELECT COUNT(*) FROM raw.{table} WHERE company_id = :cid"
                                ), {"cid": company_id}).fetchone()
                                t["record_count"] = int(row[0]) if row else 0
                            except Exception:
                                t["record_count"] = None
        except Exception as e:
            logger.warning("kinetic objects count failed: %s", e)

    return {
        "ontology_version": "1.0",
        "object_types": types,
        "total_types": len(types),
        "link_count": sum(len(t["links_to"]) for t in types),
    }


@router.get("/action-types")
def get_action_types(company_id: Optional[str] = Query(None)):
    """
    Return the catalogue of registered action types.
    System actions are universal. Custom actions are per-company (future).
    """
    system_actions = [
        {"id": "enroll_client",  "name": "Enroll Client",   "category": "People",     "writes_to": ["Person", "Relationship"], "requires_approval": False},
        {"id": "assign_task",    "name": "Assign Task",     "category": "Operations", "writes_to": ["Task"],                  "requires_approval": False},
        {"id": "create_invoice", "name": "Create Invoice",  "category": "Finance",    "writes_to": ["Transaction"],           "requires_approval": True},
        {"id": "onboard_staff",  "name": "Onboard Staff",   "category": "People",     "writes_to": ["Person", "Relationship"],"requires_approval": True},
        {"id": "open_branch",    "name": "Open Branch",     "category": "Enterprise", "writes_to": ["Enterprise", "Relationship"], "requires_approval": True},
    ]
    return {
        "company_id": company_id,
        "system_actions": system_actions,
        "total": len(system_actions),
    }
