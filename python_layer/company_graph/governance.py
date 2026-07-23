"""Governed Company Graph exports and relationship mutations.

Client payloads are selection requests, never graph facts. Every operation is
reconstructed from the principal's current authorized graph packet.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException

from .field_classification import FIELD_CLASSIFICATIONS
from .predicates import PREDICATES


PROPOSAL_ASSERTION_CLASSES = {
    "deterministic_derivation", "analytical_inference", "advisor_proposal",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def audit_event_id() -> str:
    return f"graph-audit-{uuid4()}"


def governed_export(packet, *, actor: str, purpose: str,
                    included_object_types: list[str] | None = None,
                    included_node_ids: list[str] | None = None) -> dict:
    purpose = (purpose or "").strip()
    if len(purpose) < 3:
        raise HTTPException(status_code=422, detail={
            "code": "GRAPH_EXPORT_PURPOSE_REQUIRED", "category": "validation",
            "message": "State the operational purpose for this export.",
            "action": "provide_export_purpose", "retryable": False,
        })

    available_types = {node.entity_type for node in packet.nodes}
    requested_types = set(included_object_types or available_types)
    unknown_types = requested_types - available_types
    # Unknown/hidden types are recorded as redacted, never used to widen data.
    selected_types = available_types.intersection(requested_types)
    requested_ids = set(included_node_ids or ())
    nodes = [
        node for node in packet.nodes
        if node.entity_type in selected_types and (not requested_ids or node.id in requested_ids)
    ]
    node_ids = {node.id for node in nodes}
    edges = [edge for edge in packet.edges if edge.source in node_ids and edge.target in node_ids]

    sensitivity_rank = {"public": 0, "internal": 1, "restricted": 2, "confidential": 3}
    sensitivity = max((node.sensitivity for node in nodes), key=lambda value: sensitivity_rank[value], default="internal")
    authorization_redactions = sorted(
        source.source_id for source in packet.source_status if source.state == "unauthorized"
    )
    redactions = [
        "all sensitive fields",
        "all prohibited fields",
        "unknown fields (prohibited by default)",
    ]
    if authorization_redactions:
        redactions.append(f"unauthorized object types: {', '.join(authorization_redactions)}")
    if unknown_types:
        redactions.append(f"unavailable or unauthorized requested types: {', '.join(sorted(unknown_types))}")
    if requested_ids:
        redactions.append("records outside the requested visible selection")

    event_id = audit_event_id()
    timestamp = utc_now()
    export_metadata = {
        "requesting_user": actor,
        "tenant_id": packet.company_id,
        "scope": packet.scope.model_dump(),
        "purpose": purpose,
        "included_object_types": sorted({node.entity_type for node in nodes}),
        "applied_redactions": redactions,
        "field_classification_policy": list(FIELD_CLASSIFICATIONS),
        "sensitivity": sensitivity,
        "timestamp": timestamp,
        "audit_event_id": event_id,
        "node_count": len(nodes),
        "edge_count": len(edges),
    }
    return {
        "contract_version": packet.contract_version,
        "export_metadata": export_metadata,
        "graph": {
            "company_id": packet.company_id,
            "scope": packet.scope.model_dump(),
            "nodes": [node.model_dump() for node in nodes],
            "edges": [edge.model_dump() for edge in edges],
            "provenance": packet.provenance.model_dump(),
            "completeness": packet.completeness.model_dump(),
            "truncation": packet.truncation.model_dump(),
            "quality": packet.quality.model_dump(),
        },
    }


def validate_relationship_proposal(packet, body, policy):
    edge = next((candidate for candidate in packet.edges if candidate.id == body.edge_id), None)
    if not edge:
        raise HTTPException(status_code=404, detail={
            "code": "RELATIONSHIP_PROPOSAL_NOT_FOUND", "category": "empty_data",
            "message": "The proposal is not present in the operator's authorized graph.",
            "action": "refresh_graph", "retryable": False,
        })
    if edge.assertion_class not in PROPOSAL_ASSERTION_CLASSES:
        raise HTTPException(status_code=409, detail={
            "code": "RELATIONSHIP_NOT_A_PROPOSAL", "category": "governance",
            "message": "Only a derived, analytical, or advisor proposal can be confirmed.",
            "action": "inspect_relationship_record", "retryable": False,
        })
    nodes = {node.id: node for node in packet.nodes}
    source = nodes.get(edge.source)
    target = nodes.get(edge.target)
    if not source or not target:
        raise HTTPException(status_code=403, detail={
            "code": "RELATIONSHIP_ENDPOINT_NOT_AUTHORIZED", "category": "authorization",
            "message": "Both relationship endpoints must be visible in the authorized graph.",
            "action": "request_record_access", "retryable": False,
        })
    supplied = (f"{body.source_type}:{body.source_id}", f"{body.target_type}:{body.target_id}", body.predicate)
    if supplied != (edge.source, edge.target, edge.predicate):
        raise HTTPException(status_code=409, detail={
            "code": "RELATIONSHIP_PROPOSAL_MISMATCH", "category": "governance",
            "message": "The submitted relationship does not match the governed proposal.",
            "action": "refresh_graph", "retryable": False,
        })
    predicate = PREDICATES.get(edge.predicate)
    if not predicate:
        raise HTTPException(status_code=422, detail={
            "code": "RELATIONSHIP_PREDICATE_NOT_ALLOWED", "category": "governance",
            "message": "The predicate is not in the governed predicate registry.",
            "action": "request_predicate_governance", "retryable": False,
        })
    source_types, target_types = predicate["source_types"], predicate["target_types"]
    if ("*" not in source_types and source.entity_type not in source_types) or ("*" not in target_types and target.entity_type not in target_types):
        raise HTTPException(status_code=422, detail={
            "code": "RELATIONSHIP_PREDICATE_SHAPE_INVALID", "category": "governance",
            "message": "The predicate is not allowed for these endpoint types.",
            "action": "choose_allowed_predicate", "retryable": False,
        })
    action = next((item for item in edge.permitted_actions if item.action == "confirm"), None)
    if not action or not action.allowed or not policy.allows("graph.relationship_confirm"):
        policy.require("graph.relationship_confirm")
        raise HTTPException(status_code=403, detail={"code": "RELATIONSHIP_CONFIRM_NOT_PERMITTED"})
    if action.requires_approval and not body.approval_confirmed:
        raise HTTPException(status_code=409, detail={
            "code": "RELATIONSHIP_APPROVAL_REQUIRED", "category": "governance",
            "message": "The applicable approval policy requires explicit operator approval.",
            "action": "confirm_approval", "retryable": False,
        })
    return edge, source, target


def relationship_payload(source, target, predicate: str, actor: str, reason: str) -> dict:
    field_map = {"person": "person_id", "enterprise": "enterprise_id", "product": "item_id", "service": "service_id"}
    source_field, target_field = field_map.get(source.entity_type), field_map.get(target.entity_type)
    if not source_field or not target_field or source_field == target_field:
        raise HTTPException(status_code=422, detail={
            "code": "RELATIONSHIP_SHAPE_UNSUPPORTED",
            "message": "This relationship shape cannot yet be canonicalized.",
            "action": "open_relationship_editor",
        })
    return {
        "relationship_type": predicate, "status": "active",
        "notes": reason or "Confirmed from Company Graph", "created_by": actor,
        source_field: source.entity_id, target_field: target.entity_id,
    }


def ensure_no_relationship_conflict(existing: list[dict], payload: dict) -> None:
    endpoint_fields = ("person_id", "secondary_person_id", "enterprise_id", "secondary_enterprise_id", "item_id", "service_id")
    requested = {str(payload[field]) for field in endpoint_fields if payload.get(field)}
    for row in existing:
        if str(row.get("status") or "active").lower() in {"inactive", "ended", "expired", "rejected", "deleted"}:
            continue
        endpoints = {str(row[field]) for field in endpoint_fields if row.get(field)}
        if endpoints != requested:
            continue
        code = "RELATIONSHIP_ALREADY_EXISTS" if row.get("relationship_type") == payload.get("relationship_type") else "RELATIONSHIP_CONFLICT"
        raise HTTPException(status_code=409, detail={
            "code": code, "category": "governance",
            "message": "An active relationship already governs these endpoints.",
            "action": "review_existing_relationship", "retryable": False,
        })
