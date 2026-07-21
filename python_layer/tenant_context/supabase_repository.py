import time
from typing import Optional

from fastapi import HTTPException

from data_sources import supabase_source
from onboarding.auth import verify_tenant_access

from .entity_registry import definition_for
from .models import TenantContext, TenantRepositoryResult
from .repository import TenantContextRepository


ROLE_PERMISSIONS = {
    "user": ("*.read",),
    "manager": ("*.read", "*.write"),
    "admin": ("*.read", "*.write"),
    "super_admin": ("*.read", "*.write"),
}


class SupabaseTenantContextRepository(TenantContextRepository):
    """Single server-side gateway for tenant-scoped operational records."""

    def __init__(self, verifier=verify_tenant_access):
        self._verifier = verifier

    def resolve_context(
        self,
        authorization: Optional[str],
        requested_tenant_id: str,
        *,
        request_id: str = "",
        operational_unit_id: str = "",
        operational_unit_name: str = "",
    ) -> TenantContext:
        access = self._verifier(authorization, requested_tenant_id)
        role = str(access.get("role") or "user").lower()
        return TenantContext(
            user_id=str(access.get("id") or ""),
            tenant_id=str(requested_tenant_id),
            role=role,
            request_id=str(request_id or ""),
            auth_source=str(access.get("tenant_auth_source") or "unknown"),
            profile_found=bool(access.get("profile_found")),
            profile_user_id_matches=bool(access.get("profile_user_id_matches")),
            scope_type="operational_unit" if operational_unit_id else "organization",
            scope_id=operational_unit_id or requested_tenant_id,
            scope_name=operational_unit_name or None,
            permissions=ROLE_PERMISSIONS.get(role, ROLE_PERMISSIONS["user"]),
        )

    @staticmethod
    def _require_permission(context: TenantContext, permission: str) -> None:
        action = permission.rsplit(".", 1)[-1]
        if permission not in context.permissions and f"*.{action}" not in context.permissions:
            raise HTTPException(status_code=403, detail={
                "code": "PERMISSION_DENIED",
                "category": "authorization",
                "message": f"Role '{context.role}' cannot perform this operation.",
                "action": "contact_admin",
                "retryable": False,
            })

    def list_entities(self, context: TenantContext, entity: str, *, limit: int = 5000) -> TenantRepositoryResult:
        canonical, definition = definition_for(entity)
        self._require_permission(context, definition.read_permission)
        started = time.monotonic()
        rows = supabase_source.list_records(
            definition.table, company_id=context.tenant_id, limit=limit, fields=definition.fields,
        )
        return TenantRepositoryResult(
            rows, context, entities=(canonical,),
            duration_ms=round((time.monotonic() - started) * 1000, 1),
        )

    def count_entities(self, context: TenantContext, entity: str) -> int:
        _, definition = definition_for(entity)
        self._require_permission(context, definition.read_permission)
        return supabase_source.count_records(definition.table, context.tenant_id)

    def get_entity(self, context: TenantContext, entity: str, record_id: str) -> TenantRepositoryResult:
        canonical, definition = definition_for(entity)
        self._require_permission(context, definition.read_permission)
        started = time.monotonic()
        row = supabase_source.get_record(
            definition.table, record_id, context.tenant_id, fields=definition.fields,
        )
        return TenantRepositoryResult(
            row, context, code="CONTEXT_READY" if row else "EMPTY_DATA",
            entities=(canonical,), duration_ms=round((time.monotonic() - started) * 1000, 1),
        )

    def create_entity(self, context: TenantContext, entity: str, payload: dict) -> TenantRepositoryResult:
        canonical, definition = definition_for(entity)
        self._require_permission(context, definition.write_permission)
        supplied = (payload or {}).get(definition.tenant_column)
        if supplied is not None and str(supplied) != context.tenant_id:
            raise HTTPException(status_code=403, detail={
                "code": "TENANT_SCOPE_MISMATCH",
                "category": "authorization",
                "message": "The record tenant does not match the verified tenant context.",
                "action": "correct_scope",
                "retryable": False,
            })
        governed_payload = dict(payload or {})
        governed_payload[definition.tenant_column] = context.tenant_id
        started = time.monotonic()
        row = supabase_source.create_record(definition.table, governed_payload, company_id=context.tenant_id)
        if not row or row.get("error") or not row.get("id"):
            raise HTTPException(status_code=502, detail={
                "code": "CANONICAL_WRITE_FAILED", "category": "data_source",
                "message": "The canonical record was not committed.", "action": "retry", "retryable": True,
            })
        from .snapshot_cache import invalidate_tenant
        invalidate_tenant(context.tenant_id)
        try:
            from company_graph.cache import invalidate as invalidate_graph
            invalidate_graph(context.tenant_id)
        except ImportError:
            pass
        return TenantRepositoryResult(
            row, context, entities=(canonical,),
            duration_ms=round((time.monotonic() - started) * 1000, 1),
        )

    def build_operational_snapshot(self, context: TenantContext) -> TenantRepositoryResult:
        started = time.monotonic()
        entities = ("enterprise", "person", "task", "transaction")
        counts = {}
        unavailable = []
        for entity in entities:
            try:
                counts[definition_for(entity)[1].table] = self.count_entities(context, entity)
            except supabase_source.SupabaseSourceError:
                counts[definition_for(entity)[1].table] = None
                unavailable.append(definition_for(entity)[1].table)
        enterprises = self.list_entities(context, "enterprise", limit=500).data
        data = {
            "entity_counts": counts,
            "unavailable_entities": unavailable,
            "enterprises": enterprises,
            "records_available": any(value for value in counts.values() if isinstance(value, int)),
        }
        return TenantRepositoryResult(
            data, context, entities=entities,
            duration_ms=round((time.monotonic() - started) * 1000, 1),
        )

    def build_layered_snapshot(self, context: TenantContext, *, layer: str = "core", family: str | None = None) -> dict:
        from .operational_snapshot import build_snapshot
        return build_snapshot(self, context, layer=layer, family=family)
