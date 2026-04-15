"""
enrichment/scoring/engine.py
-------------------------------
Phase D — Scoring & Synthesis engine.

Reads all completed enrichment tables for a company, scores each entity
using its per-type scorer, and writes results to analytics.entity_scores.

analytics.entity_scores is the single table copilot tools and agents
query for risk prioritisation — no need to JOIN across 5 enrichment tables.

Usage (called automatically at end of run_enrichment):
    from enrichment.scoring.engine import run_scoring
    summary = run_scoring(company_id)
"""

import logging
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from sqlalchemy import text

from database import get_engine_safe

logger = logging.getLogger(__name__)

_SCORE_VERSION = "D.1"   # bump when scorer logic changes


# Mapping: (enrichment_table, entity_id_col, entity_name_col, scorer_module)
_ENTITY_CONFIG = [
    ("person_enrichment",      "person_id",      "person_name",      "enrichment.scoring.person_score"),
    ("enterprise_enrichment",  "enterprise_id",  "enterprise_name",  "enrichment.scoring.enterprise_score"),
    ("product_enrichment",     "product_id",     "product_name",     "enrichment.scoring.product_score"),
    ("transaction_enrichment", "transaction_id", "transaction_type", "enrichment.scoring.transaction_score"),
    ("address_enrichment",     "address_id",     "entity_name",      "enrichment.scoring.address_score"),
]


def run_scoring(company_id: str) -> dict:
    """
    Score all enriched entities for company_id and write to analytics.entity_scores.

    Returns
    -------
    dict  {entity_type: {"rows": int, "avg_risk": float, "high_risk_count": int}}
    """
    engine = get_engine_safe()
    summary = {}

    for table, id_col, name_col, scorer_module in _ENTITY_CONFIG:
        entity_type = table.replace("_enrichment", "")
        try:
            # Read enrichment rows
            if engine:
                df = pd.read_sql(
                    text(f"SELECT * FROM analytics.{table} WHERE company_id = :cid"),
                    engine,
                    params={"cid": company_id},
                )
            else:
                df = pd.DataFrame()

            if df.empty:
                summary[entity_type] = {"rows": 0, "avg_risk": 0.0, "high_risk_count": 0}
                continue

            # Import scorer
            import importlib
            scorer = importlib.import_module(scorer_module)

            rows = []
            for _, row in df.iterrows():
                scored = scorer.score(dict(row))
                score_row = {
                    "company_id":          company_id,
                    "entity_type":         entity_type,
                    "entity_id":           str(row.get(id_col, "") or ""),
                    "entity_name":         str(row.get(name_col, "") or ""),
                    "risk_score":          scored["risk_score"],
                    "quality_score":       scored["quality_score"],
                    "intelligence_score":  scored["intelligence_score"],
                    "top_flags":           ",".join(scored.get("top_flags", [])),
                    "score_reasoning":     scored.get("score_reasoning", ""),
                    "needs_review":        scored["risk_score"] >= 50,
                    "score_version":       _SCORE_VERSION,
                    "scored_at":           datetime.now(timezone.utc).isoformat(),
                }
                rows.append(score_row)

            scored_df = pd.DataFrame(rows)

            # Write: DELETE existing + INSERT new
            if engine:
                with engine.begin() as conn:
                    conn.execute(
                        text("DELETE FROM analytics.entity_scores "
                             "WHERE company_id = :cid AND entity_type = :et"),
                        {"cid": company_id, "et": entity_type},
                    )
                scored_df.to_sql(
                    "entity_scores",
                    engine,
                    schema="analytics",
                    if_exists="append",
                    index=False,
                    method="multi",
                    chunksize=500,
                )

            avg_risk        = round(scored_df["risk_score"].mean(), 1) if not scored_df.empty else 0.0
            high_risk_count = int((scored_df["risk_score"] >= 50).sum())
            summary[entity_type] = {
                "rows":             len(rows),
                "avg_risk":         avg_risk,
                "high_risk_count":  high_risk_count,
            }
            logger.info("scoring.engine: %s → %d rows, avg_risk=%.1f (company=%s)",
                        entity_type, len(rows), avg_risk, company_id)

        except Exception as exc:
            logger.exception("scoring.engine: %s failed (company=%s)", entity_type, company_id)
            summary[entity_type] = {"error": str(exc)[:200]}

    return summary


def get_top_risk_entities(
    company_id: str,
    entity_type: Optional[str] = None,
    min_risk_score: float = 50.0,
    limit: int = 20,
) -> list[dict]:
    """
    Query analytics.entity_scores for the highest-risk entities.
    Used directly by the copilot tool get_entity_risk_report.
    """
    engine = get_engine_safe()
    if not engine:
        return []
    try:
        type_filter = "AND entity_type = :et" if entity_type else ""
        sql = f"""
            SELECT entity_type, entity_id, entity_name, risk_score,
                   quality_score, top_flags, score_reasoning, scored_at
            FROM analytics.entity_scores
            WHERE company_id = :cid
              AND risk_score >= :min_risk
              {type_filter}
            ORDER BY risk_score DESC
            LIMIT :lim
        """
        params: dict = {"cid": company_id, "min_risk": min_risk_score, "lim": limit}
        if entity_type:
            params["et"] = entity_type

        with engine.connect() as conn:
            result = conn.execute(text(sql), params)
            cols   = result.keys()
            return [dict(zip(cols, row)) for row in result.fetchall()]
    except Exception as exc:
        logger.warning("scoring.engine.get_top_risk_entities failed: %s", exc)
        return []
