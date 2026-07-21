from datetime import date, timedelta

from data_zones.analytics_products.builders import (
    build_cross_object_intelligence, build_governance_intelligence,
    build_predictive_intelligence,
)
from data_zones.analytics_products.contracts import ANALYTICS_PRODUCT_CONTRACTS, AnalyticsLayer
from data_zones.analytics_products.refresh import refresh_tenant_analytics
from tenant_context.models import TenantContext, TenantRepositoryResult


def context():
    return TenantContext(
        user_id="u1", tenant_id="tenant-a", role="admin", request_id="r1",
        auth_source="profile", profile_found=True, profile_user_id_matches=True,
        permissions=("*.read", "*.write"),
    )


def sample_data():
    yesterday = str(date.today() - timedelta(days=1))
    return {
        "enterprise": [{"id": "e1", "company_id": "tenant-a", "status": "active"}],
        "person": [{"id": "p1", "company_id": "tenant-a", "status": "active", "person_type": "staff"}],
        "task": [{"id": "t1", "company_id": "tenant-a", "status": "open", "priority": "high", "due_date": yesterday, "assigned_to_name": None, "enterprise_id": "e1"}],
        "transaction": [{"id": "x1", "company_id": "tenant-a", "status": "posted", "amount": 100, "amount_paid": 50, "enterprise_id": "e1"}],
        "product": [{"id": "i1", "company_id": "tenant-a", "stock_quantity": 0, "reorder_level": 5}],
        "service": [{"id": "s1", "company_id": "tenant-a", "is_active": True}],
        "relationship": [{"id": "r1", "company_id": "tenant-a", "person_id": "p1", "enterprise_id": "e1", "status": "active"}],
        "risk": [{"id": "risk1", "company_id": "tenant-a", "status": "open", "severity": "high"}],
        "opportunity": [{"id": "o1", "company_id": "tenant-a", "status": "pursuing"}],
        "recommendation": [{"id": "rec1", "company_id": "tenant-a", "is_actioned": True}],
        "decision": [{"id": "d1", "company_id": "tenant-a", "outcome": "successful"}],
    }


def test_all_five_layers_have_versioned_products():
    layers = {contract.layer for contract in ANALYTICS_PRODUCT_CONTRACTS.values()}
    assert layers == set(AnalyticsLayer)
    for contract in ANALYTICS_PRODUCT_CONTRACTS.values():
        assert contract.version
        assert contract.grain
        assert contract.derived_from
        assert contract.methodology


def test_cross_object_products_are_deterministic():
    rows = build_cross_object_intelligence(context(), sample_data())
    by_name = {row["product_name"]: row for row in rows if row["subject_type"] == "tenant"}
    assert by_name["workload_risk"]["metrics"]["overdue_tasks"] == 1
    assert by_name["revenue_concentration"]["metrics"]["largest_enterprise_share_pct"] == 100.0
    assert by_name["relationship_coverage"]["metrics"]["people_coverage_pct"] == 100.0
    assert by_name["service_delivery_risk"]["metrics"]["risk_level"] == "high"


def test_governance_layer_measures_outcomes():
    rows = build_governance_intelligence(context(), sample_data())
    portfolio = rows[0]["metrics"]
    assert portfolio["high_or_critical_risks"] == 1
    assert portfolio["recommendation_action_rate_pct"] == 100.0
    assert portfolio["decision_outcome_coverage_pct"] == 100.0


def test_predictive_layer_is_explicit_baseline_not_llm_claim():
    rows = build_predictive_intelligence(context(), sample_data())
    delay = next(row for row in rows if row["product_name"] == "task_delay_risk")
    assert delay["metrics"]["risk_band"] == "high"
    assert delay["confidence_kind"] == "rule_based_baseline"
    assert delay["product_version"] == "1.0.0"
    assert delay["limitations"]
    assert delay["model_metadata"]["feature_version"] == "canonical-v1"
    assert delay["model_metadata"]["training_data_window"] == "not_applicable_baseline"


def test_refresh_builds_all_layers_without_analytics_store():
    data = sample_data()

    class Repository:
        def list_entities(self, ctx, entity, limit=5000):
            return TenantRepositoryResult(data.get(entity, []), ctx, entities=(entity,))

    result = refresh_tenant_analytics(context(), Repository(), engine=None, persist=False)
    assert result["status"] == "ready"
    assert set(result["layers"]) == {layer.value for layer in AnalyticsLayer}
    assert all(count > 0 for count in result["row_counts"].values())
    for rows in result["layers"].values():
        for row in rows:
            assert all(source.startswith("public.") for source in row["derived_from"])


def test_refresh_never_accepts_browser_tenant_records():
    class Repository:
        def list_entities(self, ctx, entity, limit=5000):
            # A real repository always enforces tenant scope. This assertion
            # makes that verified context part of the analytics contract.
            assert ctx.tenant_id == "tenant-a"
            return TenantRepositoryResult([], ctx, entities=(entity,))

    result = refresh_tenant_analytics(context(), Repository(), engine=None, persist=False)
    assert result["company_id"] == "tenant-a"
