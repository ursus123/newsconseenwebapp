from ontology.relationship_registry import predicate_catalog


PREDICATES = predicate_catalog()


def predicate_for(value: str) -> dict:
    return {"id": value, **PREDICATES.get(value, {"label": value.replace("_", " "), "inverse": "related from", "category": "custom", "source_types": ["*"], "target_types": ["*"], "color": "#64748b"})}
