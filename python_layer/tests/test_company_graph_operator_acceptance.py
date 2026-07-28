from company_graph.release_contract import OPERATOR_ACCEPTANCE_SCENARIOS
from company_graph.intents import GRAPH_INTENTS


def test_acceptance_explanation_actions_use_explicit_registered_intents():
    for scenario in OPERATOR_ACCEPTANCE_SCENARIOS:
        if intent := scenario.get("intent"):
            assert intent in GRAPH_INTENTS


def test_acceptance_scenarios_make_truth_and_next_action_observable():
    for scenario in OPERATOR_ACCEPTANCE_SCENARIOS:
        observable = {
            "evidence_required", "audit_required", "operator_action_required",
            "advisor_truth_required", "refresh_required", "expected_status",
        }
        assert observable.intersection(scenario), scenario["name"]


def test_worker_is_not_authorized_for_broad_or_governance_acceptance_scenarios():
    broad_or_mutating = {1, 2, 5, 6, 7, 12, 14}
    for scenario in OPERATOR_ACCEPTANCE_SCENARIOS:
        if scenario["id"] in broad_or_mutating:
            assert "worker" not in scenario["roles"]
