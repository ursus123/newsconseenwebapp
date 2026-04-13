"""
python_layer/agents/action_executor.py  — Phase 13: Agent Actions
=================================================================
Executes approved (or auto-approved) agent actions as real Base44 mutations.

This closes the autonomous loop:
  detect → decide → act → record → learn

Supported action types:
  create_task          — POST to BASE44_TASKS_URL
  create_follow_up     — POST to BASE44_TASKS_URL (follow_up task_type)
  create_purchase_order— POST to BASE44_TASKS_URL (purchase_order task_type)
  flag_record          — PATCH to entity URL  (sets flagged=True)
  update_record        — PATCH to entity URL  (arbitrary field updates)
  update_task_status   — PATCH task status
  reassign_task        — PATCH task assignee
  create_transaction   — POST to BASE44_TRANSACTIONS_URL
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

from config.settings import settings, HEADERS as BASE44_HEADERS

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


def _post_base44(url: str, data: dict) -> dict:
    resp = requests.post(url, json=data, headers=BASE44_HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.json()


def _patch_base44(url: str, record_id: str, data: dict) -> dict:
    resp = requests.patch(f"{url}/{record_id}", json=data, headers=BASE44_HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.json()


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
    url = getattr(settings, "base44_tasks_url", None)
    if not url:
        return {"error": "BASE44_TASKS_URL not configured"}
    task = {k: v for k, v in {
        "company_id":       company_id,
        "title":            inputs.get("title", "Agent-created task"),
        "description":      inputs.get("description", ""),
        "task_type":        inputs.get("task_type", "follow_up"),
        "status":           inputs.get("status", "pending"),
        "priority":         inputs.get("priority", "medium"),
        "assigned_to_name": inputs.get("assigned_to_name", ""),
        "due_date":         inputs.get("due_date", ""),
        "notes":            inputs.get("notes",
                                       f"Created by agent at {_now_iso()[:10]}"),
    }.items() if v not in ("", None)}
    result = _post_base44(url, task)
    _fire_etl("task")
    return {"entity_type": "task", "entity_id": result.get("id")}


def _exec_flag_record(company_id: str, inputs: dict) -> dict:
    entity_type = inputs.get("entity_type", "person")
    record_id   = inputs.get("record_id")
    _url_map = {
        "person":      getattr(settings, "base44_people_url",       None),
        "enterprise":  getattr(settings, "base44_enterprises_url",  None),
        "product":     getattr(settings, "base44_products_url",     None),
        "task":        getattr(settings, "base44_tasks_url",        None),
    }
    url = _url_map.get(entity_type)
    if not url:
        return {"error": f"No Base44 URL for entity_type '{entity_type}'"}
    if not record_id:
        return {"error": "record_id required for flag_record"}
    patch = {"flagged": True, "flag_reason": inputs.get("reason", "Flagged by agent"),
             "flag_date": _now_iso()[:10]}
    result = _patch_base44(url, record_id, patch)
    _etl_map = {"person": "people", "enterprise": "enterprise",
                "product": "product", "task": "task"}
    _fire_etl(_etl_map.get(entity_type, entity_type))
    return {"entity_type": entity_type, "entity_id": record_id}


def _exec_update_record(company_id: str, inputs: dict) -> dict:
    entity_type = inputs.get("entity_type", "person")
    record_id   = inputs.get("record_id")
    updates     = inputs.get("updates", {})
    _url_map = {
        "person":      getattr(settings, "base44_people_url",        None),
        "enterprise":  getattr(settings, "base44_enterprises_url",   None),
        "product":     getattr(settings, "base44_products_url",      None),
        "task":        getattr(settings, "base44_tasks_url",         None),
        "transaction": getattr(settings, "base44_transactions_url",  None),
    }
    url = _url_map.get(entity_type)
    if not url:
        return {"error": f"No Base44 URL for entity_type '{entity_type}'"}
    if not record_id or not updates:
        return {"error": "entity_type, record_id, and updates are all required"}
    result = _patch_base44(url, record_id, updates)
    _etl_map = {"person": "people", "enterprise": "enterprise",
                "product": "product", "task": "task", "transaction": "transaction"}
    _fire_etl(_etl_map.get(entity_type, entity_type))
    return {"entity_type": entity_type, "entity_id": record_id}


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
    url = getattr(settings, "base44_transactions_url", None)
    if not url:
        return {"error": "BASE44_TRANSACTIONS_URL not configured"}
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
    result = _post_base44(url, txn)
    _fire_etl("transaction")
    return {"entity_type": "transaction", "entity_id": result.get("id")}


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


# ── Dispatcher ────────────────────────────────────────────────────────────────

_HANDLERS = {
    "create_task":           _exec_create_task,
    "create_follow_up":      _exec_create_task,
    "create_purchase_order": _exec_create_task,
    "flag_record":           _exec_flag_record,
    "update_record":         _exec_update_record,
    "update_task_status":    _exec_update_task_status,
    "reassign_task":         _exec_reassign_task,
    "create_transaction":    _exec_create_transaction,
    "send_client_message":   lambda cid, inp: _exec_send_message(cid, inp, "whatsapp"),
    "send_whatsapp":         lambda cid, inp: _exec_send_message(cid, inp, "whatsapp"),
    "send_email":            lambda cid, inp: _exec_send_message(cid, inp, "email"),
    "internal_alert":        lambda cid, inp: _exec_send_message(cid, inp, "internal_alert"),
    "trigger_etl":           _exec_trigger_etl,
}


def _push_to_connected_systems(company_id: str, entity_type: str, payload: dict) -> None:
    """
    Phase 14: Fire-and-forget push to all active write-back connectors.
    Called after every successful Base44 mutation.
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
    Execute a Base44 mutation for an approved agent action.

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
