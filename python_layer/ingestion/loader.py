"""
ingestion/loader.py
Executes an approved ingestion plan: writes rows to Base44 and
records run statistics in analytics.ingestion_runs.
"""
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import text

from ingestion.deduplicator import deduplicate

logger = logging.getLogger(__name__)

_CHUNK   = 10      # rows per chunk before rate-limit sleep
_DELAY   = 0.15    # seconds between chunks
_TIMEOUT = 20.0    # httpx timeout per request

_RUN_TABLE  = "analytics.ingestion_runs"
_PLAN_TABLE = "analytics.ingestion_plans"


# ── Base44 entity → REST endpoint slug ───────────────────────────────────────
_BASE44_SLUG: dict[str, str] = {
    "Person":       "Person",
    "Enterprise":   "Enterprise",
    "Product":      "Product",
    "Task":         "Task",
    "Transaction":  "Transaction",
    "Relationship": "Relationship",
    "Address":      "Address",
    "Document":     "Document",
    "Schedule":     "Schedule",
    "Signal":       "Signal",
    "Channel":      "Channel",
    "Territory":    "Territory",
    "Animal":       "Animal",
    "Plot":         "Plot",
    "Observation":  "Observation",
}


# ── Transform hints ───────────────────────────────────────────────────────────

def _apply_transform(value: Any, hint: str | None) -> Any:
    """Apply a transform_hint from the LLM field_map to a raw cell value."""
    if not hint or value is None:
        return value
    h  = hint.lower()
    s  = str(value).strip()

    # Name splitting
    if "split" in h and ("first" in h or "given" in h):
        parts = s.split()
        return parts[0] if parts else s
    if "split" in h and ("last" in h or "remain" in h or "surname" in h or "family" in h):
        parts = s.split()
        return " ".join(parts[1:]) if len(parts) > 1 else ""

    # Date parsing
    if "date" in h or "parse date" in h:
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"):
            try:
                from datetime import datetime as _dt
                return _dt.strptime(s, fmt).date().isoformat()
            except ValueError:
                continue

    # Numeric coercion
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

    # Case transforms
    if "upper" in h:
        return s.upper()
    if "lower" in h:
        return s.lower()
    if "title" in h or "titlecase" in h:
        return s.title()

    # Strip whitespace / punctuation
    if "strip" in h:
        return s.strip()

    # Split on comma → take first element
    if "comma" in h and "first" in h:
        return s.split(",")[0].strip()

    return value


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _make_client(base44_api_url: str, api_key: str) -> httpx.Client:
    return httpx.Client(
        base_url=base44_api_url,
        headers={"x-api-key": api_key, "Content-Type": "application/json"},
        timeout=_TIMEOUT,
    )


def _fetch_existing(client: httpx.Client, entity_type: str, company_id: str) -> list[dict]:
    """Pull existing records for dedup comparison (up to 2000)."""
    slug = _BASE44_SLUG.get(entity_type, entity_type)
    try:
        r = client.get(f"/entities/{slug}", params={"company_id": company_id, "limit": 2000})
        r.raise_for_status()
        return r.json().get("data", [])
    except Exception as e:
        logger.warning("Could not fetch existing %s records: %s", entity_type, e)
        return []


def _create(client: httpx.Client, entity_type: str, payload: dict) -> dict:
    slug = _BASE44_SLUG.get(entity_type, entity_type)
    r = client.post(f"/entities/{slug}", content=json.dumps(payload, default=str))
    r.raise_for_status()
    return r.json()


def _update(client: httpx.Client, entity_type: str, record_id: str, payload: dict) -> dict:
    slug = _BASE44_SLUG.get(entity_type, entity_type)
    r = client.patch(f"/entities/{slug}/{record_id}", content=json.dumps(payload, default=str))
    r.raise_for_status()
    return r.json()


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


def _mark_plan_loaded(engine, plan_id: str) -> None:
    if engine is None or not plan_id:
        return
    try:
        now = datetime.now(timezone.utc)
        with engine.begin() as conn:
            conn.execute(
                text(f"UPDATE {_PLAN_TABLE} SET status = 'loaded', loaded_at = :loaded_at WHERE id = :id"),
                {"loaded_at": now, "id": plan_id},
            )
    except Exception as e:
        logger.warning("Could not mark plan as loaded: %s", e)


# ── Main executor ─────────────────────────────────────────────────────────────

def execute(
    plan: dict[str, Any],
    rows: list[dict],
    company_id: str,
    base44_api_url: str,
    api_key: str,
    engine=None,
    plan_id: str | None = None,
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

    # Group field_map entries by target_entity (multiple entries per source_column allowed)
    entity_fields: dict[str, list[dict]] = {}
    for fm in field_map:
        et = fm.get("target_entity")
        if et:
            entity_fields.setdefault(et, []).append(fm)

    # row_entity_ids[entity_type][row_index] = Base44 record id
    # Populated during entity loads; used to materialise row-level relationships.
    row_entity_ids: dict[str, dict[int, str]] = {}

    client = _make_client(base44_api_url, api_key)

    try:
        # ── Phase 1: load entities ────────────────────────────────────────────
        for split in entity_splits:
            entity_type = split.get("entity_type")
            if not entity_type or entity_type not in entity_fields:
                logger.debug("No field_map entries for %s — skipping", entity_type)
                continue

            ef = entity_fields[entity_type]

            # Build one record per source row, applying transform_hints
            entity_rows = []
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

            existing = _fetch_existing(client, entity_type, company_id)
            annotated = deduplicate(entity_type, entity_rows, existing)

            row_entity_ids[entity_type] = {}

            for row_idx, record in enumerate(annotated):
                action   = record.pop("_dedup_action",   "create")
                match_id = record.pop("_dedup_match_id", None)
                record.pop("_dedup_score", None)

                entity_id: str | None = None
                try:
                    if action == "create":
                        created = _create(client, entity_type, record)
                        entity_id = created.get("id")
                        stats["entities_created"] += 1
                    elif action == "update" and match_id:
                        _update(client, entity_type, match_id, record)
                        entity_id = match_id
                        stats["entities_updated"] += 1
                    else:
                        entity_id = match_id  # skipped — still track for relationship wiring
                        stats["entities_skipped"] += 1
                except Exception as e:
                    stats["entities_failed"] += 1
                    stats["errors"].append({"entity": entity_type, "row": row_idx, "error": str(e)})
                    logger.warning("Load error [%s row %d]: %s", entity_type, row_idx, e)

                if entity_id:
                    row_entity_ids[entity_type][row_idx] = entity_id

                # Rate-limit between chunks
                if row_idx > 0 and row_idx % _CHUNK == 0:
                    time.sleep(_DELAY)

        # ── Phase 2: materialise row-level relationships ──────────────────────
        for rel in relationships:
            from_etype = rel.get("from_entity")
            to_etype   = rel.get("to_entity")
            rel_label  = rel.get("relationship_label", "related_to")

            if not from_etype or not to_etype:
                continue
            if from_etype == to_etype:
                # Same-type relationships require a different join strategy; skip for now
                continue

            from_ids = row_entity_ids.get(from_etype, {})
            to_ids   = row_entity_ids.get(to_etype, {})

            if not from_ids or not to_ids:
                logger.debug(
                    "Relationship %s→%s: no row IDs available for one or both sides",
                    from_etype, to_etype,
                )
                continue

            # Row-level pairing: same row index → link the two entities
            common_rows = sorted(set(from_ids) & set(to_ids))
            for row_idx in common_rows:
                rel_payload = {
                    "company_id":         company_id,
                    "from_entity_type":   from_etype,
                    "from_entity_id":     from_ids[row_idx],
                    "to_entity_type":     to_etype,
                    "to_entity_id":       to_ids[row_idx],
                    "relationship_type":  rel_label,
                    "status":             "active",
                }
                try:
                    _create(client, "Relationship", rel_payload)
                    stats["relationships_created"] += 1
                except Exception as e:
                    logger.warning(
                        "Relationship create failed [%s→%s row %d]: %s",
                        from_etype, to_etype, row_idx, e,
                    )

    finally:
        client.close()

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
        _mark_plan_loaded(engine, plan_id)

    logger.info(
        "Ingestion run %s complete: +%d created, ~%d updated, %d failed, %d relationships",
        run_id,
        stats["entities_created"],
        stats["entities_updated"],
        stats["entities_failed"],
        stats["relationships_created"],
    )
    return stats
