"""Role- and surface-specific projections over the governed graph packet."""

from __future__ import annotations

from fastapi import HTTPException


SURFACE_CONTRACT_VERSION = "company-graph-surface.v1"
SURFACES = {"web", "desktop", "mobile_manager", "mobile_worker"}

ROLE_CAPABILITIES = {
    "admin": ("configure_scope", "resolve_quality", "govern_relationships", "export", "control_advisors"),
    "super_admin": ("configure_scope", "resolve_quality", "govern_relationships", "export", "control_advisors"),
    "manager": ("investigate_operations", "review_recommendations", "approve_actions", "monitor_unit_outcomes"),
    "technician": ("inspect_mapping", "inspect_sources", "inspect_projection", "resolve_integrations", "verify_construction"),
    "staff": ("view_assigned_work", "receive_next_action", "report_correction", "capture_evidence"),
    "user": ("view_assigned_work", "receive_next_action", "report_correction", "capture_evidence"),
    "teacher": ("view_assigned_work", "receive_next_action", "report_correction", "capture_evidence"),
    "student": ("view_assigned_work", "receive_next_action", "report_correction", "capture_evidence"),
}


def surface_projection(packet, context, surface: str):
    if surface not in SURFACES:
        raise HTTPException(status_code=422, detail={"code": "GRAPH_SURFACE_INVALID"})
    role = context.role
    if surface == "mobile_manager" and role not in {"manager", "admin", "super_admin"}:
        raise HTTPException(status_code=403, detail={"code": "GRAPH_MANAGER_SURFACE_DENIED"})
    if surface == "mobile_worker" and role in {"manager", "admin", "super_admin", "technician"}:
        raise HTTPException(status_code=403, detail={"code": "GRAPH_WORKER_SURFACE_DENIED"})

    result = packet.model_copy(deep=True)
    assignment_verified = True
    if role in {"staff", "user", "teacher", "student"}:
        # Only the canonical user_profile.person_id -> task.assigned_to_person_id
        # chain authorizes worker context. Names and emails are never authority.
        assigned = [
            node for node in result.nodes
            if node.entity_type == "task"
            and node.attributes.get("assigned_to_current_user") is True
        ]
        assignment_verified = bool(context.person_id and assigned)
        allowed_ids = {node.id for node in assigned}
        for edge in result.edges:
            if edge.source in allowed_ids:
                allowed_ids.add(edge.target)
            if edge.target in allowed_ids:
                allowed_ids.add(edge.source)
        result.nodes = [node for node in result.nodes if node.id in allowed_ids]
        result.edges = [
            edge for edge in result.edges
            if edge.source in allowed_ids and edge.target in allowed_ids
        ]
        result.counts = {}
        for node in result.nodes:
            result.counts[node.entity_type] = result.counts.get(node.entity_type, 0) + 1
    elif surface == "mobile_manager":
        priority_types = {"risk", "recommendation", "decision", "action", "task", "operational_unit", "external_observation"}
        priority_ids = {node.id for node in result.nodes if node.entity_type in priority_types}
        result.nodes = [node for node in result.nodes if node.id in priority_ids]
        result.edges = [edge for edge in result.edges if edge.source in priority_ids and edge.target in priority_ids]

    mobile_actions = {}
    if surface == "mobile_manager":
        for node in result.nodes:
            state = str(node.attributes.get("status") or node.status or "").lower()
            if node.entity_type == "recommendation" and not node.attributes.get("is_actioned") and not node.attributes.get("is_dismissed"):
                mobile_actions[node.id] = ["approve", "reject"]
            elif node.entity_type == "decision" and not node.attributes.get("outcome") and state not in {"approved", "rejected", "closed"}:
                mobile_actions[node.id] = ["approve", "reject"]
    elif surface == "mobile_worker" and assignment_verified:
        mobile_actions = {
            node.id: ["capture_evidence", "report_correction"]
            for node in result.nodes
        }

    return {
        "contract_version": SURFACE_CONTRACT_VERSION,
        "surface": surface,
        "role": role,
        "capabilities": list(ROLE_CAPABILITIES.get(role, ())),
        "assignment_identity_verified": assignment_verified,
        "readiness": "ready" if assignment_verified else "assignment_identity_required",
        "identity_chain": {
            "user_profile_to_person": "verified" if context.person_id else "missing",
            "assigned_task_count": len(assigned) if role in {"staff", "user", "teacher", "student"} else None,
            "authorization_basis": "canonical_person_assignment" if assignment_verified and role in {"staff", "user", "teacher", "student"} else None,
        },
        "mobile_actions": mobile_actions,
        "packet": result,
    }
