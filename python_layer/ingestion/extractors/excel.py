"""
ingestion/extractors/excel.py
Extracts CSV and Excel files into a list of dicts + column metadata.
"""
import io
import logging
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

_SAMPLE_ROWS   = 8
_MAX_ROWS      = 50_000   # max rows stored in rows_json and used for loading
_ANALYSIS_ROWS = 5_000    # max rows passed to profiler (LLM gets only sample_rows)


def extract(file_bytes: bytes, filename: str) -> dict[str, Any]:
    """
    Parse CSV or Excel file.  Returns:
        {
          "columns":         [str],
          "rows":            [dict],   # up to _MAX_ROWS (stored in rows_json + loaded)
          "row_count":       int,      # actual rows in file (may exceed _MAX_ROWS)
          "rows_stored":     int,      # rows actually returned (min(actual, _MAX_ROWS))
          "rows_capped":     bool,     # True when file exceeded _MAX_ROWS
          "analysis_rows":   [dict],   # up to _ANALYSIS_ROWS for profiler
          "sample_rows":     [dict],   # up to _SAMPLE_ROWS for LLM
        }
    """
    fname = filename.lower()
    try:
        if fname.endswith((".xlsx", ".xls")):
            # Read all rows; openpyxl handles row count natively
            df = pd.read_excel(io.BytesIO(file_bytes))
        elif fname.endswith(".tsv"):
            try:
                df = pd.read_csv(io.BytesIO(file_bytes), sep="\t", encoding="utf-8")
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(file_bytes), sep="\t", encoding="latin-1")
        else:
            # CSV — try utf-8 then latin-1; read all rows
            try:
                df = pd.read_csv(io.BytesIO(file_bytes), encoding="utf-8")
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(file_bytes), encoding="latin-1")
    except Exception as e:
        raise ValueError(f"Could not parse file '{filename}': {e}") from e

    # Normalise column names
    df.columns = [str(c).strip() for c in df.columns]

    # Drop completely empty columns
    df = df.dropna(axis=1, how="all")

    all_rows = df.where(pd.notnull(df), None).to_dict("records")
    total_row_count = len(all_rows)

    rows_capped = total_row_count > _MAX_ROWS
    rows = all_rows[:_MAX_ROWS]

    return {
        "columns":       list(df.columns),
        "rows":          rows,
        "row_count":     total_row_count,
        "rows_stored":   len(rows),
        "rows_capped":   rows_capped,
        "analysis_rows": rows[:_ANALYSIS_ROWS],
        "sample_rows":   rows[:_SAMPLE_ROWS],
    }
