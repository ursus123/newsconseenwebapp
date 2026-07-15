"""
Idjwi onboarding intelligence.

This module unifies Add Data, Connectors, and Ingestion as one onboarding
system. It is intentionally deterministic and Idjwi-first: no paid adviser is
needed to explain what to add first, where data belongs, which ontology objects
are involved, what relationships are likely, and what analysis becomes possible.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

try:
    from ingestion.schema_registry import ENTITY_FIELDS
except Exception:  # pragma: no cover - allows import in partial environments
    ENTITY_FIELDS = {}


CONNECTOR_ENTITY_MAP = {
    "excel": ["Person", "Enterprise", "Product", "Transaction", "Task"],
    "csv": ["Person", "Enterprise", "Product", "Transaction", "Task"],
    "json_xml": ["Person", "Enterprise", "Product", "Transaction", "Task", "Document"],
    "google_sheets": ["Person", "Enterprise", "Product", "Transaction", "Task"],
    "bank_statement": ["Transaction", "Enterprise", "Person"],
    "mpesa": ["Transaction", "Person", "Enterprise"],
    "mtn_momo": ["Transaction", "Person", "Enterprise"],
    "airtel_money": ["Transaction", "Person", "Enterprise"],
    "wave": ["Transaction", "Person", "Enterprise"],
    "stripe": ["Transaction", "Person", "Product"],
    "quickbooks": ["Transaction", "Enterprise", "Person", "Product"],
    "xero": ["Transaction", "Enterprise", "Person", "Product"],
    "sage": ["Transaction", "Enterprise", "Person", "Product"],
    "wave_accounting": ["Transaction", "Enterprise", "Person", "Product"],
    "openmrs": ["Person", "Task", "Service", "Document"],
    "therap": ["Person", "Task", "Transaction", "Service"],
    "epic_fhir": ["Person", "Task", "Document", "Observation"],
    "dhis2": ["Enterprise", "Observation", "Territory"],
    "adp": ["Person", "Enterprise", "Transaction"],
    "paychex": ["Person", "Enterprise", "Transaction"],
    "bamboohr": ["Person", "Enterprise"],
    "gusto": ["Person", "Enterprise", "Transaction"],
    "shopify": ["Product", "Person", "Transaction"],
    "square": ["Product", "Person", "Transaction"],
    "toast": ["Product", "Person", "Transaction", "Enterprise"],
    "powerschool": ["Person", "Enterprise", "Task"],
    "canvas": ["Person", "Task", "Document"],
    "google_classroom": ["Person", "Task", "Document"],
}

INDUSTRY_FIRST_DATA = {
    "clinic": [
        "Enterprises: clinic, branches, departments, service locations.",
        "People: patients/clients, staff, providers, contacts.",
        "Services/products: appointments, procedures, medicines, supplies.",
        "Transactions: invoices, payments, claims, balances.",
        "Tasks/schedules: visits, follow-ups, staff work, due dates.",
    ],
    "healthcare": [
        "Enterprises and facilities first, then people, services, transactions, tasks, and documents.",
        "Add license/provider identifiers when available because they unlock safer public enrichment.",
    ],
    "farm": [
        "Enterprise/farm and plots first, then animals/crops/products, observations, transactions, and tasks.",
        "Precise addresses or coordinates matter early because weather, soil, and market sources depend on location.",
    ],
    "retail": [
        "Enterprise/store first, then products, customers, suppliers, transactions, and tasks.",
        "SKU/barcode, stock quantity, price, supplier, and sales history unlock inventory and margin intelligence.",
    ],
}


def _clean(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (value or "").strip().lower()).strip("_")


def _entities_from_analysis(analysis: dict[str, Any] | None) -> list[str]:
    if not analysis:
        return []
    entities = []
    for split in analysis.get("entity_splits") or []:
        if split.get("entity_type"):
            entities.append(str(split["entity_type"]))
    for fm in analysis.get("field_map") or []:
        if fm.get("target_entity"):
            entities.append(str(fm["target_entity"]))
    return [entity for entity, _count in Counter(entities).most_common()]


def _mapped_fields(analysis: dict[str, Any] | None) -> dict[str, set[str]]:
    fields: dict[str, set[str]] = {}
    for fm in (analysis or {}).get("field_map") or []:
        entity = fm.get("target_entity")
        field = fm.get("target_field")
        if entity and field:
            fields.setdefault(str(entity), set()).add(str(field))
    return fields


def _missing_fields_for(entity: str, mapped: set[str]) -> list[str]:
    required_by_entity = {
        "Person": ["full_name", "person_type", "enterprise_id", "email", "phone", "status"],
        "Enterprise": ["name", "enterprise_type", "industry", "city", "country", "status"],
        "Product": ["name", "item_type", "sku", "price", "stock_quantity", "supplier_id"],
        "Transaction": ["transaction_type", "amount", "date", "enterprise_id", "person_id", "status"],
        "Task": ["title", "assigned_to", "assigned_enterprise_id", "due_date", "status"],
        "Address": ["street", "city", "country", "entity_type", "entity_id"],
        "Animal": ["name", "tag_number", "animal_type", "enterprise_id", "status"],
        "Plot": ["name", "enterprise_id", "crop_type", "area_ha", "latitude", "longitude"],
        "Observation": ["observation_type", "subject_type", "subject_id", "observed_at"],
    }
    expected = required_by_entity.get(entity, list(ENTITY_FIELDS.get(entity, []))[:6])
    return [field for field in expected if field not in mapped][:6]


def _relationship_plan(entities: list[str], analysis: dict[str, Any] | None, scope: dict[str, Any]) -> list[dict[str, str]]:
    relationships = []
    for rel in (analysis or {}).get("relationships") or []:
        relationships.append({
            "from": rel.get("from_entity", ""),
            "to": rel.get("to_entity", ""),
            "relationship": rel.get("relationship_label", "related_to"),
            "basis": rel.get("join_hint", "Inferred from mapped source columns."),
        })
    entity_set = set(entities)
    if scope.get("scope_mode") == "enterprise" and scope.get("enterprise_id"):
        for entity in sorted(entity_set - {"Enterprise"}):
            relationships.append({
                "from": entity,
                "to": "Enterprise",
                "relationship": "belongs_to",
                "basis": f"Selected enterprise scope: {scope.get('enterprise_name') or scope.get('enterprise_id')}.",
            })
    if "Transaction" in entity_set and "Person" in entity_set:
        relationships.append({"from": "Transaction", "to": "Person", "relationship": "paid_by_or_billed_to", "basis": "Customer/person columns plus transaction columns."})
    if "Transaction" in entity_set and "Product" in entity_set:
        relationships.append({"from": "Transaction", "to": "Product", "relationship": "includes_product", "basis": "Product/SKU columns plus transaction columns."})
    if "Address" in entity_set and ("Enterprise" in entity_set or scope.get("scope_mode") == "enterprise"):
        relationships.append({"from": "Address", "to": "Enterprise", "relationship": "location_of", "basis": "Address columns can attach to selected or detected enterprise."})
    deduped = []
    seen = set()
    for item in relationships:
        key = (item.get("from"), item.get("to"), item.get("relationship"))
        if key not in seen and item.get("from") and item.get("to"):
            seen.add(key)
            deduped.append(item)
    return deduped[:10]


def _analysis_unlocked(entities: list[str], missing: dict[str, list[str]]) -> list[str]:
    entity_set = set(entities)
    unlocked = []
    if {"Person", "Transaction"} & entity_set:
        unlocked.append("client/customer activity, churn signals, and revenue contribution")
    if "Transaction" in entity_set:
        unlocked.append("revenue trends, unpaid invoices, AR aging, and cashflow summaries")
    if "Product" in entity_set:
        unlocked.append("inventory health, low-stock alerts, expiry risk, and margin checks")
    if "Task" in entity_set:
        unlocked.append("task bottlenecks, overdue work, staff workload, and completion trends")
    if "Enterprise" in entity_set:
        unlocked.append("branch/enterprise comparison and operating unit scorecards")
    if {"Plot", "Animal", "Observation"} & entity_set:
        unlocked.append("farm production, observation trends, animal/plot health, and weather/soil enrichment planning")
    if "Address" in entity_set:
        unlocked.append("map views, catchment/geospatial reasoning, and location-based enrichment")
    if not unlocked:
        unlocked.append("basic ontology browsing and data quality checks after records are loaded")
    blocked = [entity for entity, fields in missing.items() if fields]
    if blocked:
        unlocked.append("some analytics will stay partial until missing keys are added for " + ", ".join(blocked[:4]))
    return unlocked


def _connector_recommendation(source_name: str, file_type: str, entities: list[str], connector_id: str | None = None) -> dict[str, Any]:
    source = _clean(source_name)
    entity_set = set(entities)
    if connector_id:
        mapped = CONNECTOR_ENTITY_MAP.get(connector_id, [])
        return {
            "recommended_path": "connector",
            "connector_id": connector_id,
            "reason": "This source is already being handled through a connector, so Idjwi should preserve repeatable sync, credentials, mapping memory, and run history.",
            "ontology_entities": mapped or entities,
        }
    if file_type in {".pdf", ".docx", ".doc", ".txt", ".md", ".rtf", ".png", ".jpg", ".jpeg"}:
        return {
            "recommended_path": "upload",
            "connector_id": None,
            "reason": "This is document/image style input. Upload is best for extracting ontology records and review notes before any repeatable connector exists.",
            "ontology_entities": entities or ["Document"],
        }
    if any(token in source for token in ("quickbooks", "xero", "sage", "accounting")) or "Transaction" in entity_set:
        return {
            "recommended_path": "connector_if_recurring",
            "connector_id": "quickbooks/xero/sage/bank_statement",
            "reason": "Financial data changes often. Use upload for a one-time import, but prefer an accounting/payment/bank connector for recurring invoices and payments.",
            "ontology_entities": ["Transaction", "Enterprise", "Person", "Product"],
        }
    if any(token in source for token in ("shopify", "square", "toast", "pos")) or {"Product", "Transaction"} <= entity_set:
        return {
            "recommended_path": "connector_if_recurring",
            "connector_id": "shopify/square/toast",
            "reason": "POS/catalog data is usually recurring. A connector gives fresher inventory, customer, and sales intelligence than manual uploads.",
            "ontology_entities": ["Product", "Person", "Transaction"],
        }
    if any(token in source for token in ("openmrs", "epic", "fhir", "clinic", "patient")):
        return {
            "recommended_path": "connector_if_available",
            "connector_id": "openmrs/epic_fhir/dhis2",
            "reason": "Healthcare data often has system identifiers and visit history. Use upload for setup, then connect EHR/DHIS2 when possible.",
            "ontology_entities": ["Person", "Task", "Document", "Observation"],
        }
    return {
        "recommended_path": "upload",
        "connector_id": None,
        "reason": "Upload is appropriate for first-time onboarding, templates, and one-off spreadsheets. Idjwi will remember successful mappings after load.",
        "ontology_entities": entities,
    }


def build_onboarding_brief(
    *,
    company_id: str | None = None,
    source_name: str = "",
    source_kind: str = "file",
    file_type: str = "",
    row_count: int = 0,
    columns: list[str] | None = None,
    analysis: dict[str, Any] | None = None,
    ingestion_scope: dict[str, Any] | None = None,
    connector_id: str | None = None,
    industry: str | None = None,
    current_page: str | None = None,
) -> dict[str, Any]:
    scope = ingestion_scope or {}
    entities = _entities_from_analysis(analysis)
    if connector_id and not entities:
        entities = CONNECTOR_ENTITY_MAP.get(connector_id, [])
    if not entities:
        entities = ["Enterprise", "Person", "Product", "Transaction", "Task"]

    mapped = _mapped_fields(analysis)
    missing = {entity: _missing_fields_for(entity, mapped.get(entity, set())) for entity in entities}
    relationships = _relationship_plan(entities, analysis, scope)
    connector = _connector_recommendation(source_name, file_type, entities, connector_id)
    next_data = INDUSTRY_FIRST_DATA.get(_clean(industry), INDUSTRY_FIRST_DATA.get("retail" if "Product" in entities else "clinic"))

    scope_mode = scope.get("scope_mode") or "company"
    if scope_mode == "enterprise":
        enterprise_guidance = f"Stamp imported rows to enterprise `{scope.get('enterprise_name') or scope.get('enterprise_id')}` unless a row-level enterprise column overrides it."
    elif scope_mode == "mixed":
        enterprise_guidance = "Expect row-level enterprise matching. Rows without an enterprise/branch column will remain weakly connected until repaired."
    elif scope_mode == "infer":
        enterprise_guidance = "Idjwi will infer enterprise links from names, domains, addresses, references, and prior relationship memory, then require review."
    else:
        enterprise_guidance = "Records enter at company scope. Add enterprise columns or choose a specific enterprise to unlock branch-level analysis."

    incomplete = []
    for entity, fields in missing.items():
        if fields:
            incomplete.append(f"{entity}: missing or unmapped {', '.join(fields[:4])}")
    if not relationships:
        incomplete.append("Relationships: no strong relationship plan yet; Idjwi needs shared keys, enterprise scope, or matching names.")

    brief = {
        "company_id": company_id,
        "page": current_page or "onboarding",
        "source_name": source_name,
        "source_kind": source_kind,
        "file_type": file_type,
        "row_count": row_count,
        "detected_entities": entities,
        "what_to_add_first": next_data,
        "enterprise_guidance": enterprise_guidance,
        "ontology_mapping": [
            {
                "entity": entity,
                "mapped_fields": sorted(mapped.get(entity, set())),
                "missing_fields": missing.get(entity, []),
            }
            for entity in entities
        ],
        "connector_recommendation": connector,
        "relationship_plan": relationships,
        "incomplete_after_upload": incomplete[:10],
        "analysis_unlocked": _analysis_unlocked(entities, missing),
        "safe_next_actions": [
            "Review entity and field mapping before loading.",
            "Choose enterprise scope when the data belongs to one branch/unit.",
            "Use a connector instead of upload when the source changes regularly.",
            "After loading, ask Idjwi for graph gaps and repair proposals before trusting analytics.",
        ],
        "security_note": "Default onboarding guidance is public-safe; loading records, connector syncs, relationship creation, and repair actions require tenant authorization and approval where applicable.",
    }
    return brief


def answer_onboarding_brief(brief: dict[str, Any]) -> str:
    entities = ", ".join(brief.get("detected_entities") or [])
    lines = [
        "**Idjwi onboarding brief**",
        f"Detected ontology path: {entities or 'not enough data yet'}.",
        f"Enterprise scope: {brief.get('enterprise_guidance')}",
    ]
    connector = brief.get("connector_recommendation") or {}
    if connector:
        lines.append(f"Recommended ingestion path: {connector.get('recommended_path')} - {connector.get('reason')}")
    if brief.get("relationship_plan"):
        lines.append("Relationships Idjwi expects:")
        for rel in brief["relationship_plan"][:5]:
            lines.append(f"- {rel.get('from')} -> {rel.get('relationship')} -> {rel.get('to')}: {rel.get('basis')}")
    if brief.get("incomplete_after_upload"):
        lines.append("What will remain incomplete:")
        for item in brief["incomplete_after_upload"][:5]:
            lines.append(f"- {item}")
    if brief.get("analysis_unlocked"):
        lines.append("Analysis unlocked after loading:")
        for item in brief["analysis_unlocked"][:5]:
            lines.append(f"- {item}")
    return "\n".join(lines)
