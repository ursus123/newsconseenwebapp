PREDICATES = {
    "works_for": {"label": "works for", "inverse": "employs", "category": "organization", "source_types": ["person"], "target_types": ["enterprise"], "color": "#3b82f6"},
    "assigned_to": {"label": "assigned to", "inverse": "owns work", "category": "work", "source_types": ["task"], "target_types": ["person"], "color": "#f97316"},
    "belongs_to": {"label": "belongs to", "inverse": "contains", "category": "organization", "source_types": ["task"], "target_types": ["enterprise"], "color": "#64748b"},
    "involves": {"label": "involves", "inverse": "has transaction", "category": "finance", "source_types": ["transaction"], "target_types": ["enterprise"], "color": "#f59e0b"},
    "includes_product": {"label": "includes product", "inverse": "included in", "category": "offering", "source_types": ["transaction"], "target_types": ["product"], "color": "#10b981"},
    "provided_by": {"label": "provided by", "inverse": "provides", "category": "offering", "source_types": ["product", "service"], "target_types": ["enterprise"], "color": "#10b981"},
    "location_of": {"label": "location of", "inverse": "located at", "category": "spatial", "source_types": ["address"], "target_types": ["enterprise", "person"], "color": "#14b8a6"},
    "references": {"label": "references", "inverse": "referenced by", "category": "evidence", "source_types": ["document", "signal", "observation", "insight", "risk", "opportunity", "recommendation", "decision", "schedule"], "target_types": ["*"], "color": "#a855f7"},
}


def predicate_for(value: str) -> dict:
    return {"id": value, **PREDICATES.get(value, {"label": value.replace("_", " "), "inverse": "related from", "category": "custom", "source_types": ["*"], "target_types": ["*"], "color": "#64748b"})}
