from datetime import date

from data_sources import supabase_source
from tenant_context.entity_registry import ENTITY_REGISTRY, public_schema_inventory
from tenant_context.models import TenantContext, TenantRepositoryResult
from tenant_context.operational_metrics import deterministic_metrics
from tenant_context.operational_snapshot import build_snapshot
from tenant_context.supabase_repository import SupabaseTenantContextRepository


def context():
    return TenantContext(
        user_id="u1", tenant_id="tenant-a", role="admin", request_id="r1",
        auth_source="profile", profile_found=True, profile_user_id_matches=True,
        permissions=("*.read", "*.write"),
    )


def test_inventory_classifies_all_migration_object_families():
    inventory = public_schema_inventory()
    assert len(inventory) >= 23
    assert {item["classification"] for item in inventory} >= {
        "canonical_business", "derived_intelligence", "governance",
        "system_taxonomy", "security_identity",
    }
    assert ENTITY_REGISTRY["user_profile"].enabled_for_context is False


def test_task_metrics_are_deterministic():
    rows = [
        {"status": "open", "due_date": "2026-07-20", "assigned_to_name": None},
        {"status": "in_progress", "due_date": "2026-07-25", "assigned_to_name": "A"},
        {"status": "completed", "due_date": "2026-07-19", "assigned_to_name": "B"},
    ]
    metrics = deterministic_metrics("task", rows, today=date(2026, 7, 21))
    assert metrics["total"] == 3
    assert metrics["open"] == 2
    assert metrics["overdue"] == 1
    assert metrics["due_next_7_days"] == 1
    assert metrics["unassigned"] == 1


def test_transaction_totals_are_computed_not_generated():
    metrics = deterministic_metrics("transaction", [
        {"amount": "10.25", "amount_paid": "5", "payment_status": "partial"},
        {"amount": 20, "amount_paid": 20, "payment_status": "paid"},
    ])
    assert metrics["total_amount"] == 30.25
    assert metrics["total_paid"] == 25.0
    assert metrics["unpaid"] == 1


def test_core_snapshot_preserves_partial_sections():
    class Repository:
        def list_entities(self, ctx, entity, limit=500):
            if entity == "task":
                raise supabase_source.SupabaseSourceError("tasks unavailable")
            return TenantRepositoryResult([], ctx, entities=(entity,))

    snapshot = build_snapshot(Repository(), context(), layer="core", use_cache=False)
    assert snapshot["status"] == "partial"
    assert snapshot["sections"]["task"]["status"] == "unavailable"
    assert snapshot["sections"]["enterprise"]["status"] == "empty"


def test_repository_uses_explicit_projection_and_tenant(monkeypatch):
    captured = {}

    def read(entity, company_id=None, limit=5000, fields=None):
        captured.update(entity=entity, company_id=company_id, fields=fields)
        return []

    monkeypatch.setattr(supabase_source, "list_records", read)
    SupabaseTenantContextRepository().list_entities(context(), "transaction")
    assert captured["company_id"] == "tenant-a"
    assert captured["entity"] == "transactions"
    assert captured["fields"]
    assert "*" not in captured["fields"]


def test_domain_snapshot_loads_only_requested_family():
    called = []

    class Repository:
        def list_entities(self, ctx, entity, limit=500):
            called.append(entity)
            return TenantRepositoryResult([], ctx, entities=(entity,))

    snapshot = build_snapshot(Repository(), context(), layer="domain", family="spatial", use_cache=False)
    assert snapshot["family"] == "spatial"
    assert set(called) == {"address", "territory"}
