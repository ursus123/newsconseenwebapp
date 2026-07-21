"""
Supabase source of record for Newsconseen backend services.

All Python-side operational reads and writes should go through this adapter
instead of Base44 URLs. Base44 can remain only as an explicit legacy migration
source.
"""

import json
import logging
import time
from typing import Optional

import pandas as pd
import requests

from config.settings import settings

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 30
PAGE_SIZE = 1000
MAX_RETRIES = 3
RETRY_STATUSES = {408, 409, 425, 429, 500, 502, 503, 504}


class SupabaseSourceError(RuntimeError):
    """Raised when the Supabase system-of-record adapter cannot complete a request."""

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
    "user_profiles": "user_profiles",
    "user": "user_profiles",
    "users": "user_profiles",
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
    "services": {"created_at": "created_date", "updated_at": "updated_date", "notes": "internal_notes"},
    "documents": {"created_at": "created_date", "updated_at": "updated_date", "notes": "internal_notes"},
    "schedules": {"created_at": "created_date", "updated_at": "updated_date", "notes": "internal_notes"},
    "signals": {"created_at": "created_date", "updated_at": "updated_date", "notes": "internal_notes"},
    "channels": {"created_at": "created_date", "updated_at": "updated_date", "notes": "internal_notes"},
    "territories": {"created_at": "created_date", "updated_at": "updated_date", "notes": "internal_notes"},
    "animals": {"created_at": "created_date", "updated_at": "updated_date", "notes": "internal_notes"},
    "plots": {"created_at": "created_date", "updated_at": "updated_date", "notes": "internal_notes"},
    "observations": {"created_at": "created_date", "updated_at": "updated_date", "notes": "internal_notes"},
    "insights": {"created_at": "created_date", "updated_at": "updated_date", "notes": "internal_notes"},
    "recommendations": {"created_at": "created_date", "updated_at": "updated_date", "notes": "internal_notes"},
    "decisions": {"created_at": "created_date", "updated_at": "updated_date", "notes": "internal_notes"},
    "risks": {"created_at": "created_date", "updated_at": "updated_date", "notes": "internal_notes"},
    "opportunities": {"created_at": "created_date", "updated_at": "updated_date", "notes": "internal_notes"},
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
    "services": {"created_date": "created_at", "updated_date": "updated_at", "internal_notes": "notes"},
    "documents": {"created_date": "created_at", "updated_date": "updated_at", "internal_notes": "notes"},
    "schedules": {"created_date": "created_at", "updated_date": "updated_at", "internal_notes": "notes"},
    "signals": {"created_date": "created_at", "updated_date": "updated_at", "internal_notes": "notes"},
    "channels": {"created_date": "created_at", "updated_date": "updated_at", "internal_notes": "notes"},
    "territories": {"created_date": "created_at", "updated_date": "updated_at", "internal_notes": "notes"},
    "animals": {"created_date": "created_at", "updated_date": "updated_at", "internal_notes": "notes"},
    "plots": {"created_date": "created_at", "updated_date": "updated_at", "internal_notes": "notes"},
    "observations": {"created_date": "created_at", "updated_date": "updated_at", "internal_notes": "notes"},
    "insights": {"created_date": "created_at", "updated_date": "updated_at", "internal_notes": "notes"},
    "recommendations": {"created_date": "created_at", "updated_date": "updated_at", "internal_notes": "notes"},
    "decisions": {"created_date": "created_at", "updated_date": "updated_at", "internal_notes": "notes"},
    "risks": {"created_date": "created_at", "updated_date": "updated_at", "internal_notes": "notes"},
    "opportunities": {"created_date": "created_at", "updated_date": "updated_at", "internal_notes": "notes"},
}


def configured() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_role_key)


def require_configured() -> None:
    if not configured():
        logger.error("Supabase source is not configured")
        raise SupabaseSourceError(
            "Supabase source is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
        )


def health_probe(timeout: float = 5.0) -> dict:
    """Cheap, read-only connectivity probe for the canonical operational store."""
    if not configured():
        return {"status": "unavailable", "configured": False, "error": "not configured"}
    started = time.monotonic()
    try:
        response = requests.get(
            _url("enterprises"),
            headers=_headers(),
            params={"select": "id", "limit": 1},
            timeout=timeout,
        )
        response.raise_for_status()
        return {
            "status": "connected",
            "configured": True,
            "latency_ms": round((time.monotonic() - started) * 1000, 1),
        }
    except requests.RequestException as exc:
        return {
            "status": "error",
            "configured": True,
            "latency_ms": round((time.monotonic() - started) * 1000, 1),
            "error": str(exc)[:160],
        }


def count_records(entity: str, company_id: str) -> int:
    """Return an exact tenant-scoped count without downloading entity rows."""
    response = _request(
        "GET",
        table_for(entity),
        headers=_headers("count=exact"),
        params={"select": "id", "company_id": f"eq.{company_id}", "limit": 1},
    )
    content_range = response.headers.get("Content-Range", "")
    if "/" in content_range:
        total = content_range.rsplit("/", 1)[-1]
        if total.isdigit():
            return int(total)
    rows = response.json()
    return len(rows) if isinstance(rows, list) else 0


def audit_company_id_assignments(entities: list[str], company_id: str, limit: int = 10000) -> dict:
    """Audit tenant-id hygiene without returning other tenants' identifiers."""
    requested = str(company_id or "")
    normalized_requested = requested.strip().lower()
    tables = {}
    for entity in entities:
        table = table_for(entity)
        response = _request(
            "GET",
            table,
            headers=_headers(),
            params={"select": "company_id", "limit": limit},
        )
        rows = response.json() if response.content else []
        exact = unassigned = normalized_variants = other_tenants = 0
        for row in rows if isinstance(rows, list) else []:
            value = row.get("company_id") if isinstance(row, dict) else None
            if value is None or not str(value).strip():
                unassigned += 1
            elif str(value) == requested:
                exact += 1
            elif str(value).strip().lower() == normalized_requested:
                normalized_variants += 1
            else:
                other_tenants += 1
        tables[table] = {
            "requested_tenant_records": exact,
            "unassigned_records": unassigned,
            "tenant_id_format_variants": normalized_variants,
            "other_tenant_records": other_tenants,
            "sample_complete": len(rows) < limit,
        }
    return {
        "tables": tables,
        "tenant_ids_normalized": all(
            item["unassigned_records"] == 0 and item["tenant_id_format_variants"] == 0
            for item in tables.values()
        ),
    }


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


def _request(method: str, table: str, **kwargs) -> requests.Response:
    require_configured()
    url = _url(table)
    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.request(method, url, timeout=REQUEST_TIMEOUT, **kwargs)
            if resp.status_code in RETRY_STATUSES and attempt < MAX_RETRIES:
                delay = 0.5 * (2 ** (attempt - 1))
                logger.warning(
                    "supabase_source: %s %s returned HTTP %s on attempt %d/%d; retrying in %.1fs",
                    method.upper(), table, resp.status_code, attempt, MAX_RETRIES, delay,
                )
                time.sleep(delay)
                continue
            resp.raise_for_status()
            return resp
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_error = exc
            if attempt < MAX_RETRIES:
                delay = 0.5 * (2 ** (attempt - 1))
                logger.warning(
                    "supabase_source: %s %s failed on attempt %d/%d: %s; retrying in %.1fs",
                    method.upper(), table, attempt, MAX_RETRIES, exc, delay,
                )
                time.sleep(delay)
                continue
            break
        except requests.HTTPError as exc:
            last_error = exc
            break
        except requests.RequestException as exc:
            last_error = exc
            break
    logger.error("supabase_source: %s %s failed after %d attempts: %s", method.upper(), table, MAX_RETRIES, last_error)
    raise SupabaseSourceError(str(last_error))


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


def list_records(
    entity: str,
    company_id: Optional[str] = None,
    created_by: Optional[str] = None,
    limit: int = 5000,
    fields: Optional[tuple[str, ...] | list[str]] = None,
) -> list[dict]:
    table = table_for(entity)
    rows = []
    offset = 0
    while offset < limit:
        page_size = min(PAGE_SIZE, limit - offset)
        params = {
            "select": ",".join(fields) if fields else "*",
            "limit": page_size,
            "offset": offset,
        }
        if company_id:
            params["company_id"] = f"eq.{company_id}"
        if created_by:
            params["created_by"] = f"eq.{created_by}"
        resp = _request("GET", table, headers=_headers(), params=params)
        page = resp.json()
        if not isinstance(page, list) or not page:
            break
        rows.extend(_normalise_row(table, r) for r in page)
        if len(page) < page_size:
            break
        offset += page_size
    return rows


def fetch_entity_df(entity: str, company_id: Optional[str] = None, limit: int = 5000) -> pd.DataFrame:
    require_configured()
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
    resp = _request("POST", table, headers=_headers(), data=json.dumps(data, default=str))
    result = resp.json()
    row = result[0] if isinstance(result, list) and result else {}
    return _normalise_row(table, row)


def get_record(entity: str, record_id: str, company_id: str, fields=None) -> dict | None:
    """Read one canonical record with both record and tenant filters enforced."""
    table = table_for(entity)
    resp = _request(
        "GET", table, headers=_headers(),
        params={
            "select": ",".join(fields) if fields else "*",
            "id": f"eq.{record_id}", "company_id": f"eq.{company_id}", "limit": 1,
        },
    )
    rows = resp.json()
    if not isinstance(rows, list) or not rows:
        return None
    return _normalise_row(table, rows[0])


def update_record(entity: str, record_id: str, payload: dict) -> dict:
    if not configured():
        return {"error": "Supabase is not configured"}
    table = table_for(entity)
    data = _normalise_payload(table, payload)
    resp = _request(
        "PATCH",
        table,
        headers=_headers(),
        params={"id": f"eq.{record_id}"},
        data=json.dumps(data, default=str),
    )
    result = resp.json()
    row = result[0] if isinstance(result, list) and result else {}
    return _normalise_row(table, row)


def delete_record(entity: str, record_id: str) -> dict:
    if not configured():
        return {"error": "Supabase is not configured"}
    table = table_for(entity)
    _request("DELETE", table, headers=_headers("return=minimal"), params={"id": f"eq.{record_id}"})
    return {"id": record_id, "deleted": True}


def sample_columns(entity: str) -> list[str]:
    """Return column names visible from a limit=1 Supabase REST read."""
    table = table_for(entity)
    resp = _request("GET", table, headers=_headers(), params={"select": "*", "limit": 1})
    rows = resp.json()
    if not isinstance(rows, list) or not rows:
        return []
    return sorted(rows[0].keys())
