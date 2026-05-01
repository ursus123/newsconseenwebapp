"""
python_layer/copilot/action_tools.py
=====================================
Copilot propose/write-back tools.

propose_* tools → submit to analytics.agent_approvals (approval gate).
                  Nothing is created until the operator approves.

write_insight   → writes immediately to Base44 Insights or analytics.copilot_insights.
"""

import json as _json
import logging
import uuid
from datetime import datetime
from typing import Optional

from database import get_engine_safe
from sqlalchemy import text

logger = logging.getLogger(__name__)


def _submit_proposal(
    company_id: str,
    action_type: str,
    action_label: str,
    payload: dict,
    reasoning: str,
) -> dict:
    """Submit a proposal through the approval gate. Returns approval_id + status."""
    try:
        from agents.approval_gate import submit_action
        engine = get_engine_safe()
        if not engine:
            return {"status": "unavailable", "approval_id": None}
        return submit_action(
            engine=engine,
            company_id=company_id,
            agent_name="copilot",
            action_type=action_type,
            action_label=action_label,
            action_payload=payload,
            reasoning=reasoning,
        )
    except Exception as e:
        logger.warning("_submit_proposal via approval_gate failed: %s — using direct insert", e)

    # Direct insert fallback if approval_gate import fails
    approval_id = str(uuid.uuid4())
    try:
        engine = get_engine_safe()
        if engine:
            with engine.connect() as conn:
                conn.execute(text("""
                    INSERT INTO analytics.agent_approvals
                        (id, company_id, agent_name, action_type, action_label,
                         action_payload, risk_level, reasoning, status, created_at)
                    VALUES
                        (:id, :company_id, 'copilot', :action_type, :action_label,
                         :payload::jsonb, 'approve', :reasoning, 'pending', NOW())
                    ON CONFLICT (id) DO NOTHING
                """), {
                    "id":          approval_id,
                    "company_id":  company_id,
                    "action_type": action_type,
                    "action_label": action_label,
                    "payload":     _json.dumps(payload),
                    "reasoning":   reasoning,
                })
                conn.commit()
        return {"status": "pending", "approval_id": approval_id}
    except Exception as e2:
        logger.warning("_submit_proposal direct insert also failed: %s", e2)
        return {"status": "error", "approval_id": None, "error": str(e2)}


# ─── Propose tools ────────────────────────────────────────────────────────────

def propose_task(
    company_id: str,
    title: str,
    description: str,
    assigned_to: Optional[str] = None,
    due_date: Optional[str] = None,
    related_entity_type: Optional[str] = None,
    related_entity_id: Optional[str] = None,
    rationale: Optional[str] = None,
    evidence: Optional[list] = None,
) -> dict:
    """
    Propose creating a new task for operator approval.
    The task is NOT created until approved. Use for follow-ups, reviews, escalations.
    """
    payload = {
        "title":               title,
        "description":         description,
        "assigned_to":         assigned_to,
        "due_date":            due_date,
        "related_entity_type": related_entity_type,
        "related_entity_id":   related_entity_id,
        "evidence":            evidence or [],
        "entity":              "task",
        "source":              "copilot",
    }
    result = _submit_proposal(
        company_id=company_id,
        action_type="create_task",
        action_label=f"Create task: {title}",
        payload=payload,
        reasoning=rationale or description[:200],
    )
    return {
        "action_type":  "create_task",
        "title":        title,
        "description":  description,
        "assigned_to":  assigned_to,
        "due_date":     due_date,
        "rationale":    rationale,
        "evidence":     evidence or [],
        "approval_id":  result.get("approval_id"),
        "status":       result.get("status", "pending"),
        "message":      f"Task '{title}' proposed for approval.",
    }


def propose_chart(
    company_id: str,
    title: str,
    metric: str,
    entity_type: str,
    chart_type: str = "bar",
    filters: Optional[dict] = None,
    group_by: Optional[str] = None,
    date_range: Optional[str] = None,
    rationale: Optional[str] = None,
) -> dict:
    """
    Propose a chart or visualization. Returns a preview config for immediate display.
    chart_type: "bar" | "line" | "area" | "pie"
    """
    payload = {
        "title":       title,
        "metric":      metric,
        "entity_type": entity_type,
        "chart_type":  chart_type,
        "filters":     filters or {},
        "group_by":    group_by,
        "date_range":  date_range,
        "entity":      "chart",
        "source":      "copilot",
    }
    result = _submit_proposal(
        company_id=company_id,
        action_type="create_chart",
        action_label=f"Create chart: {title}",
        payload=payload,
        reasoning=rationale or f"Chart to visualise {metric} for {entity_type}",
    )
    return {
        "action_type": "create_chart",
        "title":       title,
        "metric":      metric,
        "entity_type": entity_type,
        "chart_type":  chart_type,
        "rationale":   rationale,
        "approval_id": result.get("approval_id"),
        "status":      result.get("status", "pending"),
        "preview":     {"type": chart_type, "title": title, "metric": metric,
                        "entity_type": entity_type, "proposed": True},
        "message":     f"Chart '{title}' proposed.",
    }


def propose_report(
    company_id: str,
    title: str,
    sections: Optional[list] = None,
    narrative: Optional[str] = None,
    rationale: Optional[str] = None,
) -> dict:
    """
    Propose generating a structured report for operator approval.
    sections: list of section dicts with title + content/charts.
    """
    payload = {
        "title":     title,
        "sections":  sections or [],
        "narrative": narrative,
        "entity":    "report",
        "source":    "copilot",
    }
    result = _submit_proposal(
        company_id=company_id,
        action_type="create_report",
        action_label=f"Create report: {title}",
        payload=payload,
        reasoning=rationale or f"Report requested: {title}",
    )
    return {
        "action_type": "create_report",
        "title":       title,
        "sections":    sections or [],
        "rationale":   rationale,
        "approval_id": result.get("approval_id"),
        "status":      result.get("status", "pending"),
        "message":     f"Report '{title}' proposed.",
    }


def propose_record_update(
    company_id: str,
    entity_type: str,
    entity_id: str,
    patch: dict,
    rationale: Optional[str] = None,
) -> dict:
    """
    Propose updating fields on an existing record. Requires operator approval.
    patch: dict of {field_name: new_value}.
    """
    payload = {
        "entity_type": entity_type,
        "entity_id":   entity_id,
        "patch":       patch,
        "entity":      entity_type,
        "source":      "copilot",
    }
    result = _submit_proposal(
        company_id=company_id,
        action_type="update_record",
        action_label=f"Update {entity_type} {entity_id[:12]}: {', '.join(patch.keys())}",
        payload=payload,
        reasoning=rationale or f"Field update proposed for {entity_type} {entity_id}",
    )
    return {
        "action_type": "update_record",
        "entity_type": entity_type,
        "entity_id":   entity_id,
        "patch":       patch,
        "rationale":   rationale,
        "approval_id": result.get("approval_id"),
        "status":      result.get("status", "pending"),
        "message":     f"Update to {entity_type} proposed for approval.",
    }


# ─── Insight write-back ───────────────────────────────────────────────────────

def write_insight(
    company_id: str,
    insight_type: str,
    title: str,
    body: str,
    subject_type: Optional[str] = None,
    subject_id: Optional[str] = None,
    evidence: Optional[list] = None,
) -> dict:
    """
    Write a new insight to the intelligence layer immediately (no approval required).
    Use when you derive a meaningful conclusion from data that should be stored
    for future reference: trend explanation, anomaly finding, risk conclusion, forecast.
    insight_type: "explanation" | "trend" | "anomaly" | "correlation" | "forecast" | "risk_finding"
    """
    from config.settings import settings

    insight_id = str(uuid.uuid4())
    record = {
        "id":           insight_id,
        "company_id":   company_id,
        "insight_type": insight_type,
        "title":        title,
        "body":         body,
        "subject_type": subject_type,
        "subject_id":   subject_id,
        "evidence":     evidence or [],
        "status":       "active",
        "source":       "copilot",
        "created_at":   datetime.utcnow().isoformat(),
    }

    # Try Base44 Insights entity first
    url = getattr(settings, "base44_insights_url", None)
    if url:
        try:
            import httpx
            headers = {"api_key": settings.base44_api_key, "Content-Type": "application/json"}
            r = httpx.post(url, json=record, headers=headers, timeout=10)
            if r.status_code in (200, 201):
                logger.info("write_insight: wrote to Base44 insight_id=%s", insight_id)
                return {"status": "created", "insight_id": insight_id,
                        "insight": record, "storage": "base44"}
        except Exception as e:
            logger.warning("write_insight Base44 failed: %s", e)

    # Fall back to local analytics.copilot_insights
    try:
        engine = get_engine_safe()
        if engine:
            with engine.connect() as conn:
                conn.execute(text("""
                    INSERT INTO analytics.copilot_insights
                        (id, company_id, insight_type, title, body,
                         subject_type, subject_id, evidence, status, source, created_at)
                    VALUES
                        (:id, :company_id, :insight_type, :title, :body,
                         :subject_type, :subject_id, :evidence::jsonb, :status, :source, NOW())
                    ON CONFLICT (id) DO NOTHING
                """), {
                    "id":           insight_id,
                    "company_id":   company_id,
                    "insight_type": insight_type,
                    "title":        title,
                    "body":         body,
                    "subject_type": subject_type,
                    "subject_id":   subject_id,
                    "evidence":     _json.dumps(evidence or []),
                    "status":       "active",
                    "source":       "copilot",
                })
                conn.commit()
            logger.info("write_insight: wrote to local analytics insight_id=%s", insight_id)
            return {"status": "created", "insight_id": insight_id,
                    "insight": record, "storage": "local"}
    except Exception as e:
        logger.warning("write_insight local fallback failed: %s", e)

    return {"status": "failed", "insight_id": insight_id,
            "error": "Neither Base44 nor local DB available"}
