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

from ingestion.deduplicator import deduplicate

logger = logging.getLogger(__name__)

_CHUNK = 10          # rows per Base44 batch
_DELAY = 0.15        # seconds between chunks
_TIMEOUT = 20.0      # httpx timeout per request

_RUN_TABLE  = "analytics.ingestion_runs"
_PLAN_TABLE = "analytics.ingestion_plans"


# ── Base44 entity → REST endpoint slug map ─────────────────────────────────
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


def _write_run_status(engine, run_id: str, **kwargs) -> None:
    if engine is None:
        return
    try:
        set_clause = ", ".join(f"{k} = %s" for k in kwargs)
        values     = list(kwargs.values()) + [run_id]
        with engine.begin() as conn:
            conn.execute(
                f"UPDATE {_RUN_TABLE} SET {set_clause} WHERE id = %s",
                values,
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
                f"UPDATE {_PLAN_TABLE} SET status = 'loaded', loaded_at = %s WHERE id = %s",
                (now, plan_id),
            )
    except Exception as e:
        logger.warning("Could not mark plan as loaded: %s", e)


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

    Args:
        plan:           The approved plan dict (field_map, entity_splits, relationships)
        rows:           All extracted rows from the source file
        company_id:     Tenant scoping
        base44_api_url: e.g. "https://api.base44.com/v1"
        api_key:        Base44 API key
        engine:         SQLAlchemy engine (optional, for run tracking)
        plan_id:        ID in analytics.ingestion_plans (optional)

    Returns:
        Run statistics dict
    """
    run_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc)

    # Initialise run record
    if engine:
        try:
            with engine.begin() as conn:
                conn.execute(
                    f"""INSERT INTO {_RUN_TABLE}
                        (id, company_id, plan_id, status, rows_total, started_at)
                        VALUES (%s, %s, %s, 'running', %s, %s)""",
                    (run_id, company_id, plan_id, len(rows), started_at),
                )
        except Exception as e:
            logger.warning("Could not create run record: %s", e)

    stats = {
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
        et = fm["target_entity"]
        entity_fields.setdefault(et, []).append(fm)

    client = _make_client(base44_api_url, api_key)

    try:
        for split in entity_splits:
            entity_type = split["entity_type"]
            if entity_type not in entity_fields:
                logger.debug("No field_map entries for %s — skipping", entity_type)
                continue

            ef    = entity_fields[entity_type]
            # Build transformed rows for this entity
            entity_rows = []
            for raw_row in rows:
                record: dict = {"company_id": company_id}
                for fm in ef:
                    src_val = raw_row.get(fm["source_column"])
                    if src_val is not None:
                        record[fm["target_field"]] = src_val
                entity_rows.append(record)

            # Fetch existing for dedup
            existing = _fetch_existing(client, entity_type, company_id)
            annotated = deduplicate(entity_type, entity_rows, existing)

            # Chunk-write
            for i in range(0, len(annotated), _CHUNK):
                chunk = annotated[i:i + _CHUNK]
                for record in chunk:
                    action   = record.pop("_dedup_action",   "create")
                    match_id = record.pop("_dedup_match_id", None)
                    record.pop("_dedup_score", None)

                    try:
                        if action == "create":
                            _create(client, entity_type, record)
                            stats["entities_created"] += 1
                        elif action == "update" and match_id:
                            _update(client, entity_type, match_id, record)
                            stats["entities_updated"] += 1
                        else:
                            stats["entities_skipped"] += 1
                    except Exception as e:
                        stats["entities_failed"] += 1
                        stats["errors"].append({"entity": entity_type, "error": str(e)})
                        logger.warning("Load error [%s]: %s", entity_type, e)

                time.sleep(_DELAY)

        # Relationship records (simple: create only, no dedup)
        for rel in relationships:
            # relationships in the plan are schema-level, not row-level
            # row-level relationship wiring is done by the operator after review
            stats["relationships_created"] += 0   # placeholder — Phase 2 of loader

    finally:
        client.close()

    finished_at = datetime.now(timezone.utc)
    errors_json = json.dumps(stats["errors"][:50], default=str)

    _write_run_status(
        engine,
        run_id,
        status            = "complete" if not stats["errors"] else "partial",
        entities_created  = stats["entities_created"],
        entities_updated  = stats["entities_updated"],
        entities_skipped  = stats["entities_skipped"],
        entities_failed   = stats["entities_failed"],
        relationships_created = stats["relationships_created"],
        errors_json       = errors_json,
        finished_at       = finished_at,
    )
    if plan_id:
        _mark_plan_loaded(engine, plan_id)

    logger.info(
        "Ingestion run %s complete: +%d created, ~%d updated, %d failed",
        run_id, stats["entities_created"], stats["entities_updated"], stats["entities_failed"],
    )
    return stats
