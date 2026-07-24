import hashlib
import threading
import time
import weakref
from dataclasses import replace
from contextlib import contextmanager
from typing import Optional

from fastapi import HTTPException

from data_sources import supabase_source
from onboarding.auth import verify_tenant_access

from .entity_registry import definition_for
from .models import TenantContext, TenantRepositoryResult
from .repository import TenantContextRepository


ROLE_PERMISSIONS = {
    "user": ("*.read", "graph_saved_view.write"),
    "manager": ("*.read", "*.write"),
    "admin": ("*.read", "*.write"),
    "super_admin": ("*.read", "*.write"),
}

_CONTEXT_TTL_SECONDS = 15
_CONTEXT_MAX_ENTRIES = 512
_CONTEXT_CACHE = {}
_CONTEXT_LOCK = threading.Lock()
_CONTEXT_FLIGHTS = weakref.WeakValueDictionary()


def _context_key(verifier, authorization, tenant_id, operational_unit_id):
    token_fingerprint = hashlib.sha256(str(authorization or "").encode()).hexdigest()
    return (id(verifier), token_fingerprint, str(tenant_id), str(operational_unit_id or ""))


def _get_cached_context(key, request_id):
    with _CONTEXT_LOCK:
        item = _CONTEXT_CACHE.get(key)
        if not item or item[0] <= time.monotonic():
            _CONTEXT_CACHE.pop(key, None)
            return None
        return replace(item[2], request_id=str(request_id or ""))


def _put_cached_context(key, context):
    with _CONTEXT_LOCK:
        if len(_CONTEXT_CACHE) >= _CONTEXT_MAX_ENTRIES and key not in _CONTEXT_CACHE:
            oldest = min(_CONTEXT_CACHE, key=lambda candidate: _CONTEXT_CACHE[candidate][1])
            _CONTEXT_CACHE.pop(oldest, None)
        now = time.monotonic()
        _CONTEXT_CACHE[key] = (now + _CONTEXT_TTL_SECONDS, now, replace(context, request_id=""))


def _invalidate_context_cache(tenant_id):
    with _CONTEXT_LOCK:
        for key in [candidate for candidate in _CONTEXT_CACHE if candidate[2] == str(tenant_id)]:
            _CONTEXT_CACHE.pop(key, None)


@contextmanager
def _context_single_flight(key):
    with _CONTEXT_LOCK:
        lock = _CONTEXT_FLIGHTS.get(key)
        if lock is None:
            lock = threading.Lock()
            _CONTEXT_FLIGHTS[key] = lock
    lock.acquire()
    try:
        yield
    finally:
        lock.release()


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
        key = _context_key(self._verifier, authorization, requested_tenant_id, operational_unit_id)
        cached = _get_cached_context(key, request_id)
        if cached:
            return cached
        with _context_single_flight(key):
            cached = _get_cached_context(key, request_id)
            if cached:
                return cached
            context = self._resolve_context_uncached(
                authorization, requested_tenant_id, request_id=request_id,
                operational_unit_id=operational_unit_id,
                operational_unit_name=operational_unit_name,
            )
            _put_cached_context(key, context)
            return context

    def _resolve_context_uncached(
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
        user_id = str(access.get("id") or "")
        memberships = []
        if user_id and supabase_source.configured():
            try:
                memberships = supabase_source.list_records(
                    "operational_unit_membership", company_id=requested_tenant_id,
                    fields=("id", "company_id", "operational_unit_id", "user_id", "membership_role", "permissions", "status", "valid_to"),
                    filters={"user_id": user_id, "status": "active"}, limit=500,
                )
            except Exception:
                # Organization-wide access does not depend on the optional unit
                # tables. A requested unit still fails closed below.
                memberships = []
        allowed_units = tuple(sorted({str(row.get("operational_unit_id")) for row in memberships if row.get("operational_unit_id")}))
        managed_units = tuple(sorted({str(row.get("operational_unit_id")) for row in memberships if row.get("operational_unit_id") and row.get("membership_role") in {"lead", "manager", "administrator"}}))
        membership_permissions = tuple(sorted({str(permission) for row in memberships for permission in (row.get("permissions") or []) if isinstance(permission, str)}))
        scope_authorized = not operational_unit_id
        if operational_unit_id:
            if role not in {"admin", "super_admin"} and str(operational_unit_id) not in allowed_units:
                raise HTTPException(status_code=403, detail={
                    "code": "OPERATIONAL_UNIT_ACCESS_DENIED", "category": "authorization",
                    "message": "The user is not a member or manager of this operational unit.",
                    "action": "request_unit_membership", "retryable": False,
                })
            unit = supabase_source.get_record(
                "operational_unit", operational_unit_id, requested_tenant_id,
                fields=("id", "company_id", "organization_id", "unit_name", "unit_type", "manager_user_id", "status"),
            )
            if not unit or unit.get("status") not in {None, "active"}:
                raise HTTPException(status_code=404, detail={
                    "code": "OPERATIONAL_UNIT_NOT_FOUND", "category": "empty_data",
                    "message": "The operational unit does not exist in this tenant.",
                    "action": "choose_operational_unit", "retryable": False,
                })
            scope_authorized = role in {"admin", "super_admin"} or str(operational_unit_id) in allowed_units or str(unit.get("manager_user_id") or "") == user_id
            if not scope_authorized:
                raise HTTPException(status_code=403, detail={
                    "code": "OPERATIONAL_UNIT_ACCESS_DENIED", "category": "authorization",
                    "message": "The user is not a member or manager of this operational unit.",
                    "action": "request_unit_membership", "retryable": False,
                })
            operational_unit_name = operational_unit_name or str(unit.get("unit_name") or "")
        return TenantContext(
            user_id=user_id,
            tenant_id=str(requested_tenant_id),
            role=role,
            request_id=str(request_id or ""),
            auth_source=str(access.get("tenant_auth_source") or "unknown"),
            profile_found=bool(access.get("profile_found")),
            profile_user_id_matches=bool(access.get("profile_user_id_matches")),
            scope_type="operational_unit" if operational_unit_id else "organization",
            scope_id=operational_unit_id or requested_tenant_id,
            scope_name=operational_unit_name or None,
            permissions=tuple(sorted(set(ROLE_PERMISSIONS.get(role, ROLE_PERMISSIONS["user"]) + membership_permissions))),
            allowed_operational_unit_ids=allowed_units,
            managed_operational_unit_ids=managed_units,
            scope_authorized=scope_authorized,
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
        _invalidate_context_cache(context.tenant_id)
        try:
            from company_graph.cache import invalidate as invalidate_graph
            invalidate_graph(context.tenant_id)
        except ImportError:
            pass
        return TenantRepositoryResult(
            row, context, entities=(canonical,),
            duration_ms=round((time.monotonic() - started) * 1000, 1),
        )

    def list_entities_filtered(self, context: TenantContext, entity: str, *, filters: dict,
                               limit: int = 500, offset: int = 0) -> TenantRepositoryResult:
        if not filters and offset == 0:
            # Keeps the ordinary governed list path as the first page while
            # filtered/continued reads use the narrower REST contract.
            return self.list_entities(context, entity, limit=limit)
        canonical, definition = definition_for(entity)
        self._require_permission(context, definition.read_permission)
        allowed_fields = set(definition.fields)
        if any(field not in allowed_fields for field in filters):
            raise HTTPException(status_code=422, detail={
                "code": "GRAPH_FILTER_NOT_REGISTERED", "category": "governance",
                "message": "A bounded graph query used a field outside the canonical registry.",
                "action": "update_relationship_registry", "retryable": False,
            })
        started = time.monotonic()
        rows = supabase_source.list_records(
            definition.table, company_id=context.tenant_id, limit=limit,
            fields=definition.fields, filters=filters, offset=offset,
        )
        return TenantRepositoryResult(rows, context, entities=(canonical,), duration_ms=round((time.monotonic() - started) * 1000, 1))

    def search_entities(self, context: TenantContext, entity: str, query: str, *, limit: int = 25) -> TenantRepositoryResult:
        canonical, definition = definition_for(entity)
        self._require_permission(context, definition.read_permission)
        search_fields = tuple(field for field in definition.fields if field in {
            "name", "enterprise_name", "first_name", "last_name", "preferred_name",
            "title", "task_name", "product_name", "service_name", "reference_number",
            "unit_name", "description", "status", "operating_status", "relationship_type",
            "city", "region", "country", "address_line1", "postal_code",
            "risk_type", "severity", "priority", "transaction_type", "item_type",
            "service_type", "person_type", "primary_role",
        })
        if not search_fields:
            return TenantRepositoryResult([], context, entities=(canonical,))
        started = time.monotonic()
        rows = supabase_source.search_records(
            definition.table, context.tenant_id, search_fields, query,
            fields=definition.fields, limit=limit,
            filters={definition.operational_unit_field: context.scope_id}
            if context.scope_type == "operational_unit" and definition.operational_unit_field else None,
        )
        return TenantRepositoryResult(rows, context, entities=(canonical,), duration_ms=round((time.monotonic() - started) * 1000, 1))

    def update_entity(self, context: TenantContext, entity: str, record_id: str, payload: dict) -> TenantRepositoryResult:
        canonical, definition = definition_for(entity)
        self._require_permission(context, definition.write_permission)
        governed_payload = dict(payload or {})
        governed_payload.pop(definition.tenant_column, None)
        started = time.monotonic()
        row = supabase_source.update_record(
            definition.table, record_id, governed_payload, company_id=context.tenant_id,
        )
        if not row or row.get("error") or not row.get("id"):
            raise HTTPException(status_code=502, detail={
                "code": "CANONICAL_UPDATE_FAILED", "category": "data_source",
                "message": "The governed record update was not committed.",
                "action": "retry", "retryable": True,
            })
        from .snapshot_cache import invalidate_tenant
        invalidate_tenant(context.tenant_id)
        try:
            from company_graph.cache import invalidate as invalidate_graph
            invalidate_graph(context.tenant_id)
        except ImportError:
            pass
        return TenantRepositoryResult(row, context, entities=(canonical,), duration_ms=round((time.monotonic() - started) * 1000, 1))

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
