# ==============================================================
# Shared failed-row quarantine + mapping-history writers.
# Used by both the ingestion pipeline (ingestion/loader.py) and the
# connector pipeline (connectors/base.py) so failures from either source
# land in the same queryable, retryable table instead of being logged
# and discarded (ingestion) or dropped entirely (connectors).
# ==============================================================

import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def record_failed_row(engine, company_id: str, source: str, entity_type: str,
                       row_payload: dict, error_message: str,
                       row_index: int = None) -> None:
    """
    Persist one failed row, uncapped, for later review/retry.
    Best-effort — never raises, never blocks the caller's run.
    """
    if engine is None:
        return
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO analytics.ingestion_failed_rows
                    (company_id, source, entity_type, row_index, row_payload, error_message)
                VALUES
                    (:company_id, :source, :entity_type, :row_index, :row_payload::jsonb, :error_message)
            """), {
                "company_id":    company_id,
                "source":        source,
                "entity_type":   entity_type,
                "row_index":     row_index,
                "row_payload":   json.dumps(row_payload, default=str),
                "error_message": str(error_message)[:2000],
            })
    except Exception as e:
        logger.warning("record_failed_row: failed to persist — %s", e)


def record_mapping_history(engine, company_id: str, source_fingerprint: str,
                            source_name: str, mapping: dict,
                            changed_by: str = "system") -> None:
    """
    Append-only log of mapping changes. Called alongside (not instead of)
    the existing "current mapping" upsert — only inserts when the mapping
    actually differs from what's already stored, so re-saving an unchanged
    mapping doesn't spam the history.
    """
    if engine is None:
        return
    try:
        from sqlalchemy import text
        mapping_json = json.dumps(mapping, default=str)
        with engine.connect() as conn:
            existing = conn.execute(text("""
                SELECT mapping_json FROM analytics.ingestion_mapping_history
                WHERE company_id = :company_id AND source_fingerprint = :fingerprint
                ORDER BY created_at DESC LIMIT 1
            """), {"company_id": company_id, "fingerprint": source_fingerprint}).fetchone()
            if existing and existing[0] == mapping_json:
                return  # unchanged — don't log a duplicate history entry
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO analytics.ingestion_mapping_history
                    (company_id, source_fingerprint, source_name, mapping_json, changed_by)
                VALUES
                    (:company_id, :fingerprint, :source_name, :mapping_json, :changed_by)
            """), {
                "company_id":  company_id,
                "fingerprint": source_fingerprint,
                "source_name": source_name,
                "mapping_json": mapping_json,
                "changed_by":  changed_by,
            })
    except Exception as e:
        logger.warning("record_mapping_history: failed to persist — %s", e)
