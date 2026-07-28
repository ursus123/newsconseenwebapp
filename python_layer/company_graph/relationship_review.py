"""Governed review and execution for universal relationship candidates."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException

from ontology.relationship_registry import ALL_RELATIONSHIP_RULES, predicate_catalog

from .relationship_candidates import detect_relationship_candidates
from .assertion_governance import stable_assertion_key


REVIEW_CONTRACT_VERSION = "ontology-relationship-review.v1"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rule(rule_id: str):
    rule = next((item for item in ALL_RELATIONSHIP_RULES if item.id == rule_id), None)
    if not rule:
        raise HTTPException(status_code=409, detail={
            "code": "RELATIONSHIP_RULE_NOT_REGISTERED", "action": "update_relationship_registry",
        })
    return rule


def candidate_explanation(assertion: dict, context) -> dict[str, Any]:
    evidence = assertion.get("evidence") or []
    matching = (evidence[0].get("matching_fields") or {}) if evidence else {}
    method = assertion.get("matching_method")
    count = int(assertion.get("candidate_count") or 0)
    deterministic = method in {"explicit_uuid_reference", "exact_unique_tenant_name"}
    uncertainty = (
        "No competing authorized candidate was found."
        if count <= 1 and deterministic else
        f"{count} possible matches remain and individual review is required."
    )
    return {
        "contract_version": REVIEW_CONTRACT_VERSION,
        "candidate_id": assertion.get("assertion_key"),
        "summary": (
            "Idjwi Core matched the authorized source and target deterministically."
            if deterministic else
            "Idjwi Core found a possible relationship that requires operator judgment."
        ),
        "reasoning": {
            "matching_method": method,
            "matching_fields": matching,
            "normalization": (evidence[0].get("normalization") if evidence else None),
            "candidate_count": count,
            "uncertainty": uncertainty,
            "tenant_id": context.tenant_id,
            "scope": {"type": context.scope_type, "id": context.scope_id},
            "source_record": {
                "type": assertion.get("carrier_type"),
                "id": assertion.get("carrier_record_id"),
            },
            "advisor_used": False,
            "identity": "Idjwi Core",
        },
        "why_bulk_confirmation": (
            "Permitted because the match is deterministic, unique, registered, and has a safe operation recipe."
            if assertion.get("bulk_group_key") else
            "Not permitted because ambiguity, semantics, evidence, or the operation recipe requires individual review."
        ),
        "proposed_change": assertion.get("proposed_patch") or {},
        "business_consequence": assertion.get("business_consequence"),
        "evidence": evidence,
    }


def revalidate_candidate(repository, context, assertion: dict):
    if assertion.get("assertion_state") not in {"proposed", "disputed"}:
        raise HTTPException(status_code=409, detail={
            "code": "RELATIONSHIP_CANDIDATE_NOT_REVIEWABLE",
            "action": "refresh_relationship_queue",
        })
    rule = _rule(str(assertion.get("relationship_rule_id") or ""))
    carrier_id = str(assertion.get("carrier_record_id") or "")
    carrier = repository.get_entity(context, rule.carrier_type, carrier_id).data
    if not carrier:
        raise HTTPException(status_code=409, detail={
            "code": "RELATIONSHIP_CARRIER_CHANGED", "action": "rerun_detection",
        })
    target_type = str(carrier.get(rule.target_type_field) or rule.target_type) if rule.target_type_field else rule.target_type
    records = {
        rule.carrier_type: [carrier],
        rule.source_type: repository.list_entities(context, rule.source_type, limit=5000).data or [],
        target_type: repository.list_entities(context, target_type, limit=5000).data or [],
    }
    current = next((
        item for item in detect_relationship_candidates(context.tenant_id, records)
        if item.candidate_id == assertion.get("assertion_key")
    ), None)
    if not current:
        raise HTTPException(status_code=409, detail={
            "code": "RELATIONSHIP_EVIDENCE_CHANGED", "action": "rerun_detection",
        })
    if current.evidence_hash != assertion.get("evidence_hash"):
        raise HTTPException(status_code=409, detail={
            "code": "RELATIONSHIP_EVIDENCE_VERSION_STALE", "action": "rerun_detection",
        })
    predicate = predicate_catalog().get(current.predicate)
    if not predicate or current.predicate == "unclassified_relationship":
        raise HTTPException(status_code=422, detail={
            "code": "RELATIONSHIP_PREDICATE_NOT_GOVERNED",
            "action": "classify_relationship_individually",
        })
    if not current.source.entity_id or not current.target.entity_id:
        raise HTTPException(status_code=409, detail={
            "code": "RELATIONSHIP_ENDPOINT_UNRESOLVED", "action": "review_candidate",
        })
    return current, carrier


def mutation_preview(repository, context, assertion: dict) -> dict:
    candidate, carrier = revalidate_candidate(repository, context, assertion)
    return {
        "contract_version": REVIEW_CONTRACT_VERSION,
        "candidate_id": candidate.candidate_id,
        "operation": candidate.proposed_operation,
        "carrier": {"type": candidate.carrier_type, "id": candidate.carrier_record_id},
        "before": {key: carrier.get(key) for key in candidate.proposed_patch},
        "after": candidate.proposed_patch,
        "predicate": candidate.predicate,
        "source": candidate.source.model_dump(),
        "target": candidate.target.model_dump(),
        "temporal_state": candidate.temporal_state,
        "evidence_hash": candidate.evidence_hash,
        "evidence_version": assertion.get("evidence_version") or 1,
        "approval_required": True,
    }


def _event(repository, context, assertion: dict, from_state: str, to_state: str,
           reason: str, evidence: list, bulk_operation_id: str | None):
    return repository.create_entity(context, "graph_assertion_event", {
        "assertion_id": assertion["id"], "assertion_key": assertion["assertion_key"],
        "from_state": from_state, "to_state": to_state, "reason": reason,
        "actor_user_id": context.user_id,
        "evidence_version": assertion.get("evidence_version") or 1,
        "evidence": [*evidence, {"bulk_operation_id": bulk_operation_id}],
        "occurred_at": _now(),
    }).data


def reject_candidate(repository, context, assertion: dict, *, reason: str,
                     bulk_operation_id: str | None = None) -> dict:
    if assertion.get("assertion_state") not in {"proposed", "disputed"}:
        raise HTTPException(status_code=409, detail={"code": "RELATIONSHIP_CANDIDATE_NOT_REVIEWABLE"})
    updated = repository.update_entity(context, "graph_assertion", str(assertion["id"]), {
        "assertion_state": "rejected", "rejected_at": _now(),
        "reason": reason, "actor_user_id": context.user_id,
    }).data
    event = _event(
        repository, context, updated, str(assertion.get("assertion_state")),
        "rejected", reason, assertion.get("evidence") or [], bulk_operation_id,
    )
    return {"assertion": updated, "event": event, "canonical_record": None}


def confirm_candidate(repository, context, assertion: dict, *, reason: str,
                      bulk_operation_id: str | None = None,
                      corrected_predicate: str | None = None) -> dict:
    candidate, carrier = revalidate_candidate(repository, context, assertion)
    if corrected_predicate:
        definition = predicate_catalog().get(corrected_predicate)
        if not definition:
            raise HTTPException(status_code=422, detail={"code": "RELATIONSHIP_PREDICATE_NOT_GOVERNED"})
        if (
            ("*" not in definition["source_types"] and candidate.source.entity_type not in definition["source_types"])
            or ("*" not in definition["target_types"] and candidate.target.entity_type not in definition["target_types"])
        ):
            raise HTTPException(status_code=422, detail={"code": "RELATIONSHIP_PREDICATE_SHAPE_INVALID"})
        candidate.predicate = corrected_predicate
        rule = _rule(candidate.relationship_rule_id)
        if rule.predicate_field:
            candidate.proposed_patch[rule.predicate_field] = corrected_predicate
    operation = candidate.proposed_operation
    if operation == "quarantine_for_review":
        raise HTTPException(status_code=422, detail={
            "code": "RELATIONSHIP_CANDIDATE_QUARANTINED", "action": "review_candidate",
        })
    if operation == "patch_relationship_references":
        canonical = repository.update_entity(
            context, candidate.carrier_type, candidate.carrier_record_id,
            candidate.proposed_patch,
        ).data
    elif operation == "confirm_assertion":
        canonical = carrier
    else:
        raise HTTPException(status_code=422, detail={
            "code": "RELATIONSHIP_OPERATION_NOT_REGISTERED", "operation": operation,
        })
    timestamp = _now()
    updated = repository.update_entity(context, "graph_assertion", str(assertion["id"]), {
        "source_node_id": f"{candidate.source.entity_type}:{candidate.source.entity_id}",
        "predicate": candidate.predicate,
        "target_node_id": f"{candidate.target.entity_type}:{candidate.target.entity_id}",
        "assertion_class": "operator_confirmed_assertion",
        "assertion_state": "confirmed", "confirmed_at": timestamp,
        "reason": reason, "actor_user_id": context.user_id,
    }).data
    event = _event(
        repository, context, updated, str(assertion.get("assertion_state")),
        "confirmed", reason, [
            *(assertion.get("evidence") or []),
            {"before": {key: carrier.get(key) for key in candidate.proposed_patch}},
            {"after": candidate.proposed_patch, "operation": operation},
        ], bulk_operation_id,
    )
    edge_assertion_key = stable_assertion_key(
        updated["source_node_id"], candidate.predicate,
        updated["target_node_id"], candidate.relationship_rule_id,
    )
    edge_rows = repository.list_entities_filtered(
        context, "graph_assertion", filters={"assertion_key": edge_assertion_key}, limit=2,
    ).data or []
    edge_payload = {
        "operational_unit_id": candidate.operational_unit_id,
        "assertion_key": edge_assertion_key,
        "relationship_rule_id": candidate.relationship_rule_id,
        "source_node_id": updated["source_node_id"],
        "predicate": candidate.predicate,
        "target_node_id": updated["target_node_id"],
        "assertion_class": "operator_confirmed_assertion",
        "assertion_state": "confirmed",
        "valid_from": candidate.temporal_state.get("valid_from"),
        "valid_until": candidate.temporal_state.get("valid_until"),
        "observed_at": candidate.detected_at,
        "confirmed_at": timestamp,
        "evidence_version": assertion.get("evidence_version") or 1,
        "evidence": [
            *(assertion.get("evidence") or []),
            {
                "evidence_id": f"public.graph_assertion_events:{event['id']}",
                "source_table": "public.graph_assertion_events",
                "source_record_id": str(event["id"]),
                "explanation": "Authorized operator confirmation event.",
            },
        ],
        "reason": reason,
        "actor_user_id": context.user_id,
    }
    if edge_rows:
        edge_assertion = repository.update_entity(
            context, "graph_assertion", str(edge_rows[0]["id"]), edge_payload,
        ).data
    else:
        edge_assertion = repository.create_entity(
            context, "graph_assertion", edge_payload,
        ).data
    return {
        "assertion": updated, "event": event, "canonical_record": canonical,
        "edge_assertion": edge_assertion,
        "previous_values": {key: carrier.get(key) for key in candidate.proposed_patch},
        "new_values": candidate.proposed_patch,
    }


def new_bulk_operation_id() -> str:
    return f"relationship-review-{uuid4()}"
