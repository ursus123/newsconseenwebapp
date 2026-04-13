"""
python_layer/ingest/routes.py  — Phase 12: Live Data Feeds
===========================================================
Inbound webhook receiver. Any external system (POS, LIMS, mobile app,
ERP) can push data into Newsconseen in real-time by POSTing JSON to
a per-company, per-source endpoint generated here.

Endpoints:
    POST   /ingest/register             — create / update a webhook config
    GET    /ingest/list                 — list webhooks for a company
    DELETE /ingest/config/{webhook_id}  — remove a webhook
    POST   /ingest/receive/{company_id}/{source_slug}  — receive data
    GET    /ingest/events               — recent ingest event log

Security:
    Each webhook has a 32-char hex secret generated at registration time.
    The caller must pass it as the X-Webhook-Secret header or ?secret= query param.

Flow:
    Payload arrives → validate secret → map fields → POST to Base44 →
    trigger ETL (fire-and-forget) → log event → return summary.
"""

import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import unquote

import requests
from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel

from config.settings import settings, HEADERS as BASE44_HEADERS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ingest", tags=["Inbound Webhooks"])

RAILWAY_BASE = "https://newsconseenwebapp-production.up.railway.app"

# ── In-memory stores (reset on Railway restart — acceptable for v1) ──────────
_CONFIGS: Dict[str, dict] = {}          # keyed by webhook_id
_EVENTS:  List[dict]      = []          # last N events across all companies
_EVENTS_MAX               = 500


# ── Entity routing table ──────────────────────────────────────────────────────
ENTITY_CONFIG: Dict[str, dict] = {
    "people": {
        "url_attr": "base44_people_url",
        "etl_name": "people",
    },
    "enterprises": {
        "url_attr": "base44_enterprises_url",
        "etl_name": "enterprise",
    },
    "products": {
        "url_attr": "base44_products_url",
        "etl_name": "product",
    },
    "tasks": {
        "url_attr": "base44_tasks_url",
        "etl_name": "task",
    },
    "transactions": {
        "url_attr": "base44_transactions_url",
        "etl_name": "transaction",
    },
}

# ── Auto-mapping heuristics ───────────────────────────────────────────────────
# External field name (lower-snake) → Base44 field name, per entity type.
# Applied AFTER explicit field_mappings from config.
AUTO_MAP: Dict[str, Dict[str, str]] = {
    "people": {
        "name":           "full_name",
        "full_name":      "full_name",
        "first_name":     "first_name",
        "firstname":      "first_name",
        "last_name":      "last_name",
        "lastname":       "last_name",
        "email":          "email",
        "email_address":  "email",
        "phone":          "phone",
        "phone_number":   "phone",
        "mobile":         "phone",
        "type":           "person_type",
        "role":           "person_type",
        "category":       "person_type",
        "status":         "status",
        "dob":            "date_of_birth",
        "date_of_birth":  "date_of_birth",
        "gender":         "gender",
        "notes":          "notes",
    },
    "enterprises": {
        "name":              "enterprise_name",
        "org_name":          "enterprise_name",
        "company_name":      "enterprise_name",
        "business_name":     "enterprise_name",
        "organisation_name": "enterprise_name",
        "type":              "enterprise_type",
        "org_type":          "enterprise_type",
        "status":            "status",
        "email":             "email",
        "phone":             "phone",
        "website":           "website",
        "description":       "description",
    },
    "products": {
        "name":          "name",
        "product_name":  "name",
        "item_name":     "name",
        "item":          "name",
        "description":   "description",
        "type":          "item_type",
        "category":      "item_type",
        "price":         "unit_price",
        "unit_price":    "unit_price",
        "cost":          "unit_price",
        "stock":         "current_stock",
        "quantity":      "current_stock",
        "qty":           "current_stock",
        "inventory":     "current_stock",
        "status":        "status",
        "sku":           "sku",
        "barcode":       "barcode",
        "expiry":        "expiry_date",
        "expiry_date":   "expiry_date",
    },
    "tasks": {
        "title":        "title",
        "name":         "title",
        "task":         "title",
        "subject":      "title",
        "description":  "description",
        "notes":        "notes",
        "type":         "task_type",
        "category":     "task_type",
        "status":       "status",
        "due":          "due_date",
        "due_date":     "due_date",
        "deadline":     "due_date",
        "assigned_to":  "assigned_to_name",
        "assignee":     "assigned_to_name",
        "priority":     "priority",
    },
    "transactions": {
        "amount":              "amount",
        "total":               "amount",
        "value":               "amount",
        "price":               "amount",
        "sum":                 "amount",
        "type":                "transaction_type",
        "category":            "transaction_type",
        "status":              "status",
        "date":                "transaction_date",
        "transaction_date":    "transaction_date",
        "invoice_date":        "transaction_date",
        "reference":           "reference_number",
        "ref":                 "reference_number",
        "invoice_number":      "reference_number",
        "receipt_number":      "reference_number",
        "description":         "description",
        "notes":               "notes",
        "currency":            "currency",
    },
}

# Fields we never pass through to Base44 to avoid schema errors
_SKIP_FIELDS = frozenset({"id", "_id", "created_at", "updated_at", "__v"})


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug(name: str) -> str:
    return name.lower().strip().replace(" ", "_").replace("-", "_")


def _webhook_id(company_id: str, source_name: str) -> str:
    return f"{company_id}:{_slug(source_name)}"


def _ingest_url(company_id: str, source_name: str) -> str:
    return f"{RAILWAY_BASE}/ingest/receive/{company_id}/{_slug(source_name)}"


def _apply_mappings(
    raw: dict,
    entity_type: str,
    explicit: dict,
) -> dict:
    """
    Map an incoming payload dict to Base44 field names.

    Priority:
      1. Explicit field_mappings stored in config  (override everything)
      2. Auto-map heuristics (lower-cased key matching)
      3. Skip unknown / internal fields

    company_id is injected by the caller — not here.
    """
    result = {}
    auto = AUTO_MAP.get(entity_type, {})

    for raw_key, val in raw.items():
        if raw_key in _SKIP_FIELDS:
            continue
        # Normalise key for matching
        norm = raw_key.lower().replace("-", "_").replace(" ", "_")

        if raw_key in explicit:
            # Explicit mapping — use as-is
            dst = explicit[raw_key]
            if dst:
                result[dst] = val
        elif norm in explicit:
            dst = explicit[norm]
            if dst:
                result[dst] = val
        elif norm in auto:
            # Auto mapping — only if destination not already set
            dst = auto[norm]
            if dst not in result:
                result[dst] = val
        # else: skip unknown fields

    return result


def _post_to_base44(url: str, record: dict) -> str:
    """POST a single record to Base44. Returns 'created' or 'error'."""
    try:
        resp = requests.post(url, json=record, headers=BASE44_HEADERS, timeout=20)
        resp.raise_for_status()
        return "created"
    except Exception as exc:
        logger.warning("ingest: Base44 write failed — %s", exc)
        return "error"


def _fire_etl(etl_name: str) -> None:
    """Trigger ETL for an entity — fire and forget, never blocks."""
    try:
        requests.post(
            f"{RAILWAY_BASE}/load/{etl_name}-summary",
            timeout=3,
        )
    except Exception:
        pass


def _log_event(event: dict) -> None:
    global _EVENTS
    _EVENTS.append(event)
    if len(_EVENTS) > _EVENTS_MAX:
        _EVENTS = _EVENTS[-_EVENTS_MAX:]


# ── Request / response schemas ────────────────────────────────────────────────

class RegisterBody(BaseModel):
    company_id:     str
    source_name:    str                          # human-friendly, e.g. "Square POS"
    entity_type:    str                          # people / enterprises / products / tasks / transactions
    description:    Optional[str] = None
    field_mappings: Optional[Dict[str, str]] = None   # external_field → base44_field


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", summary="Create or update a webhook config")
def register_webhook(body: RegisterBody):
    """
    Register an inbound webhook endpoint for a company + source.
    Returns the ingest URL and a secret the caller must include in every request.
    """
    if body.entity_type not in ENTITY_CONFIG:
        raise HTTPException(
            422,
            f"Unknown entity_type '{body.entity_type}'. "
            f"Choose from: {sorted(ENTITY_CONFIG)}",
        )

    wid      = _webhook_id(body.company_id, body.source_name)
    existing = _CONFIGS.get(wid)
    secret   = existing["secret"] if existing else secrets.token_hex(16)

    config = {
        "webhook_id":       wid,
        "company_id":       body.company_id,
        "source_name":      body.source_name,
        "source_slug":      _slug(body.source_name),
        "entity_type":      body.entity_type,
        "description":      body.description or "",
        "field_mappings":   body.field_mappings or {},
        "secret":           secret,
        "ingest_url":       _ingest_url(body.company_id, body.source_name),
        "created_at":       existing["created_at"] if existing else _now_iso(),
        "last_received_at": existing.get("last_received_at") if existing else None,
        "received_count":   existing.get("received_count", 0) if existing else 0,
    }
    _CONFIGS[wid] = config
    logger.info("ingest: registered %s → %s", wid, body.entity_type)

    return {
        "webhook_id":  wid,
        "ingest_url":  config["ingest_url"],
        "secret":      secret,
        "entity_type": body.entity_type,
        "source_name": body.source_name,
        "created_at":  config["created_at"],
    }


@router.get("/list", summary="List webhook configs for a company")
def list_webhooks(company_id: str = Query(...)):
    """List all registered webhooks for a company. Secrets are masked."""
    items = [
        {**c, "secret": "••••" + c["secret"][-4:]}
        for c in _CONFIGS.values()
        if c["company_id"] == company_id
    ]
    return {"webhooks": items, "count": len(items)}


@router.delete("/config/{webhook_id:path}", summary="Delete a webhook")
def delete_webhook(webhook_id: str):
    """Remove a webhook configuration by its ID."""
    wid = unquote(webhook_id)
    if wid not in _CONFIGS:
        raise HTTPException(404, f"Webhook '{wid}' not found")
    del _CONFIGS[wid]
    logger.info("ingest: deleted webhook %s", wid)
    return {"status": "deleted", "webhook_id": wid}


@router.post(
    "/receive/{company_id}/{source_slug}",
    summary="Receive a webhook payload from an external system",
)
async def receive_webhook(
    company_id:  str,
    source_slug: str,
    request:     Request,
    x_webhook_secret: Optional[str] = Header(None),
    secret:           Optional[str] = Query(None),
):
    """
    Ingest a JSON payload from an external system.

    Authentication: pass the webhook secret as either:
      - HTTP header:  X-Webhook-Secret: <secret>
      - Query string: ?secret=<secret>

    Body: a single JSON object OR a JSON array of objects.
    Each object is field-mapped to the configured entity type and
    POSTed to Base44. ETL is triggered immediately after.
    """
    wid    = _webhook_id(company_id, source_slug)
    config = _CONFIGS.get(wid)

    if not config:
        raise HTTPException(
            404,
            f"No webhook registered for source '{source_slug}' "
            f"on company '{company_id}'. "
            f"Register via POST /ingest/register first.",
        )

    # ── Auth ──────────────────────────────────────────────────────────────────
    provided = x_webhook_secret or secret
    if provided != config["secret"]:
        logger.warning("ingest: rejected bad secret for %s", wid)
        raise HTTPException(401, "Invalid webhook secret")

    # ── Parse body ────────────────────────────────────────────────────────────
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(422, "Request body must be valid JSON")

    if isinstance(body, dict):
        records = [body]
    elif isinstance(body, list):
        records = [r for r in body if isinstance(r, dict)]
    else:
        raise HTTPException(422, "Body must be a JSON object or array of objects")

    if not records:
        return {"status": "ok", "records_in": 0, "created": 0, "errors": 0}

    # ── Get Base44 URL ────────────────────────────────────────────────────────
    entity_type = config["entity_type"]
    ecfg        = ENTITY_CONFIG[entity_type]
    base44_url  = getattr(settings, ecfg["url_attr"], None)

    if not base44_url:
        raise HTTPException(
            503,
            f"Base44 URL for '{entity_type}' not set in Railway. "
            f"Add {ecfg['url_attr'].upper()} to environment variables.",
        )

    # ── Map and write ─────────────────────────────────────────────────────────
    field_mappings = config.get("field_mappings", {})
    created = errors = 0

    for raw in records:
        mapped = _apply_mappings(raw, entity_type, field_mappings)
        if not mapped:
            errors += 1
            continue
        mapped["company_id"] = company_id
        mapped.setdefault("source", f"webhook:{config['source_name']}")

        outcome = _post_to_base44(base44_url, mapped)
        if outcome == "created":
            created += 1
        else:
            errors += 1

    # ── ETL (fire-and-forget) ─────────────────────────────────────────────────
    if created > 0:
        _fire_etl(ecfg["etl_name"])

    # ── Update stats + log ────────────────────────────────────────────────────
    config["last_received_at"] = _now_iso()
    config["received_count"]   = config.get("received_count", 0) + len(records)

    event = {
        "webhook_id":    wid,
        "company_id":    company_id,
        "source_name":   config["source_name"],
        "entity_type":   entity_type,
        "records_in":    len(records),
        "created":       created,
        "errors":        errors,
        "received_at":   _now_iso(),
    }
    _log_event(event)

    logger.info(
        "ingest: %s/%s — %d in, %d created, %d errors",
        company_id, source_slug, len(records), created, errors,
    )

    return {
        "status":        "ok" if errors == 0 else "partial",
        "records_in":    len(records),
        "created":       created,
        "errors":        errors,
        "entity_type":   entity_type,
        "etl_triggered": created > 0,
    }


@router.get("/events", summary="Recent ingest events for a company")
def get_events(
    company_id: str       = Query(...),
    limit:      int       = Query(50, le=200),
):
    """Return the most recent ingest events for a company (in-memory, max 200)."""
    items = [e for e in reversed(_EVENTS) if e.get("company_id") == company_id]
    return {"events": items[:limit], "total": len(items)}
