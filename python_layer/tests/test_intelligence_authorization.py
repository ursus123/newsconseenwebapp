from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException

from intelligence.authorization import IntelligenceAuthorizationPolicy
from intelligence.cache import cache_key, clear, get, put
from intelligence.projector import build_envelope
from tenant_context.models import TenantContext


def context(role, user_id, *, units=(), scope_type="organization", scope_id="tenant-a"):
    return TenantContext(
        user_id=user_id, tenant_id="tenant-a", role=role, request_id="request",
        auth_source="test", profile_found=True, profile_user_id_matches=True,
        scope_type=scope_type, scope_id=scope_id,
        allowed_operational_unit_ids=tuple(units),
        managed_operational_unit_ids=tuple(units if role == "manager" else ()),
        scope_authorized=True,
    )


ROWS = {
    "insight": [
        {"id": "org", "company_id": "tenant-a", "title": "Organization finding", "source": "rule"},
        {"id": "finance", "company_id": "tenant-a", "operational_unit_id": "finance", "title": "Finance finding", "source": "analytics"},
        {"id": "warehouse", "company_id": "tenant-a", "operational_unit_id": "warehouse", "title": "Warehouse finding", "source": "agent"},
        {"id": "worker", "company_id": "tenant-a", "owner_user_id": "worker-1", "title": "Assigned finding", "source": "manual"},
        {"id": "sensitive", "company_id": "tenant-a", "operational_unit_id": "finance", "sensitivity": "restricted", "title": "Restricted finding", "source": "rule"},
        {"id": "wrong-tenant", "company_id": "tenant-b", "title": "Other tenant", "source": "rule"},
    ],
    "risk": [], "opportunity": [], "recommendation": [],
}


def envelope_for(ctx):
    policy = IntelligenceAuthorizationPolicy.for_context(ctx)
    policy.require_scope()
    return build_envelope("tenant-a", {"id": ctx.user_id, "role": ctx.role}, ROWS, 100, policy=policy)


def test_roles_receive_backend_authorized_different_inboxes():
    admin = envelope_for(context("admin", "admin-1"))
    manager = envelope_for(context("manager", "manager-1", units=("finance",)))
    technician = envelope_for(context("technician", "tech-1", units=("warehouse",)))
    worker = envelope_for(context("worker", "worker-1"))

    assert {item.id for item in admin.items} == {
        "insight:org", "insight:finance", "insight:warehouse", "insight:worker", "insight:sensitive",
    }
    assert {item.id for item in manager.items} == {"insight:finance", "insight:sensitive"}
    assert {item.id for item in technician.items} == {"insight:warehouse"}
    assert {item.id for item in worker.items} == {"insight:worker"}
    assert "intelligence.approve" in admin.authorization["permissions"]
    assert "intelligence.approve" in manager.authorization["permissions"]
    assert "intelligence.approve" not in technician.authorization["permissions"]
    assert "intelligence.read_sensitive" not in worker.authorization["permissions"]


def test_explicit_operational_unit_scope_fails_closed():
    ctx = context("worker", "worker-1", units=("warehouse",), scope_type="operational_unit", scope_id="finance")
    denied = TenantContext(**{**ctx.__dict__, "scope_authorized": False})
    policy = IntelligenceAuthorizationPolicy.for_context(denied)
    try:
        policy.require_scope()
        assert False, "expected scope denial"
    except HTTPException as exc:
        assert exc.status_code == 403


def test_sensitive_evidence_is_redacted_for_worker():
    policy = IntelligenceAuthorizationPolicy.for_context(context("worker", "worker-1"))
    row = {
        "evidence": '[{"id":"safe","label":"Safe"},{"id":"secret","label":"Secret","sensitivity":"restricted"}]'
    }
    assert [item["id"] for item in policy.redact_evidence(row)["evidence"]] == ["safe"]


def test_cache_and_delivery_are_principal_specific_and_not_realtime():
    clear()
    admin = envelope_for(context("admin", "admin-1")).model_dump(mode="json")
    worker = envelope_for(context("worker", "worker-1")).model_dump(mode="json")
    admin_key = cache_key(admin["authorization"]["fingerprint"], 100)
    worker_key = cache_key(worker["authorization"]["fingerprint"], 100)
    assert admin_key != worker_key
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda pair: put(*pair), [(admin_key, admin), (worker_key, worker)]))
    assert len(get(admin_key)["items"]) == 5
    assert len(get(worker_key)["items"]) == 1
    assert get(admin_key)["delivery"]["realtime_enabled"] is False
    assert get(worker_key)["delivery"]["mode"] == "authorized_pull"


def test_permitted_actions_are_role_derived():
    row = {"status": "proposed", "approval_required": True, "action_type": "create_task"}
    admin_actions = {a["action"]: a for a in IntelligenceAuthorizationPolicy.for_context(context("admin", "a")).permitted_actions(row)}
    worker_actions = {a["action"]: a for a in IntelligenceAuthorizationPolicy.for_context(context("worker", "w")).permitted_actions(row)}
    assert admin_actions["approve"]["allowed"] is True
    assert worker_actions["approve"]["allowed"] is False
    assert worker_actions["decide"]["allowed"] is False
    assert worker_actions["act"]["requires_approval"] is True
