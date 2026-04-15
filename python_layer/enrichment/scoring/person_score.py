"""
enrichment/scoring/person_score.py
-------------------------------------
Phase D — Score a person_enrichment row.

Contract: score(row: dict) -> dict
  risk_score        0–100  higher = more risk
  quality_score     0–100  higher = more enrichment fields populated
  intelligence_score 0–100 composite signal depth score
  top_flags         list[str]  ordered by severity
  score_reasoning   str        human-readable summary for copilot
"""

from typing import Any


def score(row: dict) -> dict:
    """Score a single person_enrichment dict."""
    flags: list[str] = []
    risk   = 0.0
    filled = 0
    total  = 0

    # ── Phase C risk signals ─────────────────────────────────────────────────
    if _truthy(row.get("sanctions_hit")):
        flags.append("sanctions_hit")
        risk += 50.0

    if _truthy(row.get("pep_flag")):
        flags.append("pep_flag")
        risk += 25.0

    sanction_score = _float(row.get("sanctions_score"), 0.0)
    if sanction_score and sanction_score >= 0.85:
        if "sanctions_hit" not in flags:
            flags.append("sanctions_near_match")
            risk += 15.0

    # ── Phase A quality signals ──────────────────────────────────────────────
    phone_valid = row.get("phone_valid")
    total += 1
    if phone_valid is True:
        filled += 1
    elif phone_valid is False:
        flags.append("invalid_phone")
        risk += 5.0

    email_valid = row.get("email_valid")
    total += 1
    if email_valid is True:
        filled += 1
    elif email_valid is False:
        flags.append("invalid_email")
        risk += 5.0

    if _truthy(row.get("email_disposable")):
        flags.append("disposable_email")
        risk += 8.0

    # ── Phase A completeness ─────────────────────────────────────────────────
    for field in ("phone_e164", "email_domain", "person_type", "person_name"):
        total += 1
        if row.get(field):
            filled += 1

    # ── Phase B completeness ─────────────────────────────────────────────────
    if row.get("npi_number"):
        filled += 1
    total += 1

    # ── Phase C completeness ─────────────────────────────────────────────────
    if row.get("sanctions_checked_at"):
        filled += 1
    total += 1

    # ── Phase E: churn / CLV risk signals ────────────────────────────────────
    churn = _float(row.get("churn_probability"), 0.0)
    if churn >= 70:
        flags.append("high_churn_risk")
        risk += 8.0
    elif churn >= 40:
        flags.append("medium_churn_risk")
        risk += 3.0

    clv = str(row.get("clv_segment", "") or "")
    if clv == "inactive":
        flags.append("inactive_client")
        risk += 5.0

    spend = str(row.get("spend_trend", "") or "")
    if spend == "falling":
        flags.append("declining_spend")
        risk += 4.0

    # Phase E completeness
    for field in ("spend_trend", "churn_probability", "clv_segment"):
        total += 1
        if row.get(field) is not None:
            filled += 1

    risk_score        = round(min(risk, 100.0), 1)
    quality_score     = round((filled / total * 100) if total else 0.0, 1)
    intelligence_score = round((quality_score * 0.4 + (100 - risk_score) * 0.6), 1)

    return {
        "risk_score":          risk_score,
        "quality_score":       quality_score,
        "intelligence_score":  intelligence_score,
        "top_flags":           flags[:5],
        "score_reasoning":     _reason("person", risk_score, quality_score, flags),
    }


def _truthy(val: Any) -> bool:
    return val is True or str(val).lower() in ("true", "1", "yes")

def _float(val: Any, default: float = 0.0) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return default

def _reason(entity: str, risk: float, quality: float, flags: list) -> str:
    parts = []
    if risk >= 50:
        parts.append(f"HIGH RISK — {', '.join(flags[:3])}")
    elif risk >= 20:
        parts.append(f"MEDIUM RISK — {', '.join(flags[:3])}")
    else:
        parts.append("LOW RISK")
    parts.append(f"data quality {quality:.0f}%")
    return ". ".join(parts)
