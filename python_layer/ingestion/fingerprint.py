"""
ingestion/fingerprint.py
Deterministic source fingerprint for schema-level memory recall.

The fingerprint is built from:
  1. Sorted column names (normalised)
  2. Type-pattern vector from profiler output

Two uploads of the same spreadsheet template (even with different data)
produce the same fingerprint, enabling the memory layer to recognise the
source and reuse the previous mapping without re-running the LLM.
"""
import hashlib
import json


def _normalise(col: str) -> str:
    """Lower-case, collapse whitespace and punctuation to underscores."""
    import re
    s = col.lower().strip()
    s = re.sub(r"[\s\-/\\\.]+", "_", s)
    s = re.sub(r"[^a-z0-9_]", "", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def generate(columns: list[str], profiles: list[dict]) -> str:
    """
    Return a 16-char hex fingerprint that is stable across row-content
    changes but changes whenever the column structure changes.

    Args:
        columns:  raw column names from the extractor
        profiles: output of profiler.profile()

    Returns:
        16-character lowercase hex string
    """
    norm_cols = sorted(_normalise(c) for c in columns)

    # Build a type-pattern vector keyed by normalised column name
    type_vec = {}
    for p in profiles:
        key = _normalise(p["column"])
        type_vec[key] = p.get("inferred_type", "text")

    fingerprint_payload = {
        "columns": norm_cols,
        "types":   [type_vec.get(c, "text") for c in norm_cols],
    }

    raw = json.dumps(fingerprint_payload, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]
