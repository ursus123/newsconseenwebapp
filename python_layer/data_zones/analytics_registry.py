from .models import DataZone, ZoneSource


def _summary(name, canonical, methodology):
    return ZoneSource(
        name=name, zone=DataZone.ANALYTICS, table=name,
        purpose="derived_summary", freshness_column="loaded_at",
        derived_from=(f"public.{canonical}",), methodology=methodology,
        confidence_kind="deterministic",
    )


ANALYTICS_REGISTRY = {
    "people_summary": _summary("people_summary", "persons", "Tenant-scoped counts and workforce status aggregates."),
    "enterprise_summary": _summary("enterprise_summary", "enterprises", "Tenant-scoped enterprise normalization and status snapshot."),
    "product_summary": _summary("product_summary", "products", "Inventory, value, availability and expiry aggregates."),
    "transaction_summary": _summary("transaction_summary", "transactions", "Transaction totals and time-window financial aggregates."),
    "task_summary": _summary("task_summary", "tasks", "Task completion, overdue and workload aggregates."),
    "address_summary": _summary("address_summary", "addresses", "Normalized tenant spatial-address summary."),
    "relationship_summary": _summary("relationship_summary", "relationships", "Relationship type and connectivity aggregates."),
    "service_summary": _summary("service_summary", "services", "Service availability and pricing aggregates."),
    "document_summary": _summary("document_summary", "documents", "Document status and expiry aggregates."),
    "schedule_summary": _summary("schedule_summary", "schedules", "Schedule activity and coverage aggregates."),
    "signal_summary": _summary("signal_summary", "signals", "Signal volume, anomalies and recency aggregates."),
    "channel_summary": _summary("channel_summary", "channels", "Communication-channel availability aggregates."),
    "territory_summary": _summary("territory_summary", "territories", "Territory coverage aggregates."),
    "animal_summary": _summary("animal_summary", "animals", "Animal status and population aggregates."),
    "plot_summary": _summary("plot_summary", "plots", "Plot utilization and area aggregates."),
    "observation_summary": _summary("observation_summary", "observations", "Observation and anomaly aggregates."),
    "insight_summary": _summary("insight_summary", "insights", "Derived insight status aggregates."),
    "recommendation_summary": _summary("recommendation_summary", "recommendations", "Recommendation priority and action aggregates."),
    "risk_summary": _summary("risk_summary", "risks", "Risk severity, likelihood and status aggregates."),
    "opportunity_summary": _summary("opportunity_summary", "opportunities", "Opportunity value, confidence and status aggregates."),
}

# Cross-object products already declared in ETL. Missing future layers are not
# invented here; they will be added after their product contracts are designed.
ANALYTICS_REGISTRY.update({
    "monthly_kpis": ZoneSource("monthly_kpis", DataZone.ANALYTICS, "monthly_kpis", "historical_metric", freshness_column="loaded_at", derived_from=("public.transactions", "public.tasks", "public.persons"), methodology="Monthly deterministic KPI aggregation.", confidence_kind="deterministic"),
    "company_scorecard": ZoneSource("company_scorecard", DataZone.ANALYTICS, "company_scorecard", "cross_object_intelligence", freshness_column="loaded_at", derived_from=("public.enterprises", "public.persons", "public.tasks", "public.transactions"), methodology="Weighted deterministic operational scorecard.", confidence_kind="deterministic"),
    "network_summary": ZoneSource("network_summary", DataZone.ANALYTICS, "network_summary", "cross_object_intelligence", freshness_column="loaded_at", derived_from=("public.relationships",), methodology="Relationship-network aggregation.", confidence_kind="deterministic"),
    "concentration_risk": ZoneSource("concentration_risk", DataZone.ANALYTICS, "concentration_risk", "cross_object_intelligence", freshness_column="loaded_at", derived_from=("public.transactions", "public.enterprises", "public.persons"), methodology="Revenue and dependency concentration analysis.", confidence_kind="deterministic"),
})

ANALYTICS_REGISTRY.update({
    "operational_object_summaries": ZoneSource("operational_object_summaries", DataZone.ANALYTICS, "operational_object_summaries", "operational_summary_layer", freshness_column="computed_at", derived_from=("public.*",), methodology="Deterministic current-state summaries from registered canonical objects.", confidence_kind="deterministic"),
    "operational_facts_daily": ZoneSource("operational_facts_daily", DataZone.ANALYTICS, "operational_facts_daily", "historical_fact_layer", freshness_column="computed_at", derived_from=("public.*",), methodology="Append-only daily deterministic facts from canonical objects.", confidence_kind="deterministic"),
    "cross_object_intelligence": ZoneSource("cross_object_intelligence", DataZone.ANALYTICS, "cross_object_intelligence", "cross_object_layer", freshness_column="computed_at", derived_from=("public.enterprises", "public.persons", "public.tasks", "public.transactions", "public.relationships"), methodology="Rule-based joins and ratios across canonical business objects.", confidence_kind="deterministic"),
    "governance_intelligence": ZoneSource("governance_intelligence", DataZone.ANALYTICS, "governance_intelligence", "governance_layer", freshness_column="computed_at", derived_from=("public.risks", "public.opportunities", "public.recommendations", "public.decisions"), methodology="Outcome, action and unresolved-exposure metrics from governed canonical records.", confidence_kind="deterministic"),
    "predictive_intelligence": ZoneSource("predictive_intelligence", DataZone.ANALYTICS, "predictive_intelligence", "predictive_layer", freshness_column="computed_at", derived_from=("public.tasks", "public.transactions", "public.products", "public.persons", "public.schedules"), methodology="Transparent versioned baseline predictions with explicit limitations.", confidence_kind="mixed_versioned_baselines"),
})
