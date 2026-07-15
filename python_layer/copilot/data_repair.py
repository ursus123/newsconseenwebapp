"""
Idjwi data quality and relationship repair planner.

This module is deliberately non-mutating. It inspects tenant-scoped ontology
records, proposes likely repairs, and can submit those proposals to the
approval gate. Actual record changes must happen after an operator approves.
"""

from __future__ import annotations

import re
from itertools import combinations
from typing import Any, Optional


REPAIR_FOCI = {
    "all",
    "relationship",
    "assignment",
    "duplicate",
    "enterprise_stamp",
    "imported_column",
    "missing_entity",
}


def _norm(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip().lower()
    if text in {"nan", "none", "null"}:
        return ""
    return re.sub(r"\s+", " ", text)


def _compact(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", _norm(value))


def _tokens(value: Any) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", _norm(value)) if len(t) > 2}


def _first(row: dict, keys: list[str]) -> str:
    for key in keys:
        val = row.get(key)
        if _norm(val):
            return str(val).strip()
    return ""


def _is_blank(row: dict, keys: list[str]) -> bool:
    existing = [key for key in keys if key in row]
    if not existing:
        return True
    return all(not _norm(row.get(key)) for key in existing)


def _row_id(row: dict) -> str:
    return _first(row, ["id", "uuid", "record_id"])


def _label(row: dict) -> str:
    return _first(
        row,
        [
            "full_name",
            "name",
            "enterprise_name",
            "title",
            "reference_number",
            "counterparty_name",
            "label",
            "email",
            "id",
        ],
    ) or "Unnamed record"


def _clean_records(df, limit: int = 500) -> list[dict]:
    if df is None or getattr(df, "empty", True):
        return []
    try:
        from database import _clean_df

        return _clean_df(df.head(limit)).to_dict(orient="records")
    except Exception:
        return df.head(limit).to_dict(orient="records")


def _load(company_id: str, entity_type: str, limit: int = 500) -> tuple[list[dict], str]:
    from .queries import _ontology_entity_df

    _canonical, df, source = _ontology_entity_df(company_id, entity_type)
    return _clean_records(df, limit=limit), source


def _enterprise_domains(enterprise: dict) -> set[str]:
    domains = set()
    for key in ("email", "website", "domain", "url"):
        value = _norm(enterprise.get(key))
        if not value:
            continue
        if "@" in value:
            domains.add(value.split("@", 1)[1])
        else:
            value = re.sub(r"^https?://", "", value).split("/", 1)[0]
            domains.add(value.replace("www.", ""))
    return {d for d in domains if "." in d}


def _person_email_domain(person: dict) -> str:
    email = _norm(person.get("email"))
    if "@" not in email:
        return ""
    return email.split("@", 1)[1]


def _enterprise_match_score(record: dict, enterprise: dict) -> tuple[float, list[str]]:
    enterprise_name = _first(enterprise, ["name", "enterprise_name", "short_name"])
    enterprise_id = _row_id(enterprise)
    if not enterprise_name and not enterprise_id:
        return 0.0, []

    evidence: list[str] = []
    score = 0.0

    explicit_id = _first(record, ["enterprise_id", "assigned_enterprise_id"])
    if explicit_id and enterprise_id and explicit_id == enterprise_id:
        return 0.99, [f"Existing enterprise_id already points to {enterprise_name or enterprise_id}."]

    explicit_name = _first(record, ["enterprise_name", "assigned_to_enterprise", "branch_name"])
    if explicit_name and _compact(explicit_name) == _compact(enterprise_name):
        score += 0.85
        evidence.append(f"Enterprise name matches '{enterprise_name}'.")

    haystack = " ".join(
        _first(record, [key])
        for key in (
            "counterparty_name",
            "description",
            "title",
            "label",
            "street",
            "street_address",
            "city",
            "country",
        )
    )
    if enterprise_name and _compact(enterprise_name) and _compact(enterprise_name) in _compact(haystack):
        score += 0.72
        evidence.append(f"Record text mentions '{enterprise_name}'.")
    elif enterprise_name:
        overlap = _tokens(haystack) & _tokens(enterprise_name)
        if len(overlap) >= 2:
            score += 0.55
            evidence.append(f"Record text shares enterprise tokens: {', '.join(sorted(overlap))}.")

    domain = _person_email_domain(record)
    if domain and domain in _enterprise_domains(enterprise):
        score += 0.9
        evidence.append(f"Person email domain '{domain}' matches enterprise contact domain.")

    record_city = _norm(_first(record, ["city"]))
    record_country = _norm(_first(record, ["country"]))
    if record_city and record_city == _norm(enterprise.get("city")):
        score += 0.18
        evidence.append(f"City matches {record_city}.")
    if record_country and record_country == _norm(enterprise.get("country")):
        score += 0.12
        evidence.append(f"Country matches {record_country}.")

    return min(score, 0.99), evidence


def _best_enterprise(record: dict, enterprises: list[dict]) -> Optional[tuple[dict, float, list[str]]]:
    best: Optional[tuple[dict, float, list[str]]] = None
    for enterprise in enterprises:
        score, evidence = _enterprise_match_score(record, enterprise)
        if score >= 0.55 and (best is None or score > best[1]):
            best = (enterprise, score, evidence)
    return best


def _proposal(
    repair_type: str,
    confidence: float,
    target_entity: str,
    target: dict,
    suggested_action: dict,
    evidence: list[str],
    reasoning: str,
) -> dict:
    return {
        "repair_type": repair_type,
        "confidence": round(float(confidence), 2),
        "target": {
            "entity_type": target_entity,
            "entity_id": _row_id(target),
            "label": _label(target),
        },
        "suggested_action": suggested_action,
        "evidence": evidence[:5],
        "reasoning": reasoning,
        "approval_required": True,
    }


def _enterprise_stamp_proposals(records: list[dict], entity_type: str, enterprises: list[dict]) -> list[dict]:
    proposals: list[dict] = []
    for row in records:
        if not _row_id(row) or not _is_blank(row, ["enterprise_id", "enterprise_name", "assigned_enterprise_id"]):
            continue
        match = _best_enterprise(row, enterprises)
        if not match:
            continue
        enterprise, score, evidence = match
        enterprise_id = _row_id(enterprise)
        enterprise_name = _first(enterprise, ["name", "enterprise_name", "short_name"])
        patch = {"enterprise_id": enterprise_id, "enterprise_name": enterprise_name}
        proposals.append(
            _proposal(
                "stamp_enterprise_id",
                score,
                entity_type,
                row,
                {"action_type": "stamp_enterprise_id", "entity_type": entity_type, "entity_id": _row_id(row), "patch": patch},
                evidence,
                f"{_label(row)} probably belongs to {enterprise_name} based on matching tenant data.",
            )
        )
    return proposals


def _person_relationship_proposals(people: list[dict], enterprises: list[dict]) -> list[dict]:
    proposals: list[dict] = []
    for person in people:
        if not _row_id(person):
            continue
        match = _best_enterprise(person, enterprises)
        if not match:
            continue
        enterprise, score, evidence = match
        if score < 0.65:
            continue
        enterprise_name = _first(enterprise, ["name", "enterprise_name", "short_name"])
        relationship = {
            "from_entity_type": "person",
            "from_entity_id": _row_id(person),
            "to_entity_type": "enterprise",
            "to_entity_id": _row_id(enterprise),
            "relationship_type": "person_enterprise",
            "status": "active",
        }
        proposals.append(
            _proposal(
                "create_relationship",
                score,
                "person",
                person,
                {"action_type": "create_relationship", "relationship": relationship},
                evidence,
                f"{_label(person)} probably belongs to {enterprise_name}.",
            )
        )
    return proposals


def _duplicate_people(people: list[dict]) -> list[dict]:
    proposals: list[dict] = []
    for left, right in combinations(people[:250], 2):
        left_id, right_id = _row_id(left), _row_id(right)
        if not left_id or not right_id or left_id == right_id:
            continue
        left_email, right_email = _norm(left.get("email")), _norm(right.get("email"))
        left_phone, right_phone = _compact(left.get("phone")), _compact(right.get("phone"))
        left_name = _compact(_first(left, ["full_name", "name"]))
        right_name = _compact(_first(right, ["full_name", "name"]))
        score = 0.0
        evidence = []
        if left_email and left_email == right_email:
            score += 0.95
            evidence.append(f"Both records use email {left_email}.")
        if left_phone and right_phone and left_phone == right_phone:
            score += 0.75
            evidence.append("Phone numbers match.")
        if left_name and left_name == right_name:
            score += 0.55
            evidence.append("Names match after normalization.")
        if score >= 0.75:
            proposals.append(
                _proposal(
                    "merge_duplicate",
                    min(score, 0.99),
                    "person",
                    left,
                    {"action_type": "merge_duplicate", "entity_type": "person", "primary_id": left_id, "duplicate_id": right_id},
                    evidence,
                    f"{_label(left)} and {_label(right)} look like the same person.",
                )
            )
    return proposals


def _duplicate_products(products: list[dict]) -> list[dict]:
    proposals: list[dict] = []
    for left, right in combinations(products[:250], 2):
        left_id, right_id = _row_id(left), _row_id(right)
        if not left_id or not right_id or left_id == right_id:
            continue
        left_sku, right_sku = _compact(left.get("sku")), _compact(right.get("sku"))
        left_name = _compact(_first(left, ["name", "product_name", "item_name"]))
        right_name = _compact(_first(right, ["name", "product_name", "item_name"]))
        score = 0.0
        evidence = []
        if left_sku and left_sku == right_sku:
            score += 0.9
            evidence.append(f"Both products use SKU {left.get('sku')}.")
        if left_name and left_name == right_name:
            score += 0.65
            evidence.append("Product names match after normalization.")
        if score >= 0.75:
            proposals.append(
                _proposal(
                    "merge_duplicate",
                    min(score, 0.99),
                    "product",
                    left,
                    {"action_type": "merge_duplicate", "entity_type": "product", "primary_id": left_id, "duplicate_id": right_id},
                    evidence,
                    f"{_label(left)} and {_label(right)} look like duplicate products.",
                )
            )
    return proposals


def _task_assignment_proposals(tasks: list[dict], people: list[dict]) -> list[dict]:
    proposals: list[dict] = []
    staff = [p for p in people if _norm(p.get("person_type")) in {"staff", "employee", "worker", "admin", "manager"} or _norm(p.get("status")) == "active"]
    if not staff:
        staff = people
    for task in tasks:
        if not _row_id(task) or not _is_blank(task, ["assigned_to", "assignee_name", "assigned_user_id"]):
            continue
        best = None
        for person in staff:
            score = 0.0
            evidence = []
            person_name = _first(person, ["full_name", "name"])
            if not person_name:
                continue
            if _norm(task.get("enterprise_id")) and _norm(task.get("enterprise_id")) == _norm(person.get("enterprise_id")):
                score += 0.55
                evidence.append("Person belongs to the same enterprise_id as the task.")
            elif _norm(task.get("enterprise_name")) and _norm(task.get("enterprise_name")) == _norm(person.get("enterprise_name")):
                score += 0.5
                evidence.append("Person belongs to the same enterprise name as the task.")
            overlap = _tokens(task.get("title")) & _tokens(person_name)
            if overlap:
                score += 0.25
                evidence.append(f"Task title mentions assignee token(s): {', '.join(sorted(overlap))}.")
            if score >= 0.5 and (best is None or score > best[1]):
                best = (person, score, evidence)
        if best:
            person, score, evidence = best
            proposals.append(
                _proposal(
                    "assign_task",
                    score,
                    "task",
                    task,
                    {
                        "action_type": "assign_task",
                        "entity_type": "task",
                        "entity_id": _row_id(task),
                        "patch": {"assigned_user_id": _row_id(person), "assigned_to": _first(person, ["full_name", "name"])},
                    },
                    evidence,
                    f"{_label(task)} has no assignee; {_label(person)} is the most likely assignee.",
                )
            )
    return proposals


def _missing_entity_proposals(transactions: list[dict], enterprises: list[dict]) -> list[dict]:
    enterprise_names = {_compact(_first(e, ["name", "enterprise_name", "short_name"])) for e in enterprises}
    proposals: list[dict] = []
    for txn in transactions:
        name = _first(txn, ["counterparty_name"])
        if not _row_id(txn) or not name or _compact(name) in enterprise_names:
            continue
        if not _is_blank(txn, ["enterprise_id", "enterprise_name"]):
            continue
        proposals.append(
            _proposal(
                "create_missing_entity",
                0.62,
                "transaction",
                txn,
                {
                    "action_type": "create_missing_entity",
                    "entity_type": "enterprise",
                    "fields": {"name": name, "status": "candidate", "source_transaction_id": _row_id(txn)},
                },
                [f"Transaction counterparty '{name}' is not linked to an existing enterprise."],
                f"Create a candidate enterprise for counterparty '{name}' before linking transaction {_label(txn)}.",
            )
        )
    return proposals


def _import_column_mapping_notes() -> list[dict]:
    return [
        {
            "repair_type": "map_imported_column",
            "confidence": 0.8,
            "target": {"entity_type": "import", "entity_id": None, "label": "Common import mapping defaults"},
            "suggested_action": {
                "action_type": "map_imported_column",
                "mappings": {
                    "customer_name": "person.full_name",
                    "client_name": "person.full_name",
                    "business_name": "enterprise.name",
                    "branch": "enterprise.name",
                    "item": "product.name",
                    "sku": "product.sku",
                    "invoice_no": "transaction.reference_number",
                    "total": "transaction.amount",
                    "due": "task.due_date",
                    "owner": "task.assigned_to",
                },
            },
            "evidence": ["No active import batch was supplied, so this is a reusable mapping recommendation."],
            "reasoning": "These common spreadsheet headers can be mapped into the ontology before loading rows.",
            "approval_required": True,
        }
    ]


def _submit_for_approval(company_id: str, proposal: dict) -> dict:
    from .action_tools import _submit_proposal

    target = proposal.get("target") or {}
    label = f"Repair {proposal.get('repair_type')}: {target.get('label') or target.get('entity_id') or 'record'}"
    result = _submit_proposal(
        company_id=company_id,
        action_type="bulk_update",
        action_label=label[:180],
        payload={
            "source": "idjwi_data_repair",
            "repair_type": proposal.get("repair_type"),
            "target": target,
            "suggested_action": proposal.get("suggested_action"),
            "evidence": proposal.get("evidence", []),
            "confidence": proposal.get("confidence"),
        },
        reasoning=proposal.get("reasoning") or label,
    )
    proposal["approval_id"] = result.get("approval_id")
    proposal["approval_status"] = result.get("status", "pending")
    proposal["risk_level"] = result.get("risk_level", "approve")
    return result


def plan_data_repairs(
    company_id: str,
    repair_focus: str = "all",
    entity_type: Optional[str] = None,
    submit_for_approval: bool = False,
    limit: int = 20,
) -> dict:
    focus = _norm(repair_focus or "all").replace("-", "_")
    if focus not in REPAIR_FOCI:
        focus = "all"
    max_rows = max(1, min(int(limit or 20), 100))

    enterprises, enterprise_source = _load(company_id, "enterprise")
    people, people_source = _load(company_id, "person")
    products, product_source = _load(company_id, "product")
    tasks, task_source = _load(company_id, "task")
    transactions, transaction_source = _load(company_id, "transaction")
    addresses, address_source = _load(company_id, "address")

    proposals: list[dict] = []
    selected_entity = _norm(entity_type or "all")

    if focus in {"all", "relationship"} and selected_entity in {"", "all", "person", "people"}:
        proposals.extend(_person_relationship_proposals(people, enterprises))

    if focus in {"all", "enterprise_stamp"}:
        if selected_entity in {"", "all", "transaction", "transactions"}:
            proposals.extend(_enterprise_stamp_proposals(transactions, "transaction", enterprises))
        if selected_entity in {"", "all", "address", "addresses"}:
            proposals.extend(_enterprise_stamp_proposals(addresses, "address", enterprises))
        if selected_entity in {"", "all", "task", "tasks"}:
            proposals.extend(_enterprise_stamp_proposals(tasks, "task", enterprises))
        if selected_entity in {"", "all", "product", "products"}:
            proposals.extend(_enterprise_stamp_proposals(products, "product", enterprises))

    if focus in {"all", "assignment"} and selected_entity in {"", "all", "task", "tasks"}:
        proposals.extend(_task_assignment_proposals(tasks, people))

    if focus in {"all", "duplicate"}:
        if selected_entity in {"", "all", "person", "people"}:
            proposals.extend(_duplicate_people(people))
        if selected_entity in {"", "all", "product", "products"}:
            proposals.extend(_duplicate_products(products))

    if focus in {"all", "missing_entity"} and selected_entity in {"", "all", "transaction", "transactions"}:
        proposals.extend(_missing_entity_proposals(transactions, enterprises))

    if focus in {"imported_column"}:
        proposals.extend(_import_column_mapping_notes())

    proposals = sorted(proposals, key=lambda p: p.get("confidence", 0), reverse=True)[:max_rows]

    approval_requests = []
    if submit_for_approval:
        for proposal in proposals:
            approval_requests.append(_submit_for_approval(company_id, proposal))

    by_type: dict[str, int] = {}
    for proposal in proposals:
        repair_type = proposal.get("repair_type", "unknown")
        by_type[repair_type] = by_type.get(repair_type, 0) + 1

    return {
        "repair_count": len(proposals),
        "proposals": proposals,
        "by_type": by_type,
        "submitted_for_approval": bool(submit_for_approval),
        "approval_requests": approval_requests,
        "filters": {"repair_focus": focus, "entity_type": selected_entity or "all", "limit": max_rows},
        "data_sources": {
            "enterprises": enterprise_source,
            "people": people_source,
            "products": product_source,
            "tasks": task_source,
            "transactions": transaction_source,
            "addresses": address_source,
        },
        "safe_actions": [
            "create_relationship",
            "assign_task",
            "merge_duplicate",
            "stamp_enterprise_id",
            "map_imported_column",
            "create_missing_entity",
        ],
        "note": "Idjwi only planned repairs. No company record was changed unless an operator later approves the submitted repair proposal.",
    }
