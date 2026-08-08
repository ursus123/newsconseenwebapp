import json
from pathlib import Path

from company_graph.benchmark import PROFILES, TARGETS_MS
from company_graph.endpoint_benchmark import TARGETS_MS as ENDPOINT_TARGETS
from company_graph.release_contract import (
    ADMINISTRATOR_WORKSPACE_ACCEPTANCE_SCENARIOS,
    OPERATOR_ACCEPTANCE_SCENARIOS,
    RELEASE_ENVIRONMENTS,
    STAGE_29_COVERAGE,
)


ROOT = Path(__file__).resolve().parents[2]


def test_every_stage_29_regression_area_has_named_automated_coverage():
    required = {
        "tenant_isolation", "cache_isolation", "field_redaction",
        "operational_unit_authorization", "role_differences",
        "pagination_and_truncation", "temporal_relationships",
        "confirmations_and_rejections", "unsupported_predicates",
        "partial_source_failure", "export_governance",
        "stale_neighborhood_requests", "explicit_idjwi_intents",
        "advisor_execution_truth", "evidence_citations",
        "page_idjwi_count_consistency", "accessibility", "performance",
    }
    assert set(STAGE_29_COVERAGE) == required
    assert all(STAGE_29_COVERAGE[item] for item in required)


def test_all_operator_acceptance_scenarios_are_versioned_and_governed():
    assert [scenario["id"] for scenario in OPERATOR_ACCEPTANCE_SCENARIOS] == list(range(1, 16))
    assert all(scenario["roles"] for scenario in OPERATOR_ACCEPTANCE_SCENARIOS)
    assert all("intent" in scenario or "endpoint" in scenario for scenario in OPERATOR_ACCEPTANCE_SCENARIOS)
    unauthorized_export = OPERATOR_ACCEPTANCE_SCENARIOS[12]
    assert unauthorized_export["roles"] == ("worker",)
    assert unauthorized_export["expected_status"] == 403


def test_administrator_workspace_acceptance_has_all_stage_14_scenarios():
    assert len(ADMINISTRATOR_WORKSPACE_ACCEPTANCE_SCENARIOS) == 17
    assert len(set(ADMINISTRATOR_WORKSPACE_ACCEPTANCE_SCENARIOS)) == 17
    assert ADMINISTRATOR_WORKSPACE_ACCEPTANCE_SCENARIOS[0] == "Open Company Graph and see the graph immediately"
    assert ADMINISTRATOR_WORKSPACE_ACCEPTANCE_SCENARIOS[-1] == "Complete the workflow using keyboard-accessible equivalents"


def test_postgresql_benchmark_contract_covers_target_shapes_and_traversals():
    assert PROFILES == {"small": 500, "medium": 20_000, "large": 200_000}
    assert {"neighborhood_1", "neighborhood_2", "neighborhood_3"} <= set(TARGETS_MS)
    assert {"overview", "search", "edge_explain"} <= set(ENDPOINT_TARGETS)


def test_recorded_authorized_endpoint_benchmark_met_every_target():
    report = json.loads((ROOT / "python_layer" / "benchmark-authorized-endpoints-final.json").read_text())
    assert report["authorization"] == "bearer_token_verified_not_persisted"
    assert report["coverage"]["missing"] == []
    assert report["decision"] == "endpoint_targets_met"
    assert all(metric["target_met"] for metric in report["metrics"].values())


def test_release_environment_contract_cannot_omit_staging_or_product_surfaces():
    assert set(RELEASE_ENVIRONMENTS) == {"local", "staging", "surfaces"}
    assert "synthetic_multi_role_tenant" in RELEASE_ENVIRONMENTS["staging"]
    assert {"desktop_layout", "mobile_manager", "mobile_worker"} <= set(RELEASE_ENVIRONMENTS["surfaces"])
