from unittest.mock import Mock

import pytest
from fastapi import HTTPException

from tenant_context.audit import safe_audit_envelope
from tenant_context.entity_registry import definition_for
from tenant_context.models import TenantContext
from tenant_context.supabase_repository import SupabaseTenantContextRepository


def _context(role="admin"):
    return TenantContext(
        user_id="user-1",
        tenant_id="tenant-a",
        role=role,
        request_id="req-1",
        auth_source="user_profiles",
        profile_found=True,
        profile_user_id_matches=True,
        permissions=("*.read", "*.write") if role == "admin" else ("*.read",),
    )


def test_resolve_context_uses_verified_identity_not_browser_identity():
    verifier = Mock(return_value={
        "id": "user-1", "company_id": "tenant-a", "role": "admin",
        "tenant_auth_source": "user_profiles", "profile_found": True,
        "profile_user_id_matches": True,
    })
    repository = SupabaseTenantContextRepository(verifier=verifier)
    context = repository.resolve_context("Bearer token", "tenant-a", request_id="req-1")
    verifier.assert_called_once_with("Bearer token", "tenant-a")
    assert context.tenant_id == "tenant-a"
    assert context.user_id == "user-1"
    assert context.scope_type == "organization"


def test_list_always_passes_verified_tenant_filter(monkeypatch):
    called = {}

    def fake_list(entity, company_id=None, limit=5000):
        called.update(entity=entity, company_id=company_id, limit=limit)
        return [{"id": "e1", "company_id": company_id}]

    monkeypatch.setattr("tenant_context.supabase_repository.supabase_source.list_records", fake_list)
    result = SupabaseTenantContextRepository().list_entities(_context(), "enterprise", limit=10)
    assert called == {"entity": "enterprises", "company_id": "tenant-a", "limit": 10}
    assert result.envelope()["audit"]["tenant_filter_enforced"] is True


def test_unregistered_table_is_rejected():
    with pytest.raises(ValueError):
        definition_for("auth.users")


def test_write_rejects_conflicting_tenant(monkeypatch):
    monkeypatch.setattr("tenant_context.supabase_repository.supabase_source.create_record", Mock())
    with pytest.raises(HTTPException) as exc:
        SupabaseTenantContextRepository().create_entity(
            _context(), "task", {"title": "attack", "company_id": "tenant-b"},
        )
    assert exc.value.detail["code"] == "TENANT_SCOPE_MISMATCH"


def test_write_injects_verified_tenant(monkeypatch):
    create = Mock(return_value={"id": "t1", "company_id": "tenant-a"})
    monkeypatch.setattr("tenant_context.supabase_repository.supabase_source.create_record", create)
    SupabaseTenantContextRepository().create_entity(_context(), "task", {"title": "Review"})
    payload = create.call_args.args[1]
    assert payload["company_id"] == "tenant-a"
    assert create.call_args.kwargs["company_id"] == "tenant-a"


def test_read_only_role_cannot_write():
    with pytest.raises(HTTPException) as exc:
        SupabaseTenantContextRepository().create_entity(_context("user"), "task", {})
    assert exc.value.detail["code"] == "PERMISSION_DENIED"


def test_snapshot_uses_only_registered_scoped_operations(monkeypatch):
    repository = SupabaseTenantContextRepository()
    monkeypatch.setattr(repository, "count_entities", lambda context, entity: 2)
    monkeypatch.setattr(repository, "list_entities", lambda context, entity, limit=500: type("R", (), {"data": []})())
    snapshot = repository.build_operational_snapshot(_context()).data
    assert snapshot["entity_counts"] == {
        "enterprises": 2, "persons": 2, "tasks": 2, "transactions": 2,
    }
    assert snapshot["records_available"] is True


def test_safe_audit_contains_no_token_or_credentials():
    audit = safe_audit_envelope(
        _context(), entity="enterprise", permission="enterprise.read",
        outcome="CONTEXT_READY", result_count=1,
    )
    serialized = str(audit).lower()
    assert "token" not in serialized
    assert "credential" not in serialized
    assert audit["tenant_filter_enforced"] is True
