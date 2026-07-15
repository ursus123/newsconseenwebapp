"""
Idjwi-first ingestion analysis.

This module gives the ingestion pipeline a deterministic Newsconseen ontology
mapper so uploads never depend on a paid LLM provider. External models are
advisers: Idjwi may ask one when the operator chooses it and the provider is
configured, but Idjwi remains the product-facing ingestion brain.
"""

from __future__ import annotations

import logging
import os
import re
from collections import Counter, defaultdict
from typing import Any

from copilot.llm_registry import get_model

logger = logging.getLogger(__name__)


_COLUMN_ALIASES: dict[str, tuple[str, str, float]] = {
    # People
    "full_name": ("Person", "full_name", 0.88),
    "name": ("Person", "full_name", 0.70),
    "first_name": ("Person", "first_name", 0.92),
    "last_name": ("Person", "last_name", 0.92),
    "email": ("Person", "email", 0.95),
    "email_address": ("Person", "email", 0.95),
    "phone": ("Person", "phone", 0.90),
    "phone_number": ("Person", "phone", 0.90),
    "mobile": ("Person", "phone", 0.86),
    "dob": ("Person", "date_of_birth", 0.86),
    "date_of_birth": ("Person", "date_of_birth", 0.92),
    "gender": ("Person", "gender", 0.86),
    "person_type": ("Person", "person_type", 0.90),
    "client": ("Person", "full_name", 0.72),
    "customer": ("Person", "full_name", 0.70),
    "patient": ("Person", "full_name", 0.74),
    "staff": ("Person", "full_name", 0.70),
    "employee": ("Person", "full_name", 0.72),
    # Enterprises
    "enterprise": ("Enterprise", "name", 0.88),
    "enterprise_name": ("Enterprise", "name", 0.94),
    "company": ("Enterprise", "name", 0.86),
    "company_name": ("Enterprise", "name", 0.94),
    "organization": ("Enterprise", "name", 0.88),
    "organisation": ("Enterprise", "name", 0.88),
    "business": ("Enterprise", "name", 0.80),
    "branch": ("Enterprise", "short_name", 0.78),
    "clinic": ("Enterprise", "name", 0.82),
    "farm": ("Enterprise", "name", 0.82),
    "shop": ("Enterprise", "name", 0.82),
    "industry": ("Enterprise", "industry", 0.90),
    "website": ("Enterprise", "website", 0.90),
    "registration_number": ("Enterprise", "registration_number", 0.92),
    "tax_number": ("Enterprise", "tax_number", 0.92),
    "employee_count": ("Enterprise", "employee_count", 0.88),
    "revenue": ("Enterprise", "revenue", 0.72),
    # Products
    "product": ("Product", "name", 0.88),
    "product_name": ("Product", "name", 0.94),
    "item": ("Product", "name", 0.82),
    "item_name": ("Product", "name", 0.90),
    "sku": ("Product", "sku", 0.95),
    "barcode": ("Product", "barcode", 0.95),
    "description": ("Product", "description", 0.62),
    "category": ("Product", "category", 0.84),
    "price": ("Product", "price", 0.86),
    "cost": ("Product", "cost", 0.86),
    "stock": ("Product", "stock_quantity", 0.82),
    "stock_quantity": ("Product", "stock_quantity", 0.92),
    "quantity": ("Product", "stock_quantity", 0.68),
    "reorder_point": ("Product", "reorder_point", 0.88),
    "expiry": ("Product", "expiry_date", 0.82),
    "expiry_date": ("Product", "expiry_date", 0.92),
    "manufacturer": ("Product", "manufacturer", 0.90),
    # Transactions
    "amount": ("Transaction", "amount", 0.92),
    "currency": ("Transaction", "currency", 0.92),
    "date": ("Transaction", "date", 0.62),
    "transaction_date": ("Transaction", "date", 0.92),
    "payment_date": ("Transaction", "date", 0.86),
    "invoice": ("Transaction", "reference_number", 0.80),
    "invoice_number": ("Transaction", "reference_number", 0.92),
    "reference": ("Transaction", "reference_number", 0.86),
    "reference_number": ("Transaction", "reference_number", 0.94),
    "payment_method": ("Transaction", "payment_method", 0.90),
    "transaction_type": ("Transaction", "transaction_type", 0.90),
    # Tasks
    "task": ("Task", "title", 0.86),
    "task_title": ("Task", "title", 0.92),
    "title": ("Task", "title", 0.62),
    "due": ("Task", "due_date", 0.80),
    "due_date": ("Task", "due_date", 0.92),
    "priority": ("Task", "priority", 0.90),
    "assigned_to": ("Task", "assigned_to", 0.88),
    "outcome": ("Task", "outcome", 0.86),
    # Addresses
    "street": ("Address", "street", 0.90),
    "address": ("Address", "street", 0.76),
    "city": ("Address", "city", 0.88),
    "state": ("Address", "state", 0.88),
    "country": ("Address", "country", 0.88),
    "postal_code": ("Address", "postal_code", 0.90),
    "zip": ("Address", "postal_code", 0.86),
    "latitude": ("Address", "latitude", 0.92),
    "longitude": ("Address", "longitude", 0.92),
    # Documents and observations
    "document_title": ("Document", "title", 0.90),
    "document_type": ("Document", "document_type", 0.90),
    "source_file": ("Document", "file_url", 0.72),
    "text": ("Document", "description", 0.70),
    "notes": ("Document", "notes", 0.58),
    "observation": ("Observation", "text_value", 0.78),
    "observation_type": ("Observation", "observation_type", 0.88),
    "numeric_value": ("Observation", "numeric_value", 0.90),
    "unit": ("Observation", "unit_of_measure", 0.84),
    "unit_of_measure": ("Observation", "unit_of_measure", 0.92),
    "observed_at": ("Observation", "observed_at", 0.90),
    # Farm-native
    "animal": ("Animal", "name", 0.82),
    "animal_name": ("Animal", "name", 0.90),
    "animal_type": ("Animal", "animal_type", 0.90),
    "species": ("Animal", "species", 0.88),
    "breed": ("Animal", "breed", 0.88),
    "sex": ("Animal", "sex", 0.84),
    "tag_number": ("Animal", "tag_number", 0.92),
    "weight": ("Animal", "weight_kg", 0.74),
    "weight_kg": ("Animal", "weight_kg", 0.92),
    "plot": ("Plot", "name", 0.82),
    "plot_name": ("Plot", "name", 0.90),
    "plot_type": ("Plot", "plot_type", 0.90),
    "land_use": ("Plot", "land_use", 0.88),
    "crop": ("Plot", "crop_type", 0.80),
    "crop_type": ("Plot", "crop_type", 0.92),
    "area": ("Plot", "area_ha", 0.70),
    "area_ha": ("Plot", "area_ha", 0.92),
    # Shared status fields: entity chosen by surrounding columns.
    "status": ("", "status", 0.70),
}


def _normalise_column(column: str) -> str:
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", column or "")
    value = re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()
    return re.sub(r"_+", "_", value)


def _profile_for(profiles: list[dict], column: str) -> dict:
    return next((p for p in profiles if p.get("column") == column), {})


def _mapping_for_column(column: str, profiles: list[dict], entity_hint: str | None) -> dict | None:
    key = _normalise_column(column)
    profile = _profile_for(profiles, column)
    signals = {str(s).lower() for s in profile.get("pattern_signals", [])}
    inferred_type = str(profile.get("inferred_type", "")).lower()

    alias = _COLUMN_ALIASES.get(key)
    if not alias:
        if "email" in key or "email" in signals:
            alias = ("Person", "email", 0.88)
        elif "phone" in key or "phone" in signals:
            alias = ("Person", "phone", 0.82)
        elif "date" in key or inferred_type == "date":
            alias = (entity_hint or "Task", "due_date" if entity_hint == "Task" else "date", 0.56)
        elif any(token in key for token in ("lat", "latitude")):
            alias = ("Address", "latitude", 0.82)
        elif any(token in key for token in ("lon", "lng", "longitude")):
            alias = ("Address", "longitude", 0.82)
        elif any(token in key for token in ("memo", "note", "comment")):
            alias = (entity_hint or "Document", "notes", 0.56)
        else:
            return None

    entity, field, confidence = alias
    if not entity:
        entity = entity_hint or "Task"
    if field == "date" and entity != "Transaction":
        field = "due_date" if entity == "Task" else "observed_at" if entity == "Observation" else "date"

    return {
        "source_column": column,
        "target_entity": entity,
        "target_field": field,
        "confidence": confidence,
        "is_primary_key": key in {"id", "uuid", "sku", "barcode", "reference_number", "invoice_number", "tag_number"},
        "transform_hint": _transform_hint(profile, field),
    }


def _transform_hint(profile: dict, target_field: str) -> str:
    inferred_type = str(profile.get("inferred_type", "")).lower()
    if target_field in {"date", "due_date", "start_date", "completed_at", "expiry_date", "observed_at", "date_of_birth"}:
        return "parse date"
    if target_field in {"amount", "price", "cost", "revenue", "stock_quantity", "employee_count", "latitude", "longitude", "weight_kg", "area_ha"}:
        return "parse number" if inferred_type not in {"number", "integer", "float"} else ""
    return ""


def _dominant_entity(field_map: list[dict]) -> str | None:
    counts = Counter(m["target_entity"] for m in field_map if m.get("target_entity"))
    return counts.most_common(1)[0][0] if counts else None


def _build_entity_splits(field_map: list[dict], row_count: int) -> list[dict]:
    by_entity: dict[str, list[float]] = defaultdict(list)
    for item in field_map:
        by_entity[item["target_entity"]].append(float(item.get("confidence") or 0.0))

    splits = []
    for entity, scores in by_entity.items():
        avg = sum(scores) / max(len(scores), 1)
        splits.append({
            "entity_type": entity,
            "confidence": round(min(0.88, max(0.45, avg)), 2),
            "row_coverage": 1.0 if row_count else 0.0,
            "reason": f"Idjwi matched {len(scores)} source column(s) to {entity}.",
        })
    return sorted(splits, key=lambda s: s["confidence"], reverse=True)


def analyse_draft(
    *,
    source_name: str,
    columns: list[str],
    profiles: list[dict],
    sample_rows: list[dict],
    row_count: int,
    note: str | None = None,
) -> dict[str, Any]:
    """Create a deterministic, review-first ontology mapping plan."""
    first_pass = [
        _mapping_for_column(column, profiles, None)
        for column in columns
    ]
    field_map = [m for m in first_pass if m]
    entity_hint = _dominant_entity(field_map)

    # Revisit ambiguous shared fields with the dominant entity context.
    field_map = []
    for column in columns:
        mapping = _mapping_for_column(column, profiles, entity_hint)
        if mapping:
            field_map.append(mapping)

    if not field_map and columns:
        for column in columns[:8]:
            field_map.append({
                "source_column": column,
                "target_entity": "Document",
                "target_field": "notes",
                "confidence": 0.38,
                "is_primary_key": False,
                "transform_hint": "review manually",
            })

    splits = _build_entity_splits(field_map, row_count)
    confidence_values = [float(m.get("confidence") or 0.0) for m in field_map]
    overall = sum(confidence_values) / max(len(confidence_values), 1) if confidence_values else 0.0
    # Deterministic mappings should invite review unless very clear.
    overall = min(overall, 0.74)

    notes = [
        "Idjwi created this mapping from Newsconseen's ontology and column profiles without using a paid adviser.",
        "Review before loading, especially ambiguous name/date/status columns.",
    ]
    if note:
        notes.append(note)

    return {
        "entity_splits": splits,
        "field_map": field_map,
        "relationships": _infer_relationships(field_map),
        "overall_confidence": round(overall, 2),
        "analyst_notes": " ".join(notes),
        "idjwi_analysis_mode": "idjwi_only",
        "adviser_used": None,
        "adviser_label": "Idjwi only",
        "source_name": source_name,
    }


def _infer_relationships(field_map: list[dict]) -> list[dict]:
    entities = {m.get("target_entity") for m in field_map}
    rels = []
    if "Person" in entities and "Enterprise" in entities:
        rels.append({
            "from_entity": "Person",
            "to_entity": "Enterprise",
            "relationship_label": "associated_with",
            "join_hint": "Review shared enterprise/company columns or selected ingestion scope.",
        })
    if "Product" in entities and "Transaction" in entities:
        rels.append({
            "from_entity": "Transaction",
            "to_entity": "Product",
            "relationship_label": "includes_product",
            "join_hint": "Review sku/product/reference columns.",
        })
    if "Animal" in entities and "Plot" in entities:
        rels.append({
            "from_entity": "Animal",
            "to_entity": "Plot",
            "relationship_label": "located_on",
            "join_hint": "Review plot/animal tag columns.",
        })
    return rels


def analyse(
    *,
    source_name: str,
    columns: list[str],
    profiles: list[dict],
    sample_rows: list[dict],
    row_count: int,
    adviser_mode: str | None = "idjwi_only",
    adviser_model: str | None = None,
) -> dict[str, Any]:
    """
    Run Idjwi ingestion analysis.

    adviser_mode:
      - idjwi_only: deterministic mapper, no external model.
      - selected_adviser: use the selected provider only when available.
    """
    mode = (adviser_mode or "idjwi_only").strip().lower()
    if mode != "selected_adviser" or not adviser_model:
        return analyse_draft(
            source_name=source_name,
            columns=columns,
            profiles=profiles,
            sample_rows=sample_rows,
            row_count=row_count,
        )

    spec = get_model(adviser_model)
    env_value = os.getenv(spec.env_key, "")
    if not env_value:
        return analyse_draft(
            source_name=source_name,
            columns=columns,
            profiles=profiles,
            sample_rows=sample_rows,
            row_count=row_count,
            note=f"Selected adviser {spec.label} is not configured, so Idjwi used its own ontology mapper.",
        )

    if spec.provider != "anthropic":
        return analyse_draft(
            source_name=source_name,
            columns=columns,
            profiles=profiles,
            sample_rows=sample_rows,
            row_count=row_count,
            note=f"Selected adviser {spec.label} is registered for Idjwi, but ingestion tool-use mapping is not enabled for this provider yet.",
        )

    try:
        from ingestion import analyser as anthropic_analyser

        result = anthropic_analyser.analyse(
            source_name=source_name,
            columns=columns,
            profiles=profiles,
            sample_rows=sample_rows,
            row_count=row_count,
            api_key=env_value,
        )
        result["idjwi_analysis_mode"] = "selected_adviser"
        result["adviser_used"] = spec.id
        result["adviser_label"] = spec.label
        result["analyst_notes"] = (
            (result.get("analyst_notes") or "") +
            f" [Idjwi consulted selected adviser: {spec.label}.]"
        ).strip()
        return result
    except Exception as exc:
        logger.warning("Selected ingestion adviser failed for %s: %s", source_name, exc)
        return analyse_draft(
            source_name=source_name,
            columns=columns,
            profiles=profiles,
            sample_rows=sample_rows,
            row_count=row_count,
            note=f"Selected adviser {spec.label} could not complete the mapping; Idjwi produced a reviewable draft instead.",
        )
