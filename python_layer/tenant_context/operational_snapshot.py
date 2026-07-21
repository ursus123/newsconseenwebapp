import time
from datetime import datetime, timezone

from data_sources.supabase_source import SupabaseSourceError

from .data_quality import section_quality
from .entity_registry import context_definitions, definition_for, public_schema_inventory
from .evidence import metric_evidence
from .operational_metrics import deterministic_metrics
from .snapshot_cache import cache_key, get_cached, set_cached


def _section(repository, context, name, definition, limit):
    started = time.monotonic()
    try:
        result = repository.list_entities(context, name, limit=limit)
        rows = result.data
        metrics = deterministic_metrics(name, rows)
        status = "empty" if not rows else "available"
        return {
            "status": status,
            "source": definition.qualified_table,
            "family": definition.family,
            "classification": definition.classification,
            "sensitivity": definition.sensitivity,
            "record_count": len(rows),
            "metrics": metrics,
            "evidence": [metric_evidence(definition, key, value, len(rows)) for key, value in metrics.items() if not isinstance(value, dict)],
            "data_quality": section_quality(name, rows, context.tenant_id),
            "sample": rows[:5],
            "fields_selected": list(definition.fields),
            "duration_ms": round((time.monotonic() - started) * 1000, 1),
            "operator_action": None,
        }
    except ValueError as exc:
        return {"status": "unsupported", "source": definition.qualified_table, "error": str(exc), "operator_action": "update_schema_contract"}
    except SupabaseSourceError as exc:
        return {"status": "unavailable", "source": definition.qualified_table, "error": str(exc)[:180], "operator_action": "check_table_and_backend"}
    except Exception as exc:
        return {"status": "failed", "source": definition.qualified_table, "error": str(exc)[:180], "operator_action": "inspect_schema_or_permissions"}


def build_snapshot(repository, context, *, layer="core", family=None, limit_per_object=500, use_cache=True):
    key = cache_key(context, f"{layer}:{family or 'all'}")
    if use_cache:
        cached = get_cached(key)
        if cached:
            return {**cached, "cache": "hit"}

    if layer == "core":
        definitions = context_definitions(tier="core")
    elif family:
        definitions = context_definitions(family=family)
    else:
        definitions = context_definitions()

    sections = {name: _section(repository, context, name, definition, limit_per_object) for name, definition in definitions}
    statuses = [section["status"] for section in sections.values()]
    if sections and all(status == "empty" for status in statuses):
        state = "empty"
    elif any(status in {"failed", "unavailable", "unsupported"} for status in statuses):
        state = "partial" if any(status in {"available", "empty"} for status in statuses) else "unavailable"
    else:
        state = "ready"
    snapshot = {
        "status": state,
        "layer": layer,
        "family": family,
        "tenant_id": context.tenant_id,
        "scope": {"type": context.scope_type, "id": context.scope_id},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sections": sections,
        "object_inventory": public_schema_inventory(),
        "cache": "miss",
    }
    set_cached(key, snapshot)
    return snapshot
