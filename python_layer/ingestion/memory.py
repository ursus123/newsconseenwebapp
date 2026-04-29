"""
ingestion/memory.py
Persists and recalls ingestion mappings by source fingerprint.

When the same spreadsheet template is uploaded again, we skip the LLM call
and reuse the previous field_map directly — with one caveat: if any column
is new or missing, we still call the analyser for those columns only.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

_TABLE = "analytics.ingestion_memory"


def recall(engine, company_id: str, fingerprint: str) -> dict | None:
    """
    Return cached mapping_json dict if a memory record exists, else None.
    """
    if engine is None:
        return None
    try:
        import pandas as pd
        df = pd.read_sql(
            f"SELECT mapping_json, use_count FROM {_TABLE} "
            "WHERE company_id = %s AND source_fingerprint = %s LIMIT 1",
            engine,
            params=(company_id, fingerprint),
        )
        if df.empty:
            return None
        row = df.iloc[0]
        logger.info("Ingestion memory HIT for fingerprint %s (used %d times)",
                    fingerprint, int(row["use_count"]))
        return json.loads(row["mapping_json"])
    except Exception as e:
        logger.warning("Ingestion memory recall failed: %s", e)
        return None


def save(
    engine,
    company_id: str,
    fingerprint: str,
    source_name: str,
    mapping: dict[str, Any],
) -> None:
    """
    Upsert the mapping into ingestion_memory, incrementing use_count.
    """
    if engine is None:
        return
    try:
        mapping_json = json.dumps(mapping, default=str)
        now = datetime.now(timezone.utc)
        with engine.begin() as conn:
            conn.execute(
                f"""
                INSERT INTO {_TABLE}
                    (company_id, source_fingerprint, source_name, mapping_json,
                     use_count, last_used_at, created_at)
                VALUES (%s, %s, %s, %s, 1, %s, %s)
                ON CONFLICT (company_id, source_fingerprint)
                DO UPDATE SET
                    mapping_json  = EXCLUDED.mapping_json,
                    source_name   = EXCLUDED.source_name,
                    use_count     = {_TABLE}.use_count + 1,
                    last_used_at  = EXCLUDED.last_used_at
                """,
                (company_id, fingerprint, source_name, mapping_json, now, now),
            )
        logger.info("Ingestion memory saved for fingerprint %s", fingerprint)
    except Exception as e:
        logger.warning("Ingestion memory save failed: %s", e)
