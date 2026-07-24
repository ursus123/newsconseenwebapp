from dataclasses import dataclass


@dataclass(frozen=True)
class EntityDefinition:
    table: str
    family: str
    classification: str
    read_permission: str
    write_permission: str
    fields: tuple[str, ...]
    tenant_column: str = "company_id"
    sensitivity: str = "internal"
    context_tier: str = "domain"
    enabled_for_context: bool = True
    operational_unit_field: str | None = None

    @property
    def qualified_table(self) -> str:
        return f"public.{self.table}"


def _object(table, family, fields, *, classification="canonical_business", sensitivity="internal", tier="domain", enabled=True, unit_owned=False, include_updated=True):
    name = table[:-1] if table.endswith("s") else table
    return EntityDefinition(
        table=table, family=family, classification=classification,
        read_permission=f"{name}.read", write_permission=f"{name}.write",
        fields=tuple(dict.fromkeys((
            "id", "company_id", *fields,
            *(("operational_unit_id",) if unit_owned else ()),
            *(("updated_at",) if include_updated else ()),
        ))),
        sensitivity=sensitivity, context_tier=tier, enabled_for_context=enabled,
        operational_unit_field="operational_unit_id" if unit_owned else None,
    )


# Canonical public schema inventory. Fields are intentionally bounded: Idjwi's
# overview never uses select=* and sensitive detail is retrieved only on demand.
ENTITY_REGISTRY = {
    "enterprise": _object("enterprises", "organization", ("enterprise_name", "enterprise_type", "enterprise_tier", "parent_enterprise_id", "status", "operating_status", "city", "region", "country"), tier="core"),
    "operational_unit": _object("operational_units", "organization", ("organization_id", "unit_name", "unit_type", "parent_unit_id", "manager_user_id", "manager_person_id", "jurisdiction", "permission_policy", "status", "starts_at", "ends_at"), tier="core"),
    "operational_unit_membership": _object("operational_unit_memberships", "organization", ("operational_unit_id", "user_id", "person_id", "membership_role", "permissions", "status", "valid_from", "valid_to"), sensitivity="restricted", enabled=True),
    "operational_unit_relationship": _object("operational_unit_relationships", "organization", ("source_unit_id", "target_unit_id", "predicate", "status", "valid_from", "valid_to", "evidence"), enabled=True),
    "graph_assertion": _object("graph_assertions", "governance", ("operational_unit_id", "assertion_key", "relationship_rule_id", "source_node_id", "predicate", "target_node_id", "assertion_class", "assertion_state", "valid_from", "valid_until", "observed_at", "confirmed_at", "rejected_at", "superseded_by", "evidence_version", "evidence", "reason", "actor_user_id"), classification="governance", sensitivity="internal", enabled=True),
    "graph_assertion_event": _object("graph_assertion_events", "governance", ("assertion_id", "assertion_key", "from_state", "to_state", "reason", "actor_user_id", "evidence_version", "evidence", "occurred_at"), classification="governance", sensitivity="internal", enabled=True, include_updated=False),
    "graph_assertion_outcome": _object("graph_assertion_outcomes", "governance", ("assertion_id", "assertion_key", "outcome", "observed_at", "evidence", "notes", "actor_user_id"), classification="governance", sensitivity="internal", enabled=True, include_updated=False),
    "graph_saved_view": _object("graph_saved_views", "governance", ("owner_user_id", "name", "audience", "scope", "filters", "layout", "permissions", "version", "validation_state", "created_at"), classification="governance", sensitivity="internal", enabled=True),
    "person": _object("persons", "people", ("first_name", "last_name", "preferred_name", "person_type", "person_subtype", "primary_role", "status", "availability_status", "start_date", "end_date"), sensitivity="personal", tier="core", unit_owned=True),
    "product": _object("products", "offerings", ("product_name", "item_name", "item_type", "item_class", "stock_quantity", "reorder_level", "expiry_date", "price", "cost", "enterprise_id"), unit_owned=True),
    "service": _object("services", "offerings", ("name", "service_name", "service_type", "price", "is_active", "enterprise_id"), unit_owned=True),
    "task": _object("tasks", "work", ("title", "task_type", "status", "priority", "due_date", "completed_at", "assigned_to_name", "related_person", "related_person_id", "enterprise", "enterprise_id"), tier="core", unit_owned=True),
    "transaction": _object("transactions", "finance", ("reference_number", "description", "transaction_type", "status", "payment_status", "amount", "amount_paid", "net_amount", "currency", "date", "due_date", "enterprise", "enterprise_id", "person_name", "person_id", "product_name", "product_id"), sensitivity="financial", tier="core", unit_owned=True),
    "relationship": _object("relationships", "knowledge", ("relationship_type", "person_name", "person", "person_id", "secondary_person", "secondary_person_id", "enterprise_name", "enterprise", "enterprise_id", "secondary_enterprise", "secondary_enterprise_id", "item_name", "item_id", "service_name", "service_id", "role", "status", "start_date", "end_date"), unit_owned=True),
    "address": _object("addresses", "spatial", ("address_line1", "city", "region", "country", "postal_code", "latitude", "longitude", "address_type", "entity_ref_type", "entity_ref_id", "is_primary"), unit_owned=True),
    "document": _object("documents", "knowledge", ("title", "document_type", "entity_ref_type", "entity_ref_id", "issue_date", "expiry_date", "status"), sensitivity="confidential", unit_owned=True),
    "schedule": _object("schedules", "work", ("name", "title", "schedule_type", "frequency", "start_date", "end_date", "is_active", "entity_ref_type", "entity_ref_id"), unit_owned=True),
    "signal": _object("signals", "intelligence", ("name", "signal_type", "numeric_value", "unit", "source", "entity_ref_type", "entity_ref_id", "is_anomaly", "recorded_at"), classification="derived_intelligence", unit_owned=True),
    "channel": _object("channels", "communications", ("name", "channel_name", "channel_type", "is_active"), sensitivity="confidential", unit_owned=True),
    "territory": _object("territories", "spatial", ("name", "territory_name", "territory_type", "parent_territory_id", "area_km2"), unit_owned=True),
    "animal": _object("animals", "agriculture", ("name", "animal_type", "breed", "status", "date_of_birth", "enterprise_id"), unit_owned=True),
    "plot": _object("plots", "agriculture", ("name", "plot_type", "land_use", "crop_type", "area_ha", "status", "parent_plot_id", "enterprise_id"), unit_owned=True),
    "observation": _object("observations", "operations", ("observation_type", "subject_type", "subject_id", "numeric_value", "unit_of_measure", "is_anomaly", "observed_at"), unit_owned=True),
    "insight": _object("insights", "intelligence", ("insight_type", "title", "severity", "entity_ref_type", "entity_ref_id", "is_actioned", "is_dismissed"), classification="derived_intelligence", unit_owned=True),
    "recommendation": _object("recommendations", "governance", ("title", "recommendation_type", "priority", "entity_ref_type", "entity_ref_id", "is_actioned", "is_dismissed"), classification="governance", unit_owned=True),
    "decision": _object("decisions", "governance", ("decision", "decision_type", "outcome", "decided_by", "decided_at", "entity_ref_type", "entity_ref_id"), classification="governance", unit_owned=True),
    "risk": _object("risks", "governance", ("title", "risk_type", "status", "severity", "likelihood", "impact", "entity_ref_type", "entity_ref_id"), classification="governance", unit_owned=True),
    "opportunity": _object("opportunities", "governance", ("title", "opportunity_type", "status", "estimated_value", "confidence", "entity_ref_type", "entity_ref_id"), classification="governance", unit_owned=True),
    "metric_definition": _object("metric_definitions", "taxonomy", ("name", "description", "metric_type", "unit", "entity_type", "is_active"), classification="system_taxonomy"),
    "master_data_option": _object("master_data_options", "taxonomy", ("entity_type", "field_name", "value", "label", "is_system_default", "is_active"), classification="system_taxonomy"),
    "user_profile": _object("user_profiles", "identity", ("role",), classification="security_identity", sensitivity="restricted", enabled=False),
}

ALIASES = {definition.table: name for name, definition in ENTITY_REGISTRY.items()}


def definition_for(entity: str) -> tuple[str, EntityDefinition]:
    canonical = (entity or "").strip().lower()
    canonical = ALIASES.get(canonical, canonical)
    if canonical not in ENTITY_REGISTRY:
        raise ValueError(f"Entity '{entity}' is not registered for tenant access")
    return canonical, ENTITY_REGISTRY[canonical]


def context_definitions(*, tier: str | None = None, family: str | None = None):
    items = []
    for name, definition in ENTITY_REGISTRY.items():
        if not definition.enabled_for_context:
            continue
        if tier and definition.context_tier != tier:
            continue
        if family and definition.family != family:
            continue
        items.append((name, definition))
    return items


def public_schema_inventory() -> list[dict]:
    return [
        {
            "object": name, "source": definition.qualified_table,
            "family": definition.family, "classification": definition.classification,
            "sensitivity": definition.sensitivity,
            "context_enabled": definition.enabled_for_context,
        }
        for name, definition in ENTITY_REGISTRY.items()
    ]
