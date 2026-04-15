"""
enrichment/scoring/enterprise_score.py
-----------------------------------------
Phase D — Score an enterprise_enrichment row.
"""

from typing import Any


def score(row: dict) -> dict:
    flags: list[str] = []
    risk   = 0.0
    filled = 0
    total  = 0

    # ── Phase C: sanctions ────────────────────────────────────────────────────
    if _truthy(row.get("sanctions_hit")):
        flags.append("sanctions_hit")
        risk += 45.0

    # ── Phase C: country risk ─────────────────────────────────────────────────
    crs = _float(row.get("country_risk_score"))
    if crs:
        label = str(row.get("country_risk_label", ""))
        if label == "very_high_risk":
            flags.append("very_high_country_risk")
            risk += 30.0
        elif label == "high_risk":
            flags.append("high_country_risk")
            risk += 15.0
        elif label == "medium_risk":
            risk += 5.0

    # ── Phase C: news sentiment ───────────────────────────────────────────────
    sentiment = str(row.get("news_sentiment", "") or "")
    if sentiment == "negative":
        flags.append("negative_news")
        risk += 10.0
    count = _int(row.get("news_mention_count"))
    if count and count >= 5 and sentiment == "negative":
        flags.append("high_negative_media")
        risk += 5.0  # extra weight for many negative mentions

    # ── Phase A completeness ─────────────────────────────────────────────────
    for field in ("reg_number", "reg_status", "jurisdiction",
                  "incorporation_date", "registered_address"):
        total += 1
        if row.get(field):
            filled += 1
        else:
            if field in ("reg_number", "reg_status"):
                flags.append(f"missing_{field}") if f"missing_{field}" not in flags else None

    # ── Phase C completeness ─────────────────────────────────────────────────
    for field in ("sanctions_checked_at", "country_risk_score", "news_mention_count"):
        total += 1
        if row.get(field) is not None:
            filled += 1

    for field in ("enterprise_name", "enterprise_type", "country"):
        total += 1
        if row.get(field):
            filled += 1

    # ── Phase E: payment behaviour risk signals ───────────────────────────────
    payment = str(row.get("payment_behavior", "") or "")
    if payment == "often_late":
        flags.append("often_late_payer")
        risk += 12.0
    elif payment == "sometimes_late":
        flags.append("sometimes_late_payer")
        risk += 5.0

    revenue = str(row.get("revenue_trend", "") or "")
    if revenue == "falling":
        flags.append("declining_revenue")
        risk += 6.0

    # Phase E completeness
    for field in ("revenue_trend", "payment_behavior", "relationship_count"):
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
        "score_reasoning":     _reason(risk_score, quality_score, flags),
    }


def _truthy(val: Any) -> bool:
    return val is True or str(val).lower() in ("true", "1", "yes")

def _float(val: Any, default: float = 0.0) -> float:
    try:
        return float(val) if val is not None else default
    except (TypeError, ValueError):
        return default

def _int(val: Any) -> int:
    try:
        return int(val) if val is not None else 0
    except (TypeError, ValueError):
        return 0

def _reason(risk: float, quality: float, flags: list) -> str:
    level = "HIGH RISK" if risk >= 50 else "MEDIUM RISK" if risk >= 20 else "LOW RISK"
    flag_str = (", ".join(flags[:3])) if flags else "no major flags"
    return f"{level} — {flag_str}. Data quality {quality:.0f}%."
