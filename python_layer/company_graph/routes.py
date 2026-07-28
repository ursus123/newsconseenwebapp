from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from copilot.idjwi_observability import log_event

from onboarding.auth import verify_tenant_access
from tenant_context.entity_registry import definition_for
from tenant_context.supabase_repository import SupabaseTenantContextRepository

from .service import build_graph_packet
from .authorization import GraphAuthorizationPolicy
from .cache import (
    get as cache_get, put as cache_put, invalidate as cache_invalidate,
    generation as cache_generation, single_flight,
)
from .predicates import PREDICATES
from .governance import (
    ensure_no_relationship_conflict,
    governed_export,
    relationship_payload,
    validate_relationship_proposal,
)
from ontology.relationship_registry import graph_entity_types, registry_contract
from .relationship_candidates import (
    RELATIONSHIP_CANDIDATE_VERSION,
    detect_relationship_candidates,
    persist_relationship_candidates,
    requires_governed_review,
)
from .relationship_review import (
    REVIEW_CONTRACT_VERSION,
    candidate_explanation,
    confirm_candidate,
    mutation_preview,
    new_bulk_operation_id,
    reject_candidate,
)
from .surfaces import surface_projection
from .assertion_governance import ASSERTION_STATES, persist_assertion_transition, stable_assertion_key
from .correction_learning import record_correction_memory
from .bounded_queries import decode_continuation, direct_neighborhood_records
from .field_classification import project_record
from .contracts import GraphNodeSummary
from .execution import GRAPH_IO_EXECUTOR
from .quality_workflow import finding_record, project_findings
from .external_observations import (
    CONTRACT_VERSION as EXTERNAL_OBSERVATION_CONTRACT,
    governed_alternatives, normalize_matches, normalize_observation,
)
from concurrent.futures import as_completed
from typing import Any, Literal
from datetime import datetime, timezone


router = APIRouter(prefix="/company-graph", tags=["Company Graph"])


class ExternalObservationRequest(BaseModel):
    company_id: str
    operational_unit_id: str | None = None
    observation_type: str
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=2000)
    severity: str = "warning"
    source_name: str
    source_url: str | None = None
    source_record_id: str
    retrieved_at: str
    freshness_at: str | None = None
    location: dict[str, Any] = Field(default_factory=dict)
    valid_from: str
    valid_until: str | None = None
    confidence: float
    expires_at: str
    provenance: dict[str, Any] = Field(default_factory=dict)
    source_payload: dict[str, Any] = Field(default_factory=dict)
    matches: list[dict[str, Any]] = Field(default_factory=list)

GRAPH_VIEW_LAYOUTS = {
    "operational_focus", "organizational_structure", "operational_flow",
    "responsibilities_work", "customers_suppliers", "products_services",
    "risks_opportunities", "decisions_actions", "data_quality",
    "external_disruptions", "full_graph",
}
GRAPH_VIEW_PERMISSION_ROLES = {
    "super_admin", "admin", "manager", "teacher", "staff", "user", "student",
}


class GraphSavedViewRequest(BaseModel):
    company_id: str
    name: str = Field(min_length=2, max_length=100)
    audience: Literal["private", "team", "operational_unit", "organization"] = "private"
    scope: dict[str, Any] = Field(default_factory=dict)
    filters: dict[str, Any] = Field(default_factory=dict)
    layout: str = "operational_focus"
    permissions: list[str] = Field(default_factory=list, max_length=50)
    version: int = Field(default=1, ge=1)


class GraphQualityWorkRequest(BaseModel):
    company_id: str
    action: Literal[
        "create_task", "create_recommendation", "acknowledge_alert",
        "mark_verified", "resolve", "reopen",
    ]
    operational_unit_id: str = ""
    owner_user_id: str | None = None
    owner_display_name: str | None = None
    reason: str = Field(default="", max_length=1000)


class RelationshipCandidateDetectionRequest(BaseModel):
    company_id: str
    operational_unit_id: str = ""
    object_types: list[str] = Field(default_factory=list, max_length=50)
    max_per_type: int = Field(default=1000, ge=1, le=2000)


class RelationshipCandidateDecisionRequest(BaseModel):
    company_id: str
    candidate_ids: list[str] = Field(min_length=1, max_length=100)
    decision: Literal["confirm", "reject"]
    reason: str = Field(min_length=3, max_length=1000)
    approval_confirmed: bool = False
    corrected_predicate: str | None = None
    operational_unit_id: str = ""


class MobileManagerDecisionRequest(BaseModel):
    company_id: str
    node_id: str
    decision: Literal["approve", "reject"]
    reason: str = Field(min_length=3, max_length=1000)
    operational_unit_id: str = ""


class MobileWorkerReportRequest(BaseModel):
    company_id: str
    subject_node_id: str
    report_type: Literal["evidence", "correction"]
    description: str = Field(min_length=3, max_length=2000)
    evidence: list[dict[str, Any]] = Field(default_factory=list, max_length=10)
    proposed_correction: dict[str, Any] = Field(default_factory=dict)
    operational_unit_id: str = ""


def _validate_saved_view(body: GraphSavedViewRequest, context, policy: GraphAuthorizationPolicy) -> dict:
    if body.layout not in GRAPH_VIEW_LAYOUTS:
        raise HTTPException(status_code=422, detail={"code": "GRAPH_VIEW_LAYOUT_INVALID", "action": "choose_supported_layout"})
    scope_type = str(body.scope.get("type") or "organization")
    scope_id = str(body.scope.get("id") or context.tenant_id)
    if scope_type not in {"tenant", "organization", "operational_unit", "department", "team"}:
        raise HTTPException(status_code=422, detail={"code": "GRAPH_VIEW_SCOPE_INVALID", "action": "choose_authorized_scope"})
    if scope_type in {"operational_unit", "department", "team"}:
        allowed = set(context.allowed_operational_unit_ids).union(context.managed_operational_unit_ids)
        if scope_id not in allowed and not policy.allows("graph.admin"):
            raise HTTPException(status_code=403, detail={"code": "GRAPH_VIEW_SCOPE_DENIED", "action": "request_unit_membership"})
    if body.audience in {"team", "operational_unit"} and scope_type not in {"operational_unit", "department", "team"}:
        raise HTTPException(status_code=422, detail={"code": "GRAPH_VIEW_AUDIENCE_SCOPE_INVALID", "action": "select_operational_unit"})
    if body.audience != "private":
        policy.require("graph.view_share")
    if any(role not in GRAPH_VIEW_PERMISSION_ROLES for role in body.permissions):
        raise HTTPException(status_code=422, detail={"code": "GRAPH_VIEW_PERMISSION_INVALID", "action": "choose_supported_roles"})
    allowed_filter_keys = {"visible_types", "status", "risk", "active_filter", "search_query"}
    if any(key not in allowed_filter_keys for key in body.filters):
        raise HTTPException(status_code=422, detail={"code": "GRAPH_VIEW_FILTER_INVALID", "action": "remove_unsupported_filters"})
    return {
        "owner_user_id": context.user_id,
        "name": body.name.strip(),
        "audience": body.audience,
        "scope": {"type": scope_type, "id": scope_id},
        "filters": body.filters,
        "layout": body.layout,
        "permissions": sorted(set(body.permissions)),
        "version": body.version,
        "validation_state": "valid",
    }


def _saved_view_visible(row: dict, context, policy: GraphAuthorizationPolicy) -> bool:
    if str(row.get("owner_user_id")) == context.user_id:
        return True
    permitted_roles = set(row.get("permissions") or [])
    if permitted_roles and context.role not in permitted_roles and not policy.allows("graph.admin"):
        return False
    audience = row.get("audience")
    if audience == "organization":
        return True
    if audience in {"operational_unit", "team"}:
        scope_id = str((row.get("scope") or {}).get("id") or "")
        allowed = set(context.allowed_operational_unit_ids).union(context.managed_operational_unit_ids)
        if context.scope_id:
            allowed.add(str(context.scope_id))
        return scope_id in allowed or policy.allows("graph.admin")
    return False


@router.get("/external-observations")
def list_external_observations(request: Request, company_id: str = Query(...),
                               operational_unit_id: str = Query(""),
                               authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(
        authorization, company_id, request_id=getattr(request.state, "request_id", ""),
        operational_unit_id=operational_unit_id,
    )
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require_scope(operational_unit_id)
    now = datetime.now(timezone.utc)
    observations = repository.list_entities(context, "external_observation", limit=250).data or []
    observations = [
        row for row in observations
        if row.get("status") == "active"
        and datetime.fromisoformat(str(row["expires_at"]).replace("Z", "+00:00")) > now
        and (not operational_unit_id or str(row.get("operational_unit_id") or "") in {"", operational_unit_id})
    ]
    ids = {str(row["id"]) for row in observations}
    matches = repository.list_entities(context, "external_observation_match", limit=1000).data or []
    matches = [row for row in matches if str(row.get("observation_id")) in ids]
    grouped = {}
    for match in matches:
        grouped.setdefault(str(match["observation_id"]), []).append(match)
    return {
        "contract_version": EXTERNAL_OBSERVATION_CONTRACT,
        "company_id": context.tenant_id,
        "observations": [
            {**row, "matches": grouped.get(str(row["id"]), []),
             "alternatives": governed_alternatives(row, grouped.get(str(row["id"]), []))}
            for row in observations
        ],
        "canonical_records_modified": False,
    }


@router.post("/external-observations", status_code=201)
def create_external_observation(body: ExternalObservationRequest, request: Request,
                                authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(
        authorization, body.company_id, request_id=getattr(request.state, "request_id", ""),
        operational_unit_id=body.operational_unit_id or "",
    )
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require_scope(body.operational_unit_id or "")
    policy.require("graph.external_observation_manage")
    raw = body.dict()
    supplied_matches = raw.pop("matches", [])
    try:
        observation_payload = normalize_observation(raw, actor=context.user_id)
        for candidate in supplied_matches:
            target_type = str(candidate.get("target_type") or "")
            if not policy.can_read_entity(target_type):
                raise HTTPException(status_code=403, detail={"code": "GRAPH_MATCH_TARGET_DENIED"})
            if not repository.get_entity(context, target_type, str(candidate.get("target_id") or "")).data:
                raise HTTPException(status_code=422, detail={"code": "GRAPH_MATCH_TARGET_NOT_FOUND"})
        existing = repository.list_entities_filtered(
            context, "external_observation",
            filters={"source_name": observation_payload["source_name"],
                     "source_record_id": observation_payload["source_record_id"]}, limit=1,
        ).data or []
        observation = (
            repository.update_entity(context, "external_observation", str(existing[0]["id"]), observation_payload).data
            if existing else repository.create_entity(context, "external_observation", observation_payload).data
        )
        matches = normalize_matches(
            supplied_matches, observation_payload, observation_id=str(observation["id"]), actor=context.user_id,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail={
            "code": "EXTERNAL_OBSERVATION_INVALID", "message": str(error),
            "action": "correct_provider_mapping",
        }) from error
    created_matches = []
    for match in matches:
        prior = repository.list_entities_filtered(
            context, "external_observation_match",
            filters={"observation_id": observation["id"], "target_type": match["target_type"],
                     "target_id": match["target_id"], "predicate": match["predicate"]}, limit=1,
        ).data or []
        created_matches.append(
            repository.update_entity(context, "external_observation_match", str(prior[0]["id"]), match).data
            if prior else repository.create_entity(context, "external_observation_match", match).data
        )
    cache_invalidate(context.tenant_id)
    log_event(
        "company_graph.external_observation.recorded", company_id=context.tenant_id,
        actor=context.user_id, subject=observation["id"],
        metadata={"type": observation["observation_type"], "source": observation["source_name"],
                  "match_count": len(created_matches), "canonical_records_modified": False},
        status="success",
    )
    return {
        "contract_version": EXTERNAL_OBSERVATION_CONTRACT,
        "observation": observation, "matches": created_matches,
        "alternatives": governed_alternatives(observation, created_matches),
        "canonical_records_modified": False, "graph_refresh_required": True,
    }


@router.get("/views")
def list_graph_views(request: Request, company_id: str = Query(...), authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, company_id, request_id=getattr(request.state, "request_id", ""))
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require("graph.read")
    rows = repository.list_entities(context, "graph_saved_view", limit=500).data or []
    visible = [row for row in rows if _saved_view_visible(row, context, policy)]
    visible.sort(key=lambda row: (str(row.get("name") or "").casefold(), str(row.get("id"))))
    return {"contract_version": "company-graph-saved-views.v1", "company_id": context.tenant_id, "views": visible}


@router.post("/views", status_code=201)
def create_graph_view(body: GraphSavedViewRequest, request: Request, authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, body.company_id, request_id=getattr(request.state, "request_id", ""))
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require("graph.view_save")
    payload = _validate_saved_view(body, context, policy)
    existing = repository.list_entities_filtered(
        context, "graph_saved_view",
        filters={"owner_user_id": context.user_id, "name": payload["name"]}, limit=1,
    ).data or []
    if existing:
        row = repository.update_entity(context, "graph_saved_view", str(existing[0]["id"]), payload).data
    else:
        row = repository.create_entity(context, "graph_saved_view", payload).data
    log_event("company_graph.view.saved", company_id=context.tenant_id, actor=context.user_id, subject=row.get("id"), metadata={"audience": body.audience, "layout": body.layout}, status="success")
    return {"contract_version": "company-graph-saved-views.v1", "view": row}


@router.put("/views/{view_id}")
def update_graph_view(view_id: str, body: GraphSavedViewRequest, request: Request, authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, body.company_id, request_id=getattr(request.state, "request_id", ""))
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require("graph.view_save")
    existing = repository.get_entity(context, "graph_saved_view", view_id).data
    if not existing:
        raise HTTPException(status_code=404, detail={"code": "GRAPH_VIEW_NOT_FOUND"})
    if str(existing.get("owner_user_id")) != context.user_id and not policy.allows("graph.admin"):
        raise HTTPException(status_code=403, detail={"code": "GRAPH_VIEW_OWNER_REQUIRED", "action": "duplicate_view"})
    row = repository.update_entity(context, "graph_saved_view", view_id, _validate_saved_view(body, context, policy)).data
    return {"contract_version": "company-graph-saved-views.v1", "view": row}


def _quality_context(repository, request, authorization, company_id, operational_unit_id=""):
    context = repository.resolve_context(
        authorization, company_id, request_id=getattr(request.state, "request_id", ""),
        operational_unit_id=operational_unit_id,
    )
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require_scope(operational_unit_id)
    return context, policy


def _stored_quality(repository, context):
    try:
        findings = repository.list_entities(context, "graph_quality_finding", limit=500).data or []
        events = repository.list_entities(context, "graph_quality_resolution_event", limit=2000).data or []
        return findings, events
    except Exception as error:
        raise HTTPException(status_code=503, detail={
            "code": "GRAPH_QUALITY_STORE_UNAVAILABLE", "category": "data_source",
            "message": "The graph-quality work store is unavailable.",
            "action": "apply_009_graph_quality_work_migration", "retryable": True,
        }) from error


@router.get("/quality/findings")
def graph_quality_findings(request: Request, company_id: str = Query(...),
                           operational_unit_id: str = Query(""),
                           authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context, policy = _quality_context(
        repository, request, authorization, company_id, operational_unit_id,
    )
    packet = _packet(
        company_id, authorization, request, node_budget=36, edge_budget=72,
        operational_unit_id=operational_unit_id,
    )
    stored, events = _stored_quality(repository, context)
    findings = project_findings(packet, context=context, stored=stored, history=events)
    return {
        "contract_version": "company-graph-quality-work.v1",
        "company_id": context.tenant_id,
        "scope": packet.scope,
        "findings": findings,
        "summary": {
            "open": sum(item["status"] in {"open", "in_progress", "recurring"} for item in findings),
            "critical": sum(item["severity"] == "critical" for item in findings),
            "affected_records": sum(item["affected_count"] for item in findings),
            "actionable": sum(bool(item["operator_actions"]) for item in findings),
        },
        "connections": ["data_readiness", "tasks", "alerts", "idjwi_recommendations", "audit"],
        "can_manage": policy.allows("graph.quality_manage"),
    }


@router.post("/quality/findings/{finding_key}/work")
def graph_quality_work(finding_key: str, body: GraphQualityWorkRequest,
                       request: Request, authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context, policy = _quality_context(
        repository, request, authorization, body.company_id, body.operational_unit_id,
    )
    policy.require("graph.quality_manage")
    if body.owner_user_id and str(body.owner_user_id) != context.user_id:
        raise HTTPException(status_code=403, detail={
            "code": "GRAPH_QUALITY_OWNER_NOT_VERIFIED",
            "message": "A finding can only be claimed by the verified requesting operator.",
            "action": "use_verified_operator_identity",
        })
    if body.action in {"mark_verified", "resolve"} and not body.reason.strip():
        raise HTTPException(status_code=422, detail={
            "code": "GRAPH_QUALITY_REASON_REQUIRED", "action": "explain_verification_or_resolution",
        })
    packet = _packet(
        body.company_id, authorization, request, node_budget=36, edge_budget=72,
        operational_unit_id=body.operational_unit_id,
    )
    stored, events = _stored_quality(repository, context)
    current = next((
        item for item in project_findings(packet, context=context, stored=stored, history=events)
        if item["finding_key"] == finding_key
    ), None)
    if not current:
        raise HTTPException(status_code=404, detail={
            "code": "GRAPH_QUALITY_FINDING_NOT_ACTIVE",
            "message": "The finding is no longer active in the authorized graph scope.",
            "action": "refresh_quality_findings",
        })
    if not current.get("currently_detected", True) and body.action != "reopen":
        raise HTTPException(status_code=409, detail={
            "code": "GRAPH_QUALITY_FINDING_NOT_CURRENT",
            "message": "This historical finding is not currently detected.",
            "action": "reopen_only_if_new_evidence_requires_review",
        })
    existing = next((row for row in stored if row.get("finding_key") == finding_key), None)
    current["owner"]["user_id"] = context.user_id
    current["owner"]["display_name"] = body.owner_display_name or current["owner"].get("display_name")
    payload = finding_record(current, context=context)
    if existing:
        finding = repository.update_entity(context, "graph_quality_finding", str(existing["id"]), payload).data
    else:
        finding = repository.create_entity(context, "graph_quality_finding", payload).data
    from_status = finding.get("status") or "open"
    event_type = body.action
    event_status = from_status

    if body.action == "create_task":
        task = repository.create_entity(context, "task", {
            "title": f"Repair graph quality: {current['issue_code'].replace('_', ' ').title()}",
            "description": f"{current['business_consequence']}\n\nSuggested repair: {current['suggested_repair']}",
            "task_type": "data_quality_repair", "status": "open",
            "priority": "urgent" if current["severity"] == "critical" else "high",
            "assigned_to_name": current["owner"].get("display_name"),
            "created_by": context.user_id,
            **({"operational_unit_id": body.operational_unit_id} if body.operational_unit_id else {}),
        }).data
        event_type, event_status = "task_created", "in_progress"
        finding = repository.update_entity(context, "graph_quality_finding", str(finding["id"]), {
            "task_id": task["id"], "status": event_status,
        }).data
    elif body.action == "create_recommendation":
        recommendation = repository.create_entity(context, "recommendation", {
            "title": f"Repair {current['issue_code'].replace('_', ' ').lower()}",
            "body": current["suggested_repair"],
            "recommendation_type": "graph_quality_repair",
            "priority": "urgent" if current["severity"] == "critical" else "high",
            "entity_ref_type": "graph_quality_finding",
            "entity_ref_id": finding["id"],
            "created_by": context.user_id,
            **({"operational_unit_id": body.operational_unit_id} if body.operational_unit_id else {}),
        }).data
        event_type = "recommendation_created"
        finding = repository.update_entity(context, "graph_quality_finding", str(finding["id"]), {
            "recommendation_id": recommendation["id"], "status": "in_progress",
        }).data
        event_status = "in_progress"
    elif body.action == "acknowledge_alert":
        event_type = "alert_acknowledged"
        finding = repository.update_entity(context, "graph_quality_finding", str(finding["id"]), {
            "alert_state": "acknowledged",
        }).data
    elif body.action == "mark_verified":
        event_type, event_status = "verified", "in_progress"
        finding = repository.update_entity(context, "graph_quality_finding", str(finding["id"]), {
            "verification_status": "verified", "status": event_status,
        }).data
    elif body.action == "resolve":
        event_type, event_status = "resolved", "resolved"
        finding = repository.update_entity(context, "graph_quality_finding", str(finding["id"]), {
            "status": "resolved", "verification_status": "verified",
            "alert_state": "closed", "resolved_by": context.user_id,
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        }).data
    elif body.action == "reopen":
        event_type, event_status = "reopened", "open"
        finding = repository.update_entity(context, "graph_quality_finding", str(finding["id"]), {
            "status": "open", "verification_status": "unverified", "resolved_by": None, "resolved_at": None,
        }).data

    event = repository.create_entity(context, "graph_quality_resolution_event", {
        "finding_id": finding["id"], "finding_key": finding_key,
        "event_type": event_type, "from_status": from_status, "to_status": event_status,
        "actor_user_id": context.user_id, "reason": body.reason.strip(),
        "evidence": current["evidence"],
    }).data
    log_event(
        f"company_graph.quality.{event_type}", company_id=context.tenant_id,
        actor=context.user_id, subject=finding_key,
        metadata={"finding_id": finding["id"], "task_id": finding.get("task_id"), "recommendation_id": finding.get("recommendation_id")},
        status="success",
    )
    cache_invalidate(context.tenant_id)
    return {
        "contract_version": "company-graph-quality-work.v1",
        "finding": finding, "event": event,
        "next": "Refresh Company Graph and Data Readiness to verify the repair outcome.",
    }


@router.get("/predicates")
def graph_predicates():
    return {"predicates": [{"id": key, **value} for key, value in PREDICATES.items()]}


@router.get("/relationship-registry")
def graph_relationship_registry(request: Request, company_id: str = Query(...), authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, company_id, request_id=getattr(request.state, "request_id", ""))
    GraphAuthorizationPolicy.for_context(context).require("graph.read")
    return {**registry_contract(), "company_id": context.tenant_id, "tenant_verified": True}


def _candidate_context(repository, authorization, company_id, request, operational_unit_id=""):
    context = repository.resolve_context(
        authorization, company_id,
        request_id=getattr(request.state, "request_id", ""),
        operational_unit_id=operational_unit_id,
    )
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require_scope(operational_unit_id)
    return context, policy


@router.get("/relationship-candidates")
def relationship_candidate_queue(
    request: Request, company_id: str = Query(...),
    operational_unit_id: str = Query(""),
    assertion_state: str | None = Query(None),
    object_type: str | None = Query(None),
    predicate: str | None = Query(None),
    matching_method: str | None = Query(None),
    bulk_confirmable: bool | None = Query(None),
    authorization: str | None = Header(None),
):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context, policy = _candidate_context(
        repository, authorization, company_id, request, operational_unit_id,
    )
    policy.require("graph.read_sensitive")
    rows = repository.list_entities(context, "graph_assertion", limit=5000).data or []
    rows = [
        row for row in rows
        if row.get("carrier_type") and (
            not assertion_state or str(row.get("assertion_state")) == assertion_state
        )
        and (not object_type or str(row.get("carrier_type")) == object_type)
        and (not predicate or str(row.get("predicate")) == predicate)
        and (not matching_method or str(row.get("matching_method")) == matching_method)
        and (bulk_confirmable is None or bool(row.get("bulk_group_key")) == bulk_confirmable)
    ]
    rows.sort(key=lambda row: str(row.get("last_evaluated_at") or ""), reverse=True)
    return {
        "contract_version": RELATIONSHIP_CANDIDATE_VERSION,
        "company_id": context.tenant_id,
        "scope": {"type": context.scope_type, "id": context.scope_id},
        "authorization_fingerprint": policy.fingerprint(),
        "summary": {
            "total": len(rows),
            "proposed": sum(row.get("assertion_state") == "proposed" for row in rows),
            "disputed": sum(row.get("assertion_state") == "disputed" for row in rows),
            "rejected": sum(row.get("assertion_state") == "rejected" for row in rows),
            "bulk_confirmable": sum(bool(row.get("bulk_group_key")) for row in rows),
        },
        "candidates": rows,
    }


def _candidate_assertion(repository, context, candidate_id: str) -> dict:
    rows = repository.list_entities_filtered(
        context, "graph_assertion", filters={"assertion_key": candidate_id}, limit=2,
    ).data or []
    candidate = next((row for row in rows if row.get("carrier_type")), None)
    if not candidate:
        raise HTTPException(status_code=404, detail={
            "code": "RELATIONSHIP_CANDIDATE_NOT_FOUND",
            "category": "empty_data", "action": "refresh_relationship_queue",
        })
    return candidate


@router.get("/relationship-candidates/{candidate_id}/explain")
def explain_relationship_candidate(
    candidate_id: str, request: Request, company_id: str = Query(...),
    operational_unit_id: str = Query(""), authorization: str | None = Header(None),
):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context, policy = _candidate_context(
        repository, authorization, company_id, request, operational_unit_id,
    )
    policy.require("graph.read_sensitive")
    assertion = _candidate_assertion(repository, context, candidate_id)
    return candidate_explanation(assertion, context)


@router.get("/relationship-candidates/{candidate_id}/preview")
def preview_relationship_candidate(
    candidate_id: str, request: Request, company_id: str = Query(...),
    operational_unit_id: str = Query(""), authorization: str | None = Header(None),
):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context, policy = _candidate_context(
        repository, authorization, company_id, request, operational_unit_id,
    )
    policy.require("graph.relationship_confirm")
    assertion = _candidate_assertion(repository, context, candidate_id)
    return mutation_preview(repository, context, assertion)


@router.post("/relationship-candidates/decide")
def decide_relationship_candidates(
    body: RelationshipCandidateDecisionRequest, request: Request,
    authorization: str | None = Header(None),
):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context, policy = _candidate_context(
        repository, authorization, body.company_id, request, body.operational_unit_id,
    )
    permission = "graph.relationship_confirm" if body.decision == "confirm" else "graph.relationship_reject"
    policy.require(permission)
    if body.decision == "confirm" and not body.approval_confirmed:
        raise HTTPException(status_code=409, detail={
            "code": "RELATIONSHIP_APPROVAL_REQUIRED", "action": "preview_and_confirm",
        })
    if len(body.candidate_ids) > 1 and body.corrected_predicate:
        raise HTTPException(status_code=422, detail={
            "code": "BULK_RELATIONSHIP_EDIT_NOT_ALLOWED", "action": "edit_individually",
        })
    assertions = [_candidate_assertion(repository, context, item) for item in body.candidate_ids]
    if len(assertions) > 1:
        groups = {item.get("bulk_group_key") for item in assertions}
        if None in groups or len(groups) != 1:
            raise HTTPException(status_code=422, detail={
                "code": "RELATIONSHIP_BULK_GROUP_UNSAFE",
                "action": "review_candidates_individually",
            })
    baseline_packet = build_graph_packet(
        context, repository, limit=500, node_budget=36, edge_budget=72,
    )
    operation_id = new_bulk_operation_id()
    results = []
    for assertion in assertions:
        try:
            if body.decision == "confirm":
                result = confirm_candidate(
                    repository, context, assertion, reason=body.reason,
                    bulk_operation_id=operation_id,
                    corrected_predicate=body.corrected_predicate,
                )
                outcome = "edited_confirmed" if body.corrected_predicate else "confirmed"
            else:
                result = reject_candidate(
                    repository, context, assertion, reason=body.reason,
                    bulk_operation_id=operation_id,
                )
                outcome = "rejected"
            memory = record_correction_memory(
                body.company_id, assertion=result["assertion"], outcome=outcome,
                actor=context.user_id, event=result["event"],
            )
            results.append({
                "candidate_id": assertion["assertion_key"], "status": "success",
                **result, "idjwi_memory": memory,
            })
            log_event(
                f"company_graph.relationship_candidate.{outcome}",
                company_id=context.tenant_id, actor=context.user_id,
                subject=str(assertion["assertion_key"]),
                metadata={
                    "bulk_operation_id": operation_id,
                    "carrier_type": assertion.get("carrier_type"),
                    "carrier_record_id": assertion.get("carrier_record_id"),
                    "previous_values": result.get("previous_values") or {},
                    "new_values": result.get("new_values") or {},
                    "evidence_hash": assertion.get("evidence_hash"),
                    "confidence": (assertion.get("evidence") or [{}])[0]
                        .get("matching_fields", {}).get("confidence"),
                    "reason": body.reason,
                },
                status="success",
            )
        except HTTPException as error:
            results.append({
                "candidate_id": assertion["assertion_key"], "status": "failed",
                "error": error.detail,
            })
    cache_invalidate(context.tenant_id)
    successful = sum(item["status"] == "success" for item in results)
    outcome_packet = (
        build_graph_packet(context, repository, limit=500, node_budget=36, edge_budget=72)
        if successful else baseline_packet
    )
    def measurement(packet):
        return {
            "visible_nodes": len(packet.nodes),
            "visible_edges": len(packet.edges),
            "connected_records": len({
                endpoint for edge in packet.edges for endpoint in (edge.source, edge.target)
            }),
            "unconnected_records": packet.quality.unconnected_count,
            "registry_gaps": next((
                item.count for item in packet.quality.issues
                if item.code == "RELATIONSHIP_REGISTRY_GAPS"
            ), 0),
            "legacy_links_requiring_confirmation": next((
                item.count for item in packet.quality.issues
                if item.code == "LEGACY_LINKS_REQUIRE_CONFIRMATION"
            ), 0),
            "disputed_or_rejected": sum(
                event.to_state in {"disputed", "rejected"}
                for event in packet.assertion_history
            ),
            "truncated_sources": len(packet.truncation.sources_at_limit),
            "omitted_nodes": packet.truncation.omitted_nodes,
            "selection_strategy": packet.truncation.selection_strategy,
            "preserved_relationship_edges": packet.truncation.preserved_relationship_edges,
        }
    baseline = measurement(baseline_packet)
    outcome = measurement(outcome_packet)
    quality_comparison = {
        "before": baseline,
        "after": outcome,
        "change": {
            key: outcome[key] - baseline[key]
            for key in (
                "visible_edges", "connected_records", "unconnected_records",
                "registry_gaps", "legacy_links_requiring_confirmation",
            )
        },
    }
    log_event(
        "company_graph.relationship_review.quality_measured",
        company_id=context.tenant_id, actor=context.user_id,
        subject=operation_id, metadata=quality_comparison,
        status="success" if successful else "unchanged",
    )
    return {
        "contract_version": REVIEW_CONTRACT_VERSION,
        "bulk_operation_id": operation_id,
        "decision": body.decision,
        "summary": {
            "requested": len(results), "successful": successful,
            "failed": len(results) - successful,
        },
        "results": results,
        "graph_refresh_required": successful > 0,
        "quality_refresh_required": successful > 0,
        "quality_comparison": quality_comparison,
        "highlight": [
            {
                "source": item["assertion"].get("source_node_id"),
                "predicate": item["assertion"].get("predicate"),
                "target": item["assertion"].get("target_node_id"),
            }
            for item in results if item["status"] == "success" and body.decision == "confirm"
        ],
    }


@router.post("/relationship-candidates/detect")
def detect_candidate_queue(
    body: RelationshipCandidateDetectionRequest, request: Request,
    authorization: str | None = Header(None),
):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context, policy = _candidate_context(
        repository, authorization, body.company_id, request, body.operational_unit_id,
    )
    policy.require("graph.relationship_propose")
    requested = set(body.object_types or graph_entity_types())
    unknown = []
    readable = []
    for entity_type in sorted(requested):
        try:
            definition_for(entity_type)
        except ValueError:
            unknown.append(entity_type)
            continue
        if policy.can_read_entity(entity_type):
            readable.append(entity_type)
    futures = {
        GRAPH_IO_EXECUTOR.submit(
            repository.list_entities, context, entity_type, limit=body.max_per_type
        ): entity_type
        for entity_type in readable
    }
    records, unavailable = {}, []
    for future in as_completed(futures):
        entity_type = futures[future]
        try:
            records[entity_type] = future.result().data or []
        except Exception as error:
            unavailable.append({
                "entity_type": entity_type,
                "category": "source_unavailable",
                "message": str(error),
                "retryable": True,
            })
    candidates = detect_relationship_candidates(context.tenant_id, records)
    review_candidates = [item for item in candidates if requires_governed_review(item)]
    persistence = persist_relationship_candidates(repository, context, review_candidates)
    log_event(
        "company_graph.relationship_candidates.detected",
        company_id=context.tenant_id, actor=context.user_id,
        metadata={
            "detected": len(candidates), "review_required": len(review_candidates),
            "created": persistence["created"], "updated": persistence["updated"],
            "suppressed_rejections": persistence["suppressed_rejections"],
        },
        status="partial" if unavailable else "success",
    )
    cache_invalidate(context.tenant_id)
    return {
        "contract_version": RELATIONSHIP_CANDIDATE_VERSION,
        "company_id": context.tenant_id,
        "scope": {"type": context.scope_type, "id": context.scope_id},
        "evaluated_object_types": readable,
        "unknown_object_types": unknown,
        "unavailable_sources": unavailable,
        "summary": {
            "detected": len(candidates),
            "review_required": len(review_candidates),
            **{key: persistence[key] for key in (
                "created", "updated", "unchanged", "suppressed_rejections"
            )},
        },
        "candidates": [item.model_dump() for item in review_candidates],
    }


def _packet(company_id: str, authorization: str | None, request: Request, *, center=None, depth=1, limit=500,
            node_budget=36, edge_budget=72, continuation_token=None, operational_unit_id=""):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(
        authorization, company_id, request_id=getattr(request.state, "request_id", ""), operational_unit_id=operational_unit_id,
    )
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require_scope(operational_unit_id)
    try:
        offsets = decode_continuation(
            continuation_token, tenant_id=context.tenant_id, fingerprint=policy.fingerprint(),
            scope_id=context.scope_id or context.tenant_id,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail={"code": "GRAPH_CONTINUATION_INVALID", "category": "governance", "message": str(error), "action": "restart_graph_query", "retryable": False})
    key = (company_id, policy.fingerprint(), center or "overview", depth, limit, node_budget, edge_budget, continuation_token or "", operational_unit_id, cache_generation(company_id))
    cached = cache_get(key)
    if cached:
        cached.provenance.cache = "hit"
        return cached
    with single_flight(key):
        # Another worker may have completed the rebuild while this request
        # waited. Recheck before touching Supabase.
        cached = cache_get(key)
        if cached:
            cached.provenance.cache = "hit"
            return cached
        if center:
            records = direct_neighborhood_records(context, repository, center, depth, per_query_limit=max(20, min(100, node_budget)))
            packet = build_graph_packet(
                context, repository, center=center, depth=depth, limit=limit,
                node_budget=node_budget, edge_budget=edge_budget, preloaded_records=records,
            )
        else:
            packet = build_graph_packet(
                context, repository, limit=limit, node_budget=node_budget,
                edge_budget=edge_budget, offsets=offsets,
            )
        packet.provenance.cache = "miss"
        packet.provenance.scope_type = context.scope_type
        packet.provenance.scope_id = context.scope_id
        # Do not repopulate an invalidated generation after a concurrent write.
        if key[-1] == cache_generation(company_id):
            cache_put(key, packet)
        return packet


@router.get("/overview")
def graph_overview(request: Request, company_id: str = Query(...), limit: int = Query(500, ge=1, le=2000),
                   node_budget: int = Query(36, ge=20, le=1000), edge_budget: int = Query(72, ge=20, le=2000),
                   continuation_token: str | None = Query(None), operational_unit_id: str = Query(""), authorization: str | None = Header(None)):
    return _packet(company_id, authorization, request, limit=limit, node_budget=node_budget, edge_budget=edge_budget,
                   continuation_token=continuation_token, operational_unit_id=operational_unit_id)


@router.get("/surface/{surface}")
def graph_surface(
    surface: str, request: Request, company_id: str = Query(...),
    operational_unit_id: str = Query(""), authorization: str | None = Header(None),
):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context, policy = _candidate_context(
        repository, authorization, company_id, request, operational_unit_id,
    )
    policy.require("graph.read")
    packet = build_graph_packet(
        context, repository, limit=500,
        node_budget=36 if surface in {"web", "desktop"} else 20,
        edge_budget=72 if surface in {"web", "desktop"} else 30,
    )
    return surface_projection(packet, context, surface)


@router.post("/mobile/manager/decision")
def mobile_manager_decision(
    body: MobileManagerDecisionRequest, request: Request,
    authorization: str | None = Header(None),
):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context, policy = _candidate_context(
        repository, authorization, body.company_id, request, body.operational_unit_id,
    )
    policy.require("graph.action_approve")
    projection = surface_projection(
        build_graph_packet(context, repository, limit=500, node_budget=20, edge_budget=30),
        context, "mobile_manager",
    )
    allowed = projection.get("mobile_actions", {}).get(body.node_id, [])
    if body.decision not in allowed:
        raise HTTPException(status_code=409, detail={
            "code": "MOBILE_ACTION_NOT_PERMITTED",
            "category": "governance",
            "message": "This record is not awaiting that decision in the manager's authorized mobile scope.",
            "action": "refresh_mobile_context",
            "retryable": False,
        })
    try:
        entity_type, record_id = body.node_id.split(":", 1)
    except ValueError as error:
        raise HTTPException(status_code=422, detail={"code": "GRAPH_NODE_ID_INVALID"}) from error
    timestamp = datetime.now(timezone.utc).isoformat()
    if entity_type == "recommendation":
        payload = {
            "is_actioned": body.decision == "approve",
            "is_dismissed": body.decision == "reject",
            "action_taken": body.reason,
            "actioned_at": timestamp,
            "actioned_by": context.user_id,
        }
    elif entity_type == "decision":
        payload = {
            "outcome": "approved" if body.decision == "approve" else "rejected",
            "outcome_notes": body.reason,
            "decided_at": timestamp,
            "decided_by": context.user_id,
        }
    else:
        raise HTTPException(status_code=422, detail={
            "code": "MOBILE_ACTION_TYPE_UNSUPPORTED",
            "message": "Only governed recommendation and decision records can be decided from this surface.",
        })
    record = repository.update_entity(context, entity_type, record_id, payload).data
    cache_invalidate(body.company_id)
    log_event(
        f"company_graph.mobile_manager.{body.decision}",
        company_id=body.company_id, actor=context.user_id, subject=body.node_id,
        metadata={
            "reason": body.reason,
            "surface": "mobile_manager",
            "operational_unit_id": body.operational_unit_id or None,
        },
        status="success",
    )
    return {
        "contract_version": "company-graph-mobile-action.v1",
        "node_id": body.node_id,
        "decision": body.decision,
        "record": record,
        "graph_refresh_required": True,
        "audit_recorded": True,
    }


@router.post("/mobile/worker/report", status_code=201)
def mobile_worker_report(
    body: MobileWorkerReportRequest, request: Request,
    authorization: str | None = Header(None),
):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context, policy = _candidate_context(
        repository, authorization, body.company_id, request, body.operational_unit_id,
    )
    required_permission = (
        "graph.mobile_evidence_capture"
        if body.report_type == "evidence"
        else "graph.mobile_correction_report"
    )
    policy.require(required_permission)
    projection = surface_projection(
        build_graph_packet(context, repository, limit=500, node_budget=20, edge_budget=30),
        context, "mobile_worker",
    )
    if projection["readiness"] != "ready":
        raise HTTPException(status_code=409, detail={
            "code": "WORKER_ASSIGNMENT_IDENTITY_REQUIRED",
            "category": "governance",
            "message": "The worker identity must be connected to an assigned task before evidence or corrections can be submitted.",
            "action": "request_assignment_identity",
            "retryable": False,
        })
    allowed = projection.get("mobile_actions", {}).get(body.subject_node_id, [])
    expected_action = "capture_evidence" if body.report_type == "evidence" else "report_correction"
    if expected_action not in allowed:
        raise HTTPException(status_code=403, detail={
            "code": "WORKER_SUBJECT_OUTSIDE_ASSIGNMENT",
            "category": "authorization",
            "message": "The selected record is outside the worker's assignment-scoped mobile context.",
            "action": "refresh_mobile_context",
            "retryable": False,
        })
    try:
        subject_type, subject_record_id = body.subject_node_id.split(":", 1)
    except ValueError as error:
        raise HTTPException(status_code=422, detail={"code": "GRAPH_NODE_ID_INVALID"}) from error
    evidence = []
    for item in body.evidence:
        evidence.append({
            key: item[key] for key in (
                "kind", "label", "source_url", "captured_at", "latitude", "longitude"
            ) if key in item
        })
    report = repository.create_entity(context, "graph_field_report", {
        "operational_unit_id": body.operational_unit_id or None,
        "report_type": body.report_type,
        "subject_node_id": body.subject_node_id,
        "subject_type": subject_type,
        "subject_record_id": subject_record_id,
        "description": body.description,
        "evidence": evidence,
        "proposed_correction": body.proposed_correction if body.report_type == "correction" else {},
        "status": "submitted",
        "reported_by": context.user_id,
        "reported_at": datetime.now(timezone.utc).isoformat(),
    }).data
    log_event(
        f"company_graph.mobile_worker.{body.report_type}_reported",
        company_id=body.company_id, actor=context.user_id, subject=body.subject_node_id,
        metadata={
            "report_id": report.get("id"),
            "surface": "mobile_worker",
            "evidence_count": len(evidence),
            "has_proposed_correction": bool(body.proposed_correction),
        },
        status="success",
    )
    return {
        "contract_version": "company-graph-mobile-report.v1",
        "report": report,
        "audit_recorded": True,
        "canonical_record_changed": False,
        "next_step": "manager_or_data_steward_review",
    }


@router.get("/neighborhood/{entity_type}/{entity_id}")
def graph_neighborhood(entity_type: str, entity_id: str, request: Request,
                       company_id: str = Query(...), depth: int = Query(1, ge=1, le=3),
                       limit: int = Query(500, ge=1, le=2000), node_budget: int = Query(160, ge=10, le=500),
                       edge_budget: int = Query(240, ge=10, le=1000), operational_unit_id: str = Query(""), authorization: str | None = Header(None)):
    return _packet(company_id, authorization, request, center=f"{entity_type}:{entity_id}", depth=depth, limit=limit,
                   node_budget=node_budget, edge_budget=edge_budget, operational_unit_id=operational_unit_id)


@router.get("/search")
def graph_search(request: Request, company_id: str = Query(...), q: str = Query(..., min_length=2, max_length=100),
                 limit: int = Query(25, ge=1, le=100), operational_unit_id: str = Query(""),
                 authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(
        authorization, company_id, request_id=getattr(request.state, "request_id", ""),
        operational_unit_id=operational_unit_id,
    )
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require_scope(operational_unit_id)
    results = []
    source_status = []
    # Search the operational identities operators most commonly navigate to;
    # all fields remain graph-safe projections.
    search_types = tuple(entity_type for entity_type in (
        "enterprise", "operational_unit", "person", "task", "product", "service",
        "transaction", "address", "risk", "opportunity", "recommendation",
        "decision", "schedule", "observation",
    ) if policy.can_read_entity(entity_type))
    futures = {
        GRAPH_IO_EXECUTOR.submit(repository.search_entities, context, entity_type, q, limit=max(2, limit // 5)): entity_type
        for entity_type in search_types
    }
    for future in as_completed(futures):
        entity_type = futures[future]
        try:
            result = future.result()
            rows = result.data or []
            source_status.append({"source_id": entity_type, "state": "empty" if not rows else "available", "returned_records": len(rows), "duration_ms": result.duration_ms})
        except Exception as error:
            source_status.append({
                "source_id": entity_type,
                "state": "unavailable",
                "returned_records": 0,
                "duration_ms": None,
                "failure_category": "timeout" if "timeout" in type(error).__name__.lower() else "data_source",
                "affected_capabilities": ["graph_search"],
                "retryable": True,
                "operator_action": "Check the canonical Supabase source and retry search.",
            })
            continue
        for row in rows:
            projection = project_record(entity_type, row, include_role_restricted=policy.allows("graph.read_sensitive"))
            results.append(GraphNodeSummary(
                id=f"{entity_type}:{row['id']}", entity_type=entity_type, entity_id=str(row["id"]),
                label=projection["label"], sublabel=projection["sublabel"], status=projection["status"],
                sensitivity=policy.sensitivity_for(entity_type), attributes=projection["attributes"],
                permitted_actions=policy.node_actions(),
            ))
    results.sort(key=lambda node: (search_types.index(node.entity_type), node.label.lower(), node.id))
    edge_results = []
    connected_record_ids = set()
    try:
        packet = _packet(
            company_id, authorization, request, limit=200, node_budget=36,
            edge_budget=72, operational_unit_id=operational_unit_id,
        )
        query = q.casefold()
        node_lookup = {node.id: node for node in packet.nodes}
        directly_matched = {node.id for node in results}
        for edge in packet.edges:
            source, target = node_lookup.get(edge.source), node_lookup.get(edge.target)
            predicate_match = query in str(edge.predicate or edge.label).replace("_", " ").casefold()
            connected_match = (
                edge.source in directly_matched or edge.target in directly_matched
                or query in str(source.label if source else "").casefold()
                or query in str(target.label if target else "").casefold()
            )
            if not predicate_match and not connected_match:
                continue
            edge_results.append({
                "id": edge.id, "source": edge.source, "source_label": source.label if source else edge.source,
                "predicate": edge.predicate, "label": edge.label,
                "target": edge.target, "target_label": target.label if target else edge.target,
                "confidence": edge.confidence, "assertion_class": edge.assertion_class,
                "match_reason": "predicate" if predicate_match else "connected_record",
            })
            connected_record_ids.update((edge.source, edge.target))
        existing_ids = {node.id for node in results}
        results.extend(
            node for node in packet.nodes
            if node.id in connected_record_ids and node.id not in existing_ids
        )
    except Exception:
        # Canonical search results remain useful and explicitly partial when
        # semantic edge expansion is unavailable.
        source_status.append({
            "source_id": "graph_relationship_context", "state": "unavailable",
            "returned_records": 0, "failure_category": "data_source",
            "affected_capabilities": ["predicate_search", "connected_record_search"],
            "retryable": True, "operator_action": "Retry after graph sources recover.",
        })
    unavailable = [source for source in source_status if source["state"] == "unavailable"]
    return {"contract_version": "company-graph.v1", "company_id": context.tenant_id,
            "query": q, "results": results[:limit], "truncated": len(results) > limit,
            "edge_results": edge_results[:limit],
            "coverage": ["labels", "record_references", "predicates", "operational_units", "status", "risk", "address", "connected_records"],
            "authorization_enforced": True, "partial": bool(unavailable),
            "source_status": sorted(source_status, key=lambda source: source["source_id"])}


@router.get("/edge/explain")
def explain_edge(request: Request, company_id: str = Query(...), edge_id: str = Query(...),
                 source: str = Query(...), target: str = Query(...), authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(
        authorization, company_id, request_id=getattr(request.state, "request_id", ""),
    )
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require("graph.read")

    # Edge IDs contain only governed graph identifiers and an evidence locator.
    # Rebuild the requested edge from the tenant-filtered evidence record rather
    # than searching a whole overview or trusting browser-supplied claims.
    parts = edge_id.split("|")
    if len(parts) != 4 or parts[0] != source or parts[2] != target:
        raise HTTPException(status_code=404, detail={"code": "GRAPH_EDGE_NOT_FOUND", "category": "empty_data", "message": "The governed edge is not visible in this tenant context.", "action": "refresh_graph", "retryable": False})
    try:
        source_type, source_id = source.split(":", 1)
        target_type, target_id = target.split(":", 1)
        evidence_table, evidence_record_id = parts[3].rsplit(":", 1)
        if not evidence_table.startswith("public."):
            raise ValueError("unsupported evidence zone")
        carrier_type, _definition = definition_for(evidence_table.split(".", 1)[1])
    except (ValueError, KeyError):
        raise HTTPException(status_code=404, detail={"code": "GRAPH_EDGE_NOT_FOUND", "category": "empty_data", "message": "The governed edge is not visible in this tenant context.", "action": "refresh_graph", "retryable": False})

    requested_records = {
        (source_type, source_id), (target_type, target_id),
        (carrier_type, evidence_record_id),
    }
    if any(not policy.can_read_entity(entity_type) for entity_type, _record_id in requested_records):
        raise HTTPException(status_code=404, detail={"code": "GRAPH_EDGE_NOT_FOUND", "category": "empty_data", "message": "The governed edge is not visible in this tenant context.", "action": "refresh_graph", "retryable": False})
    futures = {
        GRAPH_IO_EXECUTOR.submit(repository.get_entity, context, entity_type, record_id): (entity_type, record_id)
        for entity_type, record_id in requested_records
    }
    records = {}
    for future in as_completed(futures):
        entity_type, _record_id = futures[future]
        row = future.result().data
        if row:
            records.setdefault(entity_type, []).append(row)

    packet = build_graph_packet(
        context, repository, center=source, depth=1,
        node_budget=10, edge_budget=20, preloaded_records=records,
    )
    edge = next((candidate for candidate in packet.edges if candidate.id == edge_id and candidate.target == target), None)
    if not edge:
        raise HTTPException(status_code=404, detail={"code": "GRAPH_EDGE_NOT_FOUND", "category": "empty_data", "message": "The governed edge is not visible in this tenant context.", "action": "refresh_graph", "retryable": False})

    # Apply any durable confirmation/rejection history to the reconstructed
    # edge. This preserves assertion governance for direct explanations.
    assertion_rows = repository.list_entities_filtered(
        context, "graph_assertion", filters={"assertion_key": edge.assertion_key}, limit=10,
    ).data or []
    if assertion_rows:
        records["graph_assertion"] = assertion_rows
        assertion_keys = [row.get("assertion_key") for row in assertion_rows if row.get("assertion_key")]
        event_rows = repository.list_entities_filtered(
            context, "graph_assertion_event", filters={"assertion_key": assertion_keys}, limit=100,
        ).data or []
        records["graph_assertion_event"] = event_rows
        packet = build_graph_packet(
            context, repository, center=source, depth=1,
            node_budget=10, edge_budget=20, preloaded_records=records,
        )
        edge = next((candidate for candidate in packet.edges if candidate.id == edge_id and candidate.target == target), None)
        if not edge:
            raise HTTPException(status_code=404, detail={"code": "GRAPH_EDGE_NOT_FOUND", "category": "empty_data", "message": "The governed edge is no longer active in this tenant context.", "action": "refresh_graph", "retryable": False})
    nodes = {node.id: node for node in packet.nodes}
    return {"edge": edge, "source_node": nodes.get(edge.source), "target_node": nodes.get(edge.target), "company_id": company_id, "tenant_verified": True}


class RelationshipGovernanceRequest(BaseModel):
    company_id: str
    edge_id: str
    source_type: str
    source_id: str
    target_type: str
    target_id: str
    predicate: str
    reason: str = ""
    approval_confirmed: bool = False


class GraphExportRequest(BaseModel):
    company_id: str
    purpose: str = Field(min_length=3, max_length=500)
    operational_unit_id: str = ""
    included_object_types: list[str] = Field(default_factory=list, max_length=50)
    included_node_ids: list[str] = Field(default_factory=list, max_length=2000)


class GraphAuditRequest(BaseModel):
    company_id: str
    event: str
    subject: str = ""
    metadata: dict = Field(default_factory=dict)


class AssertionStateRequest(RelationshipGovernanceRequest):
    state: str
    superseded_by: str | None = None
    evidence_version: int | None = Field(default=None, ge=1)


class AssertionOutcomeRequest(BaseModel):
    company_id: str
    assertion_key: str = Field(min_length=8, max_length=128)
    outcome: str
    observed_at: str | None = None
    evidence: list[dict] = Field(default_factory=list, max_length=50)
    notes: str = Field(default="", max_length=1000)


class RelationshipEditRequest(RelationshipGovernanceRequest):
    corrected_predicate: str


@router.post("/audit")
def graph_audit(body: GraphAuditRequest, request: Request, authorization: str | None = Header(None)):
    allowed = {
        "opened", "scope_changed", "node_inspected", "edge_inspected",
        "citation_inspected", "view_saved", "exported", "neighborhood_failed",
        "idjwi_workspace_action",
        "correction_reported",
    }
    if body.event not in allowed:
        raise HTTPException(status_code=422, detail={"code": "GRAPH_AUDIT_EVENT_INVALID"})
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, body.company_id, request_id=getattr(request.state, "request_id", ""))
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require("graph.read")
    if body.event == "exported":
        policy.require("graph.export")
    log_event(f"company_graph.{body.event}", company_id=body.company_id, actor=context.user_id, subject=body.subject or body.company_id, metadata=body.metadata, status="success")
    return {"recorded": True}


@router.post("/export")
def export_graph(body: GraphExportRequest, request: Request, authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(
        authorization, body.company_id,
        request_id=getattr(request.state, "request_id", ""),
        operational_unit_id=body.operational_unit_id,
    )
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require("graph.export")
    policy.require_scope(body.operational_unit_id)
    packet = build_graph_packet(context, repository, limit=500)
    exported = governed_export(
        packet, actor=context.user_id, purpose=body.purpose,
        included_object_types=body.included_object_types,
        included_node_ids=body.included_node_ids,
    )
    metadata = exported["export_metadata"]
    log_event(
        "company_graph.exported", company_id=body.company_id,
        actor=context.user_id, subject=body.operational_unit_id or body.company_id,
        metadata=metadata, status="success",
    )
    return exported


def _existing_assertion(repository, context, assertion_key: str) -> dict | None:
    rows = repository.list_entities(context, "graph_assertion", limit=5000).data or []
    return next((row for row in rows if row.get("assertion_key") == assertion_key), None)


def _ensure_proposal_recorded(repository, context, edge, *, reason: str) -> dict:
    existing = _existing_assertion(repository, context, edge.assertion_key)
    if existing:
        if existing.get("assertion_state") == "rejected":
            raise HTTPException(status_code=409, detail={
                "code": "RELATIONSHIP_PROPOSAL_PREVIOUSLY_REJECTED",
                "category": "governance",
                "message": "This assertion was previously rejected and remains suppressed.",
                "action": "review_assertion_history",
                "retryable": False,
            })
        return {"assertion": existing, "event": None, "created": False}
    transition = persist_assertion_transition(
        repository, context, edge, "proposed",
        reason=reason or "Idjwi recorded a governed relationship proposal for operator review.",
    )
    return {**transition, "created": True}


@router.post("/relationship/propose", status_code=201)
def propose_relationship(body: RelationshipGovernanceRequest, request: Request, authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, body.company_id, request_id=getattr(request.state, "request_id", ""))
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require("graph.relationship_propose")
    packet = build_graph_packet(context, repository, limit=500)
    edge = next((candidate for candidate in packet.edges if candidate.id == body.edge_id), None)
    if not edge or edge.assertion_class not in {"deterministic_derivation", "analytical_inference", "advisor_proposal"}:
        raise HTTPException(status_code=404, detail={"code": "RELATIONSHIP_PROPOSAL_NOT_FOUND", "action": "refresh_graph"})
    supplied = (f"{body.source_type}:{body.source_id}", f"{body.target_type}:{body.target_id}", body.predicate)
    if supplied != (edge.source, edge.target, edge.predicate):
        raise HTTPException(status_code=409, detail={"code": "RELATIONSHIP_PROPOSAL_MISMATCH", "action": "refresh_graph"})
    transition = _ensure_proposal_recorded(
        repository, context, edge,
        reason=body.reason or "Idjwi identified this possible relationship for governed review.",
    )
    cache_invalidate(body.company_id)
    log_event(
        "company_graph.relationship.proposed", company_id=body.company_id,
        actor=context.user_id, subject=edge.id,
        metadata={"assertion_key": edge.assertion_key, "predicate": edge.predicate, "evidence_ids": [item.evidence_id for item in edge.evidence]},
        status="success",
    )
    return {"assertion": transition["assertion"], "event": transition["event"], "created": transition["created"], "graph_refresh_required": True}


@router.post("/relationship/confirm", status_code=201)
def confirm_relationship(body: RelationshipGovernanceRequest, request: Request, authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, body.company_id, request_id=getattr(request.state, "request_id", ""))
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require("graph.relationship_confirm")
    packet = build_graph_packet(context, repository, limit=500)
    edge, source, target = validate_relationship_proposal(packet, body, policy)
    payload = relationship_payload(source, target, edge.predicate, context.user_id, body.reason)
    existing = repository.list_entities(context, "relationship", limit=5000).data or []
    ensure_no_relationship_conflict(existing, payload)
    _ensure_proposal_recorded(
        repository, context, edge,
        reason="Proposal recorded before the operator confirmation decision.",
    )
    created = repository.create_entity(context, "relationship", payload).data
    transition = persist_assertion_transition(
        repository, context, edge, "confirmed",
        reason=body.reason or "Operator confirmed the proposal.",
    )
    memory = record_correction_memory(
        body.company_id, assertion=transition["assertion"], outcome="confirmed",
        actor=context.user_id, event=transition["event"],
    )
    cache_invalidate(body.company_id)
    log_event("company_graph.relationship.confirmed", company_id=body.company_id, actor=context.user_id, subject=created.get("id"), metadata={"edge_id": body.edge_id, "predicate": body.predicate, "reason": body.reason}, status="success")
    return {"record": created, "assertion": transition["assertion"], "event": transition["event"], "graph_refresh_required": True, "idjwi_feedback": "canonical_relationship_confirmed", "idjwi_memory": memory}


@router.post("/relationship/reject")
def reject_relationship(body: RelationshipGovernanceRequest, request: Request, authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, body.company_id, request_id=getattr(request.state, "request_id", ""))
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require("graph.relationship_reject")
    packet = build_graph_packet(context, repository, limit=500)
    edge = next((candidate for candidate in packet.edges if candidate.id == body.edge_id), None)
    if not edge or edge.assertion_class not in {"deterministic_derivation", "analytical_inference", "advisor_proposal"}:
        raise HTTPException(status_code=404, detail={"code": "RELATIONSHIP_PROPOSAL_NOT_FOUND", "category": "empty_data", "message": "The proposal is not present in the operator's authorized graph.", "action": "refresh_graph"})
    if (f"{body.source_type}:{body.source_id}", f"{body.target_type}:{body.target_id}", body.predicate) != (edge.source, edge.target, edge.predicate):
        raise HTTPException(status_code=409, detail={"code": "RELATIONSHIP_PROPOSAL_MISMATCH", "category": "governance", "message": "The submitted relationship does not match the governed proposal.", "action": "refresh_graph"})
    _ensure_proposal_recorded(
        repository, context, edge,
        reason="Proposal recorded before the operator rejection decision.",
    )
    transition = persist_assertion_transition(
        repository, context, edge, "rejected",
        reason=body.reason or "Operator rejected derived connection",
    )
    memory = record_correction_memory(
        body.company_id, assertion=transition["assertion"], outcome="rejected",
        actor=context.user_id, event=transition["event"],
    )
    log_event("company_graph.relationship.rejected", company_id=body.company_id, actor=context.user_id, subject=edge.id, metadata={"predicate": edge.predicate, "reason": body.reason or "Operator rejected derived connection", "assertion_key": edge.assertion_key}, status="success")
    cache_invalidate(body.company_id)
    return {"recorded": True, "assertion": transition["assertion"], "event": transition["event"], "idjwi_feedback": "derived_relationship_rejected", "idjwi_memory": memory, "graph_refresh_required": True}


@router.post("/relationship/edit", status_code=201)
def edit_relationship_proposal(body: RelationshipEditRequest, request: Request, authorization: str | None = Header(None)):
    if not body.approval_confirmed:
        raise HTTPException(status_code=409, detail={"code": "RELATIONSHIP_APPROVAL_REQUIRED", "action": "confirm_approval"})
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, body.company_id, request_id=getattr(request.state, "request_id", ""))
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require("graph.relationship_confirm")
    packet = build_graph_packet(context, repository, limit=500)
    edge = next((candidate for candidate in packet.edges if candidate.id == body.edge_id), None)
    if not edge or edge.assertion_class not in {"deterministic_derivation", "analytical_inference", "advisor_proposal"}:
        raise HTTPException(status_code=404, detail={"code": "RELATIONSHIP_PROPOSAL_NOT_FOUND", "action": "refresh_graph"})
    supplied = (f"{body.source_type}:{body.source_id}", f"{body.target_type}:{body.target_id}", body.predicate)
    if supplied != (edge.source, edge.target, edge.predicate):
        raise HTTPException(status_code=409, detail={"code": "RELATIONSHIP_PROPOSAL_MISMATCH", "action": "refresh_graph"})
    nodes = {node.id: node for node in packet.nodes}
    source, target = nodes.get(edge.source), nodes.get(edge.target)
    predicate = PREDICATES.get(body.corrected_predicate)
    if not predicate or not source or not target:
        raise HTTPException(status_code=422, detail={"code": "RELATIONSHIP_CORRECTION_INVALID", "action": "choose_allowed_predicate"})
    if (
        ("*" not in predicate["source_types"] and source.entity_type not in predicate["source_types"])
        or ("*" not in predicate["target_types"] and target.entity_type not in predicate["target_types"])
    ):
        raise HTTPException(status_code=422, detail={"code": "RELATIONSHIP_PREDICATE_SHAPE_INVALID", "action": "choose_allowed_predicate"})
    payload = relationship_payload(source, target, body.corrected_predicate, context.user_id, body.reason)
    existing = repository.list_entities(context, "relationship", limit=5000).data or []
    ensure_no_relationship_conflict(existing, payload)
    _ensure_proposal_recorded(repository, context, edge, reason="Original proposal recorded before operator correction.")
    created = repository.create_entity(context, "relationship", payload).data
    corrected_edge = edge.model_copy(deep=True)
    corrected_edge.id = f"{edge.source}|{body.corrected_predicate}|{edge.target}|operator:{created['id']}"
    corrected_edge.predicate = body.corrected_predicate
    corrected_edge.label = predicate.get("label") or body.corrected_predicate.replace("_", " ")
    corrected_edge.assertion_class = "operator_confirmed_assertion"
    corrected_edge.assertion_key = stable_assertion_key(
        corrected_edge.source, corrected_edge.predicate, corrected_edge.target, None,
    )
    corrected_edge.assertion_state = "confirmed"
    corrected_edge.verification_state = "verified"
    corrected = persist_assertion_transition(
        repository, context, corrected_edge, "confirmed",
        reason=body.reason or "Operator confirmed the corrected relationship.",
    )
    original = persist_assertion_transition(
        repository, context, edge, "superseded",
        reason=body.reason or f"Operator replaced predicate {edge.predicate} with {body.corrected_predicate}.",
        superseded_by=str(corrected["assertion"]["id"]),
    )
    memory = record_correction_memory(
        body.company_id, assertion=corrected["assertion"], outcome="edited_confirmed",
        actor=context.user_id, event=corrected["event"],
    )
    cache_invalidate(body.company_id)
    log_event(
        "company_graph.relationship.edited", company_id=body.company_id,
        actor=context.user_id, subject=created.get("id"),
        metadata={"original_assertion_key": edge.assertion_key, "corrected_assertion_key": corrected_edge.assertion_key, "from_predicate": edge.predicate, "to_predicate": body.corrected_predicate},
        status="success",
    )
    return {
        "record": created, "superseded_assertion": original["assertion"],
        "assertion": corrected["assertion"], "event": corrected["event"],
        "idjwi_memory": memory, "graph_refresh_required": True,
    }


@router.post("/relationship/outcome", status_code=201)
def observe_relationship_outcome(body: AssertionOutcomeRequest, request: Request, authorization: str | None = Header(None)):
    if body.outcome not in {"supported", "refuted", "inconclusive"}:
        raise HTTPException(status_code=422, detail={"code": "GRAPH_OUTCOME_INVALID"})
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, body.company_id, request_id=getattr(request.state, "request_id", ""))
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require("graph.relationship_confirm")
    assertion = _existing_assertion(repository, context, body.assertion_key)
    if not assertion:
        raise HTTPException(status_code=404, detail={"code": "GRAPH_ASSERTION_NOT_FOUND", "action": "refresh_graph"})
    outcome = repository.create_entity(context, "graph_assertion_outcome", {
        "assertion_id": assertion["id"],
        "assertion_key": body.assertion_key,
        "outcome": body.outcome,
        "observed_at": body.observed_at,
        "evidence": body.evidence,
        "notes": body.notes,
        "actor_user_id": context.user_id,
    }).data
    memory = record_correction_memory(
        body.company_id, assertion=assertion, outcome=body.outcome,
        actor=context.user_id, observed_evidence=body.evidence,
    )
    log_event(
        "company_graph.relationship.outcome_observed", company_id=body.company_id,
        actor=context.user_id, subject=body.assertion_key,
        metadata={"outcome_id": outcome.get("id"), "outcome": body.outcome, "evidence_count": len(body.evidence), "memory_saved": memory.get("saved", False)},
        status="success",
    )
    return {"outcome": outcome, "idjwi_memory": memory, "graph_refresh_required": False}


@router.post("/relationship/state")
def transition_relationship_state(body: AssertionStateRequest, request: Request, authorization: str | None = Header(None)):
    if body.state not in ASSERTION_STATES or body.state in {"confirmed", "rejected"}:
        raise HTTPException(status_code=422, detail={
            "code": "ASSERTION_STATE_INVALID", "message": "Use confirm/reject endpoints for approval decisions.",
        })
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, body.company_id, request_id=getattr(request.state, "request_id", ""))
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require("graph.relationship_confirm")
    packet = build_graph_packet(context, repository, limit=500)
    edge = next((candidate for candidate in packet.edges if candidate.id == body.edge_id), None)
    if not edge:
        raise HTTPException(status_code=404, detail={"code": "GRAPH_ASSERTION_NOT_FOUND", "action": "refresh_graph"})
    if (f"{body.source_type}:{body.source_id}", f"{body.target_type}:{body.target_id}", body.predicate) != (edge.source, edge.target, edge.predicate):
        raise HTTPException(status_code=409, detail={"code": "RELATIONSHIP_PROPOSAL_MISMATCH", "action": "refresh_graph"})
    transition = persist_assertion_transition(
        repository, context, edge, body.state, reason=body.reason or f"Operator changed assertion to {body.state}.",
        evidence_version=body.evidence_version, superseded_by=body.superseded_by,
    )
    cache_invalidate(body.company_id)
    log_event("company_graph.relationship.state_changed", company_id=body.company_id, actor=context.user_id, subject=edge.id, metadata={"assertion_key": edge.assertion_key, "from_state": edge.assertion_state, "to_state": body.state, "reason": body.reason}, status="success")
    return {"assertion": transition["assertion"], "event": transition["event"], "graph_refresh_required": True, "idjwi_feedback": "assertion_history_updated"}
