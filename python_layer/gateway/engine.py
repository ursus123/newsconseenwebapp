from __future__ import annotations

import re
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from gateway.contracts import ArtifactRequest, FieldCaptureSync, GatewayMessage, GatewayResponse

logger = logging.getLogger(__name__)


READ_ONLY_CHANNELS = {"sms"}
WRITE_KEYWORDS = ("create", "approve", "reject", "update", "delete", "send", "assign", "schedule")


AGENT_ROUTES = {
    "market": ["market_research_agent", "copilot"],
    "stock": ["inventory_agent", "copilot"],
    "inventory": ["inventory_agent", "copilot"],
    "incident": ["operations_agent", "compliance_agent", "copilot"],
    "risk": ["compliance_agent", "copilot"],
    "report": ["reports_agent", "copilot"],
    "chart": ["reports_agent", "copilot"],
    "import": ["import_data_agent", "copilot"],
    "attendance": ["operations_agent", "copilot"],
    "staff": ["operations_agent", "copilot"],
    "medication": ["compliance_agent", "operations_agent", "copilot"],
}


ARTIFACT_TEMPLATES = {
    "report": {
        "type": "report",
        "sections": ["summary", "evidence", "charts", "recommendations", "approval"],
        "save_as": "Report",
    },
    "chart": {
        "type": "chart",
        "requirements": ["title", "metric", "source_table", "date_range", "source_of_truth"],
        "save_as": "ReportChart",
    },
    "form": {
        "type": "form",
        "requirements": ["ontology_objects", "required_fields", "validation_rules", "offline_allowed"],
        "save_as": "Workflow",
    },
    "workflow": {
        "type": "workflow",
        "requirements": ["trigger", "steps", "approval_gate", "resulting_records"],
        "save_as": "Workflow",
    },
}


FIELD_CAPTURE_PROFILES = {
    "incidentreport": {
        "offline_allowed": True,
        "gps": "required",
        "media": "optional",
        "writes": ["Observation", "Risk", "Task", "Document"],
        "event_type": "incident_reported",
    },
    "fieldvisitreport": {
        "offline_allowed": True,
        "gps": "required",
        "media": "optional",
        "writes": ["Observation", "Opportunity", "Risk", "Task"],
        "event_type": "field_visit_completed",
    },
    "inspectionchecklist": {
        "offline_allowed": True,
        "gps": "optional",
        "media": "optional",
        "writes": ["Observation", "Risk", "Task", "Document"],
        "event_type": "inspection_completed",
    },
    "stockcounter": {
        "offline_allowed": True,
        "gps": "optional",
        "media": "optional",
        "writes": ["Observation", "Transaction", "Task"],
        "event_type": "stock_count_completed",
    },
    "medadmin": {
        "offline_allowed": False,
        "gps": "optional",
        "media": "optional",
        "writes": ["Observation", "Task", "Transaction", "Risk"],
        "event_type": "medication_administered",
    },
}

# Map write-type names → (settings url attr, ETL entity name)
# Risk and Opportunity have no standalone entity — they become Tasks with a specific task_type
_FC_ENTITY_MAP: Dict[str, tuple] = {
    "Task":        ("base44_tasks_url",         "task"),
    "Transaction": ("base44_transactions_url",  "transaction"),
    "Document":    ("base44_documents_url",     "document"),
    "Observation": ("base44_observations_url",  "observation"),
    "Signal":      ("base44_signals_url",       "signal"),
    "Risk":        ("base44_tasks_url",         "task"),
    "Opportunity": ("base44_tasks_url",         "task"),
}

_FC_TASK_TYPE_MAP: Dict[str, str] = {
    "Risk":        "risk_review",
    "Opportunity": "opportunity_follow_up",
}


def _session_id(existing: str | None) -> str:
    return existing or f"gw_{uuid4().hex}"


def classify_intent(text: str) -> str:
    q = text.lower()
    if any(k in q for k in ("report", "pdf", "presentation", "briefing")):
        return "artifact_report"
    if any(k in q for k in ("chart", "graph", "visualize", "plot")):
        return "artifact_chart"
    if any(k in q for k in ("form", "checklist", "capture")):
        return "artifact_form"
    if any(k in q for k in ("workflow", "playbook", "process")):
        return "workflow_design"
    if any(k in q for k in ("incident", "visit", "inspection", "field", "offline")):
        return "field_capture"
    if any(k in q for k in WRITE_KEYWORDS):
        return "action_request"
    return "question"


def route_agents(text: str) -> list[str]:
    q = text.lower()
    routed: list[str] = []
    for key, agents in AGENT_ROUTES.items():
        if key in q:
            routed.extend(agents)
    if not routed:
        routed = ["copilot"]
    return list(dict.fromkeys(routed))


def decompose_goal(message: GatewayMessage, intent: str) -> list[dict[str, Any]]:
    q = message.message
    return [
        {"step": "check_data_quality", "status": "planned", "tool": "dataquality.report"},
        {"step": "gather_context", "status": "planned", "tool": "company_graph + datamart + enrichment"},
        {"step": "route_to_agents", "status": "planned", "agents": route_agents(q)},
        {"step": "produce_evidence", "status": "planned", "output": "Insight.evidence"},
        {"step": "propose_actions", "status": "planned", "output": "Recommendation"},
        {"step": "request_approval", "status": "planned", "required": requires_approval(message, intent)},
    ]


def requires_approval(message: GatewayMessage, intent: str) -> bool:
    if message.dry_run:
        return True
    if message.channel.lower() in READ_ONLY_CHANNELS:
        return True
    return intent in {"action_request", "workflow_design", "artifact_form", "field_capture"}


def build_artifact_preview(req: ArtifactRequest) -> dict[str, Any]:
    template = ARTIFACT_TEMPLATES.get(req.artifact_type, ARTIFACT_TEMPLATES["report"])
    return {
        "id": f"artifact_{uuid4().hex}",
        "title": req.title,
        "artifact_type": req.artifact_type,
        "template": template,
        "status": "preview",
        "source_context": req.source_context,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def _build_field_capture_payload(
    company_id: str,
    entity_type: str,
    record: dict,
    app_id: str,
    event_type: str,
) -> dict:
    """Build a Base44-ready payload from a raw field capture record."""
    now_iso = datetime.now(timezone.utc).isoformat()
    task_type_override = _FC_TASK_TYPE_MAP.get(entity_type)
    resolved = "Task" if task_type_override else entity_type

    base: dict = {
        "company_id": company_id,
        "notes": record.get("notes", f"Synced via {app_id} field capture at {now_iso[:10]}"),
    }

    if resolved == "Task":
        payload = {
            **base,
            "title":       record.get("title") or record.get("description") or f"Field capture: {app_id}",
            "task_type":   task_type_override or record.get("task_type", "field_visit"),
            "status":      record.get("status", "completed"),
            "description": record.get("description", ""),
            "outcome":     record.get("outcome", ""),
            "latitude":    record.get("latitude"),
            "longitude":   record.get("longitude"),
        }
    elif resolved == "Transaction":
        payload = {
            **base,
            "transaction_type": record.get("transaction_type", "payment"),
            "amount":           record.get("amount", 0),
            "currency":         record.get("currency", "USD"),
            "status":           record.get("status", "completed"),
            "description":      record.get("description", ""),
            "reference_number": record.get("reference_number", ""),
        }
    elif resolved == "Document":
        payload = {
            **base,
            "title":         record.get("title") or f"Field report: {app_id}",
            "document_type": record.get("document_type", "other"),
            "status":        "draft",
            "description":   record.get("description", ""),
            "file_url":      record.get("file_url") or record.get("media_url", ""),
            "created_date":  now_iso[:10],
        }
    elif resolved == "Observation":
        payload = {
            **base,
            "observation_type": record.get("observation_type", "field_reading"),
            "subject_type":     record.get("subject_type", "enterprise"),
            "subject_id":       record.get("subject_id", ""),
            "numeric_value":    record.get("numeric_value"),
            "text_value":       record.get("text_value") or record.get("description", ""),
            "unit_of_measure":  record.get("unit_of_measure", ""),
            "is_anomaly":       record.get("is_anomaly", False),
            "observed_at":      record.get("observed_at", now_iso),
            "latitude":         record.get("latitude"),
            "longitude":        record.get("longitude"),
        }
    elif resolved == "Signal":
        payload = {
            **base,
            "name":            record.get("name") or f"Field signal: {app_id}",
            "signal_type":     record.get("signal_type", "manual"),
            "status":          "active",
            "value":           record.get("value"),
            "unit_of_measure": record.get("unit_of_measure", "unit"),
            "recorded_at":     record.get("recorded_at", now_iso),
            "is_anomaly":      record.get("is_anomaly", False),
        }
    else:
        payload = {**base, **{k: v for k, v in record.items() if k != "local_id"}}

    return {k: v for k, v in payload.items() if v is not None and v != ""}


def sync_field_capture(req: FieldCaptureSync) -> dict[str, Any]:
    """
    Sync offline field capture records to Base44 ontology entities.
    Each record is routed to the correct entity type (Task, Observation, Transaction,
    Document, Signal) based on the app profile and an optional per-record entity_type override.
    """
    from config.settings import settings
    try:
        from agents.action_executor import _post_base44, _fire_etl
    except Exception as _imp_err:
        logger.warning("sync_field_capture: action_executor unavailable — %s", _imp_err)
        _post_base44 = None
        _fire_etl = None

    profile    = FIELD_CAPTURE_PROFILES.get(req.app_id, {})
    writes     = profile.get("writes", ["Task"])
    event_type = profile.get("event_type", f"{req.app_id}.synced")

    accepted: List[Dict[str, Any]] = []
    rejected: List[Dict[str, Any]] = []

    for record in req.records:
        if not record.get("local_id"):
            rejected.append({"record": record, "reason": "missing local_id"})
            continue

        entity_type = record.get("entity_type") or writes[0]
        url_attr, etl_name = _FC_ENTITY_MAP.get(entity_type, ("base44_tasks_url", "task"))
        url = getattr(settings, url_attr, None)

        if not url or _post_base44 is None:
            accepted.append({
                "local_id":   record["local_id"],
                "status":     "queued",
                "entity_type": entity_type.lower(),
                "reason":     f"{url_attr} not configured" if not url else "executor unavailable",
                "event_type": event_type,
            })
            continue

        try:
            payload = _build_field_capture_payload(
                company_id=req.company_id,
                entity_type=entity_type,
                record=record,
                app_id=req.app_id,
                event_type=event_type,
            )
            created = _post_base44(url, payload)
            _fire_etl(etl_name)
            accepted.append({
                "local_id":   record["local_id"],
                "status":     "synced",
                "entity_type": entity_type.lower(),
                "entity_id":  created.get("id"),
                "event_type": event_type,
            })
        except Exception as exc:
            logger.warning("sync_field_capture %s/%s failed: %s", req.app_id, entity_type, exc)
            accepted.append({
                "local_id":   record["local_id"],
                "status":     "queued",
                "entity_type": entity_type.lower(),
                "reason":     str(exc),
                "event_type": event_type,
            })

    synced = len([a for a in accepted if a.get("status") == "synced"])
    queued = len([a for a in accepted if a.get("status") == "queued"])
    return {
        "company_id": req.company_id,
        "app_id":     req.app_id,
        "profile":    profile,
        "accepted":   accepted,
        "rejected":   rejected,
        "synced":     synced,
        "queued":     queued,
        "count":      synced,
    }


def answer_gateway_message(message: GatewayMessage) -> GatewayResponse:
    intent = classify_intent(message.message)
    plan = decompose_goal(message, intent)
    routed = route_agents(message.message)
    approval = requires_approval(message, intent)

    artifacts: List[Dict[str, Any]] = []
    proposed_actions: List[Dict[str, Any]] = []
    evidence: List[Dict[str, Any]] = [{"source": "gateway", "label": "message", "value": message.message[:240]}]

    # ── Route to copilot for data/analytics/conversational intents ─────────────
    answer = ""
    if intent in {"data_query", "analysis", "question", "unknown"}:
        try:
            import asyncio
            from copilot.engine import ask as copilot_ask
            history = [{"role": r["role"], "content": r["content"]}
                       for r in (message.context.get("history") or [])]
            answer = asyncio.get_event_loop().run_until_complete(
                copilot_ask(message.message, message.company_id, history)
            )
            evidence.append({"source": "copilot", "label": "grounded_answer", "value": answer[:300]})
        except RuntimeError:
            # No event loop — use sync fallback
            try:
                import asyncio
                loop = asyncio.new_event_loop()
                answer = loop.run_until_complete(
                    copilot_ask(message.message, message.company_id, [])
                )
                loop.close()
            except Exception as _e:
                answer = f"Copilot unavailable: {_e}"
        except Exception as _e:
            answer = f"Could not route to copilot: {_e}"

    # ── Artifact preview ────────────────────────────────────────────────────────
    if intent.startswith("artifact_"):
        artifact_type = intent.replace("artifact_", "")
        artifacts.append(build_artifact_preview(ArtifactRequest(
            company_id=message.company_id,
            artifact_type=artifact_type,
            title=_title_from_message(message.message, artifact_type),
            source_context=message.context,
        )))
        answer = answer or f"Artifact preview ready for: {artifact_type}"

    # ── Write intents → propose as Recommendation ───────────────────────────────
    if intent in {"action_request", "workflow_design", "field_capture"}:
        title = _title_from_message(message.message, "action")
        proposed_actions.append({
            "action_type": "create_recommendation",
            "title": title,
            "status": "proposed",
            "approval_required": True,
            "payload": {"message": message.message, "context": message.context},
        })
        if not message.dry_run:
            try:
                from copilot.action_tools import write_recommendation
                write_recommendation(
                    company_id=message.company_id,
                    title=title,
                    description=message.message,
                    action_type="gateway_action",
                    source_agent=f"gateway:{message.channel}",
                    priority="medium",
                    approval_required=True,
                )
            except Exception:
                pass
        answer = answer or (
            "I've noted this as a proposed action. "
            "It will appear in the Approval Gate for your review before anything is changed."
        )

    if not answer:
        answer = (
            "Message received via the Newsconseen Gateway. "
            "State what you'd like to know or do and I'll route it to the right agent."
        )

    return GatewayResponse(
        session_id=_session_id(message.session_id),
        channel=message.channel,
        intent=intent,
        answer=answer,
        plan=plan,
        artifacts=artifacts,
        proposed_actions=proposed_actions,
        approval_required=approval,
        routed_to=routed,
        evidence=evidence,
        data_quality={"status": "ok" if intent in {"data_query", "analysis", "question"} else "required_before_answer"},
    )


def _title_from_message(text: str, fallback: str) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if not compact:
        return fallback.title()
    return compact[:80]
