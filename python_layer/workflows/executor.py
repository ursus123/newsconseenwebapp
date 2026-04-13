# ==============================================================
# Workflow Step Executor
# ==============================================================
# Executes individual workflow steps against Base44 entities
# and the alerts infrastructure.
#
# Step types:
#   create_task    — create a Task entity in Base44
#   send_alert     — send WhatsApp/Email/SMS via alerts channels
#   update_field   — update a field on the triggering entity
#   log_note       — append an audit log entry
# ==============================================================

import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any

import requests

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _render(template: str, context: dict) -> str:
    """
    Replace {{field_name}} placeholders in a template string
    with values from the trigger entity context.

    Example:
        template = "Welcome {{first_name}} to {{person_type}} programme"
        context  = {"first_name": "Alice", "person_type": "client"}
        → "Welcome Alice to client programme"
    """
    def replacer(m):
        key = m.group(1).strip()
        return str(context.get(key, m.group(0)))
    return re.sub(r"\{\{(.*?)\}\}", replacer, template)


# ── Step executors ─────────────────────────────────────────────────────────────

def step_create_task(params: dict, context: dict, company_id: str) -> dict:
    """
    Create a Task entity in Base44.

    params keys:
        title         str  — task title (supports {{field}} placeholders)
        task_type     str  — task type taxonomy value (e.g. "call", "visit", "follow_up")
        due_days      int  — due date = now + due_days
        priority      str  — low | medium | high (default: medium)
        notes         str  — optional notes / description
        assigned_to   str  — email of the assignee (optional)
    """
    try:
        from config.settings import settings, HEADERS

        title    = _render(params.get("title", "Workflow task"), context)
        due_date = (datetime.now(timezone.utc) + timedelta(
            days=int(params.get("due_days", 1))
        )).date().isoformat()

        task_payload = {
            "title":       title,
            "task_type":   params.get("task_type", "follow_up"),
            "priority":    params.get("priority", "medium"),
            "status":      "pending",
            "due_date":    due_date,
            "company_id":  company_id,
            "notes":       _render(params.get("notes", ""), context) or None,
            "assigned_to": params.get("assigned_to") or None,
            # Link to trigger entity if it has an id
            "related_entity_id":   context.get("id"),
            "related_entity_type": context.get("_entity_type"),
        }
        # Remove None values
        task_payload = {k: v for k, v in task_payload.items() if v is not None}

        resp = requests.post(
            settings.base44_tasks_url,
            json=task_payload,
            headers=HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        created = resp.json()
        logger.info("workflow executor: created task id=%s title=%s", created.get("id"), title)
        return {"status": "ok", "task_id": created.get("id"), "title": title}

    except Exception as e:
        logger.error("step_create_task failed: %s", e)
        return {"status": "error", "error": str(e)}


def step_send_alert(params: dict, context: dict, company_id: str) -> dict:
    """
    Send a notification via WhatsApp, Email, or SMS.

    params keys:
        channel   str  — whatsapp | email | sms
        recipient str  — phone number or email address
                         (supports {{field}} placeholders, e.g. {{phone}} or {{email}})
        message   str  — message body (supports {{field}} placeholders)
        subject   str  — email subject (email only)
    """
    try:
        channel   = params.get("channel", "email").lower()
        recipient = _render(params.get("recipient", ""), context)
        message   = _render(params.get("message", ""), context)

        if not recipient:
            return {"status": "skipped", "reason": "no recipient resolved"}
        if not message:
            return {"status": "skipped", "reason": "empty message"}

        if channel == "whatsapp":
            from alerts.channels.whatsapp import WhatsAppChannel
            ch = WhatsAppChannel()
            result = ch.send(recipient=recipient, message=message)
        elif channel == "sms":
            from alerts.channels.sms import SMSChannel
            ch = SMSChannel()
            result = ch.send(recipient=recipient, message=message)
        else:
            from alerts.channels.email import EmailChannel
            ch = EmailChannel()
            subject = _render(params.get("subject", "Notification from Newsconseen"), context)
            result  = ch.send(recipient=recipient, subject=subject, message=message)

        logger.info("workflow executor: alert sent channel=%s recipient=%s", channel, recipient)
        return {"status": "ok", "channel": channel, "recipient": recipient, **(result or {})}

    except Exception as e:
        logger.error("step_send_alert failed: %s", e)
        return {"status": "error", "error": str(e)}


def step_update_field(params: dict, context: dict, company_id: str) -> dict:
    """
    Update a field on the triggering entity.

    params keys:
        field     str  — field name to update (e.g. "status")
        value     str  — new value (supports {{field}} placeholders)
        entity_url str — Base44 URL for the entity type (uses context._entity_url if absent)
    """
    try:
        from config.settings import settings, HEADERS

        entity_id  = context.get("id")
        if not entity_id:
            return {"status": "skipped", "reason": "no entity id in trigger context"}

        entity_url = params.get("entity_url") or context.get("_entity_url")
        if not entity_url:
            return {"status": "skipped", "reason": "entity_url not configured for this step"}

        field = params.get("field")
        value = _render(str(params.get("value", "")), context)

        if not field:
            return {"status": "error", "error": "field param is required"}

        resp = requests.patch(
            f"{entity_url}/{entity_id}",
            json={field: value},
            headers=HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        logger.info(
            "workflow executor: updated %s.%s = %s for entity %s",
            context.get("_entity_type"), field, value, entity_id,
        )
        return {"status": "ok", "field": field, "value": value}

    except Exception as e:
        logger.error("step_update_field failed: %s", e)
        return {"status": "error", "error": str(e)}


def step_log_note(params: dict, context: dict, company_id: str) -> dict:
    """Write an audit log entry for the workflow action."""
    try:
        note = _render(params.get("note", "Workflow step executed"), context)
        logger.info("workflow log_note: company=%s note=%s", company_id, note)
        return {"status": "ok", "note": note}
    except Exception as e:
        return {"status": "error", "error": str(e)}


# ── Step dispatcher ────────────────────────────────────────────────────────────

STEP_EXECUTORS = {
    "create_task":  step_create_task,
    "send_alert":   step_send_alert,
    "update_field": step_update_field,
    "log_note":     step_log_note,
}


def execute_workflow(workflow: dict, trigger_context: dict) -> dict:
    """
    Execute all steps of a workflow definition in order.

    Returns a run result dict with per-step outcomes.
    """
    company_id = workflow.get("company_id", "")
    steps      = workflow.get("steps", [])
    results    = []

    for step in steps:
        step_type = step.get("type")
        executor  = STEP_EXECUTORS.get(step_type)
        if not executor:
            results.append({
                "step_id": step.get("step_id"),
                "type":    step_type,
                "status":  "skipped",
                "reason":  f"unknown step type: {step_type}",
            })
            continue

        try:
            outcome = executor(
                params=step.get("params", {}),
                context=trigger_context,
                company_id=company_id,
            )
        except Exception as e:
            outcome = {"status": "error", "error": str(e)}

        results.append({
            "step_id": step.get("step_id"),
            "label":   step.get("label", step_type),
            "type":    step_type,
            **outcome,
        })

        # Stop on hard failure
        if outcome.get("status") == "error" and step.get("stop_on_error", False):
            break

    overall = "completed"
    if any(r.get("status") == "error" for r in results):
        overall = "completed_with_errors"

    return {
        "status":       overall,
        "steps_run":    len(results),
        "step_results": results,
        "executed_at":  _now_iso(),
    }
