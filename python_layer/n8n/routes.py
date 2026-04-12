# ==============================================================
# n8n ↔ Newsconseen Webhook Routes
# ==============================================================
# Two directions:
#
#  n8n → Newsconseen  (this file)
#  ─────────────────
#  GET  /n8n/status                  health + config check
#  POST /n8n/trigger/etl             run full ETL pipeline
#  POST /n8n/trigger/etl/{entity}    run single entity ETL
#  POST /n8n/ingest/people           push Person records from n8n workflow
#  POST /n8n/ingest/transactions     push Transaction records from n8n workflow
#  POST /n8n/ingest/tasks            push Task records from n8n workflow
#  POST /n8n/ingest/enterprises      push Enterprise records from n8n workflow
#  POST /n8n/event                   generic event receiver (for n8n → Newsconseen signals)
#
#  Newsconseen → n8n  (see emitter.py)
#  ─────────────────
#  emit_event() fires to N8N_WEBHOOK_URL after ETL, alerts, imports, etc.
#
# Security:
#   All write endpoints check X-N8N-Secret header against N8N_SECRET env var.
#   If N8N_SECRET is not set, the endpoints are open (use only on private networks).
# ==============================================================

import logging
import os
import time
from typing import Any, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/n8n", tags=["n8n Integration"])

RAILWAY_URL = os.getenv(
    "RAILWAY_URL",
    "https://newsconseenwebapp-production.up.railway.app",
)


# ── Auth helper ──────────────────────────────────────────────────────────────

def _check_n8n_secret(provided: str | None) -> None:
    """Validate X-N8N-Secret header. No-op if N8N_SECRET is not configured."""
    expected = os.getenv("N8N_SECRET", "").strip()
    if not expected:
        return
    if provided != expected:
        raise HTTPException(status_code=401, detail="Invalid X-N8N-Secret header")


# ── Request / response models ────────────────────────────────────────────────

class IngestPeopleRequest(BaseModel):
    """
    Push one or more Person records from an n8n workflow into Newsconseen.

    n8n workflow example:
      Google Form → n8n → POST /n8n/ingest/people
      WhatsApp registration → n8n → POST /n8n/ingest/people

    Records are written to raw.people and analytics.people_summary is refreshed.
    """
    records:    list[dict[str, Any]]
    company_id: str
    trigger_etl: bool = True   # refresh analytics after ingest


class IngestTransactionsRequest(BaseModel):
    """
    Push Transaction records from an n8n workflow.

    n8n workflow example:
      MPESA confirmation → n8n → POST /n8n/ingest/transactions
      QuickBooks sync → n8n → POST /n8n/ingest/transactions
    """
    records:    list[dict[str, Any]]
    company_id: str
    trigger_etl: bool = True


class IngestTasksRequest(BaseModel):
    """Push Task records from an n8n workflow (e.g. auto-created follow-ups)."""
    records:    list[dict[str, Any]]
    company_id: str
    trigger_etl: bool = True


class IngestEnterprisesRequest(BaseModel):
    """Push Enterprise records from an n8n workflow."""
    records:    list[dict[str, Any]]
    company_id: str
    trigger_etl: bool = True


class EventRequest(BaseModel):
    """Generic event receiver — n8n can send any signal to Newsconseen."""
    event:      str
    payload:    dict[str, Any] = {}
    company_id: Optional[str] = None


# ── Shared ingest helper ─────────────────────────────────────────────────────

def _ingest_records(
    records: list[dict],
    company_id: str,
    entity_name: str,     # "people", "transactions", "tasks", "enterprises"
    trigger_etl: bool,
) -> dict:
    """
    Write records to raw.<entity> and optionally refresh analytics summary.

    Flow:
      1. Stamp company_id on every record
      2. Append to raw.<entity> (upsert by id if present)
      3. If trigger_etl: re-run transform + load for this entity + company
    """
    from etl.load import load_raw
    from database import get_engine_safe

    if not records:
        return {"status": "skipped", "reason": "empty records list", "count": 0}

    # Stamp company_id on every record
    stamped = []
    for r in records:
        row = dict(r)
        row.setdefault("company_id", company_id)
        stamped.append(row)

    df = pd.DataFrame(stamped)

    # Write to raw schema
    try:
        load_raw(df, entity_name)
        logger.info("n8n ingest: wrote %d rows to raw.%s (company_id=%s)", len(df), entity_name, company_id)
    except Exception as e:
        logger.error("n8n ingest: raw.%s write failed — %s", entity_name, e)
        return {"status": "error", "detail": str(e), "count": 0}

    # Optionally refresh analytics for this entity
    etl_result = None
    if trigger_etl:
        try:
            etl_result = _run_entity_etl(entity_name, company_id)
        except Exception as e:
            logger.warning("n8n ingest: ETL refresh failed for %s — %s", entity_name, e)
            etl_result = {"status": "error", "detail": str(e)}

    return {
        "status":     "success",
        "count":      len(df),
        "entity":     entity_name,
        "company_id": company_id,
        "etl":        etl_result,
    }


def _run_entity_etl(entity_name: str, company_id: str) -> dict:
    """
    Run transform + analytics load for a single entity.
    Reads from raw.<entity> (already written), transforms, loads analytics.
    """
    from etl import people, enterprises, transactions, tasks
    from etl.load import load_dataframe
    from database import get_engine_safe
    from sqlalchemy import text

    entity_map = {
        "people":        people.transform_people,
        "enterprises":   enterprises.transform_enterprises,
        "transactions":  transactions.transform_transactions,
        "tasks":         tasks.transform_tasks,
    }

    transform_fn = entity_map.get(entity_name)
    if not transform_fn:
        return {"status": "skipped", "reason": f"no transform for {entity_name}"}

    engine = get_engine_safe()
    if not engine:
        return {"status": "skipped", "reason": "no database connection"}

    with engine.connect() as conn:
        try:
            raw_df = pd.read_sql(
                f"SELECT * FROM raw.{entity_name} WHERE company_id = :cid",
                conn,
                params={"cid": company_id},
            )
        except Exception as e:
            return {"status": "error", "detail": f"raw read failed: {e}"}

    if raw_df.empty:
        return {"status": "skipped", "reason": "no raw data for this company"}

    summary = transform_fn(raw_df)
    return load_dataframe(summary, f"{entity_name}_summary", company_id=company_id)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/status")
def n8n_status():
    """
    Health check for the n8n integration.
    Shows whether N8N_WEBHOOK_URL and N8N_SECRET are configured,
    and returns the ingest + trigger endpoint URLs for n8n node setup.
    """
    webhook_url = os.getenv("N8N_WEBHOOK_URL", "")
    secret_set  = bool(os.getenv("N8N_SECRET", ""))

    return {
        "status":              "ok",
        "n8n_webhook_url_set": bool(webhook_url),
        "n8n_secret_set":      secret_set,
        "note":                (
            "Set N8N_WEBHOOK_URL in Railway to enable Newsconseen → n8n event emission. "
            "Set N8N_SECRET to secure the ingest endpoints."
            if not webhook_url else None
        ),
        "endpoints": {
            "trigger_etl_all":      f"{RAILWAY_URL}/n8n/trigger/etl",
            "trigger_etl_people":   f"{RAILWAY_URL}/n8n/trigger/etl/people",
            "trigger_etl_transactions": f"{RAILWAY_URL}/n8n/trigger/etl/transactions",
            "ingest_people":        f"{RAILWAY_URL}/n8n/ingest/people",
            "ingest_transactions":  f"{RAILWAY_URL}/n8n/ingest/transactions",
            "ingest_tasks":         f"{RAILWAY_URL}/n8n/ingest/tasks",
            "ingest_enterprises":   f"{RAILWAY_URL}/n8n/ingest/enterprises",
            "event_receiver":       f"{RAILWAY_URL}/n8n/event",
        },
        "example_n8n_workflows": [
            "Google Form → n8n → POST /n8n/ingest/people  (auto-register students/clients)",
            "MPESA notification → n8n → POST /n8n/ingest/transactions  (auto-record payments)",
            "WhatsApp message → n8n → POST /n8n/ingest/tasks  (create follow-up task)",
            "Schedule (nightly) → n8n → POST /n8n/trigger/etl  (automated ETL)",
            "ETL complete → Newsconseen → n8n webhook → Send WhatsApp summary",
        ],
    }


@router.post("/trigger/etl")
def trigger_etl_all(x_n8n_secret: Optional[str] = Header(None)):
    """
    Trigger a full ETL pipeline run from n8n.

    Use this in n8n as a scheduled workflow (e.g. nightly at 3am)
    to keep analytics tables fresh without manual intervention.

    n8n node: HTTP Request → POST /n8n/trigger/etl
    Header:   X-N8N-Secret: <your secret>
    """
    _check_n8n_secret(x_n8n_secret)

    import requests as req
    try:
        resp = req.post(
            f"{RAILWAY_URL}/cron/etl-all",
            headers={"x-cron-secret": os.getenv("CRON_SECRET", "")},
            timeout=300,
        )
        result = resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ETL trigger failed: {e}")

    return {
        "triggered_by": "n8n",
        "etl_result":   result,
    }


@router.post("/trigger/etl/{entity}")
def trigger_etl_entity(
    entity: str,
    company_id: str = "",
    x_n8n_secret: Optional[str] = Header(None),
):
    """
    Trigger ETL for a single entity from n8n.

    Useful after an n8n workflow creates/updates records for one entity
    so you don't have to run the full pipeline.

    entity: people | transactions | tasks | enterprises | products | addresses
    """
    _check_n8n_secret(x_n8n_secret)

    valid = {"people", "transactions", "tasks", "enterprises",
             "products", "addresses", "relationships", "services"}
    if entity not in valid:
        raise HTTPException(status_code=400, detail=f"Unknown entity: {entity}. Valid: {sorted(valid)}")

    if not company_id:
        raise HTTPException(status_code=400, detail="company_id is required")

    try:
        result = _run_entity_etl(entity, company_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "triggered_by": "n8n",
        "entity":       entity,
        "company_id":   company_id,
        "result":       result,
    }


@router.post("/ingest/people")
def ingest_people(request: IngestPeopleRequest, x_n8n_secret: Optional[str] = Header(None)):
    """
    Push Person records from an n8n workflow into Newsconseen.

    Example n8n use cases:
    - Google Form (new student registration) → n8n → this endpoint
    - WhatsApp bot collects name/phone → n8n → this endpoint
    - External CRM sync → n8n → this endpoint

    Required fields per record: first_name + last_name (or full_name)
    Optional but recommended: person_type, person_subtype, email, phone
    """
    _check_n8n_secret(x_n8n_secret)
    return _ingest_records(request.records, request.company_id, "people", request.trigger_etl)


@router.post("/ingest/transactions")
def ingest_transactions(request: IngestTransactionsRequest, x_n8n_secret: Optional[str] = Header(None)):
    """
    Push Transaction records from an n8n workflow.

    Example n8n use cases:
    - MPESA STK push confirmation → n8n → this endpoint (auto-record payment)
    - Stripe webhook (payment received) → n8n → this endpoint
    - Bank statement import → n8n → this endpoint

    Required fields per record: transaction_type, date, amount
    """
    _check_n8n_secret(x_n8n_secret)
    return _ingest_records(request.records, request.company_id, "transactions", request.trigger_etl)


@router.post("/ingest/tasks")
def ingest_tasks(request: IngestTasksRequest, x_n8n_secret: Optional[str] = Header(None)):
    """
    Push Task records from an n8n workflow.

    Example n8n use cases:
    - New client added → n8n auto-creates a "Welcome call" task
    - Overdue invoice → n8n creates a "Follow-up" task
    - Google Calendar event → n8n creates a task in Newsconseen

    Required fields per record: task_type, title (or description)
    """
    _check_n8n_secret(x_n8n_secret)
    return _ingest_records(request.records, request.company_id, "tasks", request.trigger_etl)


@router.post("/ingest/enterprises")
def ingest_enterprises(request: IngestEnterprisesRequest, x_n8n_secret: Optional[str] = Header(None)):
    """
    Push Enterprise records from an n8n workflow.

    Example n8n use cases:
    - New client onboarding form → n8n creates Enterprise + Person
    - External directory sync → n8n → this endpoint

    Required fields per record: name, enterprise_type
    """
    _check_n8n_secret(x_n8n_secret)
    return _ingest_records(request.records, request.company_id, "enterprises", request.trigger_etl)


@router.post("/event")
def receive_event(
    request: EventRequest,
    x_n8n_secret: Optional[str] = Header(None),
):
    """
    Generic event receiver — n8n sends any signal to Newsconseen.

    Use this when an n8n workflow needs to notify Newsconseen of an external
    event without ingesting data (e.g. "payment confirmed", "form submitted").

    The event is logged and can trigger internal actions based on event type.
    """
    _check_n8n_secret(x_n8n_secret)

    logger.info(
        "n8n event received: event=%s company_id=%s payload=%s",
        request.event, request.company_id, str(request.payload)[:200],
    )

    # Route specific event types to internal handlers
    handled = False

    if request.event == "trigger_etl":
        company_id = request.company_id or request.payload.get("company_id", "")
        entity     = request.payload.get("entity", "all")
        if entity == "all":
            import requests as req
            req.post(
                f"{RAILWAY_URL}/cron/etl-all",
                headers={"x-cron-secret": os.getenv("CRON_SECRET", "")},
                timeout=5,
            )
        handled = True

    return {
        "status":     "received",
        "event":      request.event,
        "handled":    handled,
        "company_id": request.company_id,
    }
