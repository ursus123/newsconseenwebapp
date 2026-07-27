"""Evidence-backed Company Graph daily briefing.

The briefing is deterministic and provider-neutral. It explains only the
authorized packet and never turns an LLM proposal into operational truth.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from tenant_context.entity_registry import definition_for


BRIEFING_CONTRACT_VERSION = "company-graph-daily-briefing.v1"
_CLOSED = {"closed", "completed", "done", "resolved", "cancelled", "dismissed", "rejected"}


def _time(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc)
    except (TypeError, ValueError):
        return None


def _record_evidence(kind, row):
    try:
        source = definition_for(kind)[1].qualified_table
    except ValueError:
        source = f"public.{kind}"
    return {
        "evidence_id": f"{source}:{row.get('id')}",
        "source": source,
        "record_id": str(row.get("id")),
        "observed_at": row.get("updated_at") or row.get("created_at"),
    }


def _owner(row, context):
    return {
        "display_name": row.get("assigned_to_name") or row.get("owner_display_name") or "Authorized scope manager",
        "role": "record_owner" if row.get("assigned_to_name") or row.get("assigned_to_id") else context.role,
        "can_act": context.role in {"manager", "admin", "super_admin"} or bool(row.get("assigned_to_id")),
    }


def build_daily_briefing(*, context, records, nodes, edges, quality, completeness, truncation, generated_at):
    now = datetime.now(timezone.utc)
    changed_since = now - timedelta(hours=24)
    changes = []
    for kind, rows in records.items():
        if kind.startswith("graph_"):
            continue
        for row in rows:
            changed_at = _time(row.get("updated_at") or row.get("created_at"))
            if changed_at and changed_at >= changed_since:
                changes.append({
                    "record_type": kind,
                    "record_id": str(row.get("id")),
                    "label": row.get("title") or row.get("name") or row.get("enterprise_name") or f"{kind} record",
                    "changed_at": changed_at.isoformat(),
                    "change": "Created or updated in the last 24 hours",
                    "evidence": [_record_evidence(kind, row)],
                })
    changes.sort(key=lambda item: item["changed_at"], reverse=True)

    node_lookup = {node.id: node for node in nodes}
    priorities = []

    def add_priority(kind, row, severity, why, recommendation):
        node_id = f"{kind}:{row.get('id')}"
        incident = [edge for edge in edges if node_id in {edge.source, edge.target}]
        relationship_evidence = [{
            "edge_id": edge.id,
            "claim": (
                f"{node_lookup.get(edge.source).label if node_lookup.get(edge.source) else edge.source} "
                f"{edge.label or edge.predicate} "
                f"{node_lookup.get(edge.target).label if node_lookup.get(edge.target) else edge.target}"
            ),
            "predicate": edge.predicate,
            "evidence_ids": [evidence.evidence_id for evidence in edge.evidence],
            "confidence": edge.confidence,
            "verification_state": edge.verification_state,
        } for edge in incident[:4]]
        priorities.append({
            "priority_id": node_id,
            "type": kind,
            "record_id": str(row.get("id")),
            "title": row.get("title") or row.get("task_name") or f"{kind.replace('_', ' ').title()} requires attention",
            "severity": severity,
            "why_it_matters": why,
            "relationship_explanation": relationship_evidence,
            "uncertainty": (
                "Relationship evidence is incomplete or unverified."
                if any(item["verification_state"] != "verified" for item in relationship_evidence)
                else None
            ),
            "owner": _owner(row, context),
            "recommended_action": recommendation,
            "evidence": [_record_evidence(kind, row)],
            "workflow": {
                "recommendation_id": str(row.get("recommendation_id") or "") or None,
                "decision_id": str(row.get("decision_id") or "") or None,
                "approval_id": str(row.get("approval_id") or "") or None,
                "action_id": str(row.get("action_id") or "") or None,
                "task_id": str(row.get("created_task_id") or (row.get("id") if kind == "task" else "")) or None,
                "outcome": row.get("outcome"),
                "next_state": "recommendation" if kind not in {"recommendation", "decision", "action", "task"} else {
                    "recommendation": "decision_or_approval",
                    "decision": "approved_action",
                    "action": "task_or_agent_execution",
                    "task": "outcome",
                }.get(kind),
            },
        })

    for row in records.get("risk", []):
        if str(row.get("status") or "").lower() not in _CLOSED and row.get("severity") in {"critical", "high"}:
            add_priority("risk", row, row.get("severity"), "A high-consequence risk is active in this scope.", "Review evidence, choose mitigation, and request approval if execution changes records.")
    for row in records.get("task", []):
        status = str(row.get("status") or "").lower()
        due = _time(row.get("due_date"))
        if status not in _CLOSED and (row.get("priority") in {"urgent", "high"} or (due and due < now)):
            add_priority("task", row, "critical" if due and due < now else "warning", "Urgent or overdue work can affect today's operation.", "Confirm ownership and complete, reassign, or escalate the task.")
    for row in records.get("recommendation", []):
        if not row.get("is_actioned") and not row.get("is_dismissed"):
            add_priority("recommendation", row, row.get("priority") or "warning", "A governed recommendation is awaiting an operator decision.", "Review its evidence and approve, reject, or request clarification.")
    for row in records.get("decision", []):
        if not row.get("outcome") and not row.get("decided_at"):
            add_priority("decision", row, "warning", "A decision is waiting for an authorized outcome.", "Record the decision or route it to the authorized approver.")
    priorities.sort(key=lambda item: ({"critical": 0, "high": 1, "warning": 2}.get(item["severity"], 3), item["priority_id"]))

    uncertainties = []
    for source in completeness.diagnostics.source_availability.affected_sources:
        uncertainties.append({"type": "source", "source": source, "explanation": "A governed source is unavailable or partial."})
    if truncation.truncated:
        uncertainties.append({"type": "bounded_context", "explanation": f"{truncation.omitted_nodes} or more nodes were omitted by the bounded graph contract."})
    unverified = sum(edge.verification_state != "verified" for edge in edges)
    if unverified:
        uncertainties.append({"type": "relationship_verification", "count": unverified, "explanation": "Visible relationships require confirmation before high-impact action."})

    attention = [{
        "finding_code": issue.code,
        "severity": issue.severity,
        "count": issue.count,
        "message": issue.message,
        "suggested_action": issue.action,
    } for issue in quality.issues]

    return {
        "contract_version": BRIEFING_CONTRACT_VERSION,
        "generated_at": generated_at,
        "period": {"label": "today", "changed_since": changed_since.isoformat()},
        "headline": priorities[0]["title"] if priorities else "No critical operational priority is visible in this bounded scope.",
        "summary": f"{len(changes)} recent changes, {len(priorities)} operational priorities, and {sum(issue.count for issue in quality.issues)} graph-quality findings are visible.",
        "what_changed": changes[:12],
        "what_matters_today": priorities[:10],
        "uncertainties": uncertainties,
        "requires_attention": attention,
        "recommended_focus": priorities[0]["recommended_action"] if priorities else ("Repair graph-quality findings." if attention else "Continue monitoring governed changes."),
        "workflow_contract": ["evidence", "recommendation", "decision", "approval", "action", "task_or_agent_execution", "outcome"],
        "open_tasks": sum(str(row.get("status") or "").lower() not in _CLOSED for row in records.get("task", [])),
        "high_risks": sum(row.get("severity") in {"high", "critical"} and str(row.get("status") or "").lower() not in _CLOSED for row in records.get("risk", [])),
        "pending_recommendations": sum(not row.get("is_actioned") and not row.get("is_dismissed") for row in records.get("recommendation", [])),
        "quality_issues": sum(issue.count for issue in quality.issues),
    }
