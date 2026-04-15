"""
enrichment/transaction_enrich.py
----------------------------------
Enrich Transaction records with FX normalisation to USD.
Writes to analytics.transaction_enrichment — one row per transaction.
"""

import logging
import datetime
import pandas as pd

from enrichment.exchange_rates import convert_to_usd

logger = logging.getLogger(__name__)


def enrich_transactions(transactions_df: pd.DataFrame, company_id: str, force: bool = False) -> pd.DataFrame:
    """
    For each transaction in company_id: convert amount to USD using live FX rates.
    Returns DataFrame ready for analytics.transaction_enrichment.
    """
    if transactions_df.empty:
        return pd.DataFrame()

    txs = transactions_df[transactions_df["company_id"] == company_id].copy() \
          if "company_id" in transactions_df.columns else transactions_df.copy()
    if txs.empty:
        return pd.DataFrame()

    today = datetime.date.today().isoformat()
    rows  = []

    for _, t in txs.iterrows():
        amount_raw = t.get("amount", 0)
        currency   = str(t.get("currency") or t.get("currency_code") or "USD").upper().strip()

        row: dict = {
            "company_id":        company_id,
            "transaction_id":    str(t.get("id", "") or ""),
            "transaction_type":  str(t.get("transaction_type", "") or ""),
            "status":            str(t.get("status", "") or ""),
            "base_currency":     currency,
        }

        try:
            amount_f = float(str(amount_raw).replace(",", "") or 0)
            row["amount_original"] = round(amount_f, 4)

            if currency == "USD" or not currency:
                row["amount_usd"]  = round(amount_f, 4)
                row["fx_rate"]     = 1.0
                row["fx_date"]     = today
                row["enrichment_status"] = "enriched"
            else:
                amount_usd, fx_rate = convert_to_usd(amount_f, currency)
                if amount_usd is not None:
                    row["amount_usd"]  = amount_usd
                    row["fx_rate"]     = fx_rate
                    row["fx_date"]     = today
                    row["enrichment_status"] = "enriched"
                else:
                    row["amount_usd"]  = None
                    row["fx_rate"]     = None
                    row["fx_date"]     = None
                    row["enrichment_status"] = "fx_not_found"

        except (ValueError, TypeError) as e:
            row["enrichment_status"] = "parse_error"
            row["reason"]            = str(e)[:120]

        row["enriched_at"] = pd.Timestamp.now(tz="UTC").isoformat()
        rows.append(row)

    logger.info("transaction_enrich: %d transactions processed (company=%s)", len(rows), company_id)
    return pd.DataFrame(rows)
