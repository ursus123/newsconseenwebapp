from dataclasses import dataclass
from enum import Enum


class AnalyticsLayer(str, Enum):
    OPERATIONAL = "operational_summary"
    HISTORICAL = "historical_fact"
    CROSS_OBJECT = "cross_object_intelligence"
    GOVERNANCE = "governance_intelligence"
    PREDICTIVE = "predictive_intelligence"


@dataclass(frozen=True)
class AnalyticsProductContract:
    name: str
    layer: AnalyticsLayer
    grain: str
    derived_from: tuple[str, ...]
    methodology: str
    version: str = "1.0.0"
    confidence_kind: str = "deterministic"
    maximum_age_seconds: int = 3600


def _p(name, layer, grain, sources, method, **kwargs):
    return AnalyticsProductContract(name, layer, grain, tuple(f"public.{item}" for item in sources), method, **kwargs)


ANALYTICS_PRODUCT_CONTRACTS = {
    # Layer 1: current canonical state.
    "operational_object_summary": _p("operational_object_summary", AnalyticsLayer.OPERATIONAL, "tenant + object + refresh", ("enterprises", "persons", "tasks", "transactions", "products", "services", "relationships", "addresses"), "Deterministic bounded-field counts, statuses, freshness and data-quality metrics."),
    # Layer 2: append-only daily facts.
    "operational_fact_daily": _p("operational_fact_daily", AnalyticsLayer.HISTORICAL, "tenant + object + calendar_day", ("enterprises", "persons", "tasks", "transactions", "products", "services"), "Daily immutable snapshot of deterministic canonical metrics.", maximum_age_seconds=90000),
    # Layer 3: joins across canonical objects.
    "enterprise_health": _p("enterprise_health", AnalyticsLayer.CROSS_OBJECT, "tenant + enterprise", ("enterprises", "persons", "tasks", "transactions"), "Rule-based health from staffing, overdue work and financial activity."),
    "workload_risk": _p("workload_risk", AnalyticsLayer.CROSS_OBJECT, "tenant", ("persons", "tasks"), "Open and overdue work relative to active people and unassigned work."),
    "revenue_concentration": _p("revenue_concentration", AnalyticsLayer.CROSS_OBJECT, "tenant", ("transactions", "enterprises"), "Largest-enterprise share of current canonical transaction value."),
    "relationship_coverage": _p("relationship_coverage", AnalyticsLayer.CROSS_OBJECT, "tenant", ("persons", "enterprises", "relationships"), "Coverage of canonical people and enterprises by active relationships."),
    "service_delivery_risk": _p("service_delivery_risk", AnalyticsLayer.CROSS_OBJECT, "tenant", ("services", "tasks", "products"), "Delivery exposure from overdue work and low-stock inputs."),
    # Layer 4: organizational learning and authority outcomes.
    "governance_portfolio": _p("governance_portfolio", AnalyticsLayer.GOVERNANCE, "tenant + refresh", ("risks", "opportunities", "recommendations", "decisions"), "Deterministic governance counts, action rates, outcome coverage and unresolved exposure."),
    "decision_outcomes": _p("decision_outcomes", AnalyticsLayer.GOVERNANCE, "tenant + refresh", ("decisions", "recommendations"), "Coverage of recorded decision outcomes and recommendation action status."),
    # Layer 5: transparent, versioned baseline predictions.
    "task_delay_risk": _p("task_delay_risk", AnalyticsLayer.PREDICTIVE, "tenant + task", ("tasks",), "Transparent heuristic using due date, priority, assignment and current status.", confidence_kind="rule_based_baseline"),
    "cashflow_outlook": _p("cashflow_outlook", AnalyticsLayer.PREDICTIVE, "tenant + refresh", ("transactions",), "Baseline projection from posted canonical transaction amounts; not a trained forecast.", confidence_kind="statistical_baseline"),
    "inventory_restock_risk": _p("inventory_restock_risk", AnalyticsLayer.PREDICTIVE, "tenant + product", ("products", "tasks"), "Rule-based stock and expiry exposure baseline.", confidence_kind="rule_based_baseline"),
    "staffing_pressure": _p("staffing_pressure", AnalyticsLayer.PREDICTIVE, "tenant + refresh", ("persons", "tasks", "schedules"), "Workload-to-active-person capacity baseline.", confidence_kind="rule_based_baseline"),
}
