from dataclasses import dataclass


@dataclass(frozen=True)
class EntityDefinition:
    table: str
    read_permission: str
    write_permission: str
    tenant_column: str = "company_id"


ENTITY_REGISTRY = {
    name: EntityDefinition(table, f"{name}.read", f"{name}.write")
    for name, table in {
        "enterprise": "enterprises",
        "person": "persons",
        "task": "tasks",
        "transaction": "transactions",
        "product": "products",
        "relationship": "relationships",
        "address": "addresses",
        "service": "services",
        "document": "documents",
        "schedule": "schedules",
        "signal": "signals",
        "channel": "channels",
        "territory": "territories",
    }.items()
}

ALIASES = {definition.table: name for name, definition in ENTITY_REGISTRY.items()}


def definition_for(entity: str) -> tuple[str, EntityDefinition]:
    canonical = (entity or "").strip().lower()
    canonical = ALIASES.get(canonical, canonical)
    if canonical not in ENTITY_REGISTRY:
        raise ValueError(f"Entity '{entity}' is not registered for tenant access")
    return canonical, ENTITY_REGISTRY[canonical]
