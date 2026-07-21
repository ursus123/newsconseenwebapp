from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from copilot import routes
from data_sources import supabase_source


class FakeQueryEngine:
    def __init__(self, enterprises):
        self._enterprises = enterprises

    def query_network_overview(self):
        return {"summary": {"alert_count": 0, "critical_count": 0}}

    def query_enterprises(self):
        return {
            "data": self._enterprises,
            "data_source": "supabase_live",
            "data_as_of": "live",
        }


def configure_context(monkeypatch, counts, enterprises=None, failed=None):
    failed = set(failed or [])
    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {
        "id": "user-1", "company_id": "tenant-1", "tenant_auth_source": "user_profiles",
        "profile_found": True, "profile_user_id_matches": True,
    })
    import config
    monkeypatch.setattr(config.settings, "supabase_url", "https://project-one.supabase.co")
    monkeypatch.setattr(supabase_source, "health_probe", lambda: {"status": "connected"})

    def count(entity, company_id):
        if entity in failed:
            raise supabase_source.SupabaseSourceError("source failed")
        return counts.get(entity, 0)

    monkeypatch.setattr(supabase_source, "count_records", count)
    monkeypatch.setattr(
        supabase_source,
        "list_records",
        lambda entity, company_id=None, limit=5000: (enterprises or []) if entity == "enterprises" else [],
    )
    monkeypatch.setattr(supabase_source, "audit_company_id_assignments", lambda *_: {
        "tables": {}, "tenant_ids_normalized": True,
    })
    query_engine = FakeQueryEngine(enterprises or [])
    monkeypatch.setattr(routes, "CopilotEngine", lambda **_: SimpleNamespace(query_engine=query_engine))


def test_context_available(client, monkeypatch):
    configure_context(
        monkeypatch,
        {"enterprises": 1, "persons": 2, "tasks": 3, "transactions": 4},
        enterprises=[{"id": "e1", "name": "Acme", "enterprise_type": "branch"}],
    )
    response = client.get("/copilot/context?company_id=tenant-1&frontend_project_ref=project-one", headers={"Authorization": "Bearer test"})
    data = response.json()
    assert response.status_code == 200
    assert data["tenant_authorized"] is True
    assert data["context_state"] == "available"
    assert data["records_available"] is True
    assert data["enterprise_count"] == 1
    assert data["data_source"] == "tenant_context_repository"
    assert data["context_repository"]["tenant_filter_enforced"] is True
    assert data["identity_chain"]["projects_match"] is True
    assert data["identity_chain"]["profile_user_id_matches"] is True
    assert data["identity_chain"]["profile_tenant_matches_request"] is True
    assert response.headers.get("x-request-id")


def test_context_empty_is_success(client, monkeypatch):
    configure_context(monkeypatch, {})
    response = client.get("/copilot/context?company_id=tenant-1", headers={"Authorization": "Bearer test"})
    assert response.status_code == 200
    assert response.json()["context_state"] == "empty"
    assert response.json()["records_available"] is False


def test_context_partial_is_success(client, monkeypatch):
    configure_context(monkeypatch, {"enterprises": 1}, failed={"tasks"})
    response = client.get("/copilot/context?company_id=tenant-1", headers={"Authorization": "Bearer test"})
    assert response.status_code == 200
    assert response.json()["context_state"] == "partial"
    assert response.json()["unavailable_entities"] == ["tasks"]


def test_context_source_failure_returns_structured_503(client, monkeypatch):
    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {"id": "user-1"})
    monkeypatch.setattr(supabase_source, "health_probe", lambda: {"status": "error"})
    response = client.get("/copilot/context?company_id=tenant-1", headers={"Authorization": "Bearer test"})
    detail = response.json()["detail"]
    assert response.status_code == 503
    assert detail["code"] == "operational_data_unavailable"
    assert detail["category"] == "data_source"
    assert detail["retryable"] is True


def test_context_tenant_forbidden_remains_distinct(client, monkeypatch):
    def forbidden(*_):
        raise HTTPException(status_code=403, detail={
            "code": "tenant_mismatch", "category": "authorization",
            "message": "Wrong tenant", "retryable": False, "action": "contact_admin",
        })

    monkeypatch.setattr(routes, "verify_tenant_access", forbidden)
    response = client.get("/copilot/context?company_id=tenant-1", headers={"Authorization": "Bearer test"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "tenant_mismatch"
