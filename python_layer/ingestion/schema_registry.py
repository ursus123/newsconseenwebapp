"""
ingestion/schema_registry.py
Canonical Base44 entity field definitions used to validate LLM-generated field_map entries.

Fields listed here are the safe, writable payload fields for each entity.
System fields (id, created_at, updated_at) are excluded — Base44 manages those.
"""

ENTITY_FIELDS: dict[str, set[str]] = {
    "Person": {
        "first_name", "last_name", "full_name", "email", "phone",
        "person_type", "person_subtype", "engagement_model", "status",
        "availability_status", "date_of_birth", "gender", "nationality",
        "address_id", "enterprise_id", "notes", "company_id",
    },
    "Enterprise": {
        "name", "short_name", "email", "phone", "website",
        "enterprise_type", "enterprise_tier", "enterprise_subtype",
        "operating_status", "status", "registration_number", "tax_number",
        "industry", "employee_count", "revenue", "city", "country",
        "address_id", "parent_enterprise_id", "notes", "company_id",
    },
    "Product": {
        "name", "sku", "barcode", "description", "item_type", "item_class",
        "item_subtype", "unit_of_measure", "price", "cost", "stock_quantity",
        "reorder_point", "expiry_date", "manufacturer", "supplier_id",
        "category", "notes", "company_id",
    },
    "Task": {
        "title", "description", "task_type", "status", "priority",
        "assigned_to", "assigned_enterprise_id", "due_date", "start_date",
        "completed_at", "outcome", "notes", "company_id",
    },
    "Transaction": {
        "reference_number", "transaction_type", "amount", "currency",
        "date", "status", "payment_method", "person_id", "enterprise_id",
        "product_id", "description", "notes", "company_id",
    },
    "Relationship": {
        "from_entity_type", "from_entity_id", "to_entity_type", "to_entity_id",
        "relationship_type", "status", "start_date", "end_date",
        "strength", "notes", "company_id",
    },
    "Address": {
        "street", "city", "state", "country", "postal_code",
        "latitude", "longitude", "address_type", "is_primary",
        "entity_type", "entity_id", "notes", "company_id",
    },
    "Document": {
        "title", "document_type", "file_url", "status", "description",
        "entity_type", "entity_id", "issued_date", "expiry_date",
        "notes", "company_id",
    },
    "Schedule": {
        "name", "frequency", "status", "description", "entity_type",
        "entity_id", "next_run", "last_run", "notes", "company_id",
    },
    "Signal": {
        "signal_type", "source", "value", "recorded_at", "status",
        "entity_type", "entity_id", "notes", "company_id",
    },
    "Channel": {
        "name", "channel_type", "status", "description",
        "entity_id", "notes", "company_id",
    },
    "Territory": {
        "name", "territory_type", "status", "description",
        "parent_territory_id", "notes", "company_id",
    },
    "Animal": {
        "name", "animal_type", "species", "breed", "sex",
        "date_of_birth", "weight_kg", "tag_number", "status",
        "enterprise_id", "notes", "company_id",
    },
    "Plot": {
        "name", "plot_type", "land_use", "crop_type", "area_ha",
        "latitude", "longitude", "status", "enterprise_id",
        "notes", "company_id",
    },
    "Observation": {
        "observation_type", "subject_type", "subject_id",
        "numeric_value", "text_value", "unit_of_measure",
        "is_anomaly", "observed_at", "notes", "company_id",
    },
}

VALID_ENTITY_TYPES: set[str] = set(ENTITY_FIELDS.keys())


def validate_field_map(field_map: list[dict]) -> list[dict]:
    """
    Validate each field_map entry against the canonical schema.

    Returns a list of violation dicts:
      { "source_column", "target_entity", "target_field", "issue" }

    Violations are informational — they do not block the plan, but they are
    surfaced in analyst_notes so the operator can review before loading.
    """
    violations = []
    for fm in field_map:
        entity = fm.get("target_entity", "")
        field  = fm.get("target_field", "")
        col    = fm.get("source_column", "")

        if not entity or not field:
            continue

        if entity not in VALID_ENTITY_TYPES:
            violations.append({
                "source_column": col,
                "target_entity": entity,
                "target_field":  field,
                "issue": f"Unknown entity type '{entity}'. Valid types: {', '.join(sorted(VALID_ENTITY_TYPES))}",
            })
            continue

        known_fields = ENTITY_FIELDS[entity]
        if field not in known_fields:
            violations.append({
                "source_column": col,
                "target_entity": entity,
                "target_field":  field,
                "issue": (
                    f"'{field}' is not a known field on {entity}. "
                    f"Known fields: {', '.join(sorted(known_fields))}"
                ),
            })

    return violations


def annotate_analysis(analysis: dict) -> dict:
    """
    Run validate_field_map and attach violations to the analysis dict in-place.
    Adds 'schema_violations' list and appends a note to analyst_notes.
    Returns the modified analysis dict.
    """
    field_map  = analysis.get("field_map", [])
    violations = validate_field_map(field_map)

    analysis["schema_violations"] = violations

    if violations:
        v_summary = "; ".join(
            f"{v['target_entity']}.{v['target_field']} (col: {v['source_column']})"
            for v in violations
        )
        note = f"[Schema check: {len(violations)} unknown field mapping(s) — review before loading: {v_summary}]"
        analysis["analyst_notes"] = (
            (analysis.get("analyst_notes") or "") + " " + note
        ).strip()

    return analysis
