from datetime import datetime, timedelta, timezone

import pytest

from intelligence.adapters import SOURCE_ADAPTERS, adapt
from intelligence.correlation import describe
from intelligence.ingestion import IntelligenceIngestionService
from intelligence.repository import InMemoryIntelligenceRepository


CONTEXT = {"tenant_id": "tenant-a", "organization_id": "org-a"}


def payload(source_id="source-1", **values):
    return {
        "source_id": source_id, "intelligence_type": "risk", "subtype": "supplier_delay",
        "title": "Supplier delay may affect service", "explanation": "Delivery is late.",
        "severity": "high", "related_records": [{"type": "enterprise", "id": "supplier-1"}],
        "evidence": [{"id": f"e-{source_id}", "type": "observation", "source": source_id}],
        **values,
    }


def test_all_phase_four_source_adapters_are_registered():
    required = {
        "rules_thresholds", "analytics", "ml_prediction", "agents", "alerts",
        "graph_quality", "external_observation", "idjwi_recommendation",
        "advisor_proposal", "failed_workflow_action",
    }
    assert required <= SOURCE_ADAPTERS.keys()
    for kind in required:
        assert adapt(kind, payload(), CONTEXT).contract == "intelligence-item.v1"


def test_advisor_output_remains_a_proposal_without_proven_contribution():
    item = adapt("advisor_proposal", payload(), CONTEXT)
    assert item.source.assertion_class == "advisor_proposal"
    assert item.source.authority == "proposal"
    assert item.advisor.state == "requested"
    assert item.advisor.contribution_proven is False


def test_three_sources_correlate_into_one_durable_case():
    repository = InMemoryIntelligenceRepository()
    service = IntelligenceIngestionService(repository)
    first = service.ingest("rules_thresholds", payload("inventory-rule"), CONTEXT)
    second = service.ingest("ml_prediction", payload("demand-model"), CONTEXT)
    third = service.ingest("external_observation", payload("supplier-delay"), CONTEXT)

    assert first["created"] is True
    assert second["correlated"] is True
    assert third["source_count"] == 3
    assert len(repository.list_items("tenant-a")) == 1
    item = repository.list_items("tenant-a")[0]
    assert item.id == first["item"].id
    assert item.idjwi_context["support_summary"].startswith("3 sources support this risk")
    assert len(repository.audit_events) == 3


def test_repeated_detection_updates_case_without_increasing_source_count():
    repository = InMemoryIntelligenceRepository()
    service = IntelligenceIngestionService(repository)
    service.ingest("rules_thresholds", payload("inventory-rule"), CONTEXT)
    replay = service.ingest("rules_thresholds", payload("inventory-rule"), CONTEXT)
    assert replay["created"] is False
    assert replay["source_count"] == 1
    assert len(repository.list_items("tenant-a")) == 1


def test_detection_after_correlation_window_creates_a_new_case():
    repository = InMemoryIntelligenceRepository()
    item = adapt("rules_thresholds", payload("inventory-rule"), CONTEXT)
    start = datetime(2026, 8, 9, tzinfo=timezone.utc)
    first = repository.ingest(item, describe(item, observed_at=start, window_hours=24))
    later = repository.ingest(item, describe(item, observed_at=start + timedelta(hours=25), window_hours=24))
    assert first["created"] is True
    assert later["created"] is True
    assert first["item"].id != later["item"].id
    assert len(repository.list_items("tenant-a")) == 2


def test_correlation_never_crosses_tenants_or_affected_records():
    first = adapt("rules_thresholds", payload(), CONTEXT)
    other_tenant = adapt("rules_thresholds", payload(), {"tenant_id": "tenant-b", "organization_id": "org-b"})
    other_record = adapt("rules_thresholds", payload(related_records=[{"type": "enterprise", "id": "supplier-2"}]), CONTEXT)
    moment = datetime(2026, 8, 9, tzinfo=timezone.utc)
    assert describe(first, observed_at=moment).correlation_key != describe(other_tenant, observed_at=moment).correlation_key
    assert describe(first, observed_at=moment).correlation_key != describe(other_record, observed_at=moment).correlation_key


def test_unknown_source_is_explicitly_rejected():
    with pytest.raises(ValueError, match="Unsupported intelligence source adapter"):
        adapt("mystery_source", payload(), CONTEXT)


def test_lifecycle_records_and_status_are_durable():
    repository = InMemoryIntelligenceRepository()
    result = IntelligenceIngestionService(repository).ingest("analytics", payload(), CONTEXT, actor_id="admin-1")
    item = result["item"]
    repository.record_lifecycle("assignments", "tenant-a", item.id, {"assignee_id": "manager-1"})
    repository.record_lifecycle("approvals", "tenant-a", item.id, {"status": "pending"})
    repository.record_lifecycle("actions", "tenant-a", item.id, {"action_type": "create_task"})
    repository.record_lifecycle("outcomes", "tenant-a", item.id, {"summary": "Delay avoided"})
    repository.record_lifecycle("feedback", "tenant-a", item.id, {"feedback_type": "accurate"})
    repository.transition("tenant-a", item.id, "detected", "investigating", "manager-1")
    assert repository.list_items("tenant-a")[0].status == "investigating"
    assert {event["kind"] for event in repository.lifecycle if "kind" in event} == {"assignments", "approvals", "actions", "outcomes", "feedback"}
