"""
enrichment/compliance/country_risk.py
---------------------------------------
Phase C — Country risk score from World Bank Governance Indicators (WGI).

Source : World Bank Open Data API — https://api.worldbank.org/v2/
         Free, no API key required. CC BY 4.0.

WGI indicators used (6 dimensions of governance):
  RL  — Rule of Law
  CC  — Control of Corruption
  GE  — Government Effectiveness
  PV  — Political Stability and Absence of Violence/Terrorism
  RQ  — Regulatory Quality
  VA  — Voice and Accountability

Each indicator ranges from -2.5 (worst) to +2.5 (best).
Composite formula: ((avg + 2.5) / 5.0) * 100  → 0 (worst) to 100 (best).

Risk labels:
  80–100  very_low_risk
  65–80   low_risk
  50–65   medium_risk
  30–50   high_risk
  0–30    very_high_risk

Cache: per ISO-2 country code, 7 days (governance scores change annually).
Rate:  one HTTP call per country per 7 days.
"""

import logging
import time
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_WGI_CODES = ["RL", "CC", "GE", "PV", "RQ", "VA"]
_BASE_URL   = "https://api.worldbank.org/v2/country/{iso2}/indicator/WGI.{code}?format=json&mrv=1"
_CACHE_TTL  = 7 * 86_400   # 7 days

# {iso2_upper: {"score": float, "label": str, "loaded_at": float}}
_cache: dict = {}


def _label(score: float) -> str:
    if score >= 80:  return "very_low_risk"
    if score >= 65:  return "low_risk"
    if score >= 50:  return "medium_risk"
    if score >= 30:  return "high_risk"
    return "very_high_risk"


def _fetch_wgi(iso2: str) -> Optional[dict]:
    """Fetch all 6 WGI indicators for iso2, return composite score dict or None."""
    try:
        import urllib.request, json, time as _t
        values = []
        for code in _WGI_CODES:
            url = _BASE_URL.format(iso2=iso2.upper(), code=code)
            try:
                with urllib.request.urlopen(url, timeout=10) as resp:
                    data = json.loads(resp.read())
                # World Bank response: [metadata_dict, [records]]
                if isinstance(data, list) and len(data) > 1:
                    records = data[1]
                    if records:
                        val = records[0].get("value")
                        if val is not None:
                            values.append(float(val))
                _t.sleep(0.2)   # polite — stay well under WB rate limit
            except Exception:
                pass

        if not values:
            return None

        avg      = sum(values) / len(values)
        score    = round(((avg + 2.5) / 5.0) * 100, 1)
        score    = max(0.0, min(100.0, score))   # clamp
        return {
            "country_risk_score":            score,
            "country_governance_index":      round(avg, 4),
            "country_risk_label":            _label(score),
            "country_risk_indicators_used":  len(values),
        }
    except Exception as exc:
        logger.warning("country_risk: WGI fetch failed for %s — %s", iso2, exc)
        return None


def get_country_risk(iso2: str) -> dict:
    """
    Return governance risk score for a 2-letter ISO country code.

    Returns
    -------
    {
        country_risk_score       : float   0–100 (higher = safer)
        country_risk_label       : str     very_low_risk | low_risk | medium_risk | high_risk | very_high_risk
        country_governance_index : float   raw WGI composite (-2.5 to +2.5)
    }
    Empty dict if iso2 is blank or World Bank unavailable.
    """
    if not iso2 or len(iso2.strip()) < 2:
        return {}

    key = iso2.strip().upper()[:2]
    now = time.time()

    # Cache hit
    cached = _cache.get(key)
    if cached and (now - cached["loaded_at"]) < _CACHE_TTL:
        return {
            "country_risk_score":      cached["score"],
            "country_risk_label":      cached["label"],
            "country_governance_index": cached.get("governance_index", None),
        }

    result = _fetch_wgi(key)
    if result:
        _cache[key] = {
            "score":            result["country_risk_score"],
            "label":            result["country_risk_label"],
            "governance_index": result.get("country_governance_index"),
            "loaded_at":        now,
        }
        return {
            "country_risk_score":      result["country_risk_score"],
            "country_risk_label":      result["country_risk_label"],
            "country_governance_index": result.get("country_governance_index"),
        }

    return {}
