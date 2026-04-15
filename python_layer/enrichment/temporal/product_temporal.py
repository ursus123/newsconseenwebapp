"""
enrichment/temporal/product_temporal.py
-----------------------------------------
Phase E: Predictive & Temporal Intelligence for Product entities.

Signals produced:
  demand_trend          rising | stable | falling (units sold 30d vs prior 30d)
  velocity_change_pct   float — % change in sell-through rate
  days_of_stock         integer — estimated days of remaining stock at current velocity
  stockout_risk         high | medium | low | none
  demand_forecast_30d   float — projected units sold next 30 days (naive linear)
  last_sold_days        integer — days since last recorded sale
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

def enrich_product_temporal(
    product_row: dict,
    transactions_df: pd.DataFrame,
) -> dict:
    """
    Given a single product dict and the full transactions DataFrame for the company,
    return Phase E temporal fields.

    transactions_df expected columns (best-effort): product_id, quantity, amount_usd,
    created_date, transaction_type, status.
    """
    result: dict = {
        "demand_trend": None,
        "velocity_change_pct": None,
        "days_of_stock": None,
        "stockout_risk": None,
        "demand_forecast_30d": None,
        "last_sold_days": None,
    }

    if transactions_df is None or transactions_df.empty:
        return result

    product_id = product_row.get("product_id") or product_row.get("id")
    if not product_id:
        return result

    try:
        pid_col = _find_product_col(transactions_df)
        if pid_col is None:
            return result

        ptx = transactions_df[
            transactions_df[pid_col].astype(str) == str(product_id)
        ].copy()

        if ptx.empty:
            result["stockout_risk"] = "none"
            return result

        # Parse dates
        date_col = _find_date_col(ptx)
        if not date_col:
            return result

        ptx["_date"] = pd.to_datetime(ptx[date_col], errors="coerce", utc=True)
        ptx = ptx.dropna(subset=["_date"])
        if ptx.empty:
            return result

        # Filter to sale/outbound transactions only
        ptx = _filter_sales(ptx)

        now = _now()
        cutoff_30 = now - timedelta(days=30)
        cutoff_60 = now - timedelta(days=60)

        qty_col = _find_qty_col(ptx)

        recent = ptx[ptx["_date"] >= cutoff_30]
        prior = ptx[(ptx["_date"] >= cutoff_60) & (ptx["_date"] < cutoff_30)]

        # Units sold
        units_30 = float(recent[qty_col].sum()) if qty_col else float(len(recent))
        units_prior = float(prior[qty_col].sum()) if qty_col else float(len(prior))

        # Last sold
        latest = ptx["_date"].max()
        result["last_sold_days"] = (now - latest).days

        # Demand trend
        if units_prior == 0 and units_30 == 0:
            result["demand_trend"] = "stable"
            result["velocity_change_pct"] = 0.0
        elif units_prior == 0:
            result["demand_trend"] = "rising"
            result["velocity_change_pct"] = 100.0
        else:
            pct = (units_30 - units_prior) / units_prior * 100
            result["velocity_change_pct"] = round(pct, 1)
            result["demand_trend"] = "rising" if pct >= 10 else ("falling" if pct <= -10 else "stable")

        # Demand forecast (naive: extrapolate 30d rate)
        result["demand_forecast_30d"] = round(units_30, 1)

        # Days of stock and stockout risk
        current_stock = _get_stock(product_row)
        daily_velocity = units_30 / 30 if units_30 > 0 else 0.0

        if current_stock is not None and daily_velocity > 0:
            dos = int(current_stock / daily_velocity)
            result["days_of_stock"] = dos
            if dos <= 7:
                result["stockout_risk"] = "high"
            elif dos <= 21:
                result["stockout_risk"] = "medium"
            else:
                result["stockout_risk"] = "low"
        elif current_stock == 0:
            result["days_of_stock"] = 0
            result["stockout_risk"] = "high"
        else:
            result["stockout_risk"] = "none"

    except Exception as exc:
        logger.debug("product_temporal: product_id=%s — %s", product_id, exc)

    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _filter_sales(df: pd.DataFrame) -> pd.DataFrame:
    """Keep only outbound / sale transaction rows."""
    sale_types = {"sale", "sales", "invoice", "outbound", "delivery", "dispatch", "sold"}
    type_col = None
    for c in ("transaction_type", "type"):
        if c in df.columns:
            type_col = c
            break
    if not type_col:
        return df
    mask = df[type_col].astype(str).str.lower().isin(sale_types)
    filtered = df[mask]
    return filtered if not filtered.empty else df  # fallback: use all rows


def _get_stock(row: dict) -> float | None:
    for k in ("stock_quantity", "quantity_in_stock", "inventory", "stock", "quantity"):
        v = row.get(k)
        if v is not None:
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    return None


def _find_product_col(df: pd.DataFrame) -> str | None:
    for col in ("product_id", "item_id", "sku_id"):
        if col in df.columns:
            return col
    return None


def _find_date_col(df: pd.DataFrame) -> str | None:
    for col in ("created_date", "transaction_date", "date", "created_at"):
        if col in df.columns:
            return col
    return None


def _find_qty_col(df: pd.DataFrame) -> str | None:
    for col in ("quantity", "qty", "units", "quantity_sold"):
        if col in df.columns:
            return col
    return None
