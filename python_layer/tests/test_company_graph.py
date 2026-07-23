from fastapi import HTTPException
import threading
import time
import pytest

from company_graph import routes
from company_graph.cache import invalidate as invalidate_graph_cache
from company_graph.contracts import GraphPermittedAction, IdjwiGraphContext
from company_graph.field_classification import PROJECTIONS, classify_field, classified_fields, project_record
from company_graph.service import build_graph_packet
from copilot.routes import AskRequest
from tenant_context.models import TenantContext, TenantRepositoryResult
from tenant_context.supabase_repository import SupabaseTenantContextRepository
from data_sources import supabase_source
from ontology.relationship_registry import ALL_RELATIONSHIP_RULES, registry_contract, rules_for_carrier
from company_graph.assertion_governance import apply_assertion_state, persist_assertion_transition, stable_assertion_key
from company_graph.contracts import GraphSourceStatus
from company_graph.diagnostics import build_diagnostics
from company_graph.bounded_queries import decode_continuation, direct_neighborhood_records, encode_continuation
from company_graph.bounded_queries import DEFAULT_EDGE_BUDGET, DEFAULT_NODE_BUDGET


class FakeRepository:
    def __init__(self, records):
        self.records = records

    def list_entities(self, context, entity, *, limit=500):
        return TenantRepositoryResult(self.records.get(entity, [])[:limit], context, entities=(entity,))


def _context():
    return TenantContext(
        user_id="user-1", tenant_id="tenant-a", role="admin", request_id="req-1",
        auth_source="test", profile_found=True, profile_user_id_matches=True,
        permissions=("*.read",),
    )


def test_operational_overview_defaults_are_bounded_for_readability():
    assert DEFAULT_NODE_BUDGET == 36
    assert DEFAULT_EDGE_BUDGET == 72


def test_graph_packet_explains_canonical_and_derived_edges():
    repository = FakeRepository({
        "enterprise": [{"id": "e1", "company_id": "tenant-a", "enterprise_name": "Acme"}],
        "person": [{"id": "p1", "company_id": "tenant-a", "first_name": "Ada", "last_name": "Lovelace"}],
        "task": [{"id": "t1", "company_id": "tenant-a", "title": "Review", "enterprise_id": "e1"}],
        "relationship": [{"id": "r1", "company_id": "tenant-a", "relationship_type": "works_for", "person_id": "p1", "enterprise_id": "e1", "status": "active"}],
    })

    packet = build_graph_packet(_context(), repository)

    assert packet.company_id == "tenant-a"
    canonical = next(edge for edge in packet.edges if edge.predicate == "works_for")
    assert packet.contract_version == "company-graph.v1"
    assert canonical.assertion_class == "canonical_relationship"
    assert canonical.evidence[0].source_table == "public.relationships"
    assert canonical.confidence == 1
    assert canonical.verification_state == "verified"
    derived = next(edge for edge in packet.edges if edge.predicate == "belongs_to")
    assert derived.assertion_class == "canonical_reference_projection"
    assert derived.evidence[0].derivation_rule == "ontology_registry:task.enterprise"


def test_graph_packet_recovers_exact_unique_legacy_name_links_as_unverified_derivations():
    repository = FakeRepository({
        "enterprise": [{"id": "e1", "enterprise_name": "Acme Pharmacy"}],
        "person": [{"id": "p1", "first_name": "Ada", "last_name": "Lovelace"}],
        "task": [{"id": "t1", "title": "Review refill", "enterprise": "  ACME pharmacy ", "related_person": "Ada Lovelace"}],
    })

    packet = build_graph_packet(_context(), repository)

    assert len(packet.edges) == 2
    for edge in packet.edges:
        assert edge.assertion_class == "deterministic_derivation"
        assert edge.verification_state == "unverified"
        assert edge.confidence == .95
        assert edge.evidence[0].requirement == "operator_confirmation"
        assert edge.evidence[0].derivation_rule.startswith("legacy_exact_unique_name:")
    issue = next(issue for issue in packet.quality.issues if issue.code == "LEGACY_LINKS_REQUIRE_CONFIRMATION")
    assert issue.count == 2


def test_graph_packet_does_not_guess_ambiguous_legacy_name_links():
    repository = FakeRepository({
        "enterprise": [
            {"id": "e1", "enterprise_name": "Acme"},
            {"id": "e2", "enterprise_name": "Acme"},
        ],
        "task": [{"id": "t1", "title": "Review", "enterprise": "Acme"}],
    })

    packet = build_graph_packet(_context(), repository)

    assert packet.edges == []
    assert not any(issue.code == "LEGACY_LINKS_REQUIRE_CONFIRMATION" for issue in packet.quality.issues)


def test_edge_explanation_reconstructs_legacy_derived_edge_from_evidence(client, monkeypatch):
    records = {
        "enterprise": {"e1": {"id": "e1", "enterprise_name": "Acme"}},
        "task": {"t1": {"id": "t1", "title": "Review", "enterprise": "Acme"}},
    }
    seed_packet = build_graph_packet(
        _context(), FakeRepository({kind: list(rows.values()) for kind, rows in records.items()}),
    )
    expected_edge = seed_packet.edges[0]
    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {
        "id": "edge-user", "company_id": "tenant-edge-explain", "role": "admin",
        "tenant_auth_source": "user_profiles", "profile_found": True,
        "profile_user_id_matches": True,
    })

    def get_entity(_self, context, entity_type, record_id):
        return TenantRepositoryResult(
            records.get(entity_type, {}).get(record_id), context, entities=(entity_type,),
        )

    def list_filtered(_self, context, entity_type, *, filters, limit, offset=0):
        return TenantRepositoryResult([], context, entities=(entity_type,))

    monkeypatch.setattr(routes.SupabaseTenantContextRepository, "get_entity", get_entity)
    monkeypatch.setattr(routes.SupabaseTenantContextRepository, "list_entities_filtered", list_filtered)
    response = client.get(
        "/company-graph/edge/explain",
        params={
            "company_id": "tenant-edge-explain", "edge_id": expected_edge.id,
            "source": expected_edge.source, "target": expected_edge.target,
        },
        headers={"Authorization": "Bearer edge-explain-token"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["edge"]["id"] == expected_edge.id
    assert body["edge"]["assertion_class"] == "deterministic_derivation"
    assert body["source_node"]["id"] == "task:t1"
    assert body["target_node"]["id"] == "enterprise:e1"


def test_neighborhood_is_bounded_to_selected_node():
    repository = FakeRepository({
        "enterprise": [{"id": "e1", "enterprise_name": "Acme"}, {"id": "e2", "enterprise_name": "Other"}],
        "person": [{"id": "p1", "first_name": "Ada"}],
        "relationship": [{"id": "r1", "relationship_type": "works_for", "person_id": "p1", "enterprise_id": "e1"}],
    })
    packet = build_graph_packet(_context(), repository, center="enterprise:e1", depth=1)
    assert {node.id for node in packet.nodes} == {"enterprise:e1", "person:p1"}
    assert packet.scope.type == "neighborhood"
    assert packet.scope.center_node_id == "enterprise:e1"


def test_continuation_token_is_bound_to_tenant_authorization_and_scope():
    token = encode_continuation({"tenant": "tenant-a", "authorization": "policy-a", "scope": "unit-a", "offsets": {"task": 20}})
    assert decode_continuation(token, tenant_id="tenant-a", fingerprint="policy-a", scope_id="unit-a") == {"task": 20}
    for tenant, fingerprint, scope in (("tenant-b", "policy-a", "unit-a"), ("tenant-a", "policy-b", "unit-a"), ("tenant-a", "policy-a", "unit-b")):
        with pytest.raises(ValueError):
            decode_continuation(token, tenant_id=tenant, fingerprint=fingerprint, scope_id=scope)


def test_direct_neighborhood_queries_incident_carriers_and_exact_endpoints_only():
    class DirectRepository:
        def __init__(self):
            self.filtered_calls = []
            self.rows = {
                "enterprise": {"e1": {"id": "e1", "enterprise_name": "Acme"}},
                "task": {"t1": {"id": "t1", "title": "Review", "enterprise_id": "e1"}},
            }

        def get_entity(self, context, entity, record_id):
            return TenantRepositoryResult(self.rows.get(entity, {}).get(record_id), context, entities=(entity,))

        def list_entities_filtered(self, context, entity, *, filters, limit, offset=0):
            self.filtered_calls.append((entity, filters, limit))
            rows = [
                row for row in self.rows.get(entity, {}).values()
                if all(
                    str(row.get(key)) in {str(item) for item in value}
                    if isinstance(value, (tuple, list, set))
                    else str(row.get(key)) == str(value)
                    for key, value in filters.items()
                )
            ]
            return TenantRepositoryResult(rows[:limit], context, entities=(entity,))

    repository = DirectRepository()
    records = direct_neighborhood_records(_context(), repository, "enterprise:e1", 1)
    assert {row["id"] for row in records["enterprise"]} == {"e1"}
    assert {row["id"] for row in records["task"]} == {"t1"}
    assert ("task", {"enterprise_id": "e1"}, 80) in repository.filtered_calls
    assert not any(not filters for _, filters, _ in repository.filtered_calls)


def test_direct_neighborhood_runs_incident_carrier_queries_concurrently():
    class TimedRepository:
        def __init__(self):
            self.lock = threading.Lock()
            self.active = 0
            self.max_active = 0

        def get_entity(self, context, entity, record_id):
            row = {"id": record_id, "enterprise_name": "Acme"} if entity == "enterprise" else None
            return TenantRepositoryResult(row, context, entities=(entity,))

        def list_entities_filtered(self, context, entity, *, filters, limit, offset=0):
            with self.lock:
                self.active += 1
                self.max_active = max(self.max_active, self.active)
            time.sleep(0.02)
            with self.lock:
                self.active -= 1
            return TenantRepositoryResult([], context, entities=(entity,), duration_ms=20.0)

    repository = TimedRepository()
    records = direct_neighborhood_records(_context(), repository, "enterprise:e1", 1)

    assert records["enterprise"][0]["id"] == "e1"
    assert repository.max_active > 1


def test_graph_overview_requires_verified_tenant(client, monkeypatch):
    def forbidden(_authorization, _company_id):
        raise HTTPException(status_code=403, detail={"code": "tenant_mismatch"})

    monkeypatch.setattr(routes, "verify_tenant_access", forbidden)
    response = client.get("/company-graph/overview?company_id=tenant-b", headers={"Authorization": "Bearer test"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "tenant_mismatch"


def test_graph_overview_returns_governed_packet(client, monkeypatch):
    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {
        "id": "user-1", "company_id": "tenant-a", "role": "admin",
        "tenant_auth_source": "user_profiles", "profile_found": True,
        "profile_user_id_matches": True,
    })

    def list_entities(_self, context, entity, *, limit=5000):
        data = {
            "enterprise": [{"id": "e1", "company_id": context.tenant_id, "enterprise_name": "Acme"}],
            "person": [{"id": "p1", "company_id": context.tenant_id, "first_name": "Ada"}],
            "relationship": [{"id": "r1", "company_id": context.tenant_id, "relationship_type": "works_for", "person_id": "p1", "enterprise_id": "e1"}],
        }.get(entity, [])
        return TenantRepositoryResult(data, context, entities=(entity,))

    monkeypatch.setattr(routes.SupabaseTenantContextRepository, "list_entities", list_entities)
    response = client.get("/company-graph/overview?company_id=tenant-a", headers={"Authorization": "Bearer test"})
    body = response.json()
    assert response.status_code == 200
    assert body["contract_version"] == "company-graph.v1"
    assert body["provenance"]["tenant_verified"] is True
    assert body["edges"][0]["evidence"][0]["source_table"] == "public.relationships"


def test_graph_search_queries_authorized_sources_concurrently(client, monkeypatch):
    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {
        "id": "user-1", "company_id": "tenant-a", "role": "admin",
        "tenant_auth_source": "user_profiles", "profile_found": True,
        "profile_user_id_matches": True,
    })
    lock = threading.Lock()
    active = 0
    max_active = 0

    def search_entities(_self, context, entity_type, query, *, limit=25):
        nonlocal active, max_active
        assert query == "acme"
        with lock:
            active += 1
            max_active = max(max_active, active)
        time.sleep(0.03)
        with lock:
            active -= 1
        return TenantRepositoryResult([], context, entities=(entity_type,), duration_ms=30.0)

    monkeypatch.setattr(routes.SupabaseTenantContextRepository, "search_entities", search_entities)
    response = client.get(
        "/company-graph/search?company_id=tenant-a&q=acme",
        headers={"Authorization": "Bearer test"},
    )

    assert response.status_code == 200
    body = response.json()
    assert max_active > 1
    assert body["partial"] is False
    assert len(body["source_status"]) == 7
    assert {source["state"] for source in body["source_status"]} == {"empty"}


def test_graph_search_preserves_results_when_one_source_fails(client, monkeypatch):
    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {
        "id": "user-1", "company_id": "tenant-a", "role": "admin",
        "tenant_auth_source": "user_profiles", "profile_found": True,
        "profile_user_id_matches": True,
    })

    def search_entities(_self, context, entity_type, _query, *, limit=25):
        if entity_type == "task":
            raise TimeoutError("canonical source timed out")
        rows = [{"id": "e1", "enterprise_name": "Acme"}] if entity_type == "enterprise" else []
        return TenantRepositoryResult(rows, context, entities=(entity_type,), duration_ms=12.0)

    monkeypatch.setattr(routes.SupabaseTenantContextRepository, "search_entities", search_entities)
    response = client.get(
        "/company-graph/search?company_id=tenant-a&q=acme",
        headers={"Authorization": "Bearer test"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["partial"] is True
    assert body["results"][0]["id"] == "enterprise:e1"
    failed = next(source for source in body["source_status"] if source["source_id"] == "task")
    assert failed["failure_category"] == "timeout"
    assert failed["affected_capabilities"] == ["graph_search"]


def test_graph_nodes_are_safe_summaries_not_database_rows():
    repository = FakeRepository({
        "person": [{
            "id": "p1", "company_id": "tenant-a", "first_name": "Ada",
            "last_name": "Lovelace", "person_type": "staff", "status": "active",
            "email": "private@example.com", "phone": "+15555550100",
            "internal_notes": "must never leave canonical storage",
        }],
    })
    packet = build_graph_packet(_context(), repository)
    node = packet.nodes[0]
    assert node.label == "Ada"
    assert node.attributes == {"first_name": "Ada", "last_name": "Lovelace", "person_type": "staff", "status": "active"}
    serialized = node.model_dump()
    assert "metadata" not in serialized
    assert "email" not in str(serialized)
    assert "phone" not in str(serialized)
    assert "internal_notes" not in str(serialized)


def test_graph_packet_reports_source_completeness_truncation_and_actions():
    repository = FakeRepository({
        "enterprise": [{"id": "e1", "enterprise_name": "Acme"}, {"id": "e2", "enterprise_name": "Later"}],
    })
    packet = build_graph_packet(_context(), repository, limit=1)
    assert packet.scope.type == "organization"
    assert packet.truncation.truncated is True
    assert "enterprise" in packet.truncation.sources_at_limit
    assert packet.completeness.state == "partial"
    assert packet.completeness.diagnostics.truncation.state == "partial"
    assert packet.provenance.contract_version == packet.contract_version
    assert any(action.action == "ask_idjwi" and action.allowed for action in packet.permitted_actions)


def test_idjwi_validates_the_same_versioned_graph_contract():
    packet = build_graph_packet(_context(), FakeRepository({
        "enterprise": [{"id": "e1", "enterprise_name": "Acme"}],
    }))
    context = IdjwiGraphContext(
        scope=packet.scope, nodes=packet.nodes, edges=packet.edges,
        provenance=packet.provenance, source_status=packet.source_status,
        completeness=packet.completeness, truncation=packet.truncation,
        quality=packet.quality, permitted_actions=packet.permitted_actions,
    ).model_dump()
    request = AskRequest(question="Explain this company", company_id="tenant-a", context=context)
    assert request.context["contract_version"] == packet.contract_version
    assert request.context["nodes"][0]["attributes"] == {"enterprise_name": "Acme"}


def test_same_tenant_admin_and_worker_receive_isolated_cached_graphs(client, monkeypatch):
    def verified_user(authorization, company_id):
        is_admin = authorization == "Bearer admin-token"
        return {
            "id": "admin-1" if is_admin else "worker-1",
            "company_id": company_id,
            "role": "admin" if is_admin else "staff",
            "tenant_auth_source": "user_profiles", "profile_found": True,
            "profile_user_id_matches": True,
        }

    def list_entities(_self, context, entity, *, limit=5000):
        data = {
            "enterprise": [{"id": "e1", "company_id": context.tenant_id, "enterprise_name": "Acme", "status": "active"}],
            "person": [{"id": "p1", "company_id": context.tenant_id, "first_name": "Ada", "person_type": "staff", "status": "active"}],
            "transaction": [{"id": "tx1", "company_id": context.tenant_id, "reference_number": "TX-1", "currency": "USD", "status": "posted"}],
            "relationship": [{"id": "r1", "company_id": context.tenant_id, "relationship_type": "works_for", "person_id": "p1", "enterprise_id": "e1"}],
        }.get(entity, [])
        return TenantRepositoryResult(data, context, entities=(entity,))

    monkeypatch.setattr(routes, "verify_tenant_access", verified_user)
    monkeypatch.setattr(routes.SupabaseTenantContextRepository, "list_entities", list_entities)
    invalidate_graph_cache("tenant-isolation")

    admin = client.get("/company-graph/overview?company_id=tenant-isolation", headers={"Authorization": "Bearer admin-token"}).json()
    worker = client.get("/company-graph/overview?company_id=tenant-isolation", headers={"Authorization": "Bearer worker-token"}).json()
    admin_again = client.get("/company-graph/overview?company_id=tenant-isolation", headers={"Authorization": "Bearer admin-token"}).json()

    assert {node["entity_type"] for node in admin["nodes"]} >= {"enterprise", "person", "transaction"}
    assert {node["entity_type"] for node in worker["nodes"]} == {"enterprise"}
    assert admin["provenance"]["authorization_fingerprint"] != worker["provenance"]["authorization_fingerprint"]
    assert admin["provenance"]["cache"] == "miss"
    assert worker["provenance"]["cache"] == "miss"
    assert admin_again["provenance"]["cache"] == "hit"
    assert any(source["source_id"] == "person" and source["state"] == "unauthorized" for source in worker["source_status"])
    assert any(action["action"] == "export" and action["allowed"] for action in admin["permitted_actions"])
    assert any(action["action"] == "export" and not action["allowed"] for action in worker["permitted_actions"])


def test_worker_cache_cannot_seed_admin_response(client, monkeypatch):
    def verified_user(authorization, company_id):
        is_admin = authorization == "Bearer admin-token"
        return {"id": "admin-2" if is_admin else "worker-2", "company_id": company_id,
                "role": "admin" if is_admin else "staff", "profile_found": True,
                "profile_user_id_matches": True, "tenant_auth_source": "test"}

    def list_entities(_self, context, entity, *, limit=5000):
        data = {"enterprise": [{"id": "e1", "enterprise_name": "Acme"}],
                "person": [{"id": "p1", "first_name": "Ada"}]}.get(entity, [])
        return TenantRepositoryResult(data, context, entities=(entity,))

    monkeypatch.setattr(routes, "verify_tenant_access", verified_user)
    monkeypatch.setattr(routes.SupabaseTenantContextRepository, "list_entities", list_entities)
    invalidate_graph_cache("tenant-reverse")
    worker = client.get("/company-graph/overview?company_id=tenant-reverse", headers={"Authorization": "Bearer worker-token"}).json()
    admin = client.get("/company-graph/overview?company_id=tenant-reverse", headers={"Authorization": "Bearer admin-token"}).json()
    assert "person" not in {node["entity_type"] for node in worker["nodes"]}
    assert "person" in {node["entity_type"] for node in admin["nodes"]}
    assert admin["provenance"]["cache"] == "miss"


def test_worker_cannot_select_arbitrary_operational_unit(client, monkeypatch):
    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {
        "id": "worker-3", "company_id": "tenant-a", "role": "staff",
        "profile_found": True, "profile_user_id_matches": True,
    })
    response = client.get(
        "/company-graph/overview?company_id=tenant-a&operational_unit_id=unit-1",
        headers={"Authorization": "Bearer worker-token"},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "OPERATIONAL_UNIT_ACCESS_DENIED"


def test_worker_cannot_confirm_or_reject_relationship(client, monkeypatch):
    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {
        "id": "worker-4", "company_id": "tenant-a", "role": "staff",
        "profile_found": True, "profile_user_id_matches": True,
    })
    payload = {
        "company_id": "tenant-a", "edge_id": "edge-1",
        "source_type": "enterprise", "source_id": "e1",
        "target_type": "person", "target_id": "p1",
        "predicate": "works_for", "reason": "test",
    }
    for action in ("confirm", "reject"):
        response = client.post(f"/company-graph/relationship/{action}", json=payload, headers={"Authorization": "Bearer worker-token"})
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "GRAPH_PERMISSION_DENIED"


def test_all_required_graph_objects_have_four_class_field_policies():
    required = {
        "enterprise", "operational_unit", "person", "task", "transaction",
        "product", "service", "relationship", "address", "document", "schedule",
        "risk", "opportunity", "recommendation", "decision", "action",
        "external_observation",
    }
    assert required <= set(PROJECTIONS)
    for entity_type in required:
        definition = PROJECTIONS[entity_type]
        definition.validate()
        classifications = classified_fields(entity_type)
        assert set(classifications.values()) <= {"graph_safe", "role_restricted", "sensitive", "prohibited"}
        assert classify_field(entity_type, "unexpected_database_column") == "prohibited"


def test_sensitive_and_prohibited_fields_never_enter_type_projections():
    cases = {
        "operational_unit": {"id": "u1", "unit_name": "Finance", "status": "active", "budget": "SECRET-BUDGET", "manager_user_id": "SECRET-MANAGER"},
        "transaction": {"id": "t1", "transaction_type": "invoice", "currency": "USD", "reference_number": "INV-1", "amount": "SECRET-AMOUNT", "account_number": "SECRET-ACCOUNT"},
        "address": {"id": "a1", "city": "Chicago", "country": "US", "address_line1": "SECRET-STREET", "latitude": "SECRET-LAT"},
        "action": {"id": "x1", "title": "Review", "status": "pending", "reasoning": "Permitted for restricted role", "action_payload": "SECRET-PAYLOAD", "credential_ref": "SECRET-CREDENTIAL"},
        "external_observation": {"id": "o1", "observation_type": "weather", "status": "active", "summary": "Storm expected", "precise_location": "SECRET-LOCATION", "raw_payload": "SECRET-RAW"},
    }
    for entity_type, row in cases.items():
        projected = project_record(entity_type, row, include_role_restricted=True)
        serialized = str(projected)
        assert not any(value in serialized for value in row.values() if isinstance(value, str) and value.startswith("SECRET-"))


def test_api_and_idjwi_packets_do_not_contain_unauthorized_values():
    repository = FakeRepository({
        "enterprise": [{"id": "e1", "enterprise_name": "Acme", "status": "active", "tax_id": "LEAK-TAX"}],
        "person": [{"id": "p1", "first_name": "Ada", "person_type": "staff", "email": "LEAK-EMAIL", "medical_data": "LEAK-MEDICAL"}],
        "transaction": [{"id": "t1", "transaction_type": "invoice", "currency": "USD", "amount": "LEAK-AMOUNT", "account_number": "LEAK-ACCOUNT"}],
        "product": [{"id": "pr1", "product_name": "Widget", "item_type": "physical", "cost": "LEAK-COST"}],
        "address": [{"id": "a1", "city": "Chicago", "address_line1": "LEAK-STREET", "latitude": "LEAK-LAT"}],
        "document": [{"id": "d1", "title": "License", "document_type": "license", "file_url": "LEAK-FILE"}],
        "observation": [{"id": "o1", "observation_type": "weather", "observed_at": "2026-07-22", "raw_payload": "LEAK-RAW"}],
    })
    packet = build_graph_packet(_context(), repository)
    idjwi_context = IdjwiGraphContext(
        scope=packet.scope, nodes=packet.nodes, edges=packet.edges,
        provenance=packet.provenance, source_status=packet.source_status,
        completeness=packet.completeness, truncation=packet.truncation,
        quality=packet.quality, permitted_actions=packet.permitted_actions,
    )
    serialized = str({"api": packet.model_dump(), "idjwi": idjwi_context.model_dump()})
    for marker in ("LEAK-TAX", "LEAK-EMAIL", "LEAK-MEDICAL", "LEAK-AMOUNT", "LEAK-ACCOUNT", "LEAK-COST", "LEAK-STREET", "LEAK-LAT", "LEAK-FILE", "LEAK-RAW"):
        assert marker not in serialized


def test_governed_export_rebuilds_authorized_packet_and_ignores_hidden_requests(client, monkeypatch):
    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {
        "id": "admin-export", "company_id": "tenant-export", "role": "admin",
        "profile_found": True, "profile_user_id_matches": True,
    })

    def list_entities(_self, context, entity, *, limit=5000):
        data = {
            "enterprise": [{"id": "e1", "enterprise_name": "Visible Co", "tax_id": "NEVER-EXPORT-TAX"}],
            "person": [{"id": "p1", "first_name": "Ada", "email": "NEVER-EXPORT-EMAIL"}],
            "relationship": [{"id": "r1", "relationship_type": "works_for", "person_id": "p1", "enterprise_id": "e1"}],
        }.get(entity, [])
        return TenantRepositoryResult(data, context, entities=(entity,))

    events = []
    monkeypatch.setattr(routes.SupabaseTenantContextRepository, "list_entities", list_entities)
    monkeypatch.setattr(routes, "log_event", lambda *args, **kwargs: events.append((args, kwargs)))
    response = client.post("/company-graph/export", headers={"Authorization": "Bearer admin"}, json={
        "company_id": "tenant-export", "purpose": "Quarterly operating review",
        "included_object_types": ["enterprise", "person", "secret_admin_record"],
        "included_node_ids": ["enterprise:e1", "person:p1", "secret_admin_record:root"],
    })
    assert response.status_code == 200
    body = response.json()
    serialized = str(body)
    assert "NEVER-EXPORT-TAX" not in serialized
    assert "NEVER-EXPORT-EMAIL" not in serialized
    assert "secret_admin_record:root" not in serialized
    assert body["export_metadata"]["requesting_user"] == "admin-export"
    assert body["export_metadata"]["tenant_id"] == "tenant-export"
    assert body["export_metadata"]["purpose"] == "Quarterly operating review"
    assert body["export_metadata"]["audit_event_id"].startswith("graph-audit-")
    assert events[0][0][0] == "company_graph.exported"


def test_worker_cannot_export_even_with_modified_browser_request(client, monkeypatch):
    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {
        "id": "worker-export", "company_id": "tenant-export", "role": "staff",
        "profile_found": True, "profile_user_id_matches": True,
    })
    response = client.post("/company-graph/export", headers={"Authorization": "Bearer worker"}, json={
        "company_id": "tenant-export", "purpose": "Attempt hidden export",
        "included_object_types": ["transaction", "person"],
    })
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "GRAPH_PERMISSION_DENIED"


def _proposal_packet():
    packet = build_graph_packet(_context(), FakeRepository({
        "enterprise": [{"id": "e1", "enterprise_name": "Acme"}],
        "person": [{"id": "p1", "first_name": "Ada"}],
        "relationship": [{"id": "proposal-1", "relationship_type": "works_for", "person_id": "p1", "enterprise_id": "e1"}],
    }))
    edge = packet.edges[0]
    edge.assertion_class = "advisor_proposal"
    edge.verification_state = "proposed"
    edge.assertion_state = "proposed"
    edge.permitted_actions = [GraphPermittedAction(action="confirm", allowed=True, requires_approval=True)]
    return packet


def test_modified_relationship_request_cannot_change_governed_proposal(client, monkeypatch):
    packet = _proposal_packet()
    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {
        "id": "admin-mutation", "company_id": "tenant-mutation", "role": "admin",
        "profile_found": True, "profile_user_id_matches": True,
    })
    monkeypatch.setattr(routes, "build_graph_packet", lambda *_args, **_kwargs: packet)
    payload = {
        "company_id": "tenant-mutation", "edge_id": packet.edges[0].id,
        "source_type": "person", "source_id": "p1",
        "target_type": "enterprise", "target_id": "e1",
        "predicate": "provided_by", "reason": "tampered request", "approval_confirmed": True,
    }
    response = client.post("/company-graph/relationship/confirm", json=payload, headers={"Authorization": "Bearer admin"})
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "RELATIONSHIP_PROPOSAL_MISMATCH"


def test_relationship_confirmation_requires_approval_and_rejects_conflict(client, monkeypatch):
    packet = _proposal_packet()
    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {
        "id": "admin-mutation", "company_id": "tenant-mutation", "role": "admin",
        "profile_found": True, "profile_user_id_matches": True,
    })
    monkeypatch.setattr(routes, "build_graph_packet", lambda *_args, **_kwargs: packet)
    payload = {
        "company_id": "tenant-mutation", "edge_id": packet.edges[0].id,
        "source_type": "person", "source_id": "p1",
        "target_type": "enterprise", "target_id": "e1",
        "predicate": "works_for", "reason": "Reviewed evidence",
    }
    approval = client.post("/company-graph/relationship/confirm", json=payload, headers={"Authorization": "Bearer admin"})
    assert approval.status_code == 409
    assert approval.json()["detail"]["code"] == "RELATIONSHIP_APPROVAL_REQUIRED"

    def list_entities(_self, context, entity, *, limit=5000):
        rows = [{"id": "existing", "relationship_type": "provided_by", "person_id": "p1", "enterprise_id": "e1", "status": "active"}] if entity == "relationship" else []
        return TenantRepositoryResult(rows, context, entities=(entity,))

    monkeypatch.setattr(routes.SupabaseTenantContextRepository, "list_entities", list_entities)
    payload["approval_confirmed"] = True
    conflict = client.post("/company-graph/relationship/confirm", json=payload, headers={"Authorization": "Bearer admin"})
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "RELATIONSHIP_CONFLICT"


def test_relationship_edit_rejects_ungoverned_predicate_before_writing(client, monkeypatch):
    packet = _proposal_packet()
    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {
        "id": "admin-mutation", "company_id": "tenant-mutation", "role": "admin",
        "profile_found": True, "profile_user_id_matches": True,
    })
    monkeypatch.setattr(routes, "build_graph_packet", lambda *_args, **_kwargs: packet)
    response = client.post("/company-graph/relationship/edit", json={
        "company_id": "tenant-mutation", "edge_id": packet.edges[0].id,
        "source_type": "person", "source_id": "p1",
        "target_type": "enterprise", "target_id": "e1",
        "predicate": "works_for", "corrected_predicate": "invented_by_chat",
        "reason": "Operator correction", "approval_confirmed": True,
    }, headers={"Authorization": "Bearer admin"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "RELATIONSHIP_CORRECTION_INVALID"


def test_operational_unit_scope_uses_unit_identity_and_owned_records_not_enterprise_proxy():
    context = TenantContext(
        user_id="admin-1", tenant_id="tenant-a", role="admin", request_id="req-unit",
        auth_source="test", profile_found=True, profile_user_id_matches=True,
        scope_type="operational_unit", scope_id="finance", scope_name="Finance",
        permissions=("*.read",), scope_authorized=True,
    )
    repository = FakeRepository({
        "operational_unit": [
            {"id": "finance", "company_id": "tenant-a", "organization_id": "tenant-a", "unit_name": "Finance", "unit_type": "department", "status": "active"},
            {"id": "hr", "company_id": "tenant-a", "organization_id": "tenant-a", "unit_name": "HR", "unit_type": "department", "status": "active"},
        ],
        "task": [
            {"id": "fin-task", "title": "Close books", "status": "open", "operational_unit_id": "finance"},
            {"id": "hr-task", "title": "Review onboarding", "status": "open", "operational_unit_id": "hr"},
        ],
        "enterprise": [{"id": "external-vendor", "enterprise_name": "External Vendor"}],
    })
    packet = build_graph_packet(context, repository)
    ids = {node.id for node in packet.nodes}
    assert packet.scope.type == "operational_unit"
    assert packet.scope.id == "finance"
    assert "operational_unit:finance" in ids
    assert "task:fin-task" in ids
    assert "operational_unit:hr" not in ids
    assert "task:hr-task" not in ids
    assert "enterprise:finance" not in ids
    assert not any(node.entity_type == "enterprise" for node in packet.nodes)
    assert any(edge.source == "task:fin-task" and edge.target == "operational_unit:finance" and edge.predicate == "operates_in" for edge in packet.edges)


def test_operational_unit_hierarchy_includes_managed_descendants_and_excludes_siblings():
    context = TenantContext(
        user_id="manager-1", tenant_id="tenant-a", role="manager", request_id="req-unit",
        auth_source="test", profile_found=True, profile_user_id_matches=True,
        scope_type="operational_unit", scope_id="branch", scope_name="North Branch",
        permissions=("*.read",), allowed_operational_unit_ids=("branch",),
        managed_operational_unit_ids=("branch",), scope_authorized=True,
    )
    packet = build_graph_packet(context, FakeRepository({
        "operational_unit": [
            {"id": "branch", "unit_name": "North Branch", "unit_type": "branch", "status": "active"},
            {"id": "warehouse", "unit_name": "North Warehouse", "unit_type": "warehouse", "parent_unit_id": "branch", "status": "active"},
            {"id": "finance", "unit_name": "Finance", "unit_type": "department", "status": "active"},
        ],
        "product": [
            {"id": "stock-1", "product_name": "Stock", "operational_unit_id": "warehouse"},
            {"id": "ledger-1", "product_name": "Ledger", "operational_unit_id": "finance"},
        ],
    }))
    ids = {node.id for node in packet.nodes}
    assert {"operational_unit:branch", "operational_unit:warehouse", "product:stock-1"} <= ids
    assert "operational_unit:finance" not in ids
    assert "product:ledger-1" not in ids
    assert any(edge.predicate == "part_of" and edge.source == "operational_unit:warehouse" for edge in packet.edges)


def test_relationship_registry_is_complete_and_exposed_to_shared_consumers(client, monkeypatch):
    required_fields = {
        "source_type", "source_field", "target_type", "target_field", "predicate",
        "direction", "temporal_behavior", "evidence_requirement", "sensitivity",
        "canonicalization", "inverse_relationship", "valid_correction_actions",
    }
    for rule in ALL_RELATIONSHIP_RULES:
        assert required_fields <= set(rule.public_dict())
    assert rules_for_carrier("task")
    contract = registry_contract()
    assert set(contract["consumers"]) == {"forms", "canonical_repositories", "company_graph", "idjwi", "import_mapping", "data_quality", "relationship_editing"}

    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_: {
        "id": "admin-registry", "company_id": "tenant-a", "role": "admin",
        "profile_found": True, "profile_user_id_matches": True,
    })
    response = client.get("/company-graph/relationship-registry?company_id=tenant-a", headers={"Authorization": "Bearer admin"})
    assert response.status_code == 200
    assert response.json()["version"] == "ontology-relationships.v1"
    assert response.json()["tenant_verified"] is True


def test_operational_unit_membership_authorizes_scope_and_manager_permissions(monkeypatch):
    monkeypatch.setattr(supabase_source, "configured", lambda: True)
    monkeypatch.setattr(supabase_source, "list_records", lambda *_args, **_kwargs: [{
        "operational_unit_id": "finance", "user_id": "manager-user",
        "membership_role": "manager", "permissions": ["graph.export"], "status": "active",
    }])
    monkeypatch.setattr(supabase_source, "get_record", lambda *_args, **_kwargs: {
        "id": "finance", "company_id": "tenant-a", "organization_id": "tenant-a",
        "unit_name": "Finance", "unit_type": "department", "status": "active",
    })
    repository = SupabaseTenantContextRepository(verifier=lambda *_: {
        "id": "manager-user", "role": "staff", "tenant_auth_source": "test",
        "profile_found": True, "profile_user_id_matches": True,
    })
    context = repository.resolve_context("Bearer test", "tenant-a", operational_unit_id="finance")
    assert context.scope_type == "operational_unit"
    assert context.scope_name == "Finance"
    assert context.scope_authorized is True
    assert context.allowed_operational_unit_ids == ("finance",)
    assert context.managed_operational_unit_ids == ("finance",)
    assert "graph.export" in context.permissions


def test_rejected_inference_is_suppressed_but_history_remains_for_idjwi():
    key = stable_assertion_key("risk:r1", "references", "enterprise:e1", "risk.subject")
    packet = build_graph_packet(_context(), FakeRepository({
        "enterprise": [{"id": "e1", "enterprise_name": "Acme"}],
        "risk": [{"id": "r1", "title": "Storm exposure", "entity_ref_id": "e1", "entity_ref_type": "enterprise", "status": "open"}],
        "graph_assertion": [{
            "id": "a1", "assertion_key": key, "assertion_state": "rejected",
            "source_node_id": "risk:r1", "predicate": "references", "target_node_id": "enterprise:e1",
            "rejected_at": "2026-07-22T12:00:00+00:00", "evidence_version": 2,
        }],
        "graph_assertion_event": [{
            "id": "ev1", "assertion_id": "a1", "assertion_key": key,
            "from_state": "proposed", "to_state": "rejected", "reason": "Wrong enterprise match",
            "actor_user_id": "user-1", "evidence_version": 2, "occurred_at": "2026-07-22T12:00:00+00:00",
        }],
    }))
    assert not any(edge.assertion_key == key for edge in packet.edges)
    event = next(item for item in packet.assertion_history if item.assertion_key == key)
    assert event.to_state == "rejected"
    assert event.reason == "Wrong enterprise match"
    assert event.evidence_version == 2


def test_temporal_assertion_overlay_explains_confirmation_and_supersession_fields():
    packet = build_graph_packet(_context(), FakeRepository({
        "enterprise": [{"id": "e1", "enterprise_name": "Acme"}],
        "person": [{"id": "p1", "first_name": "Ada"}],
        "relationship": [{"id": "r1", "relationship_type": "works_for", "person_id": "p1", "enterprise_id": "e1"}],
    }))
    edge = packet.edges[0]
    visible, history = apply_assertion_state([edge], [{
        "id": "a1", "assertion_key": edge.assertion_key, "assertion_state": "confirmed",
        "confirmed_at": "2026-07-22T13:00:00+00:00", "evidence_version": 3,
        "valid_from": "2026-07-01T00:00:00+00:00",
    }], [{
        "assertion_key": edge.assertion_key, "from_state": "proposed", "to_state": "confirmed",
        "reason": "HR verified employment", "occurred_at": "2026-07-22T13:00:00+00:00", "evidence_version": 3,
    }])
    assert visible[0].assertion_state == "confirmed"
    assert visible[0].temporal.confirmed_at == "2026-07-22T13:00:00+00:00"
    assert visible[0].temporal.evidence_version == 3
    assert history[0]["reason"] == "HR verified employment"


def test_completeness_states_have_precise_different_meanings():
    def status(name, state, returned=0):
        return GraphSourceStatus(source_id=name, zone="canonical", table=f"public.{name}", state=state, returned_records=returned)

    cases = [
        ([status("enterprise", "available", 1)], [object()], "complete"),
        ([status("enterprise", "empty")], [], "empty"),
        ([status("enterprise", "unavailable")], [], "unavailable"),
        ([status("person", "unauthorized")], [], "unauthorized"),
        ([status("enterprise", "available", 1), status("risk", "unavailable")], [object()], "partial"),
    ]
    for statuses, nodes, expected in cases:
        overall, explanation, diagnostics = build_diagnostics(
            source_status=statuses, records={}, nodes=nodes, edges=[],
            mapping={"candidates": 0, "mapped": 0, "unmatched_endpoints": 0, "unknown_predicates": 0, "duplicates": 0},
            disconnected_count=0, expired_count=0, missing_assignments=0,
        )
        assert overall == expected, explanation
        assert diagnostics.source_availability.state in {"complete", "unavailable", "partial"}


def test_diagnostic_report_distinguishes_mapping_quality_and_operational_gaps():
    statuses = [
        GraphSourceStatus(source_id="task", zone="canonical", table="public.tasks", state="available", returned_records=2, may_be_truncated=True, requested_limit=2),
        GraphSourceStatus(source_id="risk", zone="analytics", table="analytics.risks", state="unavailable", failure_category="data_source", affected_capabilities=["idjwi_reasoning"], operator_action="Check source", retryable=True),
    ]
    overall, _, diagnostics = build_diagnostics(
        source_status=statuses,
        records={"task": [{"id": "t1", "status": "open", "updated_at": "2020-01-01T00:00:00+00:00"}, {"id": "t2", "status": "open"}]},
        nodes=[object(), object()], edges=[],
        mapping={"candidates": 4, "mapped": 1, "unmatched_endpoints": 1, "unknown_predicates": 1, "duplicates": 1},
        disconnected_count=2, expired_count=1, missing_assignments=2,
    )
    assert overall == "partial"
    assert diagnostics.pagination_completeness.state == "partial"
    assert diagnostics.mapping_coverage.count == 3
    assert diagnostics.unmatched_endpoints.count == 1
    assert diagnostics.unknown_predicates.count == 1
    assert diagnostics.disconnected_records.count == 2
    assert diagnostics.stale_records.count == 1
    assert diagnostics.expired_relationships.count == 1
    assert diagnostics.duplicate_relationships.count == 1
    assert diagnostics.missing_assignments.count == 2
    assert diagnostics.analytical_availability.state == "unavailable"


def test_assertion_transition_persists_current_state_and_append_only_event():
    edge = _proposal_packet().edges[0]

    class WritableRepository:
        def __init__(self):
            self.assertions = []
            self.events = []

        def list_entities(self, _context, entity, *, limit=5000):
            return TenantRepositoryResult(self.assertions if entity == "graph_assertion" else self.events, _context, entities=(entity,))

        def create_entity(self, context, entity, payload):
            row = {"id": f"{entity}-{len(self.assertions) + len(self.events) + 1}", "company_id": context.tenant_id, **payload}
            (self.assertions if entity == "graph_assertion" else self.events).append(row)
            return TenantRepositoryResult(row, context, entities=(entity,))

        def update_entity(self, context, entity, record_id, payload):
            row = next(item for item in self.assertions if item["id"] == record_id)
            row.update(payload)
            return TenantRepositoryResult(row, context, entities=(entity,))

    repository = WritableRepository()
    result = persist_assertion_transition(repository, _context(), edge, "rejected", reason="Evidence belongs to another record", evidence_version=4)
    assert result["assertion"]["assertion_state"] == "rejected"
    assert result["assertion"]["rejected_at"]
    assert result["event"]["from_state"] == "proposed"
    assert result["event"]["to_state"] == "rejected"
    assert result["event"]["evidence_version"] == 4
    assert len(repository.assertions) == 1
    assert len(repository.events) == 1


def test_every_unavailable_source_has_actionable_failure_metadata():
    class FailingRepository:
        def list_entities(self, _context, entity, *, limit=500):
            raise TimeoutError(f"{entity} timed out")

    packet = build_graph_packet(_context(), FailingRepository())
    unavailable = [source for source in packet.source_status if source.state == "unavailable"]
    assert unavailable
    assert packet.completeness.state == "unavailable"
    for source in unavailable:
        assert source.source_id
        assert source.failure_category == "timeout"
        assert source.affected_capabilities
        assert source.retryable is True
        assert source.operator_action


def test_derived_proposals_fail_closed_when_assertion_store_is_unavailable():
    class AssertionStoreFailure(FakeRepository):
        def list_entities(self, context, entity, *, limit=500):
            if entity == "graph_assertion":
                raise TimeoutError("assertion store unavailable")
            return super().list_entities(context, entity, limit=limit)

    packet = build_graph_packet(_context(), AssertionStoreFailure({
        "enterprise": [{"id": "e1", "enterprise_name": "Acme"}],
        "risk": [{"id": "r1", "title": "Storm", "entity_ref_type": "enterprise", "entity_ref_id": "e1"}],
    }))
    assert not any(edge.assertion_class == "analytical_inference" for edge in packet.edges)
    assert packet.completeness.state == "partial"
    assert any(issue.code == "ASSERTION_GOVERNANCE_UNAVAILABLE" for issue in packet.quality.issues)
