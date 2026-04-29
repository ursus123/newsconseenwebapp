"""
ingestion/profiler.py
Structural analysis of extracted columns.

Produces per-column stats that feed the LLM analyser as evidence,
removing the need for the LLM to guess from names alone.
"""
import re
import logging
from typing import Any

logger = logging.getLogger(__name__)

# ── Regex patterns for value-level signal detection ──────────────────────────
_RX_EMAIL    = re.compile(r"^[\w.+-]+@[\w.-]+\.\w{2,}$")
_RX_PHONE    = re.compile(r"^[\+\d\s\-\(\)]{7,20}$")
_RX_DATE     = re.compile(r"^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$")
_RX_CURRENCY = re.compile(r"^[\$€£¥₦₹₸]?\s*[\d,]+\.?\d*$")
_RX_ID       = re.compile(r"^[A-Z0-9\-_]{3,30}$")
_RX_URL      = re.compile(r"^https?://")


def _detect_signals(values: list[Any]) -> list[str]:
    """Return a list of pattern signal names detected in the non-null values."""
    non_null = [str(v).strip() for v in values if v is not None and str(v).strip() not in ("", "nan", "None")]
    if not non_null:
        return ["all_null"]

    signals = []
    sample  = non_null[:20]

    email_hits    = sum(1 for v in sample if _RX_EMAIL.match(v))
    phone_hits    = sum(1 for v in sample if _RX_PHONE.match(v))
    date_hits     = sum(1 for v in sample if _RX_DATE.match(v))
    currency_hits = sum(1 for v in sample if _RX_CURRENCY.match(v))
    id_hits       = sum(1 for v in sample if _RX_ID.match(v))
    url_hits      = sum(1 for v in sample if _RX_URL.match(v))

    threshold = max(1, len(sample) // 3)

    if email_hits    >= threshold: signals.append("looks_like_email")
    if phone_hits    >= threshold: signals.append("looks_like_phone")
    if date_hits     >= threshold: signals.append("looks_like_date")
    if currency_hits >= threshold: signals.append("looks_like_currency")
    if url_hits      >= threshold: signals.append("looks_like_url")

    # Numeric check
    numeric_hits = sum(1 for v in sample if _try_float(v))
    if numeric_hits >= threshold:
        signals.append("numeric")
    else:
        # Name/text signals
        space_hits = sum(1 for v in sample if " " in v)
        if space_hits >= threshold:
            signals.append("multi_word")            # likely full names or addresses
        title_hits = sum(1 for v in sample if v.istitle() or v[0].isupper())
        if title_hits >= threshold:
            signals.append("title_case")            # likely proper nouns

        if id_hits >= threshold and not signals:
            signals.append("looks_like_id")

    return signals or ["text"]


def _try_float(v: str) -> bool:
    try:
        float(v.replace(",", ""))
        return True
    except (ValueError, AttributeError):
        return False


def _cardinality(values: list[Any]) -> str:
    non_null = [v for v in values if v is not None]
    if not non_null:
        return "empty"
    unique_ratio = len(set(str(v) for v in non_null)) / len(non_null)
    if unique_ratio > 0.9:
        return "high"
    if unique_ratio > 0.2:
        return "medium"
    return "low"                    # low cardinality → likely a category/status field


def _is_foreign_ref(col: str, values: list[Any], all_columns: list[str]) -> bool:
    """
    Heuristic: column looks like a reference to another entity if:
    - Name ends with _id, _name, _ref, or matches another column stem
    - Values repeat with medium cardinality (i.e. not unique per row)
    """
    col_lower = col.lower()
    if any(col_lower.endswith(sfx) for sfx in ("_id", "_ref", "_code", "_key")):
        return True
    # Check if the values of this column appear to reference column name stems
    non_null = [str(v) for v in values if v is not None]
    if not non_null:
        return False
    unique_ratio = len(set(non_null)) / len(non_null)
    # Medium cardinality string column with matching sibling columns
    if 0.05 < unique_ratio < 0.8:
        stems = [c.lower().replace("_name", "").replace("_id", "") for c in all_columns]
        if any(s in col_lower for s in stems if s and s != col_lower):
            return True
    return False


def profile(columns: list[str], rows: list[dict]) -> list[dict]:
    """
    Returns a list of column profiles:
    [
      {
        "column":          str,
        "inferred_type":   str,   # "text" | "number" | "date" | "email" | "phone" | ...
        "cardinality":     str,   # "high" | "medium" | "low" | "empty"
        "null_rate":       float,
        "sample_values":   [str],
        "pattern_signals": [str],
        "foreign_ref":     bool,
      }
    ]
    """
    if not rows:
        return [{"column": c, "inferred_type": "text", "cardinality": "empty",
                 "null_rate": 1.0, "sample_values": [], "pattern_signals": [], "foreign_ref": False}
                for c in columns]

    profiles = []
    for col in columns:
        values = [row.get(col) for row in rows]
        non_null = [v for v in values if v is not None]
        null_rate = 1.0 - len(non_null) / len(values) if values else 1.0
        sample = [str(v) for v in non_null[:8]]
        signals = _detect_signals(values)
        cardinality = _cardinality(values)
        foreign_ref = _is_foreign_ref(col, values, columns)

        # Derive inferred_type from signals
        if "looks_like_email"    in signals: inferred_type = "email"
        elif "looks_like_phone"  in signals: inferred_type = "phone"
        elif "looks_like_date"   in signals: inferred_type = "date"
        elif "looks_like_currency" in signals: inferred_type = "currency"
        elif "looks_like_url"    in signals: inferred_type = "url"
        elif "numeric"           in signals: inferred_type = "number"
        elif cardinality == "low":           inferred_type = "category"
        elif "multi_word"        in signals: inferred_type = "text_multi_word"
        elif "looks_like_id"     in signals: inferred_type = "identifier"
        else:                                inferred_type = "text"

        profiles.append({
            "column":          col,
            "inferred_type":   inferred_type,
            "cardinality":     cardinality,
            "null_rate":       round(null_rate, 3),
            "sample_values":   sample,
            "pattern_signals": signals,
            "foreign_ref":     foreign_ref,
        })

    return profiles
