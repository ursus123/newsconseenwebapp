import pytest
from fastapi import HTTPException

from data_sources import supabase_source
from tenant_context import routes


def _authorize(*_args):
    return {
        "id": "user-1", "company_id": "tenant-a", "role": "admin",
        "tenant_auth_source": "user_profiles", "profile_found": True,
        "profile_user_id_matches": True,
    }


def test_enterprise_create_returns_immediate_visibility_receipt(client, monkeypatch):
    monkeypatch.setattr(routes, "verify_tenant_access", _authorize)
    monkeypatch.setattr(routes, "_refresh_analytics", lambda *_: None)
    monkeypatch.setattr(routes, "log_event", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(supabase_source, "create_record", lambda entity, payload, company_id=None: {
        "id": "e-new", "enterprise_name": payload["enterprise_name"], "company_id": company_id,
    })
    monkeypatch.setattr(supabase_source, "get_record", lambda entity, record_id, company_id, fields=None: {
        "id": record_id, "enterprise_name": "New Branch", "company_id": company_id,
    })
    response = client.post(
        "/tenant-context/entities/enterprise",
        headers={"Authorization": "Bearer test"},
        json={"company_id": "tenant-a", "enterprise_name": "New Branch", "unknown_ui_field": "discarded"},
    )
    body = response.json()
    assert response.status_code == 201
    assert body["record"]["id"] == "e-new"
    assert body["record"]["company_id"] == "tenant-a"
    assert body["visibility"]["canonical_committed"] is True
    assert body["visibility"]["read_after_write_verified"] is True
    assert body["visibility"]["idjwi_visibility"] == "immediate"
    assert body["visibility"]["analytics_status"] == "refresh_pending"


def test_enterprise_create_cannot_override_verified_tenant(client, monkeypatch):
    def forbidden(_authorization, company_id):
        raise HTTPException(status_code=403, detail={"code": "tenant_mismatch", "message": "Wrong tenant"})
    monkeypatch.setattr(routes, "verify_tenant_access", forbidden)
    response = client.post(
        "/tenant-context/entities/enterprise",
        headers={"Authorization": "Bearer test"},
        json={"company_id": "tenant-b", "enterprise_name": "Attack"},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "tenant_mismatch"


def test_read_after_write_failure_is_distinct(client, monkeypatch):
    monkeypatch.setattr(routes, "verify_tenant_access", _authorize)
    monkeypatch.setattr(supabase_source, "create_record", lambda entity, payload, company_id=None: {
        "id": "e-new", "enterprise_name": payload["enterprise_name"], "company_id": company_id,
    })
    monkeypatch.setattr(supabase_source, "get_record", lambda *_args, **_kwargs: None)
    response = client.post(
        "/tenant-context/entities/enterprise",
        headers={"Authorization": "Bearer test"},
        json={"company_id": "tenant-a", "enterprise_name": "New Branch"},
    )
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "READ_AFTER_WRITE_FAILED"


@pytest.mark.parametrize(("entity", "payload", "table"), [
    ("person", {"first_name": "Ada", "last_name": "Lovelace"}, "persons"),
    ("task", {"title": "Review account", "status": "open"}, "tasks"),
    ("transaction", {"reference_number": "TX-1", "amount": 25}, "transactions"),
    ("product", {"product_name": "Widget", "stock_quantity": 2}, "products"),
    ("service", {"name": "Consulting", "is_active": True}, "services"),
    ("relationship", {"relationship_type": "person_enterprise", "status": "active"}, "relationships"),
    ("document", {"title": "Policy", "status": "active"}, "documents"),
    ("risk", {"title": "Supply risk", "severity": "high"}, "risks"),
])
def test_registered_ontology_records_receive_same_visibility_contract(client, monkeypatch, entity, payload, table):
    monkeypatch.setattr(routes, "verify_tenant_access", _authorize)
    monkeypatch.setattr(routes, "_refresh_analytics", lambda *_: None)
    monkeypatch.setattr(routes, "log_event", lambda *_args, **_kwargs: None)

    def create(actual_table, actual_payload, company_id=None):
        assert actual_table == table
        assert company_id == "tenant-a"
        assert actual_payload["company_id"] == "tenant-a"
        return {"id": f"{entity}-1", "company_id": company_id, **payload}

    monkeypatch.setattr(supabase_source, "create_record", create)
    monkeypatch.setattr(supabase_source, "get_record", lambda actual_table, record_id, company_id, fields=None: {
        "id": record_id, "company_id": company_id, **payload,
    })
    response = client.post(
        f"/tenant-context/entities/{entity}", headers={"Authorization": "Bearer test"},
        json={"company_id": "tenant-a", **payload, "ui_only_field": "discarded"},
    )
    body = response.json()
    assert response.status_code == 201
    assert body["visibility"]["canonical_source"] == f"public.{table}"
    assert body["visibility"]["entity_type"] == entity
    assert body["visibility"]["read_after_write_verified"] is True


def test_security_identity_records_are_not_writable(client, monkeypatch):
    monkeypatch.setattr(routes, "verify_tenant_access", _authorize)
    response = client.post(
        "/tenant-context/entities/user_profile", headers={"Authorization": "Bearer test"},
        json={"company_id": "tenant-a", "role": "super_admin"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "ONTOLOGY_WRITE_CONTRACT_INVALID"
