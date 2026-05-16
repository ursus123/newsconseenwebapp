"""
ingestion/loader.py
Executes an approved ingestion plan: writes rows to Supabase and
records run statistics in analytics.ingestion_runs.

Relationship materialisation uses three strategies in priority order:

  1. Same-row pairing  — when from_entity != to_entity and both appear in the
     same denormalized row (e.g. employee + company in one spreadsheet row),
     link row[i].Person to row[i].Enterprise.

  2. FK value lookup   — parse join_hint to find candidate column names; build
     a value→entity_id lookup from the to_entity's primary-key fields and any
     fields named in the hint; match from_entity rows by those values.
     Works for cross-row foreign keys (Transaction.enterprise_name → Enterprise)
     and for entities not loaded in the current run (fetched from Supabase).

  3. Same-entity self-referential — from_entity == to_entity (e.g. Person.manager_email
     → Person.email); same FK lookup but on the same entity pool; avoids self-loops.
"""
import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text

from data_sources import supabase_source
from ingestion.deduplicator import deduplicate

logger = logging.getLogger(__name__)

_CHUNK   = 10      # rows per chunk before rate-limit sleep
_DELAY   = 0.15    # seconds between chunks

_RUN_TABLE  = "analytics.ingestion_runs"
_PLAN_TABLE = "analytics.ingestion_plans"


# ── Entity type → Supabase table name ────────────────────────────────────────
_SUPABASE_TABLE: dict[str, str] = {
    "Person":       "persons",
    "Enterprise":   "enterprises",
    "Product":      "products",
    "Task":         "tasks",
    "Transaction":  "transactions",
    "Relationship": "relationships",
    "Address":      "addresses",
    "Document":     "documents",
    "Schedule":     "schedules",
    "Signal":       "signals",
    "Channel":      "channels",
    "Territory":    "territories",
    "Animal":       "animals",
    "Plot":         "plots",
    "Observation":  "observations",
}


# ── Transform hints ───────────────────────────────────────────────────────────

def _apply_transform(value: Any, hint: str | None) -> Any:
    """Apply a transform_hint from the LLM field_map to a raw cell value."""
    if not hint or value is None:
        return value
    h = hint.lower()
    s = str(value).strip()

    if "split" in h and ("first" in h or "given" in h):
        parts = s.split()
        return parts[0] if parts else s
    if "split" in h and ("last" in h or "remain" in h or "surname" in h or "family" in h):
        parts = s.split()
        return " ".join(parts[1:]) if len(parts) > 1 else ""

    if "date" in h or "parse date" in h:
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"):
            try:
                from datetime import datetime as _dt
                return _dt.strptime(s, fmt).date().isoformat()
            except ValueError:
                continue

    if "int" in h or "integer" in h:
        try:
            return int(float(s.replace(",", "")))
        except (ValueError, TypeError):
            return value
    if "float" in h or "decimal" in h or "numeric" in h:
        try:
            return float(s.replace(",", ""))
        except (ValueError, TypeError):
            return value

    if "upper" in h:
        return s.upper()
    if "lower" in h:
        return s.lower()
    if "title" in h or "titlecase" in h:
        return s.title()
    if "strip" in h:
        return s.strip()
    if "comma" in h and "first" in h:
        return s.split(",")[0].strip()

    return value


# ── Supabase REST helpers ─────────────────────────────────────────────────────

def _fetch_existing(entity_type: str, company_id: str) -> list[dict]:
    try:
        return supabase_source.list_records(entity_type, company_id=company_id, limit=2000)
    except Exception as e:
        logger.warning("Could not fetch existing %s records: %s", entity_type, e)
        return []


def _create(entity_type: str, payload: dict) -> dict:
    result = supabase_source.create_record(entity_type, payload, company_id=payload.get("company_id"))
    if result.get("error"):
        raise RuntimeError(result["error"])
    return result


def _update(entity_type: str, record_id: str, payload: dict) -> dict:
    result = supabase_source.update_record(entity_type, record_id, payload)
    if result.get("error"):
        raise RuntimeError(result["error"])
    return result


# ── DB helpers ────────────────────────────────────────────────────────────────

def _write_run_status(engine, run_id: str, **kwargs) -> None:
    if engine is None:
        return
    try:
        set_clause = ", ".join(f"{k} = :{k}" for k in kwargs)
        with engine.begin() as conn:
            conn.execute(
                text(f"UPDATE {_RUN_TABLE} SET {set_clause} WHERE id = :_run_id"),
                {**kwargs, "_run_id": run_id},
            )
    except Exception as e:
        logger.warning("Could not update run status: %s", e)


def _mark_plan_loaded(engine, plan_id: str, had_failures: bool) -> None:
    if engine is None or not plan_id:
        return
    try:
        now    = datetime.now(timezone.utc)
        status = "loaded_with_errors" if had_failures else "loaded"
        with engine.begin() as conn:
            conn.execute(
                text(f"UPDATE {_PLAN_TABLE} SET status = :status, loaded_at = :loaded_at WHERE id = :id"),
                {"status": status, "loaded_at": now, "id": plan_id},
            )
    except Exception as e:
        logger.warning("Could not mark plan as loaded: %s", e)


# ── Relationship helpers ──────────────────────────────────────────────────────

def _hint_words(join_hint: str) -> set[str]:
    """Extract candidate field/column names from a join_hint free-text string."""
    return set(re.findall(r"\b[a-z][a-z0-9_]{1,35}\b", join_hint.lower()))


def _build_value_lookup(
    entity_type: str,
    row_ids: dict[int, str],
    entity_rows: list[dict],
    field_map: list[dict],
    hint_words_set: set[str],
) -> dict[str, str]:
    """
    Build normalised_value → entity_id lookup for to_entity so FK matching
    can resolve cross-row or self-referential relationships.

    Indexes by:
      - all is_primary_key fields for this entity type
      - all fields whose name appears in join_hint
    """
    pk_fields = {
        fm["target_field"]
        for fm in field_map
        if fm.get("target_entity") == entity_type and fm.get("is_primary_key")
    }
    lookup: dict[str, str] = {}
    for row_idx, entity_id in row_ids.items():
        if row_idx >= len(entity_rows):
            continue
        row = entity_rows[row_idx]
        for fld, val in row.items():
            if not val:
                continue
            if fld in pk_fields or fld in hint_words_set or any(hw in fld for hw in hint_words_set):
                key = str(val).strip().lower()
                if len(key) > 1:
                    lookup[key] = entity_id
    return lookup


def _try_create_rel(
    stats: dict,
    company_id: str,
    from_etype: str,
    from_id: str,
    to_etype: str,
    to_id: str,
    rel_label: str,
    seen: set,
) -> None:
    pair = (from_etype, from_id, to_etype, to_id, rel_label)
    if pair in seen:
        return
    seen.add(pair)
    payload = {
        "company_id":        company_id,
        "from_entity_type":  from_etype,
        "from_entity_id":    from_id,
        "to_entity_type":    to_etype,
        "to_entity_id":      to_id,
        "relationship_type": rel_label,
        "status":            "active",
    }
    try:
        _create("Relationship", payload)
        stats["relationships_created"] += 1
    except Exception as e:
        logger.warning("Relationship create failed [%s→%s]: %s", from_etype, to_etype, e)


def _materialise_relationships(
    relationships: list[dict],
    field_map: list[dict],
    row_entity_ids: dict[str, dict[int, str]],
    entity_rows_cache: dict[str, list[dict]],
    company_id: str,
    stats: dict,
) -> None:
    """
    Create Relationship records in Supabase.

    Priority order per relationship:
      1. Same-row pairing (from_etype != to_etype, denormalized file)
      2. FK value lookup via join_hint columns
      3. FK fallback: fetch to_entity from Supabase if not loaded in this run
    """
    seen: set = set()  # deduplicate (from_etype, from_id, to_etype, to_id, label)

    for rel in relationships:
        from_etype = rel.get("from_entity")
        to_etype   = rel.get("to_entity")
        rel_label  = rel.get("relationship_label", "related_to")
        join_hint  = rel.get("join_hint", "")

        if not from_etype or not to_etype:
            continue

        from_ids = row_entity_ids.get(from_etype, {})
        to_ids   = row_entity_ids.get(to_etype, {})

        if not from_ids:
            logger.debug("No from_entity IDs for %s — skip %s", from_etype, rel_label)
            continue

        hw = _hint_words(join_hint)

        # ── Strategy 1: same-row pairing (denormalized, different entity types) ──
        if from_etype != to_etype and to_ids:
            common = sorted(set(from_ids) & set(to_ids))
            if common:
                for row_idx in common:
                    _try_create_rel(
                        stats, company_id,
                        from_etype, from_ids[row_idx],
                        to_etype, to_ids[row_idx],
                        rel_label, seen,
                    )
                # Row-index pairing was sufficient for this relationship
                continue

        # ── Strategy 2 & 3: FK value lookup ──────────────────────────────────
        # Build to_entity value lookup from rows loaded in this run
        to_entity_rows = entity_rows_cache.get(to_etype, [])
        to_lookup = _build_value_lookup(to_etype, to_ids, to_entity_rows, field_map, hw)

        # If to_entity wasn't loaded this run (or lookup is empty), fetch from Supabase
        if not to_lookup:
            logger.debug("to_entity %s has no in-run IDs; fetching from Supabase for FK lookup", to_etype)
            pk_fields = {
                fm["target_field"]
                for fm in field_map
                if fm.get("target_entity") == to_etype and fm.get("is_primary_key")
            }
            for existing in _fetch_existing(to_etype, company_id):
                eid = existing.get("id")
                if not eid:
                    continue
                for fld, val in existing.items():
                    if not val:
                        continue
                    if fld in pk_fields or fld in hw or any(hw_w in fld for hw_w in hw):
                        key = str(val).strip().lower()
                        if len(key) > 1:
                            to_lookup[key] = eid

        from_entity_rows = entity_rows_cache.get(from_etype, [])

        for row_idx, from_id in sorted(from_ids.items()):
            if row_idx >= len(from_entity_rows):
                continue
            from_row = from_entity_rows[row_idx]
            matched_to_id: str | None = None

            # Hint-guided field check first (most precise)
            for fld, val in from_row.items():
                if not val:
                    continue
                if fld in hw or any(hw_w in fld for hw_w in hw):
                    key = str(val).strip().lower()
                    if key in to_lookup:
                        matched_to_id = to_lookup[key]
                        break

            # Fallback: any field value present in lookup (len > 2 avoids false positives)
            if not matched_to_id:
                for fld, val in from_row.items():
                    if not val:
                        continue
                    key = str(val).strip().lower()
                    if len(key) > 2 and key in to_lookup:
                        matched_to_id = to_lookup[key]
                        break

            # Avoid self-loops (important for same-entity self-referential)
            if matched_to_id and matched_to_id != from_id:
                _try_create_rel(
                    stats, company_id,
                    from_etype, from_id,
                    to_etype, matched_to_id,
                    rel_label, seen,
                )


# ── Main executor ─────────────────────────────────────────────────────────────

def execute(
    plan: dict[str, Any],
    rows: list[dict],
    company_id: str,
    supabase_url: str | None = None,
    service_role_key: str | None = None,
    engine=None,
    plan_id: str | None = None,
    duplicate_action: str = "skip",
    # Legacy aliases kept for callers that haven't migrated yet
    base44_api_url: str | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    """
    Execute an approved ingestion plan.

    Returns run statistics dict including relationships_created.
    """
    run_id     = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)

    if engine:
        try:
            with engine.begin() as conn:
                conn.execute(
                    text(f"""
                        INSERT INTO {_RUN_TABLE}
                            (id, company_id, plan_id, status, rows_total, started_at)
                        VALUES (:id, :company_id, :plan_id, 'running', :rows_total, :started_at)
                    """),
                    {
                        "id":         run_id,
                        "company_id": company_id,
                        "plan_id":    plan_id,
                        "rows_total": len(rows),
                        "started_at": started_at,
                    },
                )
        except Exception as e:
            logger.warning("Could not create run record: %s", e)

    stats: dict[str, Any] = {
        "run_id":                run_id,
        "rows_total":            len(rows),
        "entities_created":      0,
        "entities_updated":      0,
        "entities_skipped":      0,
        "entities_failed":       0,
        "relationships_created": 0,
        "errors":                [],
    }

    field_map     = plan.get("field_map", [])
    entity_splits = plan.get("entity_splits", [])
    relationships = plan.get("relationships", [])

    # Group field_map by target_entity
    entity_fields: dict[str, list[dict]] = {}
    for fm in field_map:
        et = fm.get("target_entity")
        if et:
            entity_fields.setdefault(et, []).append(fm)

    # row_entity_ids[entity_type][row_index] = Supabase entity id
    row_entity_ids: dict[str, dict[int, str]] = {}
    # entity_rows_cache[entity_type] = transformed rows (same index as source rows)
    entity_rows_cache: dict[str, list[dict]] = {}

    # ── Phase 1: load entities ────────────────────────────────────────────
    for split in entity_splits:
        entity_type = split.get("entity_type")
        if not entity_type or entity_type not in entity_fields:
            logger.debug("No field_map entries for %s — skipping", entity_type)
            continue

        ef = entity_fields[entity_type]

        # Build one transformed record per source row
        entity_rows: list[dict] = []
        for raw_row in rows:
            record: dict = {"company_id": company_id}
            for fm in ef:
                src_col = fm.get("source_column")
                tgt_fld = fm.get("target_field")
                if not src_col or not tgt_fld:
                    continue
                raw_val = raw_row.get(src_col)
                if raw_val is not None:
                    record[tgt_fld] = _apply_transform(raw_val, fm.get("transform_hint"))
            entity_rows.append(record)

        entity_rows_cache[entity_type] = entity_rows

        existing  = _fetch_existing(entity_type, company_id)
        annotated = deduplicate(entity_type, entity_rows, existing, duplicate_action=duplicate_action)

        row_entity_ids[entity_type] = {}

        for row_idx, record in enumerate(annotated):
            action   = record.pop("_dedup_action",   "create")
            match_id = record.pop("_dedup_match_id", None)
            record.pop("_dedup_score", None)

            entity_id: str | None = None
            try:
                if action == "create":
                    created   = _create(entity_type, record)
                    entity_id = created.get("id")
                    stats["entities_created"] += 1
                elif action == "update" and match_id:
                    _update(entity_type, match_id, record)
                    entity_id = match_id
                    stats["entities_updated"] += 1
                else:
                    entity_id = match_id  # skipped — track for relationship wiring
                    stats["entities_skipped"] += 1
            except Exception as e:
                stats["entities_failed"] += 1
                stats["errors"].append({"entity": entity_type, "row": row_idx, "error": str(e)})
                logger.warning("Load error [%s row %d]: %s", entity_type, row_idx, e)

            if entity_id:
                row_entity_ids[entity_type][row_idx] = entity_id

            if row_idx > 0 and row_idx % _CHUNK == 0:
                time.sleep(_DELAY)

    # ── Phase 2: materialise relationships ────────────────────────────────
    if relationships:
        _materialise_relationships(
            relationships, field_map,
            row_entity_ids, entity_rows_cache,
            company_id, stats,
        )


    finished_at = datetime.now(timezone.utc)
    errors_json = json.dumps(stats["errors"][:50], default=str)

    _write_run_status(
        engine,
        run_id,
        status                = "complete" if not stats["errors"] else "partial",
        entities_created      = stats["entities_created"],
        entities_updated      = stats["entities_updated"],
        entities_skipped      = stats["entities_skipped"],
        entities_failed       = stats["entities_failed"],
        relationships_created = stats["relationships_created"],
        errors_json           = errors_json,
        finished_at           = finished_at,
    )
    if plan_id:
        _mark_plan_loaded(engine, plan_id, had_failures=stats["entities_failed"] > 0)

    logger.info(
        "Ingestion run %s complete: +%d created, ~%d updated, %d failed, %d relationships",
        run_id,
        stats["entities_created"],
        stats["entities_updated"],
        stats["entities_failed"],
        stats["relationships_created"],
    )
    return stats
