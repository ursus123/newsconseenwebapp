"""Registry-driven ontology relationship contract.

The registry is the shared definition used by graph projection, Idjwi context,
import validation, data-quality checks, and relationship-editing metadata.
Adding a reference-backed entity requires one registry entry, not a new graph
extraction loop.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class RelationshipRule:
    id: str
    carrier_type: str
    source_type: str
    source_field: str
    target_type: str
    target_field: str
    predicate: str
    direction: str = "directed"
    predicate_field: str | None = None
    target_type_field: str | None = None
    assertion_class: str = "canonical_reference_projection"
    source_zone: str = "canonical"
    temporal_behavior: str = "current_until_revoked"
    valid_from_field: str | None = None
    valid_to_field: str | None = None
    observed_at_field: str | None = None
    expires_at_field: str | None = None
    evidence_requirement: str = "canonical_record_id"
    sensitivity: str = "internal"
    canonicalization: str = "reference_projection"
    inverse_relationship: str = "related_from"
    valid_correction_actions: tuple[str, ...] = ("inspect", "propose_correction")
    confidence: float = 1.0

    def public_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["valid_correction_actions"] = list(self.valid_correction_actions)
        return data


def _reference(rule_id, carrier, source_field, target_type, predicate, inverse,
               *, source_type=None, target_type_field=None, assertion="canonical_reference_projection",
               zone="canonical", confidence=1.0, sensitivity="internal"):
    return RelationshipRule(
        id=rule_id, carrier_type=carrier, source_type=source_type or carrier,
        source_field="id", target_type=target_type, target_field=source_field,
        predicate=predicate, target_type_field=target_type_field,
        assertion_class=assertion, source_zone=zone, confidence=confidence,
        inverse_relationship=inverse, sensitivity=sensitivity,
        canonicalization="typed_reference",
    )


RELATIONSHIP_RULES: tuple[RelationshipRule, ...] = (
    # Canonical relationship carrier.
    RelationshipRule("relationship.person_enterprise", "relationship", "person", "person_id", "enterprise", "enterprise_id", "related_to", predicate_field="relationship_type", valid_from_field="start_date", valid_to_field="end_date", assertion_class="canonical_relationship", canonicalization="canonical_relationship_record", inverse_relationship="related_from", valid_correction_actions=("inspect", "confirm", "reject", "edit")),
    RelationshipRule("relationship.person_person", "relationship", "person", "person_id", "person", "secondary_person_id", "related_to", predicate_field="relationship_type", valid_from_field="start_date", valid_to_field="end_date", assertion_class="canonical_relationship", canonicalization="canonical_relationship_record", inverse_relationship="related_from", valid_correction_actions=("inspect", "confirm", "reject", "edit"), sensitivity="restricted"),
    RelationshipRule("relationship.enterprise_enterprise", "relationship", "enterprise", "enterprise_id", "enterprise", "secondary_enterprise_id", "related_to", predicate_field="relationship_type", valid_from_field="start_date", valid_to_field="end_date", assertion_class="canonical_relationship", canonicalization="canonical_relationship_record", inverse_relationship="related_from", valid_correction_actions=("inspect", "confirm", "reject", "edit")),
    RelationshipRule("relationship.enterprise_product", "relationship", "enterprise", "enterprise_id", "product", "item_id", "related_to", predicate_field="relationship_type", valid_from_field="start_date", valid_to_field="end_date", assertion_class="canonical_relationship", canonicalization="canonical_relationship_record", inverse_relationship="related_from", valid_correction_actions=("inspect", "confirm", "reject", "edit")),
    RelationshipRule("relationship.enterprise_service", "relationship", "enterprise", "enterprise_id", "service", "service_id", "related_to", predicate_field="relationship_type", valid_from_field="start_date", valid_to_field="end_date", assertion_class="canonical_relationship", canonicalization="canonical_relationship_record", inverse_relationship="related_from", valid_correction_actions=("inspect", "confirm", "reject", "edit")),

    # First-class operational-unit identity, hierarchy, management and membership.
    RelationshipRule("unit.parent", "operational_unit", "operational_unit", "id", "operational_unit", "parent_unit_id", "part_of", inverse_relationship="contains_unit", canonicalization="unit_hierarchy", valid_from_field="starts_at", valid_to_field="ends_at", valid_correction_actions=("inspect", "edit_hierarchy")),
    RelationshipRule("unit.manager", "operational_unit", "operational_unit", "id", "person", "manager_person_id", "managed_by", inverse_relationship="manages", sensitivity="restricted", canonicalization="unit_manager_assignment", valid_correction_actions=("inspect", "change_manager")),
    RelationshipRule("unit.membership", "operational_unit_membership", "person", "person_id", "operational_unit", "operational_unit_id", "member_of", inverse_relationship="has_member", sensitivity="restricted", canonicalization="unit_membership", valid_from_field="valid_from", valid_to_field="valid_to", valid_correction_actions=("inspect", "edit_membership", "end_membership")),
    RelationshipRule("unit.cross_unit", "operational_unit_relationship", "operational_unit", "source_unit_id", "operational_unit", "target_unit_id", "coordinates_with", predicate_field="predicate", inverse_relationship="coordinates_with", canonicalization="cross_unit_relationship", valid_from_field="valid_from", valid_to_field="valid_to", evidence_requirement="operator_evidence", valid_correction_actions=("inspect", "edit", "end")),

    # Canonical object references.
    _reference("task.enterprise", "task", "enterprise_id", "enterprise", "belongs_to", "owns_work"),
    _reference("task.person", "task", "related_person_id", "person", "assigned_to", "owns_assignment", sensitivity="restricted"),
    _reference("transaction.enterprise", "transaction", "enterprise_id", "enterprise", "involves", "has_transaction", sensitivity="restricted"),
    _reference("transaction.person", "transaction", "person_id", "person", "involves_person", "has_transaction", sensitivity="restricted"),
    _reference("transaction.product", "transaction", "product_id", "product", "includes_product", "included_in", sensitivity="restricted"),
    _reference("product.enterprise", "product", "enterprise_id", "enterprise", "provided_by", "provides"),
    _reference("service.enterprise", "service", "enterprise_id", "enterprise", "provided_by", "provides"),
    _reference("address.owner", "address", "entity_ref_id", "enterprise", "location_of", "located_at", target_type_field="entity_ref_type", sensitivity="restricted"),
    _reference("document.subject", "document", "entity_ref_id", "enterprise", "references", "referenced_by", target_type_field="entity_ref_type", sensitivity="confidential"),
    _reference("schedule.subject", "schedule", "entity_ref_id", "enterprise", "references", "referenced_by", target_type_field="entity_ref_type"),
    _reference("signal.subject", "signal", "entity_ref_id", "enterprise", "references", "referenced_by", target_type_field="entity_ref_type"),
    _reference("insight.subject", "insight", "entity_ref_id", "enterprise", "references", "referenced_by", target_type_field="entity_ref_type", assertion="analytical_inference", zone="analytics", confidence=.8),
    _reference("risk.subject", "risk", "entity_ref_id", "enterprise", "references", "referenced_by", target_type_field="entity_ref_type", assertion="analytical_inference", zone="analytics", confidence=.8),
    _reference("opportunity.subject", "opportunity", "entity_ref_id", "enterprise", "references", "referenced_by", target_type_field="entity_ref_type", assertion="analytical_inference", zone="analytics", confidence=.8),
    _reference("recommendation.subject", "recommendation", "entity_ref_id", "enterprise", "references", "referenced_by", target_type_field="entity_ref_type", assertion="analytical_inference", zone="analytics", confidence=.8),
    _reference("decision.subject", "decision", "entity_ref_id", "enterprise", "references", "referenced_by", target_type_field="entity_ref_type"),
    _reference("observation.subject", "observation", "subject_id", "enterprise", "references", "referenced_by", target_type_field="subject_type", assertion="external_observation", zone="external", confidence=.8),
    _reference("animal.enterprise", "animal", "enterprise_id", "enterprise", "belongs_to", "contains"),
    _reference("plot.enterprise", "plot", "enterprise_id", "enterprise", "belongs_to", "contains"),
)


UNIT_OWNED_ENTITY_TYPES = (
    "person", "product", "service", "task", "transaction", "relationship",
    "address", "document", "schedule", "signal", "channel", "territory",
    "animal", "plot", "observation", "insight", "recommendation", "decision",
    "risk", "opportunity",
)

OWNERSHIP_RULES = tuple(
    RelationshipRule(
        id=f"{entity}.operational_unit", carrier_type=entity,
        source_type=entity, source_field="id", target_type="operational_unit",
        target_field="operational_unit_id", predicate="operates_in",
        inverse_relationship="owns_record", canonicalization="unit_record_ownership",
        valid_correction_actions=("inspect", "reassign_unit"),
    ) for entity in UNIT_OWNED_ENTITY_TYPES if entity != "relationship"
)

ALL_RELATIONSHIP_RULES = RELATIONSHIP_RULES + OWNERSHIP_RULES


PREDICATE_METADATA = {
    "works_for": ("works for", "employs", "organization", "#3b82f6"),
    "assigned_to": ("assigned to", "owns assignment", "work", "#f97316"),
    "belongs_to": ("belongs to", "contains", "organization", "#64748b"),
    "involves": ("involves", "has transaction", "finance", "#f59e0b"),
    "involves_person": ("involves person", "has transaction", "finance", "#f59e0b"),
    "includes_product": ("includes product", "included in", "offering", "#10b981"),
    "provided_by": ("provided by", "provides", "offering", "#10b981"),
    "location_of": ("location of", "located at", "spatial", "#14b8a6"),
    "references": ("references", "referenced by", "evidence", "#a855f7"),
    "part_of": ("part of", "contains unit", "organization", "#4f46e5"),
    "managed_by": ("managed by", "manages", "organization", "#2563eb"),
    "member_of": ("member of", "has member", "organization", "#3b82f6"),
    "coordinates_with": ("coordinates with", "coordinates with", "organization", "#8b5cf6"),
    "operates_in": ("operates in", "owns record", "ownership", "#0f766e"),
    "related_to": ("related to", "related from", "custom", "#64748b"),
}

DYNAMIC_PREDICATE_SHAPES = {
    "works_for": (("person",), ("enterprise",)),
}


def rules_for_carrier(entity_type: str) -> tuple[RelationshipRule, ...]:
    return tuple(rule for rule in ALL_RELATIONSHIP_RULES if rule.carrier_type == entity_type)


def graph_entity_types() -> tuple[str, ...]:
    types = {rule.carrier_type for rule in ALL_RELATIONSHIP_RULES}
    types.update(rule.source_type for rule in ALL_RELATIONSHIP_RULES)
    types.update(rule.target_type for rule in ALL_RELATIONSHIP_RULES)
    return tuple(sorted(types))


def edge_carrier_types() -> set[str]:
    return {"relationship", "operational_unit_membership", "operational_unit_relationship"}


def registry_contract() -> dict[str, Any]:
    return {
        "version": "ontology-relationships.v1",
        "rules": [rule.public_dict() for rule in ALL_RELATIONSHIP_RULES],
        "consumers": ["forms", "canonical_repositories", "company_graph", "idjwi", "import_mapping", "data_quality", "relationship_editing"],
    }


def predicate_catalog() -> dict[str, dict[str, Any]]:
    catalog: dict[str, dict[str, Any]] = {}
    for rule in ALL_RELATIONSHIP_RULES:
        label, inverse, category, color = PREDICATE_METADATA.get(rule.predicate, (rule.predicate.replace("_", " "), rule.inverse_relationship, "custom", "#64748b"))
        entry = catalog.setdefault(rule.predicate, {"label": label, "inverse": inverse, "category": category, "source_types": [], "target_types": [], "color": color})
        if rule.source_type not in entry["source_types"]:
            entry["source_types"].append(rule.source_type)
        if rule.target_type not in entry["target_types"]:
            entry["target_types"].append(rule.target_type)
    for predicate, (source_types, target_types) in DYNAMIC_PREDICATE_SHAPES.items():
        label, inverse, category, color = PREDICATE_METADATA[predicate]
        catalog[predicate] = {"label": label, "inverse": inverse, "category": category, "source_types": list(source_types), "target_types": list(target_types), "color": color}
    return catalog


def data_quality_issues(records: dict[str, list[dict]]) -> list[dict[str, Any]]:
    issues = []
    for rule in ALL_RELATIONSHIP_RULES:
        for row in records.get(rule.carrier_type, []):
            source_id, target_id = row.get(rule.source_field), row.get(rule.target_field)
            if target_id and not source_id:
                issues.append({"code": "RELATIONSHIP_SOURCE_MISSING", "rule_id": rule.id, "record_id": row.get("id")})
    return issues


def mapping_diagnostics(records: dict[str, list[dict]], node_ids: set[str]) -> dict[str, int]:
    known_predicates = set(predicate_catalog())
    candidates = mapped = unmatched = unknown = 0
    keys: list[tuple[str, str, str]] = []
    for carrier_type, rows in records.items():
        for rule in rules_for_carrier(carrier_type):
            for row in rows:
                source_id, target_id = row.get(rule.source_field), row.get(rule.target_field)
                if not source_id or not target_id:
                    continue
                candidates += 1
                target_type = str(row.get(rule.target_type_field) or rule.target_type) if rule.target_type_field else rule.target_type
                predicate = str(row.get(rule.predicate_field) or rule.predicate) if rule.predicate_field else rule.predicate
                source_node = f"{rule.source_type}:{source_id}"
                target_node = f"{target_type}:{target_id}"
                if predicate not in known_predicates:
                    unknown += 1
                    continue
                if source_node not in node_ids or target_node not in node_ids:
                    unmatched += 1
                    continue
                mapped += 1
                keys.append((source_node, predicate, target_node))
    return {
        "candidates": candidates, "mapped": mapped, "unmatched_endpoints": unmatched,
        "unknown_predicates": unknown, "duplicates": len(keys) - len(set(keys)),
    }
