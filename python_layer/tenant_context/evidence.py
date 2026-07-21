from datetime import datetime, timezone


def metric_evidence(definition, metric: str, value, records_examined: int) -> dict:
    return {
        "metric": metric,
        "value": value,
        "source": definition.qualified_table,
        "tenant_filter_enforced": True,
        "record_count_examined": records_examined,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "method": "deterministic",
    }
