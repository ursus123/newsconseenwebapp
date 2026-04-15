"""
etl/ar_aging.py
---------------
analytics.ar_aging — accounts receivable aging report.

One row per (company_id, client_name, enterprise_name, transaction_id) for
every posted, unpaid revenue invoice.

Aging buckets (days overdue from due_date):
    current       not yet past due_date
    bucket_1_30   1–30 days overdue
    bucket_31_60  31–60 days overdue
    bucket_61_90  61–90 days overdue
    bucket_90plus 91+ days overdue

Also produces a per-company summary table analytics.ar_aging_summary with
aggregate bucket totals for the copilot and dashboard.

Columns produced (detail table):
    company_id
    transaction_id
    client_name          person_name on the transaction
    enterprise_name
    transaction_type
    invoice_date         transaction_date
    due_date
    amount
    days_overdue         0 if current, >0 if past due
    aging_bucket         current / 1_30 / 31_60 / 61_90 / 90plus

Columns produced (summary table — ar_aging_summary):
    company_id
    total_outstanding     sum of all unpaid posted revenue
    current_amount
    bucket_1_30_amount
    bucket_31_60_amount
    bucket_61_90_amount
    bucket_90plus_amount
    invoice_count
    oldest_invoice_days   max days_overdue across all records
"""

import logging

import pandas as pd

logger = logging.getLogger(__name__)

REVENUE_TYPES = {
    "service_fee", "tuition", "membership_fee", "donation",
    "tithe", "event_income", "grant", "sponsorship",
    "livestock_sale", "crop_sale", "product_sale",
    "rental_income", "interest_income", "refund_received",
}


def transform_ar_aging(transactions_df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Returns (detail_df, summary_df).

    detail_df → load to analytics.ar_aging
    summary_df → load to analytics.ar_aging_summary
    """
    now_ts = pd.Timestamp.now(tz="UTC")

    empty_detail  = _empty_detail()
    empty_summary = _empty_summary()

    if transactions_df.empty:
        return empty_detail, empty_summary

    tx = transactions_df.copy()
    tx["amount"] = pd.to_numeric(tx.get("amount", 0), errors="coerce").fillna(0)

    # Only posted revenue, unpaid
    tx_st = tx.get("status", pd.Series("", index=tx.index)).fillna("").str.lower().str.strip()
    tx_tt = tx.get("transaction_type", pd.Series("", index=tx.index)).fillna("").str.lower()
    pay_st = tx.get("payment_status", pd.Series("", index=tx.index)).fillna("").str.lower().str.strip()

    mask = (
        (tx_st == "posted")
        & tx_tt.isin(REVENUE_TYPES)
        & (pay_st != "paid")
    )
    ar = tx[mask].copy()

    if ar.empty:
        logger.info("transform_ar_aging: no unpaid posted revenue — AR is clean")
        return empty_detail, empty_summary

    # Parse dates
    ar["invoice_date"] = pd.to_datetime(
        ar.get("transaction_date", ar.get("created_date")), errors="coerce", utc=True
    )
    ar["due_date_dt"] = pd.to_datetime(ar.get("due_date"), errors="coerce", utc=True)

    # Days overdue (negative = not yet due)
    ar["days_overdue"] = ar["due_date_dt"].apply(
        lambda d: max(0, int((now_ts - d).total_seconds() // 86400)) if pd.notna(d) else 0
    )

    # Aging bucket
    def _bucket(days_ov, due_dt):
        if pd.isna(due_dt):
            return "current"
        if due_dt > now_ts:
            return "current"
        if days_ov <= 30:
            return "1_30"
        if days_ov <= 60:
            return "31_60"
        if days_ov <= 90:
            return "61_90"
        return "90plus"

    ar["aging_bucket"] = ar.apply(
        lambda r: _bucket(r["days_overdue"], r["due_date_dt"]), axis=1
    )

    # Build detail DataFrame
    detail = pd.DataFrame({
        "company_id":       ar.get("company_id",      pd.Series("", index=ar.index)).fillna(""),
        "transaction_id":   ar.get("id",               pd.Series("", index=ar.index)).fillna(""),
        "client_name":      ar.get("person_name",      pd.Series("", index=ar.index)).fillna(""),
        "enterprise_name":  ar.get("enterprise",       pd.Series("", index=ar.index)).fillna(""),
        "transaction_type": ar.get("transaction_type", pd.Series("", index=ar.index)).fillna(""),
        "invoice_date":     ar["invoice_date"].dt.strftime("%Y-%m-%d").where(ar["invoice_date"].notna(), ""),
        "due_date":         ar["due_date_dt"].dt.strftime("%Y-%m-%d").where(ar["due_date_dt"].notna(), ""),
        "amount":           ar["amount"].round(2),
        "days_overdue":     ar["days_overdue"],
        "aging_bucket":     ar["aging_bucket"],
    })

    # Build summary DataFrame — one row per company
    summary_rows = []
    for cid, grp in detail.groupby("company_id", dropna=True):
        def _bucket_sum(b):
            return round(float(grp.loc[grp["aging_bucket"] == b, "amount"].sum()), 2)

        summary_rows.append({
            "company_id":           cid,
            "total_outstanding":    round(float(grp["amount"].sum()), 2),
            "current_amount":       _bucket_sum("current"),
            "bucket_1_30_amount":   _bucket_sum("1_30"),
            "bucket_31_60_amount":  _bucket_sum("31_60"),
            "bucket_61_90_amount":  _bucket_sum("61_90"),
            "bucket_90plus_amount": _bucket_sum("90plus"),
            "invoice_count":        len(grp),
            "oldest_invoice_days":  int(grp["days_overdue"].max()),
        })

    summary = pd.DataFrame(summary_rows) if summary_rows else empty_summary

    logger.info(
        "transform_ar_aging: %d AR records across %d companies",
        len(detail), detail["company_id"].nunique(),
    )
    return detail, summary


def _empty_detail() -> pd.DataFrame:
    return pd.DataFrame(columns=[
        "company_id", "transaction_id", "client_name", "enterprise_name",
        "transaction_type", "invoice_date", "due_date",
        "amount", "days_overdue", "aging_bucket",
    ])


def _empty_summary() -> pd.DataFrame:
    return pd.DataFrame(columns=[
        "company_id", "total_outstanding", "current_amount",
        "bucket_1_30_amount", "bucket_31_60_amount",
        "bucket_61_90_amount", "bucket_90plus_amount",
        "invoice_count", "oldest_invoice_days",
    ])
