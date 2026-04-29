"""
ingestion/extractors/json_xml.py
Extracts JSON and XML files into flat rows.
"""
import io
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

_SAMPLE_ROWS   = 8
_MAX_ROWS      = 50_000   # max rows stored in rows_json and used for loading
_ANALYSIS_ROWS = 5_000    # max rows passed to profiler


def _flatten(obj: Any, prefix: str = "") -> dict:
    """Recursively flatten a nested dict/list into dot-notation keys."""
    items: dict = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f"{prefix}.{k}" if prefix else k
            if isinstance(v, (dict, list)):
                items.update(_flatten(v, key))
            else:
                items[key] = v
    elif isinstance(obj, list):
        for i, v in enumerate(obj[:5]):
            items.update(_flatten(v, f"{prefix}[{i}]"))
    else:
        items[prefix] = obj
    return items


def extract(file_bytes: bytes, filename: str) -> dict[str, Any]:
    fname = filename.lower()
    try:
        if fname.endswith(".json"):
            data = json.loads(file_bytes.decode("utf-8", errors="replace"))
            if isinstance(data, list):
                records = data
            elif isinstance(data, dict):
                for v in data.values():
                    if isinstance(v, list) and len(v) > 0:
                        records = v
                        break
                else:
                    records = [data]
            else:
                records = [{"value": data}]
        elif fname.endswith(".xml"):
            import xml.etree.ElementTree as ET
            root = ET.fromstring(file_bytes.decode("utf-8", errors="replace"))
            records = []
            for child in root:
                records.append({c.tag: c.text for c in child})
        else:
            raise ValueError(f"Unsupported format: {filename}")
    except Exception as e:
        raise ValueError(f"Could not parse '{filename}': {e}") from e

    total_row_count = len(records)
    records_capped  = records[:_MAX_ROWS]
    rows_capped     = total_row_count > _MAX_ROWS

    rows = [_flatten(r) for r in records_capped]
    if not rows:
        return {
            "columns": [], "rows": [], "row_count": 0, "rows_stored": 0,
            "rows_capped": False, "analysis_rows": [], "sample_rows": [],
        }

    columns = list(rows[0].keys())
    return {
        "columns":       columns,
        "rows":          rows,
        "row_count":     total_row_count,
        "rows_stored":   len(rows),
        "rows_capped":   rows_capped,
        "analysis_rows": rows[:_ANALYSIS_ROWS],
        "sample_rows":   rows[:_SAMPLE_ROWS],
    }
