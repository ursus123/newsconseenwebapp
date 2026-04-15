"""
enrichment/scoring/address_score.py
--------------------------------------
Phase D — Score an address_enrichment row.
"""

from typing import Any


def score(row: dict) -> dict:
    flags: list[str] = []
    risk   = 0.0
    filled = 0
    total  = 0

    # ── Phase C: country risk ─────────────────────────────────────────────────
    label = str(row.get("country_risk_label", "") or "")
    if label == "very_high_risk":
        flags.append("very_high_country_risk")
        risk += 35.0
    elif label == "high_risk":
        flags.append("high_country_risk")
        risk += 18.0
    elif label == "medium_risk":
        risk += 6.0

    crs = _float(row.get("country_risk_score"))
    total += 1
    if crs is not None and crs > 0:
        filled += 1

    # ── Phase A completeness ─────────────────────────────────────────────────
    for field in ("lat", "lon"):
        total += 1
        if row.get(field) is not None:
            filled += 1
        else:
            flags.append("no_geocoordinates") if "no_geocoordinates" not in flags else None

    for field in ("timezone", "country_code", "formatted_address"):
        total += 1
        if row.get(field):
            filled += 1

    for field in ("admin_level1", "admin_level2"):
        total += 1
        if row.get(field):
            filled += 1

    enrichment_status = str(row.get("enrichment_status", "") or "")
    if enrichment_status == "geocode_failed":
        flags.append("geocode_failed")
        risk += 5.0
    elif enrichment_status == "skipped":
        flags.append("no_address_data")
        risk += 5.0

    risk_score        = round(min(risk, 100.0), 1)
    quality_score     = round((filled / total * 100) if total else 0.0, 1)
    intelligence_score = round((quality_score * 0.5 + (100 - risk_score) * 0.5), 1)

    return {
        "risk_score":          risk_score,
        "quality_score":       quality_score,
        "intelligence_score":  intelligence_score,
        "top_flags":           flags[:5],
        "score_reasoning":     _reason(risk_score, quality_score, flags),
    }


def _float(val: Any):
    try:
        return float(val) if val is not None else None
    except (TypeError, ValueError):
        return None

def _reason(risk: float, quality: float, flags: list) -> str:
    level = "HIGH RISK" if risk >= 50 else "MEDIUM RISK" if risk >= 20 else "LOW RISK"
    flag_str = (", ".join(flags[:3])) if flags else "no major flags"
    return f"{level} — {flag_str}. Data quality {quality:.0f}%."
