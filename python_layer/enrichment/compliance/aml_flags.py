"""
enrichment/compliance/aml_flags.py
-------------------------------------
Phase C — Anti-Money Laundering (AML) pattern detection on transactions.

No external API. Pure Python — uses the full batch of company transactions
to compute peer statistics before scoring each individual transaction.

Flags detected:
  round_number       Amount is exactly divisible by 1 000 AND ≥ 500 USD-equivalent.
                     Classic structuring indicator.
  just_below_limit   Amount is between 8 500–9 999 (structuring below $10 k reporting
                     threshold common in US/EU/global AML frameworks).
  velocity           Same transaction_type appears ≥ 5 times within a 7-day window
                     for this company.  Indicates burst activity.
  anomaly            |Z-score| ≥ 2.5 vs all transactions of the same type.
                     Flags statistical outliers — unusually large or small amounts.

Risk score formula (0.0–1.0):
  round_number     → +0.15
  just_below_limit → +0.40  (higher weight — deliberate structuring signal)
  velocity         → +0.20
  anomaly          → +0.25  (scaled by |z| / 5, capped at +0.25)
  capped at 1.0

Usage:
  from enrichment.compliance.aml_flags import compute_aml_batch

  # Call once per company, returns a list parallel to transactions_df rows
  results = compute_aml_batch(transactions_df, company_id)
  # Each result: {"aml_risk_score": float, "aml_flags": str, "anomaly_score": float, "anomaly_flag": bool}
"""

import json
import logging
import math
import statistics
from datetime import datetime, timedelta, timezone
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Batch entry point
# ------------------------------------------------------------------

def compute_aml_batch(df: pd.DataFrame, company_id: str) -> list[dict]:
    """
    Compute AML flags for all transactions of a company in one pass.

    Parameters
    ----------
    df          : full transactions DataFrame (all companies — we filter internally)
    company_id  : tenant to score

    Returns
    -------
    List of dicts, one per row in df[df.company_id == company_id], in order.
    Each dict:  aml_risk_score, aml_flags (JSON str), anomaly_score, anomaly_flag
    """
    if df.empty:
        return []

    mask = df["company_id"] == company_id if "company_id" in df.columns else pd.Series([True] * len(df))
    subset = df[mask].copy().reset_index(drop=True)
    if subset.empty:
        return []

    # ── Pre-compute peer stats (mean/std per transaction_type) ────────────────
    peer_stats = _build_peer_stats(subset)

    # ── Velocity map (transaction_type → list of parsed dates) ───────────────
    velocity_map = _build_velocity_map(subset)

    results = []
    for idx, row in subset.iterrows():
        result = _score_row(row, peer_stats, velocity_map)
        results.append(result)

    return results


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _safe_amount(row) -> Optional[float]:
    for col in ("amount_original", "amount", "amount_usd", "total_amount"):
        v = row.get(col)
        if v is not None:
            try:
                f = float(str(v).replace(",", ""))
                if not math.isnan(f):
                    return abs(f)
            except (ValueError, TypeError):
                pass
    return None


def _parse_date(row) -> Optional[datetime]:
    for col in ("transaction_date", "date", "created_date", "invoice_date", "payment_date"):
        v = row.get(col)
        if v:
            try:
                if isinstance(v, datetime):
                    return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v
                return datetime.fromisoformat(str(v)[:10])
            except (ValueError, TypeError):
                pass
    return None


def _build_peer_stats(df: pd.DataFrame) -> dict:
    """
    Returns {tx_type: {"mean": float, "std": float}} for anomaly scoring.
    Uses amount_original or amount as the amount column.
    """
    stats = {}
    amount_col = next((c for c in ("amount_original", "amount", "amount_usd") if c in df.columns), None)
    if amount_col is None:
        return stats

    for tx_type, grp in df.groupby("transaction_type" if "transaction_type" in df.columns else df.columns[0]):
        vals = pd.to_numeric(grp[amount_col], errors="coerce").dropna().abs().tolist()
        if len(vals) >= 3:
            stats[str(tx_type)] = {
                "mean": statistics.mean(vals),
                "std":  statistics.stdev(vals) if len(vals) > 1 else 0.0,
            }
    return stats


def _build_velocity_map(df: pd.DataFrame) -> dict:
    """
    Returns {tx_type: sorted list of datetime} for velocity checks.
    """
    velocity: dict = {}
    for _, row in df.iterrows():
        tx_type = str(row.get("transaction_type", "unknown") or "unknown")
        dt = _parse_date(row)
        if dt:
            velocity.setdefault(tx_type, []).append(dt)
    for k in velocity:
        velocity[k].sort()
    return velocity


def _velocity_flag(tx_type: str, tx_date: Optional[datetime], velocity_map: dict,
                   window_days: int = 7, threshold: int = 5) -> bool:
    """True if ≥ threshold transactions of same type occur within window_days."""
    if tx_date is None or tx_type not in velocity_map:
        return False
    window_start = tx_date - timedelta(days=window_days)
    dates_in_window = [d for d in velocity_map[tx_type]
                       if window_start <= d <= tx_date + timedelta(days=window_days)]
    return len(dates_in_window) >= threshold


def _anomaly_z(amount: float, tx_type: str, peer_stats: dict) -> Optional[float]:
    """Return Z-score for amount vs peers of same type."""
    ps = peer_stats.get(str(tx_type))
    if ps is None or ps["std"] == 0:
        return None
    return (amount - ps["mean"]) / ps["std"]


def _score_row(row, peer_stats: dict, velocity_map: dict) -> dict:
    flags  = []
    score  = 0.0
    amount = _safe_amount(row)
    tx_type = str(row.get("transaction_type", "") or "")
    tx_date = _parse_date(row)

    # ── Round number flag ─────────────────────────────────────────────────────
    if amount is not None and amount >= 500 and (amount % 1000 == 0):
        flags.append("round_number")
        score += 0.15

    # ── Just below AML reporting limit ───────────────────────────────────────
    if amount is not None and 8_500 <= amount <= 9_999:
        flags.append("just_below_limit")
        score += 0.40

    # ── Velocity flag ─────────────────────────────────────────────────────────
    if _velocity_flag(tx_type, tx_date, velocity_map):
        flags.append("velocity")
        score += 0.20

    # ── Anomaly (Z-score) ─────────────────────────────────────────────────────
    z = None
    anomaly_flag = False
    if amount is not None:
        z = _anomaly_z(amount, tx_type, peer_stats)
        if z is not None and abs(z) >= 2.5:
            anomaly_flag = True
            flags.append("anomaly")
            score += min(0.25, abs(z) / 5.0 * 0.25)

    score = round(min(score, 1.0), 4)

    return {
        "aml_risk_score": score,
        "aml_flags":      json.dumps(flags),
        "anomaly_score":  round(z, 4) if z is not None else None,
        "anomaly_flag":   anomaly_flag,
    }
