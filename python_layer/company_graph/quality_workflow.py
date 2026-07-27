"""Governed graph-quality findings and repair-work projections."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone


QUALITY_CONTRACT_VERSION = "company-graph-quality-work.v1"

QUALITY_PLAYBOOK = {
    "UNCONNECTED_RECORDS": {
        "cause": "Authorized records have no visible governed relationship.",
        "consequence": "Idjwi cannot reliably explain dependencies, ownership, or operational impact.",
        "repair": "Review likely endpoints, record a proposal, and confirm or reject it with evidence.",
        "bulk": False,
    },
    "EXPIRED_RELATIONSHIPS": {
        "cause": "Relationship validity ended but the historical assertion remains visible.",
        "consequence": "Operators may rely on an obsolete responsibility or dependency.",
        "repair": "Review the replacement relationship or close dependent work.",
        "bulk": False,
    },
    "PARTIAL_SOURCES": {
        "cause": "One or more governed sources could not be read.",
        "consequence": "Briefings, graph explanations, and recommendations may omit relevant facts.",
        "repair": "Open Data Readiness, restore the failing source, and rerun the graph scan.",
        "bulk": True,
    },
    "TRUNCATED_SOURCES": {
        "cause": "The bounded request reached a source or global graph budget.",
        "consequence": "The overview is useful but cannot support claims about omitted records.",
        "repair": "Narrow the operational scope or continue through the governed continuation token.",
        "bulk": False,
    },
    "ASSERTION_GOVERNANCE_UNAVAILABLE": {
        "cause": "Durable relationship assertion history is unavailable.",
        "consequence": "Rejected proposals could be regenerated, so derived relationships are hidden.",
        "repair": "Restore graph assertion storage before reviewing derived relationship proposals.",
        "bulk": True,
    },
    "RELATIONSHIP_REGISTRY_GAPS": {
        "cause": "Relationship carrier records are missing endpoints required by the ontology registry.",
        "consequence": "Operational records appear disconnected and cross-object reasoning is incomplete.",
        "repair": "Correct endpoint references through a governed repair proposal.",
        "bulk": True,
    },
    "LEGACY_LINKS_REQUIRE_CONFIRMATION": {
        "cause": "Legacy labels were mapped to unique tenant records without a canonical identifier.",
        "consequence": "The relationship is plausible but not yet safe for high-impact action.",
        "repair": "Review evidence and confirm or reject each proposed relationship.",
        "bulk": False,
    },
}


def stable_finding_key(tenant_id: str, scope_id: str, issue_code: str) -> str:
    return hashlib.sha256(f"{tenant_id}|{scope_id}|{issue_code}".encode()).hexdigest()


def project_findings(packet, *, context, stored=(), history=()):
    stored_by_key = {row.get("finding_key"): row for row in stored}
    history_by_key = {}
    for event in history:
        history_by_key.setdefault(event.get("finding_key"), []).append(event)
    result = []
    active_keys = set()
    for issue in packet.quality.issues:
        key = stable_finding_key(context.tenant_id, str(packet.scope.id or context.tenant_id), issue.code)
        active_keys.add(key)
        playbook = QUALITY_PLAYBOOK.get(issue.code, {
            "cause": "The graph diagnostic contract identified an incomplete dimension.",
            "consequence": "Operational reasoning may be incomplete.",
            "repair": issue.action or "Review the affected records and evidence.",
            "bulk": False,
        })
        durable = stored_by_key.get(key, {})
        recurring = durable.get("status") == "resolved"
        evidence = [{
            "source": "company-graph.v1",
            "diagnostic": issue.code,
            "count": issue.count,
            "generated_at": packet.provenance.generated_at,
            "scope": packet.scope.model_dump(),
        }]
        result.append({
            "contract_version": QUALITY_CONTRACT_VERSION,
            "finding_key": key,
            "issue_code": issue.code,
            "severity": issue.severity,
            "affected_scope": packet.scope.model_dump(),
            "affected_count": issue.count,
            "cause": playbook["cause"],
            "business_consequence": playbook["consequence"],
            "owner": {
                "user_id": durable.get("owner_user_id"),
                "display_name": durable.get("owner_display_name") or ("Tenant administrator" if context.role in {"admin", "super_admin"} else "Operational-unit manager"),
            },
            "suggested_repair": playbook["repair"],
            "evidence": durable.get("evidence") or evidence,
            "bulk_repair_eligible": bool(playbook["bulk"]),
            "verification_status": "failed" if recurring else (durable.get("verification_status") or "unverified"),
            "status": "recurring" if recurring else (durable.get("status") or "open"),
            "task_id": durable.get("task_id"),
            "recommendation_id": durable.get("recommendation_id"),
            "alert_state": durable.get("alert_state") or ("open" if issue.severity == "critical" else "not_required"),
            "currently_detected": True,
            "resolution_history": sorted(
                history_by_key.get(key, []),
                key=lambda event: str(event.get("occurred_at") or ""),
            ),
            "operator_actions": [
                "open_data_readiness", "create_task", "create_recommendation",
                "acknowledge_alert", "mark_verified", "resolve",
            ],
        })
    for durable in stored:
        key = durable.get("finding_key")
        if not key or key in active_keys:
            continue
        scope_id = str(durable.get("scope_id") or "")
        if scope_id != str(packet.scope.id or context.tenant_id):
            continue
        result.append({
            "contract_version": QUALITY_CONTRACT_VERSION,
            "finding_key": key,
            "issue_code": durable.get("issue_code"),
            "severity": durable.get("severity") or "info",
            "affected_scope": {
                "type": durable.get("scope_type") or packet.scope.type,
                "id": scope_id,
                "name": packet.scope.name,
            },
            "affected_count": durable.get("affected_count") or 0,
            "cause": durable.get("cause") or "Previously detected graph-quality condition.",
            "business_consequence": durable.get("business_consequence") or "No current impact is detected.",
            "owner": {
                "user_id": durable.get("owner_user_id"),
                "display_name": durable.get("owner_display_name") or "Authorized scope manager",
            },
            "suggested_repair": durable.get("suggested_repair") or "Continue monitoring.",
            "evidence": durable.get("evidence") or [],
            "bulk_repair_eligible": bool(durable.get("bulk_repair_eligible")),
            "verification_status": durable.get("verification_status") or "unverified",
            "status": durable.get("status") or "resolved",
            "task_id": durable.get("task_id"),
            "recommendation_id": durable.get("recommendation_id"),
            "alert_state": durable.get("alert_state") or "closed",
            "resolution_history": sorted(
                history_by_key.get(key, []),
                key=lambda event: str(event.get("occurred_at") or ""),
            ),
            "operator_actions": ["reopen"],
            "currently_detected": False,
        })
    return sorted(result, key=lambda item: (
        {"critical": 0, "warning": 1, "info": 2}.get(item["severity"], 3),
        -item["affected_count"], item["issue_code"],
    ))


def finding_record(finding, *, context):
    now = datetime.now(timezone.utc).isoformat()
    return {
        "finding_key": finding["finding_key"],
        "issue_code": finding["issue_code"],
        "severity": finding["severity"],
        "scope_type": finding["affected_scope"].get("type"),
        "scope_id": finding["affected_scope"].get("id") or context.tenant_id,
        "affected_count": finding["affected_count"],
        "cause": finding["cause"],
        "business_consequence": finding["business_consequence"],
        "owner_user_id": finding["owner"].get("user_id"),
        "owner_display_name": finding["owner"].get("display_name"),
        "suggested_repair": finding["suggested_repair"],
        "evidence": finding["evidence"],
        "bulk_repair_eligible": finding["bulk_repair_eligible"],
        "verification_status": finding["verification_status"],
        "status": finding["status"],
        "alert_state": finding["alert_state"],
        "last_detected_at": now,
    }
