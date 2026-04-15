"""
enrichment/temporal/enterprise_temporal.py
--------------------------------------------
Phase E: Predictive & Temporal Intelligence for Enterprise entities.

Signals produced:
  revenue_trend         rising | stable | falling (30d vs prior 30d transaction inflow)
  payment_behavior      always_on_time | sometimes_late | often_late
                        (derived from invoice due_date vs payment created_date)
  avg_days_to_pay       float — average days between invoice due date and payment date
  relationship_count    integer — number of active relationships for this enterprise
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

def enrich_enterprise_temporal(
    enterprise_row: dict,
    transactions_df: pd.DataFrame,
    relationships_df: pd.DataFrame | None = None,
) -> dict:
    """
    Given a single enterprise dict, the full transactions DataFrame for the company,
    and optionally the relationships DataFrame, return Phase E temporal fields.

    transactions_df expected columns (best-effort): enterprise_id, amount_usd,
    created_date, transaction_type, status, due_date.
    """
    result: dict = {
        "revenue_trend": None,
        "payment_behavior": None,
        "avg_days_to_pay": None,
        "relationship_count": None,
    }

    enterprise_id = enterprise_row.get("enterprise_id") or enterprise_row.get("id")
    if not enterprise_id:
        return result

    # ── Relationship count ────────────────────────────────────────────────
    if relationships_df is not None and not relationships_df.empty:
        try:
            rel_cols = {"entity_a_id", "entity_b_id"}
            if rel_cols.issubset(set(relationships_df.columns)):
                eid = str(enterprise_id)
                mask = (
                    (relationships_df["entity_a_id"].astype(str) == eid) |
                    (relationships_df["entity_b_id"].astype(str) == eid)
                )
                active_rels = relationships_df[mask]
                if "status" in active_rels.columns:
                    active_rels = active_rels[
                        active_rels["status"].astype(str).str.lower() == "active"
                    ]
                result["relationship_count"] = len(active_rels)
        except Exception as exc:
            logger.debug("enterprise_temporal: relationship_count — %s", exc)

    if transactions_df is None or transactions_df.empty:
        return result

    try:
        # Filter to this enterprise's transactions
        eid_col = _find_enterprise_col(transactions_df)
        if eid_col is None:
            return result

        etx = transactions_df[
            transactions_df[eid_col].astype(str) == str(enterprise_id)
        ].copy()

        if etx.empty:
            return result

        # Parse dates
        date_col = _find_date_col(etx)
        if not date_col:
            return result

        etx["_date"] = pd.to_datetime(etx[date_col], errors="coerce", utc=True)
        etx = etx.dropna(subset=["_date"])
        if etx.empty:
            return result

        now = _now()
        cutoff_30 = now - timedelta(days=30)
        cutoff_60 = now - timedelta(days=60)
        amt_col = _find_amount_col(etx)

        # Revenue trend
        recent = etx[etx["_date"] >= cutoff_30]
        prior = etx[(etx["_date"] >= cutoff_60) & (etx["_date"] < cutoff_30)]

        vol_30 = float(recent[amt_col].sum()) if amt_col else 0.0
        vol_prior = float(prior[amt_col].sum()) if amt_col else 0.0

        if vol_prior == 0 and vol_30 == 0:
            result["revenue_trend"] = "stable"
        elif vol_prior == 0:
            result["revenue_trend"] = "rising"
        else:
            pct = (vol_30 - vol_prior) / vol_prior * 100
            result["revenue_trend"] = "rising" if pct >= 10 else ("falling" if pct <= -10 else "stable")

        # Payment behavior — invoices vs payments
        result["payment_behavior"], result["avg_days_to_pay"] = _payment_behavior(etx)

    except Exception as exc:
        logger.debug("enterprise_temporal: enterprise_id=%s — %s", enterprise_id, exc)

    return result


# ---------------------------------------------------------------------------
# Payment behavior
# ---------------------------------------------------------------------------

def _payment_behavior(etx: pd.DataFrame) -> tuple[str | None, float | None]:
    """
    Compare invoice due_date to payment created_date to determine payment discipline.
    Returns (behavior_label, avg_days_to_pay).
    """
    due_col = None
    for c in ("due_date", "payment_due_date"):
        if c in etx.columns:
            due_col = c
            break

    if due_col is None:
        return None, None

    # Filter to payment transactions only
    pay_types = {"payment", "invoice_payment", "settlement", "paid"}
    type_col = None
    for c in ("transaction_type", "type", "status"):
        if c in etx.columns:
            type_col = c
            break

    payments = etx.copy()
    if type_col:
        payments = payments[
            payments[type_col].astype(str).str.lower().isin(pay_types)
        ]

    if payments.empty:
        return None, None

    try:
        payments["_due"] = pd.to_datetime(payments[due_col], errors="coerce", utc=True)
        date_col = _find_date_col(payments)
        if not date_col:
            return None, None
        payments["_paid"] = pd.to_datetime(payments[date_col], errors="coerce", utc=True)
        payments = payments.dropna(subset=["_due", "_paid"])
        if payments.empty:
            return None, None

        payments["_days_late"] = (payments["_paid"] - payments["_due"]).dt.days
        avg_days = float(payments["_days_late"].mean())
        late_pct = (payments["_days_late"] > 0).mean() * 100

        if late_pct <= 10:
            behavior = "always_on_time"
        elif late_pct <= 40:
            behavior = "sometimes_late"
        else:
            behavior = "often_late"

        return behavior, round(avg_days, 1)

    except Exception as exc:
        logger.debug("enterprise_temporal: _payment_behavior — %s", exc)
        return None, None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_enterprise_col(df: pd.DataFrame) -> str | None:
    for col in ("enterprise_id", "counterparty_id", "vendor_id", "client_id"):
        if col in df.columns:
            return col
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
