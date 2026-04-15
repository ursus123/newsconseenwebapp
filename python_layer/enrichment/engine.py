"""
enrichment/engine.py
---------------------
EnrichmentEngine — orchestrates Phase A universal ontology enrichment.

Calls all 5 per-entity enrichment modules and persists results to
analytics.{entity}_enrichment tables in PostgreSQL.

Usage:
    from enrichment.engine import run_enrichment
    summary = run_enrichment(raw_data, company_id)
"""

import logging
from typing import Optional

import pandas as pd
from sqlalchemy import text

from database import get_engine_safe

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------
# Per-entity enrichment imports (all fail gracefully)
# ------------------------------------------------------------------
try:
    from enrichment.person_enrich      import enrich_people
    from enrichment.enterprise_enrich  import enrich_enterprises
    from enrichment.product_enrich     import enrich_products
    from enrichment.transaction_enrich import enrich_transactions
    from enrichment.address_enrich     import enrich_addresses
    _ENRICH_OK = True
except ImportError as _e:
    logger.warning("Enrichment modules not fully available: %s", _e)
    _ENRICH_OK = False


def run_enrichment(
    raw_data: dict,
    company_id: str,
    force: bool = False,
) -> dict:
    """
    Run Phase A enrichment for all 5 entities for a given company_id.

    Parameters
    ----------
    raw_data    : dict of {entity_key: pd.DataFrame} — same shape as the
                  raw_data dict used in cron_etl_company()
    company_id  : tenant filter
    force       : if True, re-enrich all rows even if recently enriched

    Returns
    -------
    dict  {entity: {"status": ..., "rows": int, "error": str|None}}
    """
    if not _ENRICH_OK:
        return {"error": "enrichment modules unavailable"}

    entity_map = [
        ("people",       raw_data.get("people",       pd.DataFrame()), enrich_people),
        ("enterprises",  raw_data.get("enterprises",  pd.DataFrame()), enrich_enterprises),
        ("products",     raw_data.get("products",     pd.DataFrame()), enrich_products),
        ("transactions", raw_data.get("transactions", pd.DataFrame()), enrich_transactions),
        ("addresses",    raw_data.get("addresses",    pd.DataFrame()), enrich_addresses),
    ]

    summary = {}
    for entity_key, df, enrich_fn in entity_map:
        try:
            enriched_df = enrich_fn(df, company_id, force=force)
            if enriched_df.empty:
                summary[entity_key] = {"status": "empty", "rows": 0, "error": None}
                continue

            table = f"{entity_key.rstrip('s')}_enrichment"   # people → person_enrichment
            if entity_key == "addresses":
                table = "address_enrichment"

            rows_loaded = _load_enrichment(enriched_df, table, company_id)
            summary[entity_key] = {"status": "ok", "rows": rows_loaded, "error": None}
            logger.info("enrichment.engine: %s → %d rows (company=%s)", table, rows_loaded, company_id)

        except Exception as exc:
            logger.exception("enrichment.engine: %s failed (company=%s)", entity_key, company_id)
            summary[entity_key] = {"status": "error", "rows": 0, "error": str(exc)[:200]}

    return summary


def _load_enrichment(df: pd.DataFrame, table: str, company_id: str) -> int:
    """
    Write enrichment rows to analytics.<table>.

    Strategy:
      1. DELETE existing rows for this company_id
      2. INSERT new rows via pandas to_sql (append)

    Falls back silently if PostgreSQL is unavailable.
    Returns the number of rows inserted.
    """
    engine = get_engine_safe()
    if engine is None:
        logger.warning("enrichment._load_enrichment: no DB engine, skipping persist for %s", table)
        return len(df)   # rows were computed, just not persisted

    try:
        with engine.begin() as conn:
            conn.execute(
                text(f"DELETE FROM analytics.{table} WHERE company_id = :cid"),
                {"cid": company_id},
            )
    except Exception:
        # Table may not exist yet — to_sql will create it below
        pass

    try:
        df.to_sql(
            table,
            engine,
            schema="analytics",
            if_exists="append",
            index=False,
            method="multi",
            chunksize=500,
        )
        return len(df)
    except Exception as exc:
        logger.error("enrichment._load_enrichment: to_sql failed for %s — %s", table, exc)
        raise


def get_enrichment_coverage(company_id: str) -> dict:
    """
    Return a coverage summary: for each entity, how many records are
    in the enrichment table vs the raw table.

    Used by GET /enrichment/status.
    """
    engine = get_engine_safe()
    coverage = {}

    entity_tables = {
        "people":       ("raw.people",       "analytics.person_enrichment"),
        "enterprises":  ("raw.enterprises",  "analytics.enterprise_enrichment"),
        "products":     ("raw.products",     "analytics.product_enrichment"),
        "transactions": ("raw.transactions", "analytics.transaction_enrichment"),
        "addresses":    ("raw.addresses",    "analytics.address_enrichment"),
    }

    for entity, (raw_tbl, enriched_tbl) in entity_tables.items():
        entry = {"raw_rows": 0, "enriched_rows": 0, "coverage_pct": 0.0}
        if engine is None:
            coverage[entity] = entry
            continue

        try:
            with engine.connect() as conn:
                raw_q = f"SELECT COUNT(*) FROM {raw_tbl} WHERE company_id = :cid"
                enr_q = f"SELECT COUNT(*) FROM {enriched_tbl} WHERE company_id = :cid"
                raw_count = conn.execute(text(raw_q), {"cid": company_id}).scalar() or 0
                enr_count = conn.execute(text(enr_q), {"cid": company_id}).scalar() or 0
                entry["raw_rows"]      = int(raw_count)
                entry["enriched_rows"] = int(enr_count)
                entry["coverage_pct"]  = (
                    round(enr_count / raw_count * 100, 1) if raw_count else 0.0
                )
        except Exception:
            pass  # table may not exist; return zeros

        coverage[entity] = entry

    return coverage
