"""Registry-driven adapters from intelligence sources to intelligence-item.v1."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from intelligence.contracts import (
    AdvisorParticipation, AuthorizedReference, EvidenceReference, IntelligenceItem,
    IntelligenceSource, LifecycleTimestamps,
)


SOURCE_ADAPTERS: dict[str, Callable] = {}


def register_adapter(*names: str):
    def decorate(function):
        for name in names:
            SOURCE_ADAPTERS[name] = function
        return function
    return decorate


SOURCE_POLICY = {
    "rules_thresholds": ("deterministic_rule", "deterministic_finding", "derived"),
    "analytics": ("analytical_calculation", "analytical_finding", "derived"),
    "ml_prediction": ("machine_learning_model", "predictive_finding", "derived"),
    "agents": ("governed_agent", "analytical_finding", "derived"),
    "alerts": ("deterministic_rule", "deterministic_finding", "derived"),
    "graph_quality": ("data_quality_detector", "deterministic_finding", "derived"),
    "external_observation": ("external_observation", "external_finding", "evidence"),
    "idjwi_recommendation": ("idjwi_core_reasoning", "idjwi_validated_finding", "derived"),
    "advisor_proposal": ("tenant_llm_advisor", "advisor_proposal", "proposal"),
    "failed_workflow_action": ("governed_agent", "deterministic_finding", "derived"),
}


def _level(value, default="medium"):
    value = str(value or default).lower()
    return value if value in {"low", "medium", "high", "critical"} else default


def _refs(payload, key="related_records"):
    refs = []
    for value in payload.get(key) or []:
        if isinstance(value, dict) and value.get("type") and value.get("id"):
            refs.append(AuthorizedReference(**{field: value.get(field) for field in ("type", "id", "label", "relationship")}))
    return refs


def _evidence(payload):
    values = []
    for index, value in enumerate(payload.get("evidence") or []):
        if not isinstance(value, dict):
            continue
        values.append(EvidenceReference(
            id=str(value.get("id") or value.get("record_id") or f"evidence-{index}"),
            type=str(value.get("type") or "record"), label=value.get("label") or value.get("summary"),
            source=value.get("source"), observed_at=value.get("observed_at"),
        ))
    return values


def _adapt(kind: str, payload: dict, context: dict) -> IntelligenceItem:
    source_type, assertion_class, authority = SOURCE_POLICY[kind]
    now = str(payload.get("detected_at") or payload.get("observed_at") or datetime.now(timezone.utc).isoformat())
    item_type = payload.get("intelligence_type") or {
        "ml_prediction": "prediction", "idjwi_recommendation": "recommendation",
        "advisor_proposal": "recommendation", "graph_quality": "finding",
        "failed_workflow_action": "risk",
    }.get(kind, "finding")
    source_id = str(payload.get("source_id") or payload.get("rule_id") or payload.get("model_id") or payload.get("id") or kind)
    advisor = AdvisorParticipation()
    if kind == "advisor_proposal":
        proven = bool(payload.get("advisor_contribution_proven"))
        advisor = AdvisorParticipation(
            state="consulted" if proven else "requested", advisor_ids=[source_id], contribution_proven=proven,
        )
    return IntelligenceItem(
        id=f"candidate:{kind}:{source_id}", tenant_id=context["tenant_id"],
        organization_id=str(context.get("organization_id") or context["tenant_id"]),
        operational_unit_id=context.get("operational_unit_id") or payload.get("operational_unit_id"),
        affected_scope=payload.get("affected_scope") or {"type": "organization", "id": context.get("organization_id") or context["tenant_id"]},
        intelligence_type=item_type, subtype=payload.get("subtype") or payload.get("condition") or payload.get("category"),
        title=str(payload.get("title") or "Operational finding"),
        explanation=str(payload.get("explanation") or payload.get("description") or payload.get("body") or "No explanation supplied."),
        severity=_level(payload.get("severity")), priority=_level(payload.get("priority") or payload.get("severity")),
        operational_impact=payload.get("operational_impact") or payload.get("business_consequence"),
        source=IntelligenceSource(type=source_type, id=source_id, label=payload.get("source_label"), assertion_class=assertion_class, authority=authority, model_version=payload.get("model_version")),
        evidence=_evidence(payload), provenance=payload.get("provenance") or {},
        confidence=payload.get("confidence"), uncertainty=payload.get("uncertainty"),
        freshness={"observed_at": now, "stale": bool(payload.get("stale"))}, expires_at=payload.get("expires_at"),
        status=str(payload.get("status") or "detected"), lifecycle=LifecycleTimestamps(detected_at=now),
        related_records=_refs(payload), graph_relationships=_refs(payload, "graph_relationships"),
        required_permissions=payload.get("required_permissions") or ["intelligence.read"],
        recommended_next_action=payload.get("recommended_next_action"), approval=payload.get("approval") or {},
        idjwi_context={"source_adapter": kind, "source_id": source_id}, advisor=advisor,
        contradictions=[EvidenceReference(**value) for value in payload.get("contradictions") or [] if isinstance(value, dict) and value.get("id")],
        audit_context={"event_type": "intelligence.source.adapted", "adapter": kind},
    )


for _kind in SOURCE_POLICY:
    register_adapter(_kind)(lambda payload, context, kind=_kind: _adapt(kind, payload, context))

SOURCE_ADAPTERS.update({
    "rule": SOURCE_ADAPTERS["rules_thresholds"], "rules": SOURCE_ADAPTERS["rules_thresholds"],
    "threshold": SOURCE_ADAPTERS["rules_thresholds"], "ml": SOURCE_ADAPTERS["ml_prediction"],
    "ml_predictions": SOURCE_ADAPTERS["ml_prediction"], "agent": SOURCE_ADAPTERS["agents"],
    "alert": SOURCE_ADAPTERS["alerts"], "graph_quality_finding": SOURCE_ADAPTERS["graph_quality"],
    "external_observations": SOURCE_ADAPTERS["external_observation"],
    "idjwi_recommendations": SOURCE_ADAPTERS["idjwi_recommendation"],
    "advisor_proposals": SOURCE_ADAPTERS["advisor_proposal"],
    "failed_workflow": SOURCE_ADAPTERS["failed_workflow_action"],
    "failed_action": SOURCE_ADAPTERS["failed_workflow_action"],
})


def adapt(source_kind: str, payload: dict, context: dict) -> IntelligenceItem:
    try:
        adapter = SOURCE_ADAPTERS[source_kind]
    except KeyError as exc:
        raise ValueError(f"Unsupported intelligence source adapter: {source_kind}") from exc
    return adapter(payload, context)
