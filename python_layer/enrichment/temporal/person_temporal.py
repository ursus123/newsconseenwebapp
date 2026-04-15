"""
enrichment/temporal/person_temporal.py
----------------------------------------
Phase E: Predictive & Temporal Intelligence for Person entities.

Derives signals from the operator's own transaction history — no external APIs.

Signals produced:
  spend_trend               rising | stable | falling (30d vs prior 30d)
  days_since_last_transaction  integer — days since most recent transaction
  transaction_count_30d     integer — transactions in last 30 days
  transaction_volume_30d_usd  float — USD volume in last 30 days
  churn_probability         float 0–100 — likelihood of disengagement
  clv_segment               high | medium | low | inactive — customer lifetime value tier
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import pandas as pd

logger = logging.getLogger(__name__)

_NOW = None  # injectable for tests


def _now() -> datetime:
    return _NOW or datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def enrich_person_temporal(person_row: dict, transactions_df: pd.DataFrame) -> dict:
    """
    Given a single person dict and the full transactions DataFrame for the company,
    return a dict of Phase E temporal fields to merge into the enrichment row.

    transactions_df expected columns (best-effort): transaction_id, person_id,
    amount_usd, created_date, transaction_type, status.
    """
    result: dict = {
        "spend_trend": None,
        "days_since_last_transaction": None,
        "transaction_count_30d": None,
        "transaction_volume_30d_usd": None,
        "churn_probability": None,
        "clv_segment": None,
    }

    if transactions_df is None or transactions_df.empty:
        return result

    person_id = person_row.get("person_id") or person_row.get("id")
    if not person_id:
        return result

    try:
        # Filter to this person's transactions
        pid_col = "person_id" if "person_id" in transactions_df.columns else None
        if pid_col is None:
            return result

        ptx = transactions_df[transactions_df[pid_col].astype(str) == str(person_id)].copy()
        if ptx.empty:
            result["clv_segment"] = "inactive"
            result["churn_probability"] = 80.0
            return result

        # Parse dates
        date_col = _find_date_col(ptx)
        if date_col:
            ptx["_date"] = pd.to_datetime(ptx[date_col], errors="coerce", utc=True)
        else:
            result["clv_segment"] = "inactive"
            return result

        ptx = ptx.dropna(subset=["_date"])
        if ptx.empty:
            result["clv_segment"] = "inactive"
            return result

        now = _now()
        cutoff_30 = now - timedelta(days=30)
        cutoff_60 = now - timedelta(days=60)

        # Amount column (best-effort: prefer amount_usd)
        amt_col = _find_amount_col(ptx)

        # 30-day window
        recent = ptx[ptx["_date"] >= cutoff_30]
        prior = ptx[(ptx["_date"] >= cutoff_60) & (ptx["_date"] < cutoff_30)]

        count_30 = len(recent)
        vol_30 = float(recent[amt_col].sum()) if amt_col else 0.0
        vol_prior = float(prior[amt_col].sum()) if amt_col else 0.0

        result["transaction_count_30d"] = count_30
        result["transaction_volume_30d_usd"] = round(vol_30, 2)

        # Days since last transaction
        latest = ptx["_date"].max()
        result["days_since_last_transaction"] = (now - latest).days

        # Spend trend
        if vol_prior == 0 and vol_30 == 0:
            result["spend_trend"] = "stable"
        elif vol_prior == 0:
            result["spend_trend"] = "rising"
        else:
            pct_change = (vol_30 - vol_prior) / vol_prior * 100
            if pct_change >= 10:
                result["spend_trend"] = "rising"
            elif pct_change <= -10:
                result["spend_trend"] = "falling"
            else:
                result["spend_trend"] = "stable"

        # CLV segment (total lifetime volume)
        total_vol = float(ptx[amt_col].sum()) if amt_col else 0.0
        days_active = (now - ptx["_date"].min()).days or 1
        monthly_rate = total_vol / max(days_active / 30, 1)

        if monthly_rate >= 1000:
            clv = "high"
        elif monthly_rate >= 200:
            clv = "medium"
        elif monthly_rate > 0:
            clv = "low"
        else:
            clv = "inactive"
        result["clv_segment"] = clv

        # Churn probability (heuristic)
        days_inactive = result["days_since_last_transaction"]
        churn = _churn_score(days_inactive, count_30, result["spend_trend"], clv)
        result["churn_probability"] = churn

    except Exception as exc:
        logger.debug("person_temporal: person_id=%s — %s", person_id, exc)

    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_date_col(df: pd.DataFrame) -> str | None:
    for col in ("created_date", "transaction_date", "date", "created_at", "updated_at"):
        if col in df.columns:
            return col
    return None


def _find_amount_col(df: pd.DataFrame) -> str | None:
    for col in ("amount_usd", "amount_original", "amount", "total"):
        if col in df.columns:
            return col
    return None


def _churn_score(days_inactive: int, count_30: int, trend: str, clv: str) -> float:
    """
    Heuristic churn probability (0–100).
    Higher = more likely to disengage.
    """
    score = 0.0

    # Recency
    if days_inactive is None:
        score += 60
    elif days_inactive > 90:
        score += 60
    elif days_inactive > 60:
        score += 40
    elif days_inactive > 30:
        score += 20
    else:
        score += 5

    # Frequency
    if count_30 == 0:
        score += 20
    elif count_30 == 1:
        score += 10

    # Trend
    if trend == "falling":
        score += 15
    elif trend == "rising":
        score -= 10

    # CLV modifier
    if clv == "high":
        score -= 10
    elif clv == "inactive":
        score += 10

    return round(max(0.0, min(100.0, score)), 1)
