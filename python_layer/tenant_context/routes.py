from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from copilot.idjwi_observability import log_event
from onboarding.auth import verify_tenant_access

from .entity_registry import definition_for
from .supabase_repository import SupabaseTenantContextRepository
from .writable_registry import sanitize_create_payload


router = APIRouter(prefix="/tenant-context", tags=["Tenant Context"])


class OntologyCreateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    company_id: str


def _refresh_analytics(context, repository):
    try:
        from data_zones.analytics_products import refresh_tenant_analytics
        refresh_tenant_analytics(context, repository)
    except Exception:
        # Canonical visibility is never rolled back by analytics failure.
        pass


@router.post("/entities/{entity}", status_code=201)
def create_ontology_record(
    entity: str,
    body: OntologyCreateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(None),
):
    request_id = getattr(request.state, "request_id", "")
    try:
        canonical, definition = definition_for(entity)
        payload = sanitize_create_payload(canonical, body.model_dump(), actor_id="pending-verification")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={
            "code": "ONTOLOGY_WRITE_CONTRACT_INVALID", "category": "validation",
            "message": str(exc), "action": "correct_payload", "retryable": False,
        }) from exc

    repository = SupabaseTenantContextRepository(verifier=verify_tenant_access)
    context = repository.resolve_context(authorization, body.company_id, request_id=request_id)
    payload = sanitize_create_payload(canonical, body.model_dump(), actor_id=context.user_id)
    created = repository.create_entity(context, canonical, payload).data

    visible = repository.get_entity(context, canonical, created["id"]).data
    if not visible:
        raise HTTPException(status_code=502, detail={
            "code": "READ_AFTER_WRITE_FAILED", "category": "visibility",
            "message": f"The {canonical} was committed but Idjwi could not read it from canonical context.",
            "action": "retry_context", "retryable": True, "entity_type": canonical,
            "record_id": created["id"],
        })

    log_event(
        f"canonical.{canonical}.created", company_id=context.tenant_id,
        actor=context.user_id, subject=created["id"],
        metadata={
            "request_id": request_id, "canonical_source": definition.qualified_table,
            "entity_type": canonical, "read_after_write_verified": True,
        }, status="success",
    )
    background_tasks.add_task(_refresh_analytics, context, repository)
    return {
        "record": visible,
        "visibility": {
            "canonical_committed": True, "canonical_source": definition.qualified_table,
            "entity_type": canonical,
            "tenant_filter_verified": str(visible.get("company_id")) == context.tenant_id,
            "context_cache_invalidated": True, "read_after_write_verified": True,
            "idjwi_visibility": "immediate", "analytics_status": "refresh_pending",
            "request_id": request_id,
        },
    }
