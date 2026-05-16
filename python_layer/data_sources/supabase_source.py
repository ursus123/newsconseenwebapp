"""
Supabase source of record for Newsconseen backend services.

All Python-side operational reads and writes should go through this adapter
instead of Base44 URLs. Base44 can remain only as an explicit legacy migration
source.
"""

import json
import logging
from typing import Optional

import pandas as pd
import requests

from config.settings import settings

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 30
PAGE_SIZE = 1000

ENTITY_TABLES = {
    "person": "persons",
    "people": "persons",
    "persons": "persons",
    "enterprise": "enterprises",
    "enterprises": "enterprises",
    "product": "products",
    "products": "products",
    "task": "tasks",
    "tasks": "tasks",
    "transaction": "transactions",
    "transactions": "transactions",
    "relationship": "relationships",
    "relationships": "relationships",
    "address": "addresses",
    "addresses": "addresses",
    "service": "services",
    "services": "services",
    "document": "documents",
    "documents": "documents",
    "schedule": "schedules",
    "schedules": "schedules",
    "signal": "signals",
    "signals": "signals",
    "channel": "channels",
    "channels": "channels",
    "territory": "territories",
    "territories": "territories",
    "animal": "animals",
    "animals": "animals",
    "plot": "plots",
    "plots": "plots",
    "observation": "observations",
    "observations": "observations",
    "insight": "insights",
    "insights": "insights",
    "recommendation": "recommendations",
    "recommendations": "recommendations",
    "decision": "decisions",
    "decisions": "decisions",
    "risk": "risks",
    "risks": "risks",
    "opportunity": "opportunities",
    "opportunities": "opportunities",
}

BASE44_TO_SUPABASE_COLUMNS = {
    "persons": {
        "created_at": "created_date",
        "updated_at": "updated_date",
        "preferred_name": "display_name",
        "notes": "internal_notes",
    },
    "enterprises": {
        "created_at": "created_date",
        "updated_at": "updated_date",
        "enterprise_name": "name",
        "parent_enterprise_id": "parent_id",
        "notes": "internal_notes",
    },
    "products": {
        "created_at": "created_date",
        "updated_at": "updated_date",
        "product_name": "name",
        "description": "internal_notes",
    },
    "tasks": {
        "created_at": "created_date",
        "updated_at": "updated_date",
        "completed_at": "completed_date",
        "assigned_to_name": "assignee_name",
        "assigned_to_email": "assigned_to",
        "notes": "internal_notes",
    },
    "transactions": {
        "created_at": "created_date",
        "updated_at": "updated_date",
        "date": "transaction_date",
        "person_name": "primary_person",
        "notes": "internal_notes",
    },
    "relationships": {
        "created_at": "created_date",
        "updated_at": "updated_date",
        "notes": "internal_notes",
    },
    "addresses": {
        "created_at": "created_date",
        "updated_at": "updated_date",
        "region": "state_region",
        "notes": "internal_notes",
    },
}

SUPABASE_WRITE_ALIASES = {
    "persons": {"display_name": "preferred_name", "internal_notes": "notes"},
    "enterprises": {"name": "enterprise_name", "parent_id": "parent_enterprise_id", "internal_notes": "notes"},
    "products": {"name": "product_name", "internal_notes": "description"},
    "tasks": {
        "created_date": "created_at",
        "scheduled_date": "due_date",
        "completed_date": "completed_at",
        "assignee_name": "assigned_to_name",
        "assigned_to": "assigned_to_email",
        "internal_notes": "notes",
    },
    "transactions": {"transaction_date": "date", "primary_person": "person_name", "internal_notes": "notes"},
    "relationships": {"internal_notes": "notes"},
    "addresses": {"state_region": "region", "internal_notes": "notes"},
}


def configured() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_role_key)


def table_for(entity: str) -> str:
    return ENTITY_TABLES.get((entity or "").lower(), (entity or "").lower())


def _headers(prefer: str = "return=representation") -> dict:
    key = settings.supabase_service_role_key or ""
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def _url(table: str) -> str:
    return f"{settings.supabase_url.rstrip().rstrip('/')}/rest/v1/{table}"


def _normalise_row(table: str, row: dict) -> dict:
    out = dict(row or {})
    for src, dest in BASE44_TO_SUPABASE_COLUMNS.get(table, {}).items():
        if src in out and dest not in out:
            out[dest] = out[src]
    if table == "persons" and "full_name" not in out:
        full = " ".join(str(out.get(k) or "").strip() for k in ("first_name", "last_name")).strip()
        if full:
            out["full_name"] = full
    if table == "enterprises" and "enterprise_name" not in out and out.get("name"):
        out["enterprise_name"] = out["name"]
    return out


def _normalise_payload(table: str, payload: dict) -> dict:
    out = dict(payload or {})
    for src, dest in SUPABASE_WRITE_ALIASES.get(table, {}).items():
        if src in out and dest not in out:
            out[dest] = out.pop(src)
    out.pop("created_date", None)
    out.pop("updated_date", None)
    return out


def list_records(entity: str, company_id: Optional[str] = None, limit: int = 5000) -> list[dict]:
    if not configured():
        logger.warning("Supabase source is not configured")
        return []
    table = table_for(entity)
    rows = []
    offset = 0
    while offset < limit:
        page_size = min(PAGE_SIZE, limit - offset)
        params = {
            "select": "*",
            "limit": page_size,
            "offset": offset,
        }
        if company_id:
            params["company_id"] = f"eq.{company_id}"
        resp = requests.get(_url(table), headers=_headers(), params=params, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        page = resp.json()
        if not isinstance(page, list) or not page:
            break
        rows.extend(_normalise_row(table, r) for r in page)
        if len(page) < page_size:
            break
        offset += page_size
    return rows


def fetch_entity_df(entity: str, company_id: Optional[str] = None, limit: int = 5000) -> pd.DataFrame:
    rows = list_records(entity, company_id=company_id, limit=limit)
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    logger.info("supabase_source: fetched %d %s rows", len(df), entity)
    return df


def create_record(entity: str, payload: dict, company_id: Optional[str] = None) -> dict:
    if not configured():
        return {"error": "Supabase is not configured"}
    table = table_for(entity)
    data = _normalise_payload(table, payload)
    if company_id and not data.get("company_id"):
        data["company_id"] = company_id
    data.pop("id", None)
    resp = requests.post(_url(table), headers=_headers(), data=json.dumps(data, default=str), timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    result = resp.json()
    row = result[0] if isinstance(result, list) and result else {}
    return _normalise_row(table, row)


def update_record(entity: str, record_id: str, payload: dict) -> dict:
    if not configured():
        return {"error": "Supabase is not configured"}
    table = table_for(entity)
    data = _normalise_payload(table, payload)
    resp = requests.patch(
        _url(table),
        headers=_headers(),
        params={"id": f"eq.{record_id}"},
        data=json.dumps(data, default=str),
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    result = resp.json()
    row = result[0] if isinstance(result, list) and result else {}
    return _normalise_row(table, row)


def delete_record(entity: str, record_id: str) -> dict:
    if not configured():
        return {"error": "Supabase is not configured"}
    table = table_for(entity)
    resp = requests.delete(_url(table), headers=_headers("return=minimal"), params={"id": f"eq.{record_id}"}, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    return {"id": record_id, "deleted": True}
