"""Seed deterministic, governed staging acceptance data.

This dataset belongs only to ``newsconseen-acceptance`` and is safe to rerun.
It deliberately includes connected and disconnected records plus proposed,
expired, and rejected graph assertions for governance acceptance scenarios.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[1]
TENANT = "newsconseen-acceptance"
CREATED_BY = "acceptance-seeder"
NS = uuid.uuid5(uuid.NAMESPACE_URL, "https://news-con-seen.com/acceptance/v1")


def uid(name: str) -> str:
    return str(uuid.uuid5(NS, name))


def now(offset_days: int = 0) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=offset_days)).isoformat()


def load_env() -> None:
    for path in (ROOT / ".env", ROOT / ".env.local", ROOT / "python_layer" / ".env"):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def config() -> tuple[str, str]:
    url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    return url.rstrip("/"), key


def request(method: str, path: str, *, payload=None, params=None):
    url, key = config()
    response = requests.request(
        method,
        f"{url}/rest/v1/{path}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
        params=params,
        data=json.dumps(payload) if payload is not None else None,
        timeout=30,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"{method} {path}: HTTP {response.status_code} {response.text[:800]}")
    return response.json() if response.text else None


def schema() -> dict[str, set[str]]:
    url, key = config()
    response = requests.get(
        f"{url}/rest/v1/",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/openapi+json"},
        timeout=30,
    )
    response.raise_for_status()
    definitions = response.json().get("definitions", {})
    return {name: set(value.get("properties", {})) for name, value in definitions.items()}


def upsert(table: str, rows: list[dict], available: dict[str, set[str]]) -> int:
    if not rows:
        return 0
    if table not in available:
        raise RuntimeError(f"Required acceptance table is unavailable: public.{table}")
    # PostgREST requires every object in a bulk payload to have identical keys.
    # Restrict the union to live columns and fill optional fixture fields with null.
    keys = set().union(*(row.keys() for row in rows)) & available[table]
    defaults = {
        "graph_assertions": {
            "candidate_count": 0,
            "proposed_patch": {},
            "evidence": [],
            "evidence_version": 1,
            "permitted_actions": [],
        },
    }.get(table, {})
    filtered = [{key: row.get(key, defaults.get(key)) for key in keys} for row in rows]
    request("POST", table, payload=filtered, params={"on_conflict": "id"})
    return len(filtered)


def profile(email: str) -> dict:
    rows = request("GET", "user_profiles", params={"select": "id,person_id,role", "email": f"eq.{email}"})
    if not rows:
        raise RuntimeError(f"Acceptance identity is missing: {email}")
    return rows[0]


def existing_unit(name: str) -> dict | None:
    rows = request("GET", "operational_units", params={
        "select": "id,unit_name", "company_id": f"eq.{TENANT}", "unit_name": f"eq.{name}", "limit": "1",
    })
    return rows[0] if rows else None


def records() -> dict[str, list[dict]]:
    manager = profile("acceptance-manager@news-con-seen.com")
    worker = profile("acceptance-worker@news-con-seen.com")
    admin = profile("acceptance-admin@news-con-seen.com")
    org = uid("enterprise:organization")
    operations_record = existing_unit("Acceptance Operations")
    finance_record = existing_unit("Acceptance Finance")
    operations = operations_record["id"] if operations_record else uid("unit:operations")
    finance = finance_record["id"] if finance_record else uid("unit:finance")
    supplier, customer = uid("enterprise:supplier"), uid("enterprise:customer")
    product, service = uid("product:storm-kit"), uid("service:priority-delivery")
    task, disconnected_task = uid("task:route-review"), uid("task:disconnected")
    transaction = uid("transaction:supplier-order")
    address = uid("address:supplier")
    document = uid("document:route-plan")
    schedule = uid("schedule:delivery")
    recommendation = uid("recommendation:reroute")
    decision = uid("decision:approve-reroute")
    observation = uid("external:storm")
    relationship = uid("relationship:supplier-product")

    common = {"company_id": TENANT, "created_by": CREATED_BY}
    data: dict[str, list[dict]] = {
        "enterprises": [
            {"id": org, **common, "enterprise_name": "Newsconseen Acceptance Organization", "enterprise_type": "commercial", "enterprise_subtype": "acceptance_organization", "status": "active", "operating_status": "open", "notes": "ACCEPTANCE DATA — primary organization."},
            {"id": supplier, **common, "enterprise_name": "Acceptance Storm Supply Co", "enterprise_type": "commercial", "enterprise_subtype": "logistics_supplier", "status": "active", "operating_status": "open", "city": "Chicago", "region": "IL", "country": "USA", "notes": "ACCEPTANCE DATA — connected supplier."},
            {"id": customer, **common, "enterprise_name": "Acceptance Unconnected Customer", "enterprise_type": "commercial", "enterprise_subtype": "test_customer", "status": "active", "operating_status": "open", "notes": "ACCEPTANCE DATA — intentionally disconnected."},
        ],
        "operational_units": [
            {"id": operations, **common, "organization_id": TENANT, "unit_name": "Acceptance Operations", "unit_type": "department", "manager_user_id": manager["id"], "manager_person_id": manager.get("person_id"), "jurisdiction": {"region": "Chicago"}, "permission_policy": {"classification": "acceptance"}, "status": "active"},
            {"id": finance, **common, "organization_id": TENANT, "unit_name": "Acceptance Finance", "unit_type": "department", "manager_user_id": admin["id"], "manager_person_id": admin.get("person_id"), "jurisdiction": {}, "permission_policy": {"classification": "acceptance"}, "status": "active"},
        ],
        "persons": [
            {"id": uid("person:driver"), **common, "operational_unit_id": operations, "first_name": "Avery", "last_name": "Driver", "person_type": "staff", "person_subtype": "driver", "primary_role": "Driver", "status": "active", "email": "acceptance.driver@example.com", "notes": "ACCEPTANCE DATA — connected driver."},
            {"id": uid("person:unconnected"), **common, "operational_unit_id": finance, "first_name": "Casey", "last_name": "Unconnected", "person_type": "staff", "person_subtype": "analyst", "primary_role": "Analyst", "status": "active", "notes": "ACCEPTANCE DATA — intentionally disconnected."},
        ],
        "products": [{"id": product, **common, "operational_unit_id": operations, "product_name": "Storm Response Kit", "item_name": "Storm Response Kit", "item_type": "physical", "stock_quantity": 12, "reorder_level": 10, "sku": "ACC-STORM-001", "enterprise_id": supplier, "description": "ACCEPTANCE DATA — connected operational product."}],
        "services": [{"id": service, **common, "operational_unit_id": operations, "name": "Priority Delivery", "service_name": "Priority Delivery", "service_type": "logistics", "service_subtype": "delivery", "price": 125, "is_active": True, "enterprise_id": supplier, "description": "ACCEPTANCE DATA — connected service."}],
        "tasks": [
            {"id": task, **common, "operational_unit_id": operations, "title": "Review storm-affected delivery route", "description": "ACCEPTANCE DATA — assigned workflow task.", "task_type": "operational_review", "status": "open", "priority": "urgent", "due_date": now(1), "assigned_to_email": "acceptance-worker@news-con-seen.com", "assigned_to_name": "Acceptance Worker", "related_person_id": worker.get("person_id"), "enterprise_id": supplier},
            {"id": disconnected_task, **common, "operational_unit_id": finance, "title": "Acceptance disconnected reconciliation", "description": "ACCEPTANCE DATA — intentionally has no business relationship.", "task_type": "data_quality", "status": "pending", "priority": "normal", "due_date": now(7)},
        ],
        "transactions": [{"id": transaction, **common, "operational_unit_id": finance, "reference_number": "ACC-TXN-001", "description": "Acceptance purchase of storm kits", "transaction_type": "purchase", "status": "posted", "payment_status": "paid", "amount": 1500, "amount_paid": 1500, "net_amount": -1500, "currency": "USD", "date": now(-2), "enterprise_id": supplier, "product_id": product, "notes": "ACCEPTANCE DATA — connected transaction."}],
        "addresses": [{"id": address, **common, "operational_unit_id": operations, "address_line1": "100 Acceptance Way", "city": "Chicago", "region": "IL", "country": "USA", "postal_code": "60601", "latitude": 41.8781, "longitude": -87.6298, "address_type": "operating", "entity_ref_type": "enterprise", "entity_ref_id": supplier, "is_primary": True, "notes": "ACCEPTANCE DATA."}],
        "documents": [{"id": document, **common, "operational_unit_id": operations, "title": "Acceptance Emergency Route Plan", "file_name": "acceptance-route-plan.pdf", "document_type": "operational_plan", "entity_ref_type": "task", "entity_ref_id": task, "issue_date": now(-10), "expiry_date": now(90), "status": "active", "notes": "ACCEPTANCE DATA — metadata record for extraction tests."}],
        "schedules": [{"id": schedule, **common, "operational_unit_id": operations, "name": "Acceptance Delivery Window", "title": "Acceptance Delivery Window", "schedule_type": "delivery", "frequency": "once", "start_time": "09:00", "end_time": "11:00", "start_date": now(1), "end_date": now(1), "is_active": True, "entity_ref_type": "task", "entity_ref_id": task, "notes": "ACCEPTANCE DATA."}],
        "relationships": [{"id": relationship, **common, "operational_unit_id": operations, "relationship_type": "supplies", "enterprise_id": supplier, "enterprise_name": "Acceptance Storm Supply Co", "item_id": product, "item_name": "Storm Response Kit", "status": "active", "start_date": now(-30), "notes": "ACCEPTANCE DATA — canonical supplier/product link."}],
        "recommendations": [{"id": recommendation, **common, "operational_unit_id": operations, "title": "Reroute tomorrow's delivery", "body": "Use the north route because the external storm observation affects the planned corridor.", "recommendation_type": "route_alternative", "priority": "high", "entity_ref_type": "task", "entity_ref_id": task, "is_actioned": False}],
        "decisions": [{"id": decision, **common, "operational_unit_id": operations, "decision": "Approve alternate delivery route", "context": "External severe-weather evidence and delivery schedule.", "decision_type": "operational_approval", "outcome": "pending_approval", "decided_by": None, "entity_ref_type": "recommendation", "entity_ref_id": recommendation}],
        "external_observations": [{"id": observation, **common, "operational_unit_id": operations, "observation_type": "severe_weather", "title": "Acceptance severe-weather disruption", "summary": "Synthetic storm intersects the scheduled delivery corridor.", "severity": "high", "status": "active", "source_name": "Newsconseen Acceptance Fixture", "source_url": "https://example.invalid/acceptance-weather", "source_record_id": "ACC-WEATHER-001", "retrieved_at": now(), "freshness_at": now(), "location": {"city": "Chicago", "region": "IL"}, "valid_from": now(), "valid_until": now(2), "confidence": 0.93, "expires_at": now(3), "provenance": {"synthetic": True, "purpose": "acceptance"}, "source_payload_hash": uid("hash:weather") }],
        "external_observation_matches": [{"id": uid("external-match:task"), **common, "observation_id": observation, "target_type": "task", "target_id": task, "predicate": "may_disrupt", "matching_method": "schedule_window", "confidence": 0.91, "evidence": [{"type": "schedule", "id": schedule}], "verification_status": "proposed", "valid_from": now(), "valid_until": now(2), "expires_at": now(3)}],
        "graph_assertions": [
            {"id": uid("assertion:proposed"), **common, "operational_unit_id": operations, "assertion_key": "acceptance-proposed-driver-task", "relationship_rule_id": "person_assigned_task", "source_node_id": f"person:{uid('person:driver')}", "predicate": "assigned_to", "target_node_id": f"task:{task}", "assertion_class": "analytical_inference", "assertion_state": "proposed", "observed_at": now(), "evidence_version": 1, "evidence": [{"type": "assignment_name_match", "value": "Avery Driver"}], "reason": "Synthetic proposal for operator confirmation.", "matching_method": "unique_name_match", "candidate_count": 1, "candidate_confidence": 0.94, "permitted_actions": ["confirm", "reject"]},
            {"id": uid("assertion:expired"), **common, "operational_unit_id": operations, "assertion_key": "acceptance-expired-supplier-product", "relationship_rule_id": "enterprise_supplies_product", "source_node_id": f"enterprise:{supplier}", "predicate": "supplies", "target_node_id": f"product:{product}", "assertion_class": "canonical_relationship", "assertion_state": "expired", "valid_from": now(-90), "valid_until": now(-1), "observed_at": now(-90), "evidence_version": 1, "evidence": [{"type": "relationship", "id": relationship}], "reason": "Synthetic expired relationship."},
            {"id": uid("assertion:rejected"), **common, "operational_unit_id": finance, "assertion_key": "acceptance-rejected-person-enterprise", "source_node_id": f"person:{uid('person:unconnected')}", "predicate": "employee_of", "target_node_id": f"enterprise:{customer}", "assertion_class": "analytical_inference", "assertion_state": "rejected", "observed_at": now(-5), "rejected_at": now(-4), "evidence_version": 1, "evidence": [{"type": "name_similarity", "score": 0.52}], "reason": "Operator rejected weak synthetic inference.", "matching_method": "fuzzy_name_match", "candidate_count": 2, "candidate_confidence": 0.52, "permitted_actions": ["reopen"]},
        ],
    }
    return data


def seed_action() -> bool:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        return False
    from sqlalchemy import create_engine, text
    from agents.approval_gate import ensure_tables

    engine = create_engine(database_url, future=True)
    ensure_tables(engine)
    with engine.begin() as connection:
        connection.execute(text("""
            INSERT INTO analytics.agent_approvals
              (id, company_id, agent_name, action_type, action_label,
               action_payload, risk_level, reasoning, status)
            VALUES
              (:id, :company, 'idjwi-core', 'create_purchase_order',
               'Acceptance: order additional storm kits', CAST(:payload AS jsonb),
               'approve', 'Evidence-backed acceptance action awaiting manager approval', 'pending')
            ON CONFLICT (id) DO UPDATE SET
              action_payload = EXCLUDED.action_payload,
              reasoning = EXCLUDED.reasoning,
              status = 'pending', resolved_at = NULL, resolved_by = NULL
        """), {"id": uid("action:purchase-order"), "company": TENANT,
                "payload": json.dumps({"product_id": uid("product:storm-kit"), "quantity": 20, "synthetic": True})})
    engine.dispose()
    return True


def verify(expected: dict[str, list[dict]]) -> None:
    failures = []
    for table, rows in expected.items():
        ids = [row["id"] for row in rows]
        actual = request("GET", table, params={"select": "id", "id": f"in.({','.join(ids)})"})
        if len(actual) != len(ids):
            failures.append(f"{table}:{len(actual)}/{len(ids)}")
    if failures:
        raise RuntimeError("Acceptance seed verification failed: " + ", ".join(failures))


def main() -> int:
    load_env()
    available = schema()
    dataset = records()
    total = 0
    # Dependency-safe write order.
    order = ["enterprises", "operational_units", "persons", "products", "services", "tasks",
             "transactions", "addresses", "documents", "schedules", "relationships",
             "recommendations", "decisions", "external_observations",
             "external_observation_matches", "graph_assertions"]
    for table in order:
        total += upsert(table, dataset[table], available)
    verify(dataset)
    action_seeded = seed_action()
    print(json.dumps({
        "status": "ok", "tenant": TENANT, "rows": total,
        "tables": {name: len(dataset[name]) for name in order},
        "governed_action_seeded": action_seeded,
        "fixtures": {"connected": True, "disconnected": True, "proposed": 1, "expired": 1, "rejected": 1},
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
