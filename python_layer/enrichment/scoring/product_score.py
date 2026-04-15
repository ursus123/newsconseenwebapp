"""
enrichment/scoring/product_score.py
--------------------------------------
Phase D — Score a product_enrichment row.
"""

from typing import Any


def score(row: dict) -> dict:
    flags: list[str] = []
    risk   = 0.0
    filled = 0
    total  = 0

    # ── Phase B: recall risk (vehicles) ──────────────────────────────────────
    recall = _int(row.get("recall_count"))
    if recall and recall > 5:
        flags.append("high_recall_count")
        risk += 20.0
    elif recall and recall > 0:
        flags.append("has_recalls")
        risk += 8.0

    fda_recall = _int(row.get("fda_recall_count"))
    if fda_recall and fda_recall > 0:
        flags.append("fda_recalls")
        risk += 15.0

    # ── Phase B: hazardous chemicals ─────────────────────────────────────────
    ghs = str(row.get("chem_ghs_hazard", "") or "")
    if ghs and len(ghs) > 2:
        flags.append("ghs_hazard_present")
        risk += 10.0

    # ── Phase B: controlled medication ───────────────────────────────────────
    drug_class = str(row.get("drug_class", "") or "").lower()
    if any(kw in drug_class for kw in ("narcotic", "opioid", "controlled", "schedule")):
        flags.append("controlled_substance")
        risk += 20.0

    # ── Phase B: device safety class ─────────────────────────────────────────
    fda_class = str(row.get("fda_device_class", "") or "")
    if fda_class == "III":
        flags.append("high_risk_device_class_III")
        risk += 15.0
    elif fda_class == "II":
        risk += 3.0

    # ── Phase A completeness ─────────────────────────────────────────────────
    for field in ("product_name", "item_type", "item_class"):
        total += 1
        if row.get(field):
            filled += 1

    for field in ("barcode_name", "brand", "price_usd"):
        total += 1
        if row.get(field) is not None:
            filled += 1

    # ── Phase B completeness (at least one domain signal) ────────────────────
    domain_fields = [
        "drug_rxnorm_name", "food_description", "vehicle_make",
        "chem_formula", "fda_device_name", "pkg_name",
    ]
    total += 1
    if any(row.get(f) for f in domain_fields):
        filled += 1
    else:
        flags.append("no_domain_enrichment")

    # ── Phase E: demand / stockout risk signals ───────────────────────────────
    stockout = str(row.get("stockout_risk", "") or "")
    if stockout == "high":
        flags.append("stockout_imminent")
        risk += 15.0
    elif stockout == "medium":
        flags.append("stockout_risk")
        risk += 6.0

    demand = str(row.get("demand_trend", "") or "")
    if demand == "falling":
        flags.append("falling_demand")
        risk += 5.0

    dos = row.get("days_of_stock")
    if dos is not None and dos == 0:
        if "stockout_imminent" not in flags:
            flags.append("out_of_stock")
            risk += 20.0

    # Phase E completeness
    for field in ("demand_trend", "stockout_risk", "days_of_stock"):
        total += 1
        if row.get(field) is not None:
            filled += 1

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


def _int(val: Any) -> int:
    try:
        return int(val) if val is not None else 0
    except (TypeError, ValueError):
        return 0

def _reason(risk: float, quality: float, flags: list) -> str:
    level = "HIGH RISK" if risk >= 50 else "MEDIUM RISK" if risk >= 20 else "LOW RISK"
    flag_str = (", ".join(flags[:3])) if flags else "no major flags"
    return f"{level} — {flag_str}. Data quality {quality:.0f}%."
