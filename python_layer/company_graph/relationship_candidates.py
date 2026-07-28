"""Universal, ontology-wide relationship candidate contract and detection.

Detectors are deterministic and provider-neutral. They never mutate canonical
records; they emit governed proposals that may later be confirmed or rejected.
"""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

from ontology.relationship_registry import (
    ALL_RELATIONSHIP_RULES,
    canonicalize_predicate,
    predicate_catalog,
)
from tenant_context.entity_registry import definition_for


RELATIONSHIP_CANDIDATE_VERSION = "ontology-relationship-candidate.v1"
MATCHING_METHODS = {
    "explicit_uuid_reference",
    "exact_unique_tenant_name",
    "import_mapping",
    "canonical_reference_field",
    "operational_unit_ownership",
    "external_observation_match",
    "deterministic_inference",
    "advisor_proposal",
}


class CandidateNode(BaseModel):
    entity_type: str
    entity_id: str | None = None
    label: str | None = None
    candidate_count: int = Field(default=0, ge=0)


class RelationshipCandidateEvidence(BaseModel):
    evidence_id: str
    source_table: str
    source_record_id: str
    matching_fields: dict[str, Any] = Field(default_factory=dict)
    normalization: str = "trim_casefold_whitespace"
    explanation: str


class RelationshipCandidate(BaseModel):
    contract_version: str = RELATIONSHIP_CANDIDATE_VERSION
    candidate_id: str
    tenant_id: str
    operational_unit_id: str | None = None
    carrier_type: str
    carrier_record_id: str
    relationship_rule_id: str
    source: CandidateNode
    predicate: str
    raw_predicate: str | None = None
    target: CandidateNode
    inverse_predicate: str
    assertion_class: Literal[
        "canonical_relationship", "canonical_reference_projection",
        "deterministic_derivation", "analytical_inference",
        "external_observation", "advisor_proposal",
    ] = "deterministic_derivation"
    matching_method: str
    confidence: float = Field(ge=0, le=1)
    evidence: list[RelationshipCandidateEvidence]
    evidence_hash: str
    evidence_version: int = Field(default=1, ge=1)
    temporal_state: dict[str, Any] = Field(default_factory=dict)
    verification_state: Literal["proposed", "confirmed", "rejected", "disputed"] = "proposed"
    proposed_operation: str
    proposed_patch: dict[str, Any] = Field(default_factory=dict)
    sensitivity: str = "internal"
    business_consequence: str
    permitted_actions: list[str] = Field(default_factory=lambda: ["inspect", "confirm", "reject", "dispute"])
    bulk_group_key: str | None = None
    bulk_confirmable: bool = False
    detected_at: str


LABEL_FIELDS = {
    "person": (("preferred_name",), ("first_name", "last_name")),
    "enterprise": (("enterprise_name",),),
    "product": (("product_name",), ("item_name",)),
    "service": (("service_name",), ("name",)),
    "task": (("title",),),
    "transaction": (("reference_number",), ("description",)),
    "address": (("address_line1", "city"),),
    "operational_unit": (("unit_name",),),
    "document": (("title",),),
    "schedule": (("title",), ("name",)),
    "risk": (("title",),),
    "recommendation": (("title",),),
    "decision": (("decision",),),
    "external_observation": (("title",),),
}


def _normalize(value: Any) -> str:
    return " ".join(str(value or "").casefold().split())


def _label(entity_type: str, row: dict[str, Any]) -> str:
    for fields in LABEL_FIELDS.get(entity_type, (("name",), ("title",))):
        value = " ".join(str(row.get(field) or "").strip() for field in fields).strip()
        if value:
            return value
    return f"{entity_type} {row.get('id')}"


def _first_label(row: dict[str, Any], fields: tuple[str, ...]) -> str:
    return next((str(row.get(field)).strip() for field in fields if row.get(field)), "")


def _indexes(records: dict[str, list[dict]]) -> tuple[dict[str, dict[str, list[dict]]], dict[str, dict[str, dict]]]:
    names: dict[str, dict[str, list[dict]]] = {}
    ids: dict[str, dict[str, dict]] = {}
    for entity_type, rows in records.items():
        by_name: dict[str, list[dict]] = defaultdict(list)
        by_id = {}
        for row in rows:
            if row.get("id"):
                by_id[str(row["id"])] = row
                normalized = _normalize(_label(entity_type, row))
                if normalized:
                    by_name[normalized].append(row)
        names[entity_type], ids[entity_type] = dict(by_name), by_id
    return names, ids


def _candidate_key(tenant_id: str, rule_id: str, carrier_id: str,
                   source: CandidateNode, predicate: str, target: CandidateNode) -> str:
    material = "|".join((
        tenant_id, rule_id, carrier_id,
        f"{source.entity_type}:{source.entity_id or source.label or 'unresolved'}",
        predicate,
        f"{target.entity_type}:{target.entity_id or target.label or 'unresolved'}",
    ))
    return hashlib.sha256(material.encode()).hexdigest()


def detect_relationship_candidates(tenant_id: str, records: dict[str, list[dict]]) -> list[RelationshipCandidate]:
    names, ids = _indexes(records)
    predicates = predicate_catalog()
    detected_at = datetime.now(timezone.utc).isoformat()
    candidates = []
    seen = set()
    for rule in ALL_RELATIONSHIP_RULES:
        for row in records.get(rule.carrier_type, []):
            carrier_id = str(row.get("id") or "")
            if not carrier_id:
                continue
            source_id = str(row.get(rule.source_field) or "") or None
            target_id = str(row.get(rule.target_field) or "") or None
            source_label = _first_label(row, rule.source_label_fields)
            target_label = _first_label(row, rule.target_label_fields)
            # A polymorphic carrier such as public.relationships participates
            # only in rules for which its target is actually present. This
            # prevents one legacy row from producing proposals for unrelated
            # Person, Enterprise, Product, and Service shapes.
            if not target_id and not target_label:
                continue
            source_matches = names.get(rule.source_type, {}).get(_normalize(source_label), []) if source_label else []
            target_type = str(row.get(rule.target_type_field) or rule.target_type) if rule.target_type_field else rule.target_type
            target_matches = names.get(target_type, {}).get(_normalize(target_label), []) if target_label else []

            source_row = ids.get(rule.source_type, {}).get(source_id) if source_id else None
            target_row = ids.get(target_type, {}).get(target_id) if target_id else None
            source_resolved = source_row or (source_matches[0] if len(source_matches) == 1 else None)
            target_resolved = target_row or (target_matches[0] if len(target_matches) == 1 else None)
            if source_row and target_row:
                matching_method = "explicit_uuid_reference"
            elif source_resolved and target_resolved:
                matching_method = "exact_unique_tenant_name"
            elif source_id or target_id or source_label or target_label:
                matching_method = "canonical_reference_field"
            else:
                continue

            raw_predicate = str(row.get(rule.predicate_field) or rule.predicate) if rule.predicate_field else rule.predicate
            predicate = canonicalize_predicate(raw_predicate, row.get("role"), rule.source_type, target_type)
            semantic_valid = bool(predicate and predicate in predicates)
            if not semantic_valid:
                predicate = "unclassified_relationship"
            source = CandidateNode(
                entity_type=rule.source_type,
                entity_id=str(source_resolved["id"]) if source_resolved else source_id,
                label=_label(rule.source_type, source_resolved) if source_resolved else source_label or None,
                candidate_count=1 if source_row else len(source_matches),
            )
            target = CandidateNode(
                entity_type=target_type,
                entity_id=str(target_resolved["id"]) if target_resolved else target_id,
                label=_label(target_type, target_resolved) if target_resolved else target_label or None,
                candidate_count=1 if target_row else len(target_matches),
            )
            unresolved = not source.entity_id or not target.entity_id or not source_resolved or not target_resolved
            confidence = (
                1.0 if source_row and target_row and semantic_valid
                else .98 if source_resolved and target_resolved and semantic_valid
                else .35 if unresolved else .6
            )
            verification = "disputed" if unresolved or not semantic_valid else "proposed"
            patch = {}
            if source_resolved and not source_id:
                patch[rule.source_field] = str(source_resolved["id"])
            if target_resolved and not target_id:
                patch[rule.target_field] = str(target_resolved["id"])
            if rule.predicate_field and semantic_valid and raw_predicate != predicate:
                patch[rule.predicate_field] = predicate
            evidence_material = {
                "carrier": carrier_id, "rule": rule.id, "source_label": source_label,
                "target_label": target_label, "source_id": source.entity_id,
                "target_id": target.entity_id, "raw_predicate": raw_predicate,
                "predicate": predicate, "status": row.get("status"),
            }
            try:
                carrier_fields = definition_for(rule.carrier_type)[1].fields
            except ValueError:
                carrier_fields = tuple(row)
            evidence_material["carrier_values"] = {
                field: row.get(field) for field in carrier_fields
                if field not in {"company_id"} and row.get(field) is not None
            }
            evidence_hash = hashlib.sha256(json.dumps(evidence_material, sort_keys=True).encode()).hexdigest()
            candidate_id = _candidate_key(tenant_id, rule.id, carrier_id, source, predicate, target)
            if candidate_id in seen:
                continue
            seen.add(candidate_id)
            definition = predicates[predicate]
            bulk = bool(
                definition.get("bulk_confirmable", True)
                and matching_method in {"explicit_uuid_reference", "exact_unique_tenant_name"}
                and not unresolved and semantic_valid
            )
            try:
                source_table = definition_for(rule.carrier_type)[1].qualified_table
            except ValueError:
                source_table = f"public.{rule.carrier_type}s"
            candidates.append(RelationshipCandidate(
                candidate_id=candidate_id, tenant_id=tenant_id,
                operational_unit_id=str(row.get("operational_unit_id")) if row.get("operational_unit_id") else None,
                carrier_type=rule.carrier_type, carrier_record_id=carrier_id,
                relationship_rule_id=rule.id, source=source, predicate=predicate,
                raw_predicate=raw_predicate, target=target,
                inverse_predicate=definition.get("inverse") or rule.inverse_relationship,
                assertion_class="canonical_relationship" if source_row and target_row and semantic_valid else "deterministic_derivation",
                matching_method=matching_method, confidence=confidence,
                evidence=[RelationshipCandidateEvidence(
                    evidence_id=f"{source_table}:{carrier_id}",
                    source_table=source_table, source_record_id=carrier_id,
                    matching_fields=evidence_material,
                    explanation=(
                        "Both endpoint UUIDs resolve to authorized canonical records."
                        if source_row and target_row else
                        "Normalized labels were evaluated against authorized tenant-local records."
                    ),
                )],
                evidence_hash=evidence_hash,
                temporal_state={
                    "status": row.get("status") or "active",
                    "valid_from": row.get(rule.valid_from_field) if rule.valid_from_field else None,
                    "valid_until": row.get(rule.valid_to_field) if rule.valid_to_field else None,
                },
                verification_state=verification,
                proposed_operation=rule.proposed_operation if not unresolved else "quarantine_for_review",
                proposed_patch=patch, sensitivity=rule.sensitivity,
                business_consequence=(
                    "The relationship cannot be used for governed reasoning until its endpoints and predicate are verified."
                    if unresolved or not semantic_valid else
                    "Confirmation will make this relationship available to governed graph reasoning."
                ),
                permitted_actions=list(rule.valid_correction_actions),
                bulk_group_key=(
                    f"{rule.id}:{predicate}:{matching_method}:{rule.proposed_operation}" if bulk else None
                ),
                bulk_confirmable=bulk, detected_at=detected_at,
            ))
    return candidates


def requires_governed_review(candidate: RelationshipCandidate) -> bool:
    """Return whether a detected assertion needs an operator-owned queue item."""
    return bool(
        candidate.verification_state in {"proposed", "disputed"}
        and (
            candidate.assertion_class != "canonical_relationship"
            or candidate.proposed_patch
            or candidate.predicate == "unclassified_relationship"
        )
    )


def persist_relationship_candidates(repository, context, candidates: list[RelationshipCandidate]) -> dict[str, Any]:
    """Upsert review proposals while preserving unchanged operator rejections."""
    existing_rows = repository.list_entities(context, "graph_assertion", limit=5000).data or []
    by_key = {str(row.get("assertion_key")): row for row in existing_rows if row.get("assertion_key")}
    created = updated = suppressed = unchanged = 0
    records = []
    timestamp = datetime.now(timezone.utc).isoformat()
    for candidate in candidates:
        if not requires_governed_review(candidate):
            continue
        existing = by_key.get(candidate.candidate_id)
        evidence_changed = bool(existing and existing.get("evidence_hash") != candidate.evidence_hash)
        if existing and existing.get("assertion_state") == "rejected" and not evidence_changed:
            suppressed += 1
            records.append(existing)
            continue
        # Stable evidence is idempotent. In particular, never overwrite a
        # confirmed/disputed operator state merely because another scan ran.
        if existing and not evidence_changed:
            unchanged += 1
            records.append(existing)
            continue
        state = candidate.verification_state
        version = int((existing or {}).get("evidence_version") or 1)
        if evidence_changed:
            version += 1
            state = "proposed" if candidate.verification_state != "disputed" else "disputed"
        payload = {
            "operational_unit_id": candidate.operational_unit_id,
            "assertion_key": candidate.candidate_id,
            "relationship_rule_id": candidate.relationship_rule_id,
            "source_node_id": f"{candidate.source.entity_type}:{candidate.source.entity_id or 'unresolved'}",
            "predicate": candidate.predicate,
            "target_node_id": f"{candidate.target.entity_type}:{candidate.target.entity_id or 'unresolved'}",
            "assertion_class": candidate.assertion_class,
            "assertion_state": state,
            "valid_from": candidate.temporal_state.get("valid_from"),
            "valid_until": candidate.temporal_state.get("valid_until"),
            "observed_at": candidate.detected_at,
            "evidence_version": version,
            "evidence": [item.model_dump() for item in candidate.evidence],
            "reason": candidate.business_consequence,
            "actor_user_id": context.user_id,
            "carrier_type": candidate.carrier_type,
            "carrier_record_id": candidate.carrier_record_id,
            "matching_method": candidate.matching_method,
            "candidate_count": max(candidate.source.candidate_count, candidate.target.candidate_count),
            "candidate_confidence": candidate.confidence,
            "permitted_actions": candidate.permitted_actions,
            "raw_predicate": candidate.raw_predicate,
            "proposed_operation": candidate.proposed_operation,
            "proposed_patch": candidate.proposed_patch,
            "bulk_group_key": candidate.bulk_group_key,
            "evidence_hash": candidate.evidence_hash,
            "business_consequence": candidate.business_consequence,
            "last_evaluated_at": timestamp,
        }
        if existing:
            record = repository.update_entity(context, "graph_assertion", str(existing["id"]), payload).data
            updated += 1
        else:
            record = repository.create_entity(context, "graph_assertion", payload).data
            created += 1
        records.append(record)
        if not existing or evidence_changed:
            repository.create_entity(context, "graph_assertion_event", {
                "assertion_id": record["id"],
                "assertion_key": candidate.candidate_id,
                "from_state": existing.get("assertion_state") if existing else None,
                "to_state": state,
                "reason": "Relationship candidate detected" if not existing else "Candidate evidence changed",
                "actor_user_id": context.user_id,
                "evidence_version": version,
                "evidence": [item.model_dump() for item in candidate.evidence],
                "occurred_at": timestamp,
            })
    return {
        "records": records, "created": created, "updated": updated,
        "suppressed_rejections": suppressed, "unchanged": unchanged,
    }
