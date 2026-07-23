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
from ontology.relationship_registry import registry_contract
from .assertion_governance import ASSERTION_STATES, persist_assertion_transition
from .bounded_queries import decode_continuation, direct_neighborhood_records
from .field_classification import project_record
from .contracts import GraphNodeSummary
from .execution import GRAPH_IO_EXECUTOR
from concurrent.futures import as_completed


router = APIRouter(prefix="/company-graph", tags=["Company Graph"])


@router.get("/predicates")
def graph_predicates():
    return {"predicates": [{"id": key, **value} for key, value in PREDICATES.items()]}


@router.get("/relationship-registry")
def graph_relationship_registry(request: Request, company_id: str = Query(...), authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, company_id, request_id=getattr(request.state, "request_id", ""))
    GraphAuthorizationPolicy.for_context(context).require("graph.read")
    return {**registry_contract(), "company_id": context.tenant_id, "tenant_verified": True}


def _packet(company_id: str, authorization: str | None, request: Request, *, center=None, depth=1, limit=500,
            node_budget=240, edge_budget=360, continuation_token=None, operational_unit_id=""):
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
                   node_budget: int = Query(240, ge=20, le=1000), edge_budget: int = Query(360, ge=20, le=2000),
                   continuation_token: str | None = Query(None), operational_unit_id: str = Query(""), authorization: str | None = Header(None)):
    return _packet(company_id, authorization, request, limit=limit, node_budget=node_budget, edge_budget=edge_budget,
                   continuation_token=continuation_token, operational_unit_id=operational_unit_id)


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
        "enterprise", "operational_unit", "person", "task", "product", "service", "transaction",
    ) if policy.can_read_entity(entity_type))
    futures = {
        GRAPH_IO_EXECUTOR.submit(repository.search_entities, context, entity_type, q, limit=max(2, limit // 3)): entity_type
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
    unavailable = [source for source in source_status if source["state"] == "unavailable"]
    return {"contract_version": "company-graph.v1", "company_id": context.tenant_id,
            "query": q, "results": results[:limit], "truncated": len(results) > limit,
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


@router.post("/audit")
def graph_audit(body: GraphAuditRequest, request: Request, authorization: str | None = Header(None)):
    allowed = {"opened", "scope_changed", "node_inspected", "edge_inspected", "view_saved", "exported"}
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
    created = repository.create_entity(context, "relationship", payload).data
    transition = persist_assertion_transition(
        repository, context, edge, "confirmed",
        reason=body.reason or "Operator confirmed the proposal.",
    )
    cache_invalidate(body.company_id)
    log_event("company_graph.relationship.confirmed", company_id=body.company_id, actor=context.user_id, subject=created.get("id"), metadata={"edge_id": body.edge_id, "predicate": body.predicate, "reason": body.reason}, status="success")
    return {"record": created, "assertion": transition["assertion"], "graph_refresh_required": True, "idjwi_feedback": "canonical_relationship_confirmed"}


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
    transition = persist_assertion_transition(
        repository, context, edge, "rejected",
        reason=body.reason or "Operator rejected derived connection",
    )
    log_event("company_graph.relationship.rejected", company_id=body.company_id, actor=context.user_id, subject=edge.id, metadata={"predicate": edge.predicate, "reason": body.reason or "Operator rejected derived connection", "assertion_key": edge.assertion_key}, status="success")
    cache_invalidate(body.company_id)
    return {"recorded": True, "assertion": transition["assertion"], "idjwi_feedback": "derived_relationship_rejected", "graph_refresh_required": True}


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
