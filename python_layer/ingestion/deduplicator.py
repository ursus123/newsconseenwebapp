"""
ingestion/deduplicator.py
Row-level deduplication before loading into Base44.

Strategy per entity type:
  Person      — match on (full_name + phone) or (full_name + email)
  Enterprise  — match on (name + city) or (registration_number)
  Product     — match on (name + company_id) or (sku / barcode)
  Address     — match on (street + city + country)
  Animal      — match on (tag_number + company_id) or (name + species + company_id)
  Plot        — match on (name + company_id)
  Observation — no dedup (time-series readings are always new)
  Others      — match on all non-null key fields combined

Returns each row annotated with:
  _dedup_action: "create" | "update" | "skip"
  _dedup_match_id: existing record id if action != "create"
  _dedup_score: 0.0–1.0 similarity score

Default behaviour for matches is "skip" — re-importing the same file twice will
not overwrite existing data. Pass duplicate_action="update" to override.
"""
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)


def _norm(v: Any) -> str:
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v).strip().lower())


def _match_score(a: str, b: str) -> float:
    """Simple character-overlap similarity — good enough for dedup gating."""
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    set_a, set_b = set(a.split()), set(b.split())
    if not set_a or not set_b:
        return 0.0
    overlap = len(set_a & set_b)
    return overlap / max(len(set_a), len(set_b))


# Key extractors per entity type → list of (field_name, weight) tuples
_KEY_FIELDS: dict[str, list[tuple[str, float]]] = {
    "Person":       [("full_name", 0.5), ("email", 0.3), ("phone", 0.2)],
    "Enterprise":   [("name", 0.5), ("email", 0.2), ("registration_number", 0.3)],
    "Product":      [("name", 0.4), ("sku", 0.4), ("barcode", 0.2)],
    "Address":      [("street", 0.4), ("city", 0.3), ("country", 0.3)],
    "Animal":       [("name", 0.4), ("tag_number", 0.4), ("species", 0.2)],
    "Plot":         [("name", 0.6), ("plot_type", 0.2), ("land_use", 0.2)],
    "Task":         [("title", 0.5), ("task_type", 0.3), ("due_date", 0.2)],
    "Transaction":  [("reference_number", 0.6), ("amount", 0.2), ("date", 0.2)],
    "Document":     [("title", 0.5), ("document_type", 0.3), ("file_url", 0.2)],
    "Schedule":     [("name", 0.6), ("frequency", 0.4)],
    "Signal":       [("signal_type", 0.4), ("source", 0.3), ("recorded_at", 0.3)],
    "Channel":      [("name", 0.5), ("channel_type", 0.5)],
    "Territory":    [("name", 0.6), ("territory_type", 0.4)],
    "Relationship": [("from_entity_id", 0.4), ("to_entity_id", 0.4), ("relationship_type", 0.2)],
    "Observation":  [],   # never dedup observations
}

# Score thresholds — same for all entity types
_HIGH_MATCH  = 0.85   # near-certain duplicate
_LOW_MATCH   = 0.70   # probable duplicate


def _alias(entity_type: str, row: dict) -> dict:
    """
    Add computed alias fields to a row before key comparison so that dedup
    works even when field names differ from the canonical _KEY_FIELDS names.
    """
    r = dict(row)
    if entity_type == "Person":
        if not r.get("full_name"):
            fn = str(r.get("first_name") or "").strip()
            ln = str(r.get("last_name")  or "").strip()
            joined = " ".join(p for p in [fn, ln] if p)
            if joined:
                r["full_name"] = joined
    if entity_type == "Enterprise":
        if not r.get("name"):
            r["name"] = r.get("enterprise_name") or r.get("company_name") or r.get("org_name") or ""
    if entity_type == "Transaction":
        if not r.get("reference_number"):
            r["reference_number"] = r.get("reference") or r.get("ref") or r.get("invoice_number") or ""
        if not r.get("date"):
            r["date"] = r.get("transaction_date") or r.get("tx_date") or r.get("invoice_date") or ""
    if entity_type == "Product":
        if not r.get("name"):
            r["name"] = r.get("item_name") or r.get("product_name") or r.get("product") or ""
    return r


def _row_key(row: dict, entity_type: str, fields: list[tuple[str, float]]) -> str:
    r = _alias(entity_type, row)
    parts = []
    for field, _ in fields:
        v = _norm(r.get(field, ""))
        if v:
            parts.append(v)
    return " ".join(parts)


def _score_pair(
    incoming: dict, existing: dict, entity_type: str, fields: list[tuple[str, float]]
) -> float:
    inc = _alias(entity_type, incoming)
    ext = _alias(entity_type, existing)
    total_weight = sum(w for _, w in fields)
    if total_weight == 0:
        return 0.0
    score = 0.0
    for field, weight in fields:
        a = _norm(inc.get(field, ""))
        b = _norm(ext.get(field, ""))
        score += weight * _match_score(a, b)
    return score / total_weight


def deduplicate(
    entity_type: str,
    incoming_rows: list[dict],
    existing_records: list[dict],
    duplicate_action: str = "skip",
) -> list[dict]:
    """
    Annotate each incoming row with _dedup_action, _dedup_match_id, _dedup_score.

    Args:
        entity_type:       One of the 15 canonical entity names.
        incoming_rows:     Rows to be loaded (already transformed).
        existing_records:  Records already in Base44 for this entity + company.
        duplicate_action:  What to do when a match is found above threshold.
                           "skip"   — leave the existing record untouched (default).
                           "update" — merge incoming fields onto the existing record.

    Returns:
        incoming_rows with _dedup_* keys added in-place (copies returned).
    """
    if duplicate_action not in ("skip", "update"):
        duplicate_action = "skip"

    fields = _KEY_FIELDS.get(entity_type, [])

    if not fields:
        # Observations and unknown entity types: always create
        for row in incoming_rows:
            row["_dedup_action"]   = "create"
            row["_dedup_match_id"] = None
            row["_dedup_score"]    = 0.0
        return incoming_rows

    annotated = []
    for row in incoming_rows:
        best_score = 0.0
        best_id    = None

        for existing in existing_records:
            score = _score_pair(row, existing, entity_type, fields)
            if score > best_score:
                best_score = score
                best_id    = existing.get("id")

        if best_score >= _LOW_MATCH:
            action = duplicate_action   # "skip" or "update" — operator's choice
        else:
            action  = "create"
            best_id = None

        annotated.append({
            **row,
            "_dedup_action":   action,
            "_dedup_match_id": best_id,
            "_dedup_score":    round(best_score, 3),
        })

    created  = sum(1 for r in annotated if r["_dedup_action"] == "create")
    skipped  = sum(1 for r in annotated if r["_dedup_action"] == "skip")
    updated  = sum(1 for r in annotated if r["_dedup_action"] == "update")
    logger.info(
        "Dedup [%s]: %d incoming → %d create, %d skip, %d update",
        entity_type, len(incoming_rows), created, skipped, updated,
    )
    return annotated
