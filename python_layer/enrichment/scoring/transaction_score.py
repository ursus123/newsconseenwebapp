"""
enrichment/scoring/transaction_score.py
------------------------------------------
Phase D — Score a transaction_enrichment row.
"""

from typing import Any
import json


def score(row: dict) -> dict:
    flags: list[str] = []
    risk   = 0.0
    filled = 0
    total  = 0

    # ── Phase C: AML risk ─────────────────────────────────────────────────────
    aml_score = _float(row.get("aml_risk_score"))
    if aml_score >= 0.5:
        flags.append("high_aml_risk")
        risk += aml_score * 50.0
    elif aml_score >= 0.2:
        flags.append("elevated_aml_risk")
        risk += aml_score * 30.0

    # ── Phase C: AML flag decomposition ──────────────────────────────────────
    try:
        aml_flags = json.loads(row.get("aml_flags") or "[]")
        if "just_below_limit" in aml_flags:
            flags.append("structuring_suspected")
            risk += 20.0
        if "round_number" in aml_flags and "round_number" not in flags:
            flags.append("round_number_transaction")
        if "anomaly" in aml_flags:
            flags.append("statistical_outlier")
        if "velocity" in aml_flags:
            flags.append("velocity_burst")
    except (ValueError, TypeError):
        pass

    # ── Phase C: statistical anomaly ─────────────────────────────────────────
    if _truthy(row.get("anomaly_flag")):
        if "statistical_outlier" not in flags:
            flags.append("statistical_outlier")
        risk += 10.0

    # ── Phase A completeness ─────────────────────────────────────────────────
    for field in ("amount_usd", "fx_rate", "fx_date"):
        total += 1
        if row.get(field) is not None:
            filled += 1

    for field in ("transaction_type", "base_currency", "transaction_id"):
        total += 1
        if row.get(field):
            filled += 1

    # ── Phase C completeness ─────────────────────────────────────────────────
    total += 1
    if row.get("aml_risk_score") is not None:
        filled += 1

    enrichment_status = str(row.get("enrichment_status", "") or "")
    if enrichment_status == "fx_not_found":
        flags.append("fx_conversion_failed")

    # ── Phase E: recurrence & seasonal signals ────────────────────────────────
    is_recurring = row.get("is_recurring")
    if is_recurring is True:
        recurrence_count = _float(row.get("recurrence_count"), 0.0)
        if recurrence_count >= 5:
            flags.append("high_frequency_recurring")
        elif recurrence_count >= 2:
            flags.append("recurring_transaction")
        # Recurring transactions are not themselves high-risk, but improve intelligence
        # score by demonstrating predictable cash flow

    # Phase E completeness
    for field in ("is_recurring", "seasonal_flag", "days_since_prior_tx"):
        total += 1
        if row.get(field) is not None:
            filled += 1

    risk_score        = round(min(risk, 100.0), 1)
    quality_score     = round((filled / total * 100) if total else 0.0, 1)
    intelligence_score = round((quality_score * 0.3 + (100 - risk_score) * 0.7), 1)

    return {
        "risk_score":          risk_score,
        "quality_score":       quality_score,
        "intelligence_score":  intelligence_score,
        "top_flags":           flags[:5],
        "score_reasoning":     _reason(risk_score, quality_score, flags),
    }


def _float(val: Any, default: float = 0.0) -> float:
    try:
        return float(val) if val is not None else default
    except (TypeError, ValueError):
        return default

def _truthy(val: Any) -> bool:
    return val is True or str(val).lower() in ("true", "1", "yes")

def _reason(risk: float, quality: float, flags: list) -> str:
    level = "HIGH RISK" if risk >= 50 else "MEDIUM RISK" if risk >= 20 else "LOW RISK"
    flag_str = (", ".join(flags[:3])) if flags else "no major flags"
    return f"{level} — {flag_str}. Data quality {quality:.0f}%."
