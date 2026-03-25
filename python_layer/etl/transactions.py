import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_json_to_df
from config import settings

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Transaction type classification
# Mirrors the REVENUE_TYPES and EXPENSE_TYPES defined in
# src/config/transactionTypes.js on the frontend.
# Keep these two lists in sync when new types are added.
# ----------------------------------------------------------
REVENUE_TYPES = {
    "service_fee", "tuition", "membership_fee", "donation",
    "tithe", "event_income", "grant", "sponsorship",
    "livestock_sale", "crop_sale", "product_sale",
    "rental_income", "interest_income", "refund_received",
}

EXPENSE_TYPES = {
    "payroll", "contractor_payment", "rent_expense",
    "utility_expense", "supply_purchase", "equipment_purchase",
    "feed_purchase", "vet_expense", "medication_purchase",
    "insurance_expense", "tax_payment", "refund_issued",
    "ministry_expense", "travel_expense", "marketing_expense",
    "other_expense",
}

# Only these statuses represent committed financial reality.
# draft   — not yet approved, must not affect dashboards
# voided  — cancelled, must not affect dashboards
# reconciled — finalised, already counted in prior periods
# posted  — approved and outstanding, the only status we transform
POSTED_STATUS = "posted"

REQUIRED_COLUMNS = {"id", "status", "amount"}

GROUP_COLUMNS = [
    "enterprise_id",
    "company_id",
    "transaction_type",
    "status",
]


def extract_transactions() -> pd.DataFrame:
    """
    Extract all transaction records from Base44.
    Returns raw DataFrame — no transformation applied here.
    """
    return fetch_json_to_df(settings.base44_transactions_url)


def transform_transactions(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform posted transaction records into a financial summary
    suitable for appending to analytics.transaction_summary.

    IMPORTANT: Only transactions with status == "posted" are included.
    Draft, voided, and reconciled transactions are excluded before
    any metrics are calculated. This ensures dashboards reflect
    committed financial reality only.

    Produces per-group metrics:
        total_transactions  — count of posted transactions in this group
        total_amount        — sum of amounts in this group
        avg_amount          — mean amount within this type+status group
        outstanding_amount  — total posted revenue not yet reconciled
        is_revenue          — True if transaction_type is a revenue type
        is_expense          — True if transaction_type is an expense type
        revenue_last_7d     — posted revenue transactions in last 7 days
        revenue_last_30d    — posted revenue transactions in last 30 days
        expense_last_30d    — posted expense transactions in last 30 days

    Groups by: enterprise_id, company_id, transaction_type, status
    """
    if df.empty:
        logger.warning("transform_transactions: received empty DataFrame")
        return _empty_summary()

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        logger.error(
            "transform_transactions: missing required columns %s — returning empty",
            missing,
        )
        return _empty_summary()

    df = df.copy()

    # ----------------------------------------------------------
    # STATUS FILTER — posted only
    # This is the critical gate. Draft and voided transactions
    # must never reach the aggregation step.
    # ----------------------------------------------------------
    total_raw = len(df)
    df = df[df["status"].str.lower().str.strip() == POSTED_STATUS].copy()
    posted_count = len(df)

    logger.info(
        "transform_transactions: %d raw records → %d posted (filtered out %d draft/voided/reconciled)",
        total_raw, posted_count, total_raw - posted_count,
    )

    if df.empty:
        logger.warning(
            "transform_transactions: no posted transactions found — "
            "financial dashboards will show zero. "
            "Confirm transactions have been posted in Base44."
        )
        return _empty_summary()

    # ----------------------------------------------------------
    # Parse and clean numeric fields
    # ----------------------------------------------------------
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)

    # ----------------------------------------------------------
    # Parse dates
    # ----------------------------------------------------------
    now = datetime.now(timezone.utc)

    df["transaction_date"] = pd.to_datetime(
        df.get("transaction_date"), errors="coerce", utc=True
    )
    df["created_date"] = pd.to_datetime(
        df.get("created_date"), errors="coerce", utc=True
    )

    # Use transaction_date if available, fall back to created_date
    df["effective_date"] = df["transaction_date"].fillna(df["created_date"])

    # ----------------------------------------------------------
    # Classify transaction types
    # ----------------------------------------------------------
    tx_type = df.get("transaction_type", pd.Series("", index=df.index))

    df["is_revenue"] = tx_type.isin(REVENUE_TYPES)
    df["is_expense"] = tx_type.isin(EXPENSE_TYPES)

    # All posted revenue is outstanding (approved but not yet reconciled)
    df["outstanding_amount"] = df["amount"].where(df["is_revenue"], 0)

    # ----------------------------------------------------------
    # Windowed revenue/expense flags
    # ----------------------------------------------------------
    df["revenue_last_7d"] = (
        df["is_revenue"]
        & df["effective_date"].notna()
        & (df["effective_date"] >= now - pd.Timedelta(days=7))
    )

    df["revenue_last_30d"] = (
        df["is_revenue"]
        & df["effective_date"].notna()
        & (df["effective_date"] >= now - pd.Timedelta(days=30))
    )

    df["expense_last_30d"] = (
        df["is_expense"]
        & df["effective_date"].notna()
        & (df["effective_date"] >= now - pd.Timedelta(days=30))
    )

    # ----------------------------------------------------------
    # Safe groupBy
    # ----------------------------------------------------------
    group_cols = [c for c in GROUP_COLUMNS if c in df.columns]

    summary = (
        df.groupby(group_cols, dropna=False)
        .agg(
            total_transactions=("id", "count"),
            total_amount=("amount", "sum"),
            avg_amount=("amount", "mean"),
            outstanding_amount=("outstanding_amount", "sum"),
            revenue_last_7d=("revenue_last_7d", "sum"),
            revenue_last_30d=("revenue_last_30d", "sum"),
            expense_last_30d=("expense_last_30d", "sum"),
        )
        .reset_index()
    )

    # ----------------------------------------------------------
    # Re-derive classification columns after groupby
    # ----------------------------------------------------------
    if "transaction_type" in summary.columns:
        summary["is_revenue"] = summary["transaction_type"].isin(REVENUE_TYPES)
        summary["is_expense"] = summary["transaction_type"].isin(EXPENSE_TYPES)
    else:
        summary["is_revenue"] = False
        summary["is_expense"] = False

    # ----------------------------------------------------------
    # Round monetary columns to 2 decimal places
    # ----------------------------------------------------------
    for col in ["total_amount", "avg_amount", "outstanding_amount"]:
        summary[col] = summary[col].round(2).fillna(0.0)

    # Cast integer columns
    for col in ["total_transactions", "revenue_last_7d",
                "revenue_last_30d", "expense_last_30d"]:
        summary[col] = summary[col].fillna(0).astype(int)

    logger.info(
        "transform_transactions: produced %d summary rows from %d posted records",
        len(summary), posted_count,
    )

    return summary


def _empty_summary() -> pd.DataFrame:
    """
    Typed empty DataFrame matching the transform output schema.
    load_dataframe() skips writing this — no false zero snapshots.
    """
    return pd.DataFrame(columns=[
        "enterprise_id",
        "company_id",
        "transaction_type",
        "status",
        "total_transactions",
        "total_amount",
        "avg_amount",
        "outstanding_amount",
        "is_revenue",
        "is_expense",
        "revenue_last_7d",
        "revenue_last_30d",
        "expense_last_30d",
    ])
