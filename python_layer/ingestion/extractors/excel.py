"""
ingestion/extractors/excel.py
Extracts CSV and Excel files into a list of dicts + column metadata.
"""
import io
import logging
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

_SAMPLE_ROWS = 8
_MAX_ROWS    = 5000


def extract(file_bytes: bytes, filename: str) -> dict[str, Any]:
    """
    Parse CSV or Excel file.  Returns:
        {
          "columns": [str],
          "rows":    [dict],          # up to _MAX_ROWS
          "row_count": int,
          "sample_rows": [dict],      # up to _SAMPLE_ROWS
        }
    """
    fname = filename.lower()
    try:
        if fname.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(file_bytes), nrows=_MAX_ROWS)
        else:
            # CSV — try utf-8 then latin-1
            try:
                df = pd.read_csv(io.BytesIO(file_bytes), nrows=_MAX_ROWS, encoding="utf-8")
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(file_bytes), nrows=_MAX_ROWS, encoding="latin-1")
    except Exception as e:
        raise ValueError(f"Could not parse file '{filename}': {e}") from e

    # Normalise column names — strip whitespace
    df.columns = [str(c).strip() for c in df.columns]

    # Drop completely empty columns
    df = df.dropna(axis=1, how="all")

    rows = df.where(pd.notnull(df), None).to_dict("records")
    return {
        "columns":    list(df.columns),
        "rows":       rows,
        "row_count":  len(rows),
        "sample_rows": rows[:_SAMPLE_ROWS],
    }
