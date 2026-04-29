"""
ingestion/memory.py
Persists and recalls ingestion mappings by source fingerprint.

Recall strategy (two-level):
  1. Exact fingerprint match  — zero LLM cost, instant
  2. Fuzzy Jaccard match      — finds the closest known template when a file
     has new/removed columns, returning the delta as an analyst_notes flag
     so the next analyser call only needs to fill the gaps.
"""
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text

logger = logging.getLogger(__name__)

_TABLE = "analytics.ingestion_memory"


def _norm_col(col: str) -> str:
    return re.sub(r"[^a-z0-9]", "", col.lower())


# ── Exact recall ─────────────────────────────────────────────────────────────

def recall(engine, company_id: str, fingerprint: str) -> dict | None:
    """Return cached mapping dict for an exact fingerprint match, else None."""
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
        logger.info("Ingestion memory EXACT HIT for fingerprint %s (used %d×)",
                    fingerprint, int(row["use_count"]))
        return json.loads(row["mapping_json"])
    except Exception as e:
        logger.warning("Ingestion memory exact recall failed: %s", e)
        return None


# ── Fuzzy recall ──────────────────────────────────────────────────────────────

def recall_fuzzy(
    engine,
    company_id: str,
    columns: list[str],
    fingerprint: str,
    threshold: float = 0.70,
) -> dict | None:
    """
    Try exact match first; if that misses, find the closest cached schema by
    column Jaccard similarity and return it when similarity >= threshold.

    Args:
        columns:    Normalised column names from the incoming file.
        fingerprint: SHA fingerprint of the incoming schema (for exact check).
        threshold:  Minimum Jaccard similarity to accept a fuzzy hit (default 0.70).
    """
    exact = recall(engine, company_id, fingerprint)
    if exact is not None:
        return exact

    if engine is None:
        return None

    try:
        import pandas as pd
        df = pd.read_sql(
            f"SELECT source_fingerprint, mapping_json FROM {_TABLE} WHERE company_id = %s",
            engine,
            params=(company_id,),
        )
        if df.empty:
            return None

        incoming_norm = {_norm_col(c) for c in columns}

        best_score   = 0.0
        best_mapping = None

        for _, row in df.iterrows():
            try:
                mapping = json.loads(row["mapping_json"])
                cached_cols = {
                    _norm_col(fm["source_column"])
                    for fm in mapping.get("field_map", [])
                    if fm.get("source_column")
                }
                if not cached_cols:
                    continue
                intersection = len(incoming_norm & cached_cols)
                union        = len(incoming_norm | cached_cols)
                jaccard      = intersection / union if union else 0.0
                if jaccard > best_score:
                    best_score   = jaccard
                    best_mapping = mapping
            except Exception:
                continue

        if best_score >= threshold and best_mapping is not None:
            new_cols    = incoming_norm - {_norm_col(fm["source_column"]) for fm in best_mapping.get("field_map", [])}
            removed_cols = {_norm_col(fm["source_column"]) for fm in best_mapping.get("field_map", [])} - incoming_norm
            note = f"[memory fuzzy hit, Jaccard={best_score:.2f}]"
            if new_cols:
                note += f" New columns not in template: {', '.join(sorted(new_cols))}"
            if removed_cols:
                note += f" Columns from template that are absent: {', '.join(sorted(removed_cols))}"
            best_mapping = dict(best_mapping)
            best_mapping["analyst_notes"] = (
                (best_mapping.get("analyst_notes") or "") + " " + note
            ).strip()
            logger.info("Ingestion memory FUZZY HIT Jaccard=%.2f for company %s", best_score, company_id)
            return best_mapping

        return None
    except Exception as e:
        logger.warning("Ingestion memory fuzzy recall failed: %s", e)
        return None


# ── Save / upsert ─────────────────────────────────────────────────────────────

def save(
    engine,
    company_id: str,
    fingerprint: str,
    source_name: str,
    mapping: dict[str, Any],
) -> None:
    """Upsert the mapping into ingestion_memory, incrementing use_count."""
    if engine is None:
        return
    try:
        mapping_json = json.dumps(mapping, default=str)
        now = datetime.now(timezone.utc)
        with engine.begin() as conn:
            conn.execute(
                text(f"""
                    INSERT INTO {_TABLE}
                        (company_id, source_fingerprint, source_name, mapping_json,
                         use_count, last_used_at, created_at)
                    VALUES (:company_id, :fingerprint, :source_name, :mapping_json,
                            1, :now, :now)
                    ON CONFLICT (company_id, source_fingerprint)
                    DO UPDATE SET
                        mapping_json  = EXCLUDED.mapping_json,
                        source_name   = EXCLUDED.source_name,
                        use_count     = {_TABLE}.use_count + 1,
                        last_used_at  = EXCLUDED.last_used_at
                """),
                {
                    "company_id":   company_id,
                    "fingerprint":  fingerprint,
                    "source_name":  source_name,
                    "mapping_json": mapping_json,
                    "now":          now,
                },
            )
        logger.info("Ingestion memory saved for fingerprint %s", fingerprint)
    except Exception as e:
        logger.warning("Ingestion memory save failed: %s", e)
