from .policy import canonical_wins


def reconcile_fact(name: str, canonical_value, analytical_value, *, analytics_source: str) -> dict:
    result = canonical_wins(canonical_value, analytical_value)
    return {
        "fact": name,
        **result,
        "canonical_source": "public.*",
        "analytical_source": analytics_source,
        "operator_action": "refresh_or_rebuild_analytics" if result["conflict"] else None,
    }


def raw_to_canonical_lineage(raw_source: str, canonical_source: str, *, ingestion_run_id=None) -> dict:
    return {
        "raw_source": raw_source,
        "canonical_source": canonical_source,
        "ingestion_run_id": ingestion_run_id,
        "relationship": "source_evidence_to_canonical_record",
        "raw_is_authoritative": False,
    }
