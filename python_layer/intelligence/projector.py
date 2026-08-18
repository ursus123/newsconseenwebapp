"""Safe legacy-record adapters for ``intelligence-item.v1``."""

import json
from typing import Any

from intelligence.contracts import (
    AdvisorParticipation,
    AuthorizedReference,
    EvidenceReference,
    IntelligenceInboxEnvelope,
    IntelligenceItem,
    IntelligenceSource,
    LifecycleTimestamps,
)


SOURCE_ALIASES = {
    "rule": "deterministic_rule", "rules": "deterministic_rule",
    "analytics": "analytical_calculation", "analysis": "analytical_calculation", "report": "analytical_calculation",
    "ml": "machine_learning_model", "ml_model": "machine_learning_model", "forecast": "machine_learning_model",
    "agent": "governed_agent", "external": "external_observation", "enrichment_api": "external_observation",
    "data_quality": "data_quality_detector", "graph_quality": "data_quality_detector",
    "idjwi": "idjwi_core_reasoning", "idjwi_core": "idjwi_core_reasoning", "ai": "idjwi_core_reasoning",
    "advisor": "tenant_llm_advisor", "llm": "tenant_llm_advisor",
    "manual": "human_operator_report", "operator": "human_operator_report", "human": "human_operator_report",
}

SOURCE_POLICY = {
    "deterministic_rule": ("deterministic_finding", "derived"),
    "analytical_calculation": ("analytical_finding", "derived"),
    "machine_learning_model": ("predictive_finding", "derived"),
    "governed_agent": ("analytical_finding", "derived"),
    "external_observation": ("external_finding", "evidence"),
    "data_quality_detector": ("deterministic_finding", "derived"),
    "idjwi_core_reasoning": ("idjwi_validated_finding", "derived"),
    "tenant_llm_advisor": ("advisor_proposal", "proposal"),
    "human_operator_report": ("operator_report", "operator"),
}

SAFE_PROVENANCE_FIELDS = ("source_run_id", "model_id", "model_version", "rule_id", "retrieved_at", "created_at")


def _value(row: dict, *names, default=None):
    for name in names:
        if row.get(name) not in (None, ""):
            return row[name]
    return default


def _json_list(value: Any) -> list:
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except (TypeError, ValueError):
            return []
    return []


def _source(row: dict) -> IntelligenceSource:
    raw = str(_value(row, "source_type", "source", default="idjwi_core")).lower().replace("-", "_")
    source_type = SOURCE_ALIASES.get(raw, "idjwi_core_reasoning")
    assertion_class, authority = SOURCE_POLICY[source_type]
    return IntelligenceSource(
        type=source_type,
        id=str(_value(row, "source_id", "source_run_id", "model_id", "rule_id", default=raw)),
        label=_value(row, "source_label", "source"),
        assertion_class=assertion_class,
        authority=authority,
        model_version=_value(row, "model_version"),
    )


def _evidence(row: dict) -> list[EvidenceReference]:
    safe = []
    for index, item in enumerate(_json_list(row.get("evidence"))):
        if not isinstance(item, dict):
            continue
        safe.append(EvidenceReference(
            id=str(_value(item, "id", "record_id", default=f"evidence-{index}")),
            type=str(_value(item, "type", default="record")),
            label=_value(item, "label", "summary"),
            source=_value(item, "source"),
            observed_at=_value(item, "observed_at", "created_at"),
        ))
    return safe


def project_item(row: dict, object_type: str, company_id: str, principal: dict, policy=None) -> IntelligenceItem:
    source = _source(row)
    item_type = {
        "insight": "prediction" if row.get("insight_type") == "forecast" else "finding",
        "risk": "risk", "opportunity": "opportunity", "recommendation": "recommendation",
    }[object_type]
    record_id = str(_value(row, "id", default="unknown"))
    subject_type = _value(row, "subject_type")
    subject_id = _value(row, "subject_id")
    related = []
    if subject_type and subject_id:
        related.append(AuthorizedReference(type=str(subject_type), id=str(subject_id), label=_value(row, "subject_name")))
    advisor = AdvisorParticipation()
    if source.type == "tenant_llm_advisor":
        advisor = AdvisorParticipation(
            state="consulted" if row.get("advisor_contribution_proven") else "requested",
            advisor_ids=[source.id],
            contribution_proven=bool(row.get("advisor_contribution_proven")),
        )
    detected_at = _value(row, "detected_at", "created_at")
    item_id = f"{object_type}:{record_id}"
    permissions = ["intelligence.read"]
    if item_type == "recommendation":
        permissions.append("intelligence.decide")
    safe_context = {
        "contract": "intelligence-item.v1",
        "item_id": item_id,
        "tenant_id": company_id,
        "intelligence_type": item_type,
        "source_type": source.type,
        "assertion_class": source.assertion_class,
        "evidence_ids": [e.id for e in _evidence(row)],
    }
    permitted_actions = policy.permitted_actions(row) if policy else []
    required_permissions = sorted({action["permission"] for action in permitted_actions}) or permissions
    return IntelligenceItem(
        id=item_id,
        tenant_id=company_id,
        organization_id=str(_value(row, "organization_id", default=company_id)),
        operational_unit_id=_value(row, "operational_unit_id"),
        affected_scope={"type": "record" if related else "organization", "references": [r.model_dump() for r in related]},
        intelligence_type=item_type,
        subtype=_value(row, "insight_type", "category", "type", "action_type"),
        title=str(_value(row, "title", "name", default="Untitled finding")),
        explanation=str(_value(row, "plain_language_explanation", "body", "description", "rationale", default="No explanation supplied.")),
        severity=str(_value(row, "severity", default="medium")).lower() if str(_value(row, "severity", default="medium")).lower() in {"low", "medium", "high", "critical"} else "medium",
        priority=str(_value(row, "priority", "severity", default="medium")).lower() if str(_value(row, "priority", "severity", default="medium")).lower() in {"low", "medium", "high", "critical"} else "medium",
        operational_impact=_value(row, "operational_impact", "estimated_impact", "business_consequence", "mitigation"),
        source=source,
        evidence=_evidence(row),
        provenance={key: row[key] for key in SAFE_PROVENANCE_FIELDS if row.get(key) is not None},
        confidence=row.get("confidence") if isinstance(row.get("confidence"), (int, float)) else None,
        uncertainty=_value(row, "uncertainty", "confidence_explanation"),
        freshness={"observed_at": detected_at, "stale": bool(row.get("stale", False))},
        expires_at=_value(row, "expires_at"),
        status=str(_value(row, "status", default="new")),
        lifecycle=LifecycleTimestamps(
            detected_at=detected_at, validated_at=_value(row, "validated_at"), assigned_at=_value(row, "assigned_at"),
            investigated_at=_value(row, "investigated_at", "acknowledged_at"), decided_at=_value(row, "decided_at"),
            approved_at=_value(row, "approved_at"), actioned_at=_value(row, "actioned_at"),
            outcome_observed_at=_value(row, "outcome_observed_at"), resolved_at=_value(row, "resolved_at"),
            reopened_at=_value(row, "reopened_at"),
        ),
        owner=AuthorizedReference(type="user", id=str(row["owner_id"]), label=_value(row, "owner_name")) if row.get("owner_id") else None,
        eligible_actors=[], required_permissions=required_permissions, permitted_actions=permitted_actions,
        recommended_next_action={
            "type": _value(row, "action_type", default="investigate"),
            "explanation": _value(row, "recommended_next_action", "mitigation", "rationale"),
            "approval_required": bool(row.get("approval_required", item_type == "recommendation")),
        },
        approval={"required": bool(row.get("approval_required", item_type == "recommendation")), "status": _value(row, "approval_status")},
        related_records=related, graph_relationships=[], idjwi_context=safe_context,
        advisor=advisor, contradictions=[], outcome_history=[], resolution_history=[],
        audit_context={**safe_context, "event_type": "intelligence.item.projected", "actor_id": principal.get("id")},
    )


def build_envelope(company_id: str, principal: dict, collections: dict[str, list], limit: int, policy=None) -> IntelligenceInboxEnvelope:
    items = []
    for object_type in ("insight", "risk", "opportunity", "recommendation"):
        authorized_rows = []
        for row in collections.get(object_type, []):
            if policy and not policy.can_read_row(row):
                continue
            authorized_rows.append(policy.redact_evidence(row) if policy else row)
        for row in authorized_rows[:limit]:
            items.append(project_item(row, object_type, company_id, principal, policy=policy))
    context = {
        "contract": "intelligence-inbox.v1", "item_contract": "intelligence-item.v1",
        "tenant_id": company_id, "item_ids": [item.id for item in items],
    }
    summary = {
        "total_items": len(items),
        "new_findings": sum(1 for item in items if item.intelligence_type in {"finding", "prediction"} and item.status == "new"),
        "open_risks": sum(1 for item in items if item.intelligence_type == "risk" and item.status in {"open", "acknowledged"}),
        "active_opportunities": sum(1 for item in items if item.intelligence_type == "opportunity" and item.status in {"identified", "evaluating", "pursuing"}),
        "pending_recommendations": sum(1 for item in items if item.intelligence_type == "recommendation" and item.status == "proposed"),
    }
    fingerprint = policy.fingerprint() if policy else "unscoped-test"
    permissions = list(policy.permissions) if policy else []
    scope = {
        "type": policy.context.scope_type if policy else "organization",
        "id": policy.context.scope_id if policy else company_id,
    }
    return IntelligenceInboxEnvelope(
        tenant_id=company_id, organization_id=company_id, items=items,
        state="available" if items else "empty", summary=summary,
        idjwi_context=context,
        audit_context={**context, "event_type": "intelligence.inbox.read", "actor_id": principal.get("id")},
        authorization={
            "policy_version": "intelligence-policy.v1",
            "fingerprint": fingerprint,
            "role": policy.context.role if policy else principal.get("role"),
            "scope": scope,
            "permissions": permissions,
        },
        delivery={
            "mode": "authorized_pull",
            "realtime_enabled": False,
            "authorization_fingerprint": fingerprint,
            "reason": "Direct table broadcasts are prohibited; updates are re-fetched through the authorized endpoint.",
        },
    )


def build_canonical_envelope(company_id: str, principal: dict, canonical_items: list[IntelligenceItem], limit: int, policy) -> IntelligenceInboxEnvelope:
    """Authorize and present already-governed canonical records.

    Unlike ``build_envelope``, this function never projects raw, analytical, or
    legacy rows. It is the only projection used by the operational inbox.
    """
    items = []
    for stored in canonical_items:
        row = stored.model_dump(mode="json")
        row["company_id"] = stored.tenant_id
        if not policy.can_read_row(row):
            continue
        item = stored.model_copy(deep=True)
        item.permitted_actions = policy.permitted_actions(row)
        item.required_permissions = sorted({
            action["permission"] for action in item.permitted_actions if action.get("allowed")
        } | {"intelligence.read"})
        items.append(item)
        if len(items) >= limit:
            break
    context = {
        "contract": "intelligence-inbox.v1", "item_contract": "intelligence-item.v1",
        "tenant_id": company_id, "item_ids": [item.id for item in items],
        "canonical_repository": True,
    }
    summary = {
        "total_items": len(items),
        "new_findings": sum(item.intelligence_type in {"finding", "prediction"} and item.status in {"new", "detected"} for item in items),
        "open_risks": sum(item.intelligence_type == "risk" and item.status not in {"resolved", "closed"} for item in items),
        "active_opportunities": sum(item.intelligence_type == "opportunity" and item.status not in {"resolved", "closed"} for item in items),
        "pending_recommendations": sum(item.intelligence_type == "recommendation" and item.status in {"detected", "proposed"} for item in items),
    }
    fingerprint = policy.fingerprint()
    return IntelligenceInboxEnvelope(
        tenant_id=company_id, organization_id=company_id, items=items,
        state="available" if items else "empty", summary=summary,
        idjwi_context=context,
        audit_context={**context, "event_type": "intelligence.inbox.read", "actor_id": principal.get("id")},
        authorization={
            "policy_version": "intelligence-policy.v1", "fingerprint": fingerprint,
            "role": policy.context.role,
            "scope": {"type": policy.context.scope_type, "id": policy.context.scope_id},
            "permissions": list(policy.permissions),
        },
        delivery={
            "mode": "authorized_pull", "realtime_enabled": False,
            "authorization_fingerprint": fingerprint,
            "repository": "canonical_public_intelligence",
        },
    )
