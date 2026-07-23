from types import SimpleNamespace

from company_graph.correction_learning import record_correction_memory
from company_graph.explanations import edge_citation, graph_claim_confidence


def test_edge_claim_is_traceable_to_nodes_edge_and_evidence():
    edge = {
        "id": "edge-17", "source": "enterprise:supplier-a",
        "predicate": "supplies", "label": "supplies",
        "target": "product:b", "assertion_class": "canonical_relationship",
        "assertion_state": "active", "verification_state": "verified",
        "confidence": 1.0,
        "temporal": {"confirmed_at": "2026-07-18T00:00:00Z"},
        "evidence": [{
            "evidence_id": "relationship:R-17",
            "source_record_id": "R-17",
            "freshness_at": "2026-07-18T00:00:00Z",
        }],
    }
    nodes = {
        "enterprise:supplier-a": {"id": "enterprise:supplier-a", "label": "Supplier A"},
        "product:b": {"id": "product:b", "label": "Product B"},
    }
    citation = edge_citation(edge, nodes)
    assert citation["claim"] == "Supplier A supplies Product B."
    assert citation["edge_id"] == "edge-17"
    assert citation["node_ids"] == ["enterprise:supplier-a", "product:b"]
    assert citation["evidence_ids"] == ["relationship:R-17"]
    assert citation["last_confirmed"] == "2026-07-18T00:00:00Z"


def test_confidence_discloses_all_five_governed_factors():
    context = {
        "source_status": [
            {"state": "available"}, {"state": "unavailable"},
        ],
        "quality": {"duplicate_edge_count": 1},
    }
    confidence = graph_claim_confidence(context, [{
        "confidence": 0.8, "assertion_class": "deterministic_derivation",
        "assertion_state": "proposed", "temporal": {}, "evidence": [],
    }], intent_complete=False)
    assert set(confidence["factors"]) == {
        "evidence_strength", "source_completeness", "freshness",
        "intent_completion", "contradiction_status",
    }
    assert confidence["label"] in {"Low", "Medium", "High"}


def test_correction_memory_accepts_governed_outcome_not_chat(monkeypatch):
    captured = {}

    def remember(**kwargs):
        captured.update(kwargs)
        return {"saved": True}

    monkeypatch.setattr("company_graph.correction_learning.remember", remember)
    result = record_correction_memory(
        "tenant-a",
        assertion={
            "id": "assertion-1", "assertion_key": "key-12345678",
            "relationship_rule_id": "rule-1",
            "source_node_id": "person:p1", "predicate": "works_for",
            "target_node_id": "enterprise:e1", "assertion_state": "confirmed",
            "evidence_version": 2,
        },
        outcome="supported", actor="admin-1",
        event={"id": "event-1"}, observed_evidence=[{"record_id": "R-17"}],
    )
    assert result["saved"] is True
    assert captured["memory_type"] == "correction"
    assert captured["review_status"] == "confirmed"
    assert captured["source"] == "governed_graph_outcome"
    assert captured["provenance"]["arbitrary_chat_accepted"] is False
