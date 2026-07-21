from database import get_engine_safe
from tenant_context.entity_registry import context_definitions

from .builders import (
    build_cross_object_intelligence, build_governance_intelligence,
    build_historical_facts, build_operational_summaries, build_predictive_intelligence,
)
from .persistence import persist_layer


def refresh_tenant_analytics(context, repository, *, engine=None, persist=True, limit_per_object=5000):
    records = {}
    unavailable = {}
    for name, _definition in context_definitions():
        try:
            records[name] = repository.list_entities(context, name, limit=limit_per_object).data
        except Exception as exc:
            records[name] = []
            unavailable[name] = str(exc)[:160]

    operational = build_operational_summaries(context, records)
    historical = build_historical_facts(context, operational)
    cross_object = build_cross_object_intelligence(context, records)
    governance = build_governance_intelligence(context, records)
    predictive = build_predictive_intelligence(context, records)
    layers = {
        "operational_summary": operational, "historical_fact": historical,
        "cross_object_intelligence": cross_object, "governance_intelligence": governance,
        "predictive_intelligence": predictive,
    }
    target_engine = engine if engine is not None else get_engine_safe()
    persisted = {}
    if persist and target_engine is not None:
        for layer, rows in layers.items():
            persisted[layer] = persist_layer(target_engine, context.tenant_id, layer, rows)
    return {
        "status": "partial" if unavailable else "ready",
        "company_id": context.tenant_id,
        "layers": layers,
        "row_counts": {layer: len(rows) for layer, rows in layers.items()},
        "persisted": persisted,
        "persistence_status": "available" if target_engine is not None else "unavailable",
        "unavailable_objects": unavailable,
    }
