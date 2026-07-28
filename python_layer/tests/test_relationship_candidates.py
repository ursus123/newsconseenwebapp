from types import SimpleNamespace

from company_graph.relationship_candidates import (
    RELATIONSHIP_CANDIDATE_VERSION,
    detect_relationship_candidates,
    persist_relationship_candidates,
)
from company_graph.relationship_review import (
    candidate_explanation, confirm_candidate, mutation_preview, reject_candidate,
)
from company_graph.service import build_graph_packet
from tenant_context.models import TenantContext
from ontology.relationship_registry import canonicalize_predicate, registry_contract


def _records():
    return {
        "person": [{"id": "p-1", "preferred_name": "Ada Mensah"}],
        "enterprise": [{"id": "e-1", "enterprise_name": "North Pharmacy"}],
        "product": [{"id": "pr-1", "product_name": "Insulin"}],
        "relationship": [{
            "id": "r-1", "relationship_type": "person_enterprise",
            "role": "Client", "person_name": " Ada  Mensah ",
            "enterprise_name": "NORTH PHARMACY", "status": "active",
        }],
    }


def test_stage_a_candidate_contract_and_unique_name_resolution():
    candidates = detect_relationship_candidates("tenant-a", _records())
    assert len(candidates) == 1
    candidate = candidates[0]
    assert candidate.contract_version == RELATIONSHIP_CANDIDATE_VERSION
    assert candidate.relationship_rule_id == "relationship.person_enterprise"
    assert candidate.source.entity_id == "p-1"
    assert candidate.target.entity_id == "e-1"
    assert candidate.predicate == "client_of"
    assert candidate.matching_method == "exact_unique_tenant_name"
    assert candidate.proposed_patch == {
        "person_id": "p-1", "enterprise_id": "e-1",
        "relationship_type": "client_of",
    }
    assert candidate.bulk_confirmable is True
    assert candidate.confidence == .98


def test_stage_b_semantic_registry_is_versioned_and_provider_neutral():
    contract = registry_contract()
    assert contract["version"] == "ontology-relationships.v2"
    predicates = {item["predicate"]: item for item in contract["predicates"]}
    assert predicates["client_of"]["source_types"] == ["person"]
    assert "enterprise" in predicates["receives_service_from"]["target_types"]
    assert predicates["unclassified_relationship"]["bulk_confirmable"] is False
    assert canonicalize_predicate("person_enterprise", "Client", "person", "enterprise") == "client_of"


def test_unresolved_or_unknown_semantics_are_quarantined_not_bulk_confirmed():
    records = _records()
    records["relationship"][0]["enterprise_name"] = "Missing Enterprise"
    records["relationship"][0]["role"] = "Unknown role"
    candidates = detect_relationship_candidates("tenant-a", records)
    assert len(candidates) == 1
    assert candidates[0].predicate == "unclassified_relationship"
    assert candidates[0].verification_state == "disputed"
    assert candidates[0].proposed_operation == "quarantine_for_review"
    assert candidates[0].bulk_confirmable is False


class _Result:
    def __init__(self, data):
        self.data = data


class _Repository:
    def __init__(self, rows=None):
        self.rows = list(rows or [])
        self.events = []

    def list_entities(self, context, entity, limit=5000):
        if entity == "graph_assertion":
            return _Result(self.rows)
        if entity == "graph_assertion_event":
            return _Result(self.events)
        return _Result(self.records.get(entity, []))

    def create_entity(self, context, entity, payload):
        row = {"id": f"{entity}-{len(self.rows) + len(self.events) + 1}", **payload}
        (self.rows if entity == "graph_assertion" else self.events).append(row)
        return _Result(row)

    def update_entity(self, context, entity, record_id, payload):
        collection = self.rows if entity == "graph_assertion" else self.records[entity]
        row = next(item for item in collection if item["id"] == record_id)
        row.update(payload)
        return _Result(row)

    def get_entity(self, context, entity, record_id):
        row = next((item for item in self.records.get(entity, []) if item["id"] == record_id), None)
        return _Result(row)

    def list_entities_filtered(self, context, entity, filters, limit=500, offset=0):
        rows = self.list_entities(context, entity, limit=5000).data
        return _Result([
            row for row in rows
            if all(row.get(key) == value for key, value in filters.items())
        ][offset:offset + limit])

    records = {}


def test_stage_c_persistence_suppresses_unchanged_rejection_and_reopens_changed_evidence():
    candidate = detect_relationship_candidates("tenant-a", _records())[0]
    repository = _Repository()
    context = SimpleNamespace(user_id="admin", scope_type="organization", scope_id="tenant-a")
    first = persist_relationship_candidates(repository, context, [candidate])
    assert first["created"] == 1
    assert len(repository.events) == 1
    repeat = persist_relationship_candidates(repository, context, [candidate])
    assert repeat["unchanged"] == 1
    assert len(repository.events) == 1

    repository.rows[0]["assertion_state"] = "rejected"
    second = persist_relationship_candidates(repository, context, [candidate])
    assert second["suppressed_rejections"] == 1
    assert len(repository.events) == 1

    candidate.evidence_hash = "changed-evidence"
    third = persist_relationship_candidates(repository, context, [candidate])
    assert third["updated"] == 1
    assert repository.rows[0]["assertion_state"] == "proposed"
    assert repository.rows[0]["evidence_version"] == 2
    assert len(repository.events) == 2


def _review_repository():
    source = _records()
    repository = _Repository()
    repository.records = {key: [dict(row) for row in value] for key, value in source.items()}
    context = SimpleNamespace(
        user_id="admin", tenant_id="tenant-a",
        scope_type="organization", scope_id="tenant-a",
    )
    candidate = detect_relationship_candidates("tenant-a", repository.records)[0]
    assertion = persist_relationship_candidates(repository, context, [candidate])["records"][0]
    return repository, context, assertion


def test_stages_e_f_review_explanation_and_preview_are_deterministic():
    repository, context, assertion = _review_repository()
    explanation = candidate_explanation(assertion, context)
    preview = mutation_preview(repository, context, assertion)
    assert explanation["reasoning"]["identity"] == "Idjwi Core"
    assert explanation["reasoning"]["advisor_used"] is False
    assert preview["before"] == {
        "person_id": None, "enterprise_id": None,
        "relationship_type": "person_enterprise",
    }
    assert preview["after"]["relationship_type"] == "client_of"
    assert preview["approval_required"] is True


def test_stages_g_h_confirmation_patches_carrier_and_records_governed_history():
    repository, context, assertion = _review_repository()
    result = confirm_candidate(
        repository, context, assertion,
        reason="Verified against the source records", bulk_operation_id="bulk-1",
    )
    carrier = repository.records["relationship"][0]
    assert carrier["person_id"] == "p-1"
    assert carrier["enterprise_id"] == "e-1"
    assert carrier["relationship_type"] == "client_of"
    assert result["assertion"]["assertion_state"] == "confirmed"
    assert result["assertion"]["assertion_class"] == "operator_confirmed_assertion"
    assert result["event"]["evidence"][-1]["bulk_operation_id"] == "bulk-1"
    assert result["edge_assertion"]["assertion_class"] == "operator_confirmed_assertion"


def test_stages_g_h_rejection_never_mutates_the_canonical_carrier():
    repository, context, assertion = _review_repository()
    before = dict(repository.records["relationship"][0])
    result = reject_candidate(
        repository, context, assertion,
        reason="The imported names refer to a different client",
    )
    assert repository.records["relationship"][0] == before
    assert result["assertion"]["assertion_state"] == "rejected"


def _graph_context():
    return TenantContext(
        user_id="admin", tenant_id="tenant-a", role="admin",
        request_id="review-test", auth_source="test",
        profile_found=True, profile_user_id_matches=True,
        permissions=("*.read",),
    )


def test_stage_i_confirmed_edge_is_visible_verified_and_cites_confirmation_event():
    repository, review_context, assertion = _review_repository()
    result = confirm_candidate(
        repository, review_context, assertion, reason="Operator verified the source",
    )
    records = {
        **repository.records,
        "graph_assertion": [result["edge_assertion"]],
        "graph_assertion_event": [result["event"]],
    }
    packet = build_graph_packet(
        _graph_context(), repository, preloaded_records=records,
        node_budget=10, edge_budget=20,
    )
    edge = next(item for item in packet.edges if item.predicate == "client_of")
    assert edge.assertion_class == "operator_confirmed_assertion"
    assert edge.verification_state == "verified"
    assert any(item.source_table == "public.graph_assertion_events" for item in edge.evidence)


def test_stage_k_operational_focus_keeps_both_ends_of_governed_relationships():
    records = {
        "person": [{"id": "p-1", "preferred_name": "Ada"}],
        "enterprise": [{"id": "e-1", "enterprise_name": "North Pharmacy"}],
        "relationship": [{
            "id": "r-1", "relationship_type": "client_of",
            "person_id": "p-1", "enterprise_id": "e-1", "status": "active",
        }],
        "task": [
            {"id": f"t-{index}", "title": f"Urgent task {index}", "priority": "urgent", "status": "open"}
            for index in range(8)
        ],
    }
    packet = build_graph_packet(
        _graph_context(), _Repository(), preloaded_records=records,
        node_budget=4, edge_budget=10,
    )
    assert {"person:p-1", "enterprise:e-1"}.issubset({node.id for node in packet.nodes})
    assert any(edge.source == "person:p-1" and edge.target == "enterprise:e-1" for edge in packet.edges)
    assert packet.truncation.selection_strategy == "relationship_aware_operational_focus"
    assert packet.truncation.preserved_relationship_edges >= 1
