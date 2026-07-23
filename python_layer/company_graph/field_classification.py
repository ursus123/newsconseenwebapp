"""Type-specific Company Graph field classifications and safe projections.

Unknown fields are prohibited by default. `sensitive` fields require a dedicated
record-detail contract and are never serialized into graph nodes, even when the
principal has graph.read_sensitive.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


FIELD_CLASSIFICATIONS = ("graph_safe", "role_restricted", "sensitive", "prohibited")


@dataclass(frozen=True)
class GraphProjectionDefinition:
    graph_safe: tuple[str, ...]
    role_restricted: tuple[str, ...] = ()
    sensitive: tuple[str, ...] = ()
    prohibited: tuple[str, ...] = ()
    label_fields: tuple[str, ...] = ()
    restricted_label_fields: tuple[str, ...] = ()
    status_fields: tuple[str, ...] = ("status",)

    def classification_for(self, field: str) -> str:
        for classification in FIELD_CLASSIFICATIONS:
            if field in getattr(self, classification):
                return classification
        return "prohibited"

    def validate(self) -> None:
        seen: set[str] = set()
        for classification in FIELD_CLASSIFICATIONS:
            fields = set(getattr(self, classification))
            overlap = seen.intersection(fields)
            if overlap:
                raise ValueError(f"Graph fields have conflicting classifications: {sorted(overlap)}")
            seen.update(fields)


COMMON_PROHIBITED = (
    "company_id", "tenant_id", "user_id", "email", "phone", "internal_notes",
    "notes", "password", "password_hash", "secret", "token", "api_key",
    "credential", "raw_payload", "source_payload", "metadata", "data",
)


PROJECTIONS: dict[str, GraphProjectionDefinition] = {
    "enterprise": GraphProjectionDefinition(
        graph_safe=("enterprise_name", "name", "enterprise_type", "enterprise_tier", "operating_status", "status", "city", "region", "country"),
        role_restricted=("parent_enterprise_id",),
        sensitive=("tax_id", "registration_number", "bank_account", "credit_limit"),
        prohibited=COMMON_PROHIBITED,
        label_fields=("enterprise_name", "name"), status_fields=("operating_status", "status"),
    ),
    "operational_unit": GraphProjectionDefinition(
        graph_safe=("name", "unit_name", "unit_type", "status", "starts_at", "ends_at"),
        role_restricted=("jurisdiction", "manager_display_name"),
        sensitive=("budget", "cost_center", "staffing_notes"),
        prohibited=COMMON_PROHIBITED + ("organization_id", "parent_unit_id", "manager_user_id", "manager_person_id", "membership_user_ids", "permission_policy"),
        label_fields=("unit_name", "name"),
    ),
    "person": GraphProjectionDefinition(
        graph_safe=("person_type", "person_subtype", "status", "availability_status", "engagement_model"),
        role_restricted=("first_name", "last_name", "preferred_name", "full_name", "primary_role", "start_date", "end_date"),
        sensitive=("date_of_birth", "home_address", "medical_data", "pay_rate", "government_id"),
        prohibited=COMMON_PROHIBITED,
        restricted_label_fields=("full_name", "preferred_name", "first_name", "last_name"),
    ),
    "task": GraphProjectionDefinition(
        graph_safe=("title", "task_name", "task_type", "status", "priority", "due_date", "scheduled_date", "outcome"),
        role_restricted=("assigned_to_name", "completed_at", "outcome_reason"),
        sensitive=("outcome_notes", "private_description", "labor_cost"),
        prohibited=COMMON_PROHIBITED + ("related_person_id", "assigned_to_id"),
        label_fields=("title", "task_name"),
    ),
    "transaction": GraphProjectionDefinition(
        graph_safe=("transaction_type", "status", "payment_status", "transaction_date", "date", "due_date", "currency"),
        role_restricted=("reference_number", "description"),
        sensitive=("amount", "amount_paid", "net_amount", "counterparty_name", "account_number", "payment_method"),
        prohibited=COMMON_PROHIBITED + ("person_id", "product_id", "enterprise_id"),
        restricted_label_fields=("reference_number", "description"),
    ),
    "product": GraphProjectionDefinition(
        graph_safe=("product_name", "item_name", "name", "item_type", "item_class", "unit_of_measure", "status", "stock_quantity", "reorder_level", "expiry_date"),
        role_restricted=("sku", "supplier_display_name"),
        sensitive=("price", "cost", "margin", "supplier_terms"),
        prohibited=COMMON_PROHIBITED + ("enterprise_id",),
        label_fields=("product_name", "item_name", "name"),
    ),
    "service": GraphProjectionDefinition(
        graph_safe=("name", "service_name", "service_type", "status", "is_active"),
        role_restricted=("service_code", "delivery_owner"),
        sensitive=("price", "cost", "margin", "contract_terms"),
        prohibited=COMMON_PROHIBITED + ("enterprise_id",),
        label_fields=("service_name", "name"), status_fields=("status", "is_active"),
    ),
    "relationship": GraphProjectionDefinition(
        graph_safe=("relationship_type", "status", "start_date", "end_date"),
        role_restricted=("role",),
        sensitive=("relationship_notes", "private_rationale"),
        prohibited=COMMON_PROHIBITED + ("person_id", "secondary_person_id", "enterprise_id", "secondary_enterprise_id", "item_id", "service_id"),
        label_fields=("relationship_type",),
    ),
    "address": GraphProjectionDefinition(
        graph_safe=("address_type", "city", "region", "state", "country", "is_primary"),
        role_restricted=("postal_code",),
        sensitive=("address_line1", "address_line2", "latitude", "longitude"),
        prohibited=COMMON_PROHIBITED + ("entity_ref_id", "delivery_instructions"),
        label_fields=("city", "country"),
    ),
    "document": GraphProjectionDefinition(
        graph_safe=("title", "document_type", "status", "issue_date", "expiry_date"),
        role_restricted=("document_number", "issuer"),
        sensitive=("content", "summary", "file_url", "storage_path"),
        prohibited=COMMON_PROHIBITED + ("entity_ref_id", "signed_url"),
        label_fields=("title",),
    ),
    "schedule": GraphProjectionDefinition(
        graph_safe=("name", "title", "schedule_type", "frequency", "status", "is_active", "start_date", "end_date"),
        role_restricted=("timezone", "owner_display_name"),
        sensitive=("private_notes", "participant_details"),
        prohibited=COMMON_PROHIBITED + ("entity_ref_id", "participant_ids"),
        label_fields=("title", "name"), status_fields=("status", "is_active"),
    ),
    "risk": GraphProjectionDefinition(
        graph_safe=("title", "risk_type", "status", "severity", "likelihood", "impact"),
        role_restricted=("owner_display_name", "mitigation_status"),
        sensitive=("financial_exposure", "legal_analysis", "private_assessment"),
        prohibited=COMMON_PROHIBITED + ("entity_ref_id",),
        label_fields=("title",),
    ),
    "opportunity": GraphProjectionDefinition(
        graph_safe=("title", "opportunity_type", "status", "confidence"),
        role_restricted=("owner_display_name", "stage"),
        sensitive=("estimated_value", "margin", "commercial_terms"),
        prohibited=COMMON_PROHIBITED + ("entity_ref_id",),
        label_fields=("title",),
    ),
    "recommendation": GraphProjectionDefinition(
        graph_safe=("title", "recommendation_type", "priority", "status", "is_actioned", "is_dismissed"),
        role_restricted=("owner_display_name", "review_due_at"),
        sensitive=("private_rationale", "advisor_raw_output"),
        prohibited=COMMON_PROHIBITED + ("entity_ref_id", "prompt", "completion"),
        label_fields=("title",),
    ),
    "decision": GraphProjectionDefinition(
        graph_safe=("title", "decision_type", "status", "outcome", "decided_at"),
        role_restricted=("decision", "decided_by_display_name"),
        sensitive=("private_rationale", "approval_notes"),
        prohibited=COMMON_PROHIBITED + ("decided_by", "entity_ref_id"),
        label_fields=("title",), restricted_label_fields=("decision",),
    ),
    "action": GraphProjectionDefinition(
        graph_safe=("title", "action_type", "action_label", "status", "priority", "risk_level", "created_at", "completed_at"),
        role_restricted=("reasoning", "approval_status", "approved_at"),
        sensitive=("action_payload", "result_payload", "error_detail"),
        prohibited=COMMON_PROHIBITED + ("approved_by", "credential_ref", "tool_secret"),
        label_fields=("title", "action_label", "action_type"),
    ),
    "external_observation": GraphProjectionDefinition(
        graph_safe=("observation_type", "status", "severity", "observed_at", "expires_at", "confidence"),
        role_restricted=("source_name", "location_label", "summary"),
        sensitive=("precise_location", "matched_person_details"),
        prohibited=COMMON_PROHIBITED + ("source_credentials", "request_headers"),
        restricted_label_fields=("summary", "location_label"),
    ),
}

ALIASES = {"people": "person", "observation": "external_observation", "actions": "action", "operational_units": "operational_unit"}


def definition_for_projection(entity_type: str) -> GraphProjectionDefinition:
    canonical = ALIASES.get(entity_type, entity_type)
    if canonical not in PROJECTIONS:
        # Unknown object types have no exposable fields and only a generic label.
        return GraphProjectionDefinition(graph_safe=(), prohibited=COMMON_PROHIBITED)
    definition = PROJECTIONS[canonical]
    definition.validate()
    return definition


def classify_field(entity_type: str, field: str) -> str:
    return definition_for_projection(entity_type).classification_for(field)


def project_record(entity_type: str, row: dict[str, Any], *, include_role_restricted: bool) -> dict[str, Any]:
    definition = definition_for_projection(entity_type)
    allowed = set(definition.graph_safe)
    if include_role_restricted:
        allowed.update(definition.role_restricted)
    attributes = {field: row[field] for field in allowed if row.get(field) is not None}

    label_fields = list(definition.label_fields)
    if include_role_restricted:
        label_fields.extend(definition.restricted_label_fields)
    values = [str(row[field]).strip() for field in label_fields if row.get(field)]
    if entity_type == "person" and include_role_restricted and not values:
        joined = " ".join(filter(None, (row.get("first_name"), row.get("last_name"))))
        if joined:
            values.append(joined)
    label = values[0][:120] if values else f"{entity_type.replace('_', ' ').title()} {str(row.get('id', ''))[:8]}"
    status = next((row.get(field) for field in definition.status_fields if row.get(field) is not None), None)
    sublabel = next((str(value) for field, value in attributes.items() if field not in set(definition.label_fields + definition.status_fields)), None)
    return {"label": label, "sublabel": sublabel, "status": str(status) if status is not None else None, "attributes": attributes}


def classified_fields(entity_type: str) -> dict[str, str]:
    definition = definition_for_projection(entity_type)
    return {field: classification for classification in FIELD_CLASSIFICATIONS for field in getattr(definition, classification)}
