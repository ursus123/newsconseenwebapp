import pytest

from company_graph.intents import GRAPH_INTENTS, resolve_graph_intent
from copilot.graph_intents import execute_graph_intent
from copilot.routes import AskRequest


class Principal:
    tenant_authorized = True
    role = "admin"
    user_id = "user-1"


def _context():
    return {
        "contract_version": "company-graph.v1",
        "scope": {"type": "organization", "id": "tenant-a", "name": "Acme"},
        "nodes": [{"id": "enterprise:e1", "entity_type": "enterprise", "entity_id": "e1", "label": "Acme", "sensitivity": "internal", "attributes": {}, "permitted_actions": []}],
        "edges": [],
        "provenance": {"generated_at": "2026-07-22T00:00:00Z", "projection": "test", "source_of_truth": "test", "tenant_verified": True, "authorization_enforced": True, "authorization_fingerprint": "test", "policy_version": "graph-policy.v1", "contract_version": "company-graph.v1", "cache": "none"},
        "source_status": [],
        "completeness": {"state": "partial", "sources_total": 1, "sources_available": 1, "sources_unavailable": 0, "sources_unauthorized": 0, "mapping_complete": False, "authorization_filtered": False, "explanation": "bounded"},
        "truncation": {"truncated": True, "sources_at_limit": ["enterprise"], "returned_nodes": 1, "returned_edges": 0, "continuation_available": True},
        "quality": {"unconnected_count": 1, "expired_relationship_count": 0, "duplicate_edge_count": 0, "missing_assignment_count": 0, "issues": []},
        "permitted_actions": [], "assertion_history": [],
    }


def test_all_nine_governed_graph_intents_are_registered():
    assert len(GRAPH_INTENTS) == 9
    assert "explain_company_graph" in GRAPH_INTENTS
    assert "find_graph_gaps" in GRAPH_INTENTS
    assert "search_company_graph" in GRAPH_INTENTS


def test_explicit_intent_wins_and_explain_company_never_becomes_gap_detection():
    assert resolve_graph_intent("explain_company_graph", "Find gaps", _context()) == "explain_company_graph"
    assert resolve_graph_intent(None, "Explain this company.", _context()) == "explain_company_graph"
    assert resolve_graph_intent(None, "What is disconnected?", _context()) == "find_graph_gaps"


def test_explain_company_executes_its_own_capability():
    result = execute_graph_intent(
        "explain_company_graph", question="Explain this company.",
        company_id="tenant-a", context=_context(), principal=Principal(),
    )
    assert result["intent"] == "explain_company_graph"
    assert result["tools_called"] == ["explain_company_graph"]
    assert "authorized records" in result["answer"]
    assert "graph gaps" not in result["answer"].lower()
    assert result["graph_citations"][0]["kind"] == "graph_node"
    assert {action["action"] for action in result["graph_workspace_actions"]}.issuperset({
        "highlight_records", "center_record", "create_task", "request_approval",
        "explain_degraded_data",
    })
    assert set(result["confidence"]["factors"]) == {
        "evidence_strength", "source_completeness", "freshness",
        "intent_completion", "contradiction_status",
    }


def test_ask_request_rejects_unknown_page_action_intent():
    with pytest.raises(ValueError):
        AskRequest(question="Explain", company_id="tenant-a", intent="guess_for_me")


def test_natural_graph_search_ignores_prompt_words_and_matches_governed_labels():
    context = _context()
    context["nodes"][0]["label"] = "Acme Pharmacy"
    context["graph_search_query"] = "Search the governed company graph for pharmacy"
    result = execute_graph_intent(
        "search_company_graph", question=context["graph_search_query"],
        company_id="tenant-a", context=context, principal=Principal(),
    )
    assert result["data"]["nodes"][0]["id"] == "enterprise:e1"
    assert result["graph_citations"][0]["node_ids"] == ["enterprise:e1"]
