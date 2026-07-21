from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from copilot.idjwi_observability import log_event

from onboarding.auth import verify_tenant_access
from tenant_context.supabase_repository import SupabaseTenantContextRepository

from .service import build_graph_packet
from .cache import get as cache_get, put as cache_put, invalidate as cache_invalidate
from .predicates import PREDICATES


router = APIRouter(prefix="/company-graph", tags=["Company Graph"])


@router.get("/predicates")
def graph_predicates():
    return {"predicates": [{"id": key, **value} for key, value in PREDICATES.items()]}


def _packet(company_id: str, authorization: str | None, request: Request, *, center=None, depth=1, limit=500, operational_unit_id=""):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(
        authorization, company_id, request_id=getattr(request.state, "request_id", ""), operational_unit_id=operational_unit_id,
    )
    if operational_unit_id and not center:
        center = f"enterprise:{operational_unit_id}"
        depth = 2
    key = (company_id, center or "overview", depth, limit, operational_unit_id)
    cached = cache_get(key)
    if cached:
        cached.provenance["cache"] = "hit"
        return cached
    packet = build_graph_packet(context, repository, center=center, depth=depth, limit=limit)
    packet.provenance["cache"] = "miss"
    packet.provenance["scope_type"] = context.scope_type
    packet.provenance["scope_id"] = context.scope_id
    cache_put(key, packet)
    return packet


@router.get("/overview")
def graph_overview(request: Request, company_id: str = Query(...), limit: int = Query(500, ge=1, le=2000),
                   operational_unit_id: str = Query(""), authorization: str | None = Header(None)):
    return _packet(company_id, authorization, request, limit=limit, operational_unit_id=operational_unit_id)


@router.get("/neighborhood/{entity_type}/{entity_id}")
def graph_neighborhood(entity_type: str, entity_id: str, request: Request,
                       company_id: str = Query(...), depth: int = Query(1, ge=1, le=3),
                       limit: int = Query(500, ge=1, le=2000), operational_unit_id: str = Query(""), authorization: str | None = Header(None)):
    return _packet(company_id, authorization, request, center=f"{entity_type}:{entity_id}", depth=depth, limit=limit, operational_unit_id=operational_unit_id)


@router.get("/edge/explain")
def explain_edge(request: Request, company_id: str = Query(...), edge_id: str = Query(...),
                 authorization: str | None = Header(None)):
    packet = _packet(company_id, authorization, request)
    edge = next((candidate for candidate in packet.edges if candidate.id == edge_id), None)
    if not edge:
        raise HTTPException(status_code=404, detail={"code": "GRAPH_EDGE_NOT_FOUND", "category": "empty_data", "message": "The governed edge is not visible in this tenant context.", "action": "refresh_graph", "retryable": False})
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


class GraphAuditRequest(BaseModel):
    company_id: str
    event: str
    subject: str = ""
    metadata: dict = Field(default_factory=dict)


@router.post("/audit")
def graph_audit(body: GraphAuditRequest, request: Request, authorization: str | None = Header(None)):
    allowed = {"opened", "scope_changed", "node_inspected", "edge_inspected", "view_saved", "exported"}
    if body.event not in allowed:
        raise HTTPException(status_code=422, detail={"code": "GRAPH_AUDIT_EVENT_INVALID"})
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, body.company_id, request_id=getattr(request.state, "request_id", ""))
    log_event(f"company_graph.{body.event}", company_id=body.company_id, actor=context.user_id, subject=body.subject or body.company_id, metadata=body.metadata, status="success")
    return {"recorded": True}


@router.post("/relationship/confirm", status_code=201)
def confirm_relationship(body: RelationshipGovernanceRequest, request: Request, authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, body.company_id, request_id=getattr(request.state, "request_id", ""))
    payload = {"relationship_type": body.predicate, "status": "active", "notes": body.reason or "Confirmed from Company Graph", "created_by": context.user_id}
    field_map = {"person": "person_id", "enterprise": "enterprise_id", "product": "item_id", "service": "service_id"}
    source_field, target_field = field_map.get(body.source_type), field_map.get(body.target_type)
    if not source_field or not target_field or source_field == target_field:
        raise HTTPException(status_code=422, detail={"code": "RELATIONSHIP_SHAPE_UNSUPPORTED", "message": "This relationship shape cannot yet be canonicalized.", "action": "open_relationship_editor"})
    payload[source_field] = body.source_id
    payload[target_field] = body.target_id
    created = repository.create_entity(context, "relationship", payload).data
    cache_invalidate(body.company_id)
    log_event("company_graph.relationship.confirmed", company_id=body.company_id, actor=context.user_id, subject=created.get("id"), metadata={"edge_id": body.edge_id, "predicate": body.predicate, "reason": body.reason}, status="success")
    return {"record": created, "graph_refresh_required": True, "idjwi_feedback": "canonical_relationship_confirmed"}


@router.post("/relationship/reject")
def reject_relationship(body: RelationshipGovernanceRequest, request: Request, authorization: str | None = Header(None)):
    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, body.company_id, request_id=getattr(request.state, "request_id", ""))
    log_event("company_graph.relationship.rejected", company_id=body.company_id, actor=context.user_id, subject=body.edge_id, metadata={"predicate": body.predicate, "reason": body.reason or "Operator rejected derived connection"}, status="success")
    cache_invalidate(body.company_id)
    return {"recorded": True, "idjwi_feedback": "derived_relationship_rejected", "graph_refresh_required": True}
