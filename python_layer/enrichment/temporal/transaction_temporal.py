"""
enrichment/temporal/transaction_temporal.py
---------------------------------------------
Phase E: Predictive & Temporal Intelligence for Transaction entities.

Signals produced:
  is_recurring          bool — same amount + counterparty seen ≥2 times
  recurrence_count      integer — how many times this pattern has repeated
  seasonal_flag         Q1 | Q2 | Q3 | Q4 — calendar quarter of the transaction
  days_since_prior_tx   integer — days between this transaction and the previous one
                        from the same counterparty (or person)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import pandas as pd

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Batch entry point (processes all transactions for a company at once)
# ---------------------------------------------------------------------------

def compute_transaction_temporal_batch(transactions_df: pd.DataFrame) -> list[dict]:
    """
    Process all transactions for a company in a single pass.
    Returns a list of Phase E dicts, parallel to the input DataFrame rows.
    """
    results: list[dict] = []

    if transactions_df is None or transactions_df.empty:
        return results

    try:
        df = transactions_df.copy()

        # Parse dates
        date_col = _find_date_col(df)
        if date_col:
            df["_date"] = pd.to_datetime(df[date_col], errors="coerce", utc=True)
        else:
            # No date info — return blanks
            blank = _blank_row()
            return [blank] * len(df)

        amt_col = _find_amount_col(df)
        counterparty_col = _find_counterparty_col(df)

        # Build recurrence map: (amount_bucket, counterparty) → count
        recurrence_map = _build_recurrence_map(df, amt_col, counterparty_col)

        # Build prior-tx map: counterparty → sorted dates list
        prior_tx_map = _build_prior_tx_map(df, counterparty_col)

        for idx, row in df.iterrows():
            r = _blank_row()

            # Seasonal flag
            dt = row.get("_date")
            if pd.notna(dt):
                month = dt.month
                r["seasonal_flag"] = f"Q{(month - 1) // 3 + 1}"

                # Days since prior transaction from same counterparty
                cp = _get_counterparty(row, counterparty_col)
                if cp and cp in prior_tx_map:
                    dates = prior_tx_map[cp]
                    # Find the most recent date strictly before this one
                    prior = [d for d in dates if d < dt]
                    if prior:
                        r["days_since_prior_tx"] = (dt - max(prior)).days

            # Recurrence
            key = _recurrence_key(row, amt_col, counterparty_col)
            if key in recurrence_map:
                count = recurrence_map[key]
                r["is_recurring"] = count >= 2
                r["recurrence_count"] = count
            else:
                r["is_recurring"] = False
                r["recurrence_count"] = 1

            results.append(r)

    except Exception as exc:
        logger.warning("transaction_temporal: batch failed — %s", exc)
        results = [_blank_row()] * len(transactions_df)

    return results


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _blank_row() -> dict:
    return {
        "is_recurring": None,
        "recurrence_count": None,
        "seasonal_flag": None,
        "days_since_prior_tx": None,
    }


def _build_recurrence_map(
    df: pd.DataFrame,
    amt_col: str | None,
    counterparty_col: str | None,
) -> dict[tuple, int]:
    """
    Count occurrences of (amount_bucket, counterparty) pairs.
    Amount is bucketed to ±5% tolerance to catch near-identical recurring amounts.
    """
    counts: dict[tuple, int] = {}
    for _, row in df.iterrows():
        key = _recurrence_key(row, amt_col, counterparty_col)
        counts[key] = counts.get(key, 0) + 1
    return counts


def _recurrence_key(
    row: pd.Series,
    amt_col: str | None,
    counterparty_col: str | None,
) -> tuple:
    amt_bucket = None
    if amt_col and pd.notna(row.get(amt_col)):
        try:
            amt = float(row[amt_col])
            # Round to nearest 5% bucket (log scale bucket would be better but overkill)
            amt_bucket = round(amt / max(amt * 0.05, 1)) * max(int(amt * 0.05), 1)
        except (TypeError, ValueError):
            pass
    cp = _get_counterparty(row, counterparty_col)
    return (amt_bucket, cp)


def _build_prior_tx_map(
    df: pd.DataFrame,
    counterparty_col: str | None,
) -> dict[str, list]:
    """Map counterparty → sorted list of transaction datetimes."""
    mapping: dict[str, list] = {}
    if "_date" not in df.columns:
        return mapping
    for _, row in df.iterrows():
        cp = _get_counterparty(row, counterparty_col)
        if not cp:
            continue
        dt = row.get("_date")
        if pd.notna(dt):
            mapping.setdefault(cp, []).append(dt)
    for cp in mapping:
        mapping[cp] = sorted(mapping[cp])
    return mapping


def _get_counterparty(row: pd.Series, col: str | None) -> str | None:
    if col and pd.notna(row.get(col)):
        v = str(row[col]).strip()
        return v if v else None
    return None


def _find_date_col(df: pd.DataFrame) -> str | None:
    for col in ("created_date", "transaction_date", "date", "created_at"):
        if col in df.columns:
            return col
    return None


def _find_amount_col(df: pd.DataFrame) -> str | None:
    for col in ("amount_usd", "amount_original", "amount", "total"):
        if col in df.columns:
            return col
    return None


def _find_counterparty_col(df: pd.DataFrame) -> str | None:
    for col in ("person_id", "enterprise_id", "counterparty_id", "vendor_id", "client_id"):
        if col in df.columns:
            return col
    return None
