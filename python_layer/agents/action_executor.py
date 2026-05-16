"""
python_layer/agents/action_executor.py  — Phase 13: Agent Actions
=================================================================
Executes approved (or auto-approved) agent actions as real Supabase mutations.

This closes the autonomous loop:
  detect → decide → act → record → learn

Supported action types:
  create_task          — insert task in Supabase
  create_follow_up     — insert task in Supabase (follow_up task_type)
  create_purchase_order— insert task in Supabase (purchase_order task_type)
  flag_record          — update Supabase entity row (sets flagged=True)
  update_record        — update Supabase entity row (arbitrary field updates)
  update_task_status   — PATCH task status
  reassign_task        — PATCH task assignee
  create_transaction   — insert transaction in Supabase
  send_client_message  — via alerts engine (WhatsApp)
  send_whatsapp        — via alerts engine
  send_email           — via alerts engine
  internal_alert       — via alerts engine
  trigger_etl          — POST /load/{entity}-summary

After every execution:
  1. Write entry to audit.change_log  (best-effort)
  2. Fire ETL for the affected entity  (fire-and-forget)
  3. Return standardised result dict

Called by approval_gate.execute_approved() — never by agents directly.
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import requests

from data_sources import supabase_source

logger = logging.getLogger(__name__)

_RAILWAY_BASE = "https://newsconseenwebapp-production.up.railway.app"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fire_etl(entity: str) -> None:
    """Fire-and-forget ETL trigger — never blocks."""
    try:
        endpoint = "/cron/etl-all" if entity == "all" else f"/load/{entity}-summary"
        requests.post(f"{_RAILWAY_BASE}{endpoint}", timeout=3)
    except Exception:
        pass


def _create_record(entity_type: str, company_id: str, data: dict) -> dict:
    result = supabase_source.create_record(entity_type, data, company_id=company_id)
    if result.get("error"):
        raise RuntimeError(result["error"])
    return result


def _update_record(entity_type: str, record_id: str, data: dict) -> dict:
    result = supabase_source.update_record(entity_type, record_id, data)
    if result.get("error"):
        raise RuntimeError(result["error"])
    return result


def _write_audit(engine, company_id: str, agent_name: str,
                 action_type: str, entity_type: str,
                 entity_id: Optional[str], payload: dict) -> Optional[str]:
    """Write an executed action to audit.change_log. Returns entry id or None."""
    if not engine:
        return None
    try:
        from audit.routes import _pg_insert
        entry = {
            "company_id":     company_id,
            "entity_type":    entity_type or "unknown",
            "entity_id":      entity_id,
            "entity_name":    None,
            "action":         action_type,
            "changed_by":     f"agent:{agent_name}",
            "changed_fields": payload,
            "timestamp":      _now_iso(),
        }
        _pg_insert(entry)
        return entry["timestamp"]   # use timestamp as soft id
    except Exception as e:
        logger.debug("action_executor: audit write skipped — %s", e)
        return None


# ── Action handlers ───────────────────────────────────────────────────────────

def _exec_create_task(company_id: str, inputs: dict) -> dict:
    task = {k: v for k, v in {
        "company_id":       company_id,
        "title":            inputs.get("title", "Agent-created task"),
        "description":      inputs.get("description", ""),
        "task_type":        inputs.get("task_type", "follow_up"),
        "status":           inputs.get("status", "open"),
        "priority":         inputs.get("priority", "medium"),
        "assigned_to_name": inputs.get("assigned_to_name", ""),
        "due_date":         inputs.get("due_date", ""),
        "notes":            inputs.get("notes",
                                       f"Created by agent at {_now_iso()[:10]}"),
    }.items() if v not in ("", None)}
    result = _create_record("task", company_id, task)
    _fire_etl("task")
    return {"entity_type": "task", "entity_id": result.get("id"), "storage": "supabase"}


def _exec_flag_record(company_id: str, inputs: dict) -> dict:
    entity_type = inputs.get("entity_type", "person")
    record_id   = inputs.get("record_id")
    if not record_id:
        return {"error": "record_id required for flag_record"}
    patch = {"flagged": True, "flag_reason": inputs.get("reason", "Flagged by agent"),
             "flag_date": _now_iso()[:10]}
    _update_record(entity_type, record_id, patch)
    _etl_map = {"person": "people", "enterprise": "enterprise",
                "product": "product", "task": "task"}
    _fire_etl(_etl_map.get(entity_type, entity_type))
    return {"entity_type": entity_type, "entity_id": record_id, "storage": "supabase"}


def _exec_update_record(company_id: str, inputs: dict) -> dict:
    entity_type = inputs.get("entity_type", "person")
    record_id   = inputs.get("record_id")
    updates     = inputs.get("updates", {})
    if not record_id or not updates:
        return {"error": "entity_type, record_id, and updates are all required"}
    _update_record(entity_type, record_id, updates)
    _etl_map = {"person": "people", "enterprise": "enterprise",
                "product": "product", "task": "task", "transaction": "transaction"}
    _fire_etl(_etl_map.get(entity_type, entity_type))
    return {"entity_type": entity_type, "entity_id": record_id, "storage": "supabase"}


def _exec_update_task_status(company_id: str, inputs: dict) -> dict:
    return _exec_update_record(company_id, {
        "entity_type": "task",
        "record_id":   inputs.get("task_id") or inputs.get("record_id"),
        "updates":     {"status": inputs.get("status", "completed")},
    })


def _exec_reassign_task(company_id: str, inputs: dict) -> dict:
    return _exec_update_record(company_id, {
        "entity_type": "task",
        "record_id":   inputs.get("task_id") or inputs.get("record_id"),
        "updates":     {"assigned_to_name": inputs.get("assigned_to_name", "")},
    })


def _exec_create_transaction(company_id: str, inputs: dict) -> dict:
    txn = {k: v for k, v in {
        "company_id":       company_id,
        "transaction_type": inputs.get("transaction_type", "invoice"),
        "amount":           inputs.get("amount", 0),
        "currency":         inputs.get("currency", "USD"),
        "status":           inputs.get("status", "pending"),
        "description":      inputs.get("description", ""),
        "notes":            inputs.get("notes",
                                       f"Created by agent at {_now_iso()[:10]}"),
        "reference_number": inputs.get("reference_number", ""),
    }.items() if v not in ("", None)}
    result = _create_record("transaction", company_id, txn)
    _fire_etl("transaction")
    return {"entity_type": "transaction", "entity_id": result.get("id"), "storage": "supabase"}


def _exec_send_message(company_id: str, inputs: dict, channel: str) -> dict:
    try:
        resp = requests.post(
            f"{_RAILWAY_BASE}/alerts/send",
            json={
                "company_id": company_id,
                "channel":    channel,
                "message":    inputs.get("message", ""),
                "recipient":  inputs.get("recipient", ""),
            },
            timeout=15,
        )
        return {"entity_type": "alert", "entity_id": None,
                "sent": resp.ok, "status_code": resp.status_code}
    except Exception as e:
        return {"error": str(e)}


def _exec_trigger_etl(company_id: str, inputs: dict) -> dict:
    entity = inputs.get("entity", "all")
    _fire_etl(entity)
    return {"entity_type": None, "entity_id": None, "triggered": True, "entity": entity}


def _exec_invoke_agent(company_id: str, inputs: dict) -> dict:
    """Execute an approved copilot → agent invocation via the Orchestrator."""
    agent_name = inputs.get("agent_name", "")
    trigger    = inputs.get("trigger", "copilot")
    intent     = inputs.get("intent", "")

    if not agent_name:
        return {"error": "agent_name not provided in payload", "executed": False}

    try:
        from agents.orchestrator import run_agent
        from database import get_engine_safe
        engine = get_engine_safe()
        result = run_agent(agent_name, company_id, trigger, engine)
        return {
            "entity_type": "agent",
            "entity_id":   agent_name,
            "agent_result": result,
        }
    except Exception as e:
        logger.warning("_exec_invoke_agent(%s): %s", agent_name, e)
        return {"error": str(e), "agent_name": agent_name}


def _exec_create_person(company_id: str, inputs: dict) -> dict:
    person = {k: v for k, v in {
        "company_id":    company_id,
        "full_name":     inputs.get("full_name") or inputs.get("name", ""),
        "person_type":   inputs.get("person_type", "client"),
        "person_subtype": inputs.get("person_subtype", ""),
        "status":        inputs.get("status", "active"),
        "phone":         inputs.get("phone", ""),
        "email":         inputs.get("email", ""),
        "enterprise_name": inputs.get("enterprise_name", ""),
        "engagement_model": inputs.get("engagement_model", ""),
        "notes":         inputs.get("notes", f"Created by agent at {_now_iso()[:10]}"),
    }.items() if v not in ("", None)}
    if not person.get("full_name"):
        return {"error": "full_name is required for create_person"}
    result = _create_record("person", company_id, person)
    _fire_etl("people")
    return {"entity_type": "person", "entity_id": result.get("id"), "storage": "supabase"}


def _exec_create_enterprise(company_id: str, inputs: dict) -> dict:
    rec = {k: v for k, v in {
        "company_id":      company_id,
        "name":            inputs.get("name", ""),
        "enterprise_type": inputs.get("enterprise_type", "commercial"),
        "enterprise_subtype": inputs.get("enterprise_subtype", ""),
        "status":          inputs.get("status", "active"),
        "operating_status": inputs.get("operating_status", "open"),
        "phone":           inputs.get("phone", ""),
        "email":           inputs.get("email", ""),
        "website":         inputs.get("website", ""),
        "notes":           inputs.get("notes", f"Created by agent at {_now_iso()[:10]}"),
    }.items() if v not in ("", None)}
    if not rec.get("name"):
        return {"error": "name is required for create_enterprise"}
    result = _create_record("enterprise", company_id, rec)
    _fire_etl("enterprise")
    return {"entity_type": "enterprise", "entity_id": result.get("id"), "storage": "supabase"}


def _exec_create_document(company_id: str, inputs: dict) -> dict:
    rec = {k: v for k, v in {
        "company_id":    company_id,
        "title":         inputs.get("title", ""),
        "document_type": inputs.get("document_type", "other"),
        "document_subtype": inputs.get("document_subtype", ""),
        "status":        inputs.get("status", "draft"),
        "description":   inputs.get("description", ""),
        "file_url":      inputs.get("file_url", ""),
        "file_type":     inputs.get("file_type", ""),
        "created_date":  inputs.get("created_date", _now_iso()[:10]),
        "expiry_date":   inputs.get("expiry_date", ""),
        "enterprise_id": inputs.get("enterprise_id", ""),
        "is_signed":     inputs.get("is_signed", False),
        "is_confidential": inputs.get("is_confidential", False),
    }.items() if v not in ("", None)}
    if not rec.get("title"):
        return {"error": "title is required for create_document"}
    result = _create_record("document", company_id, rec)
    _fire_etl("document")
    return {"entity_type": "document", "entity_id": result.get("id"), "storage": "supabase"}


def _exec_create_schedule(company_id: str, inputs: dict) -> dict:
    rec = {k: v for k, v in {
        "company_id":       company_id,
        "title":            inputs.get("title", ""),
        "schedule_type":    inputs.get("schedule_type", "recurring"),
        "schedule_subtype": inputs.get("schedule_subtype", ""),
        "status":           inputs.get("status", "active"),
        "frequency":        inputs.get("frequency", "weekly"),
        "start_date":       inputs.get("start_date", ""),
        "end_date":         inputs.get("end_date", ""),
        "time_of_day":      inputs.get("time_of_day", ""),
        "description":      inputs.get("description", ""),
        "enterprise_id":    inputs.get("enterprise_id", ""),
        "assigned_person_id": inputs.get("assigned_person_id", ""),
    }.items() if v not in ("", None)}
    if not rec.get("title"):
        return {"error": "title is required for create_schedule"}
    result = _create_record("schedule", company_id, rec)
    _fire_etl("schedule")
    return {"entity_type": "schedule", "entity_id": result.get("id"), "storage": "supabase"}


def _exec_create_territory(company_id: str, inputs: dict) -> dict:
    rec = {k: v for k, v in {
        "company_id":          company_id,
        "name":                inputs.get("name", ""),
        "territory_type":      inputs.get("territory_type", "service_area"),
        "territory_subtype":   inputs.get("territory_subtype", ""),
        "status":              inputs.get("status", "active"),
        "country":             inputs.get("country", ""),
        "region":              inputs.get("region", ""),
        "area_km2":            inputs.get("area_km2"),
        "population_estimate": inputs.get("population_estimate"),
        "description":         inputs.get("description", ""),
        "enterprise_id":       inputs.get("enterprise_id", ""),
        "assigned_person_id":  inputs.get("assigned_person_id", ""),
    }.items() if v not in ("", None)}
    if not rec.get("name"):
        return {"error": "name is required for create_territory"}
    result = _create_record("territory", company_id, rec)
    _fire_etl("territory")
    return {"entity_type": "territory", "entity_id": result.get("id"), "storage": "supabase"}


def _exec_create_signal(company_id: str, inputs: dict) -> dict:
    rec = {k: v for k, v in {
        "company_id":     company_id,
        "name":           inputs.get("name", ""),
        "signal_type":    inputs.get("signal_type", "manual"),
        "signal_subtype": inputs.get("signal_subtype", ""),
        "status":         inputs.get("status", "active"),
        "value":          inputs.get("value"),
        "unit_of_measure": inputs.get("unit_of_measure", "unit"),
        "recorded_at":    inputs.get("recorded_at", _now_iso()),
        "source":         inputs.get("source", "copilot"),
        "description":    inputs.get("description", ""),
        "enterprise_id":  inputs.get("enterprise_id", ""),
        "is_anomaly":     inputs.get("is_anomaly", False),
    }.items() if v not in ("", None)}
    if not rec.get("name"):
        return {"error": "name is required for create_signal"}
    result = _create_record("signal", company_id, rec)
    _fire_etl("signal")
    return {"entity_type": "signal", "entity_id": result.get("id"), "storage": "supabase"}


def _exec_create_channel(company_id: str, inputs: dict) -> dict:
    rec = {k: v for k, v in {
        "company_id":     company_id,
        "name":           inputs.get("name", ""),
        "channel_type":   inputs.get("channel_type", "email"),
        "channel_subtype": inputs.get("channel_subtype", ""),
        "status":         inputs.get("status", "active"),
        "purpose":        inputs.get("purpose", "operations"),
        "sentiment":      inputs.get("sentiment", "neutral"),
        "description":    inputs.get("description", ""),
        "enterprise_id":  inputs.get("enterprise_id", ""),
    }.items() if v not in ("", None)}
    if not rec.get("name"):
        return {"error": "name is required for create_channel"}
    result = _create_record("channel", company_id, rec)
    _fire_etl("channel")
    return {"entity_type": "channel", "entity_id": result.get("id"), "storage": "supabase"}


def _exec_import_records(company_id: str, inputs: dict) -> dict:
    """
    Bulk import: create multiple records of any entity type.
    Each record is created individually so partial success is possible.
    """
    entity_type = inputs.get("entity_type", "")
    records     = inputs.get("records", [])

    if not records:
        return {"error": "records list is empty"}

    # Delegate each record to the appropriate single-create handler
    _single_handlers = {
        "person":      _exec_create_person,
        "enterprise":  _exec_create_enterprise,
        "product":     _exec_create_product,
        "task":        _exec_create_task,
        "transaction": _exec_create_transaction,
        "document":    _exec_create_document,
        "schedule":    _exec_create_schedule,
        "territory":   _exec_create_territory,
        "signal":      _exec_create_signal,
        "channel":     _exec_create_channel,
    }
    handler = _single_handlers.get(entity_type)
    if not handler:
        return {"error": f"entity_type '{entity_type}' not supported for import"}

    created, failed = [], []
    for i, record in enumerate(records):
        try:
            result = handler(company_id, record)
            if "error" in result:
                failed.append({"index": i, "record": record, "error": result["error"]})
            else:
                created.append(result)
        except Exception as e:
            failed.append({"index": i, "record": record, "error": str(e)})

    # Fire ETL once at the end
    _etl_map = {
        "person": "people", "enterprise": "enterprise", "product": "product",
        "task": "task", "transaction": "transaction", "document": "document",
        "schedule": "schedule", "territory": "territory",
        "signal": "signal", "channel": "channel",
    }
    _fire_etl(_etl_map.get(entity_type, entity_type))

    return {
        "entity_type": entity_type,
        "created_count": len(created),
        "failed_count":  len(failed),
        "created": created,
        "failed":  failed,
    }


def _exec_create_product(company_id: str, inputs: dict) -> dict:
    product = {k: v for k, v in {
        "company_id":   company_id,
        "name":         inputs.get("name", ""),
        "item_type":    inputs.get("item_type", "physical"),
        "item_class":   inputs.get("item_class", ""),
        "item_subtype": inputs.get("item_subtype", ""),
        "unit_of_measure": inputs.get("unit_of_measure", "piece"),
        "unit_price":   inputs.get("unit_price"),
        "stock_level":  inputs.get("stock_level"),
        "reorder_point": inputs.get("reorder_point"),
        "status":       inputs.get("status", "active"),
        "notes":        inputs.get("notes", f"Created by agent at {_now_iso()[:10]}"),
    }.items() if v not in ("", None)}
    if not product.get("name"):
        return {"error": "name is required for create_product"}
    result = _create_record("product", company_id, product)
    _fire_etl("product")
    return {"entity_type": "product", "entity_id": result.get("id"), "storage": "supabase"}


# ── Dispatcher ────────────────────────────────────────────────────────────────

_HANDLERS = {
    # Existing entity creates
    "create_task":           _exec_create_task,
    "create_follow_up":      _exec_create_task,
    "create_purchase_order": _exec_create_task,
    "create_person":         _exec_create_person,
    "create_product":        _exec_create_product,
    "create_transaction":    _exec_create_transaction,
    "create_enterprise":     _exec_create_enterprise,
    # New canonical entity creates
    "create_document":       _exec_create_document,
    "create_schedule":       _exec_create_schedule,
    "create_territory":      _exec_create_territory,
    "create_signal":         _exec_create_signal,
    "create_channel":        _exec_create_channel,
    # Bulk import (any entity, always approval-gated)
    "import_records":        _exec_import_records,
    # Record mutations
    "flag_record":           _exec_flag_record,
    "update_record":         _exec_update_record,
    "update_task_status":    _exec_update_task_status,
    "reassign_task":         _exec_reassign_task,
    # Messaging
    "send_client_message":   lambda cid, inp: _exec_send_message(cid, inp, "whatsapp"),
    "send_whatsapp":         lambda cid, inp: _exec_send_message(cid, inp, "whatsapp"),
    "send_email":            lambda cid, inp: _exec_send_message(cid, inp, "email"),
    "internal_alert":        lambda cid, inp: _exec_send_message(cid, inp, "internal_alert"),
    "trigger_etl":           _exec_trigger_etl,
    # Copilot → Orchestrator invocation (approved by operator)
    "invoke_agent":          _exec_invoke_agent,
}


def _push_to_connected_systems(company_id: str, entity_type: str, payload: dict) -> None:
    """
    Phase 14: Fire-and-forget push to all active write-back connectors.
    Called after every successful Supabase mutation.
    Failures are logged but never bubble up to the caller.
    """
    try:
        from connectors.writeback import push_all
        import threading
        threading.Thread(
            target=push_all,
            args=(company_id, entity_type, payload),
            daemon=True,
        ).start()
    except Exception as e:
        logger.debug("action_executor: write-back push skipped — %s", e)


def execute_action(
    action_type: str,
    action_payload: dict,
    company_id: str,
    agent_name: str = "agent",
    engine=None,
) -> dict:
    """
    Execute a Supabase mutation for an approved agent action.

    Returns:
        {
          "executed":    bool,
          "action_type": str,
          "entity_type": str | None,
          "entity_id":   str | None,
          "audit_id":    str | None,
          "error":       str | None,
          "executed_at": ISO str,
        }
    """
    handler = _HANDLERS.get(action_type)
    # Support both {inputs: {...}} and flat payload
    inputs  = action_payload.get("inputs", action_payload)

    if not handler:
        logger.warning("action_executor: no handler for '%s'", action_type)
        return {
            "executed": False, "action_type": action_type,
            "entity_type": None, "entity_id": None,
            "audit_id": None,
            "error": f"No handler for action_type '{action_type}'",
            "executed_at": _now_iso(),
        }

    try:
        result      = handler(company_id, inputs)
        entity_type = result.get("entity_type")
        entity_id   = result.get("entity_id")
        error       = result.get("error")

        audit_id = _write_audit(
            engine, company_id, agent_name,
            action_type=action_type,
            entity_type=entity_type or "unknown",
            entity_id=entity_id,
            payload=inputs,
        )

        executed = error is None
        if executed:
            logger.info("action_executor: ✓ %s/%s entity_id=%s",
                        agent_name, action_type, entity_id)
            # Phase 14: push to any active bidirectional connectors
            if entity_type:
                _push_to_connected_systems(company_id, entity_type, inputs)
        else:
            logger.warning("action_executor: ✗ %s/%s error=%s",
                           agent_name, action_type, error)

        return {
            "executed":    executed,
            "action_type": action_type,
            "entity_type": entity_type,
            "entity_id":   entity_id,
            "audit_id":    audit_id,
            "error":       error,
            "executed_at": _now_iso(),
        }

    except Exception as exc:
        logger.warning("action_executor: exception %s/%s — %s",
                       agent_name, action_type, exc)
        return {
            "executed": False, "action_type": action_type,
            "entity_type": None, "entity_id": None,
            "audit_id": None, "error": str(exc),
            "executed_at": _now_iso(),
        }
