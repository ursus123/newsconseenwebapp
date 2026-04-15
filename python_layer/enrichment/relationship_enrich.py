"""
enrichment/relationship_enrich.py
------------------------------------
Phase D — Enrich Relationship records with network intelligence.

No external APIs — derived entirely from:
  - relationship fields (start_date, end_date, relationship_type, status)
  - transaction data (volume + frequency between related entities)
  - person/enterprise enrichment risk scores (risk contagion)

Writes to analytics.relationship_enrichment — one row per relationship.

Columns produced:
  tenure_days              How long this relationship has been active
  is_active                Derived from status / end_date
  link_strength_score      0–100 based on transaction frequency + recency
  transaction_count        Count of transactions between the two entities
  transaction_volume_usd   Total USD value of transactions between them
  last_transaction_date    Most recent transaction between them
  risk_contagion_score     0–100: max of both parties' Phase C risk scores
  risk_contagion_source    which party drives the risk
  relationship_health      green | amber | red
"""

import logging
from datetime import datetime, timezone

import pandas as pd

logger = logging.getLogger(__name__)

_NOW = datetime.now(timezone.utc)


def enrich_relationships(
    relationships_df: pd.DataFrame,
    transactions_df:  pd.DataFrame,
    enrichment_scores: pd.DataFrame,   # analytics.entity_scores if available
    company_id: str,
    force: bool = False,
) -> pd.DataFrame:
    """
    Enrich relationship records for a given company_id.

    Parameters
    ----------
    relationships_df  : raw.relationships for this company
    transactions_df   : raw.transactions for this company (for link strength)
    enrichment_scores : analytics.entity_scores (for risk contagion)
    company_id        : tenant filter
    """
    if relationships_df.empty:
        return pd.DataFrame()

    rels = relationships_df[relationships_df["company_id"] == company_id].copy() \
           if "company_id" in relationships_df.columns else relationships_df.copy()
    if rels.empty:
        return pd.DataFrame()

    # Build lookup maps from supporting data
    tx_map    = _build_transaction_map(transactions_df, company_id)
    score_map = _build_score_map(enrichment_scores, company_id)

    rows = []
    for _, r in rels.iterrows():
        row: dict = {
            "company_id":       company_id,
            "relationship_id":  str(r.get("id", "") or ""),
            "relationship_type": str(r.get("relationship_type", "") or ""),
            "entity_a_id":      str(r.get("person_id", r.get("entity_a_id", "")) or ""),
            "entity_a_type":    str(r.get("entity_a_type", "person") or "person"),
            "entity_b_id":      str(r.get("enterprise_id", r.get("entity_b_id", "")) or ""),
            "entity_b_type":    str(r.get("entity_b_type", "enterprise") or "enterprise"),
        }

        # ── Tenure ────────────────────────────────────────────────────────────
        start  = _parse_date(r.get("start_date") or r.get("created_date"))
        end    = _parse_date(r.get("end_date"))
        status = str(r.get("status", "") or "").lower()
        is_active = (end is None or end > _NOW) and status != "inactive"

        row["is_active"]    = is_active
        row["tenure_days"]  = ((_NOW - start).days if start else None)

        # ── Link strength from transactions ───────────────────────────────────
        a_id = row["entity_a_id"]
        b_id = row["entity_b_id"]
        tx_key = frozenset([a_id, b_id])
        tx_data = tx_map.get(tx_key, {})

        row["transaction_count"]       = tx_data.get("count", 0)
        row["transaction_volume_usd"]  = tx_data.get("volume_usd", 0.0)
        row["last_transaction_date"]   = tx_data.get("last_date", None)

        # Score 0–100: log-scale count + recency bonus
        count   = row["transaction_count"]
        recency = 0
        if tx_data.get("last_date"):
            try:
                last = datetime.fromisoformat(str(tx_data["last_date"])[:10])
                days_ago = (_NOW.date() - last.date()).days
                recency = max(0, 100 - days_ago)   # 100 if today, 0 if 100+ days ago
            except (ValueError, TypeError):
                pass
        import math
        link_strength = round(min(100.0, math.log1p(count) * 15 + recency * 0.3), 1)
        row["link_strength_score"] = link_strength

        # ── Risk contagion from entity_scores ─────────────────────────────────
        risk_a = score_map.get(a_id, {}).get("risk_score", 0.0)
        risk_b = score_map.get(b_id, {}).get("risk_score", 0.0)
        max_risk = max(risk_a, risk_b)
        row["risk_contagion_score"]  = round(max_risk, 1)
        row["risk_contagion_source"] = (
            "entity_a" if risk_a >= risk_b else "entity_b"
        ) if max_risk > 0 else None

        # ── Health label ──────────────────────────────────────────────────────
        if max_risk >= 50 or not is_active:
            health = "red"
        elif max_risk >= 20 or link_strength < 20:
            health = "amber"
        else:
            health = "green"
        row["relationship_health"] = health

        row["enriched_at"] = pd.Timestamp.now(tz="UTC").isoformat()
        rows.append(row)

    logger.info("relationship_enrich: %d relationships processed (company=%s)", len(rows), company_id)
    return pd.DataFrame(rows)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _build_transaction_map(tx_df: pd.DataFrame, company_id: str) -> dict:
    """Build {frozenset([entity_a_id, entity_b_id]): {count, volume_usd, last_date}}."""
    if tx_df.empty:
        return {}
    mask = tx_df["company_id"] == company_id if "company_id" in tx_df.columns else pd.Series([True] * len(tx_df))
    subset = tx_df[mask]
    result: dict = {}

    for _, t in subset.iterrows():
        p_id = str(t.get("person_id", "") or "")
        e_id = str(t.get("enterprise_id", "") or "")
        if not p_id or not e_id:
            continue
        key = frozenset([p_id, e_id])
        entry = result.setdefault(key, {"count": 0, "volume_usd": 0.0, "last_date": None})
        entry["count"] += 1
        try:
            entry["volume_usd"] += float(t.get("amount_usd") or t.get("amount") or 0)
        except (TypeError, ValueError):
            pass
        date_val = str(t.get("transaction_date") or t.get("date") or "")[:10]
        if date_val and (entry["last_date"] is None or date_val > entry["last_date"]):
            entry["last_date"] = date_val

    return result


def _build_score_map(scores_df: pd.DataFrame, company_id: str) -> dict:
    """Build {entity_id: {risk_score}} from entity_scores."""
    if scores_df is None or scores_df.empty:
        return {}
    mask = scores_df["company_id"] == company_id if "company_id" in scores_df.columns else pd.Series([True] * len(scores_df))
    subset = scores_df[mask]
    result: dict = {}
    for _, s in subset.iterrows():
        eid = str(s.get("entity_id", "") or "")
        if eid:
            result[eid] = {"risk_score": float(s.get("risk_score", 0) or 0)}
    return result


def _parse_date(val) -> datetime | None:
    if not val:
        return None
    try:
        dt = datetime.fromisoformat(str(val)[:10])
        return dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None
