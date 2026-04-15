"""
enrichment/transaction_enrich.py
----------------------------------
Enrich Transaction records with:
  Phase A: FX normalisation to USD (open.er-api.com, 24h cached)
  Phase C: AML risk flags (pure Python — round number, velocity, anomaly Z-score)

Writes to analytics.transaction_enrichment — one row per transaction.
"""

import logging
import datetime
import pandas as pd

from enrichment.exchange_rates import convert_to_usd

logger = logging.getLogger(__name__)


def enrich_transactions(transactions_df: pd.DataFrame, company_id: str, force: bool = False, **_kwargs) -> pd.DataFrame:
    """
    For each transaction in company_id:
      Phase A: convert amount to USD using live FX rates.
      Phase C: compute AML flags using batch peer context.

    Returns DataFrame ready for analytics.transaction_enrichment.
    """
    if transactions_df.empty:
        return pd.DataFrame()

    txs = transactions_df[transactions_df["company_id"] == company_id].copy() \
          if "company_id" in transactions_df.columns else transactions_df.copy()
    if txs.empty:
        return pd.DataFrame()

    # ── Phase C: pre-compute AML batch context (needs all rows at once) ───────
    aml_results: list = []
    try:
        from enrichment.compliance.aml_flags import compute_aml_batch
        aml_results = compute_aml_batch(transactions_df, company_id)
    except Exception as _ae:
        logger.debug("transaction Phase C AML skipped: %s", _ae)
    # Pad to length of txs in case batch returned fewer rows
    while len(aml_results) < len(txs):
        aml_results.append({})

    # ── Phase E: pre-compute temporal batch (recurrence, seasonal, prior-tx) ──
    temporal_results: list = []
    try:
        from enrichment.temporal.transaction_temporal import compute_transaction_temporal_batch
        temporal_results = compute_transaction_temporal_batch(txs)
    except Exception as _te:
        logger.debug("transaction Phase E temporal skipped: %s", _te)
    while len(temporal_results) < len(txs):
        temporal_results.append({})

    today = datetime.date.today().isoformat()
    rows  = []

    for idx, (_, t) in enumerate(txs.iterrows()):
        amount_raw = t.get("amount", 0)
        currency   = str(t.get("currency") or t.get("currency_code") or "USD").upper().strip()

        row: dict = {
            "company_id":        company_id,
            "transaction_id":    str(t.get("id", "") or ""),
            "transaction_type":  str(t.get("transaction_type", "") or ""),
            "status":            str(t.get("status", "") or ""),
            "base_currency":     currency,
        }

        # ── Phase A: FX conversion ────────────────────────────────────────────
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

        # ── Phase C: AML flags ────────────────────────────────────────────────
        aml = aml_results[idx] if idx < len(aml_results) else {}
        if aml:
            row["aml_risk_score"] = aml.get("aml_risk_score", 0.0)
            row["aml_flags"]      = aml.get("aml_flags", "[]")
            row["anomaly_score"]  = aml.get("anomaly_score")
            row["anomaly_flag"]   = aml.get("anomaly_flag", False)

        # ── Phase E: temporal signals ─────────────────────────────────────────
        temporal = temporal_results[idx] if idx < len(temporal_results) else {}
        if temporal:
            row.update(temporal)

        row["enriched_at"] = pd.Timestamp.now(tz="UTC").isoformat()
        rows.append(row)

    logger.info("transaction_enrich: %d transactions processed (company=%s)", len(rows), company_id)
    return pd.DataFrame(rows)
