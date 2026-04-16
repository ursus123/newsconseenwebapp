"""
bi/formats/csv_export.py
------------------------
Generates a plain CSV from the primary sheet of a report.

CSV works with:
  - Looker Studio (import CSV or paste URL)
  - Google Sheets
  - Any other tool that accepts CSV
  - Quick spot-check / email attachment

If the report has multiple sheets, they are combined into a single ZIP
of CSVs so the operator gets all the data in one download.
"""

from __future__ import annotations

import io
import csv as csv_mod
import zipfile

import pandas as pd


def build_csv(report: dict) -> tuple[bytes, str]:
    """
    Convert a report dict → (bytes, mime_type).

    Single sheet  → plain .csv
    Multi-sheet   → .zip containing one .csv per sheet
    """
    non_empty = [s for s in report["sheets"] if not s["df"].empty]

    if not non_empty:
        return b"No data available\n", "text/csv"

    if len(non_empty) == 1:
        buf = io.StringIO()
        non_empty[0]["df"].to_csv(buf, index=False, quoting=csv_mod.QUOTE_NONNUMERIC)
        return buf.getvalue().encode("utf-8"), "text/csv"

    # Multi-sheet → ZIP of CSVs
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for spec in non_empty:
            sheet_buf = io.StringIO()
            spec["df"].to_csv(sheet_buf, index=False, quoting=csv_mod.QUOTE_NONNUMERIC)
            filename = spec["name"].lower().replace(" ", "_") + ".csv"
            zf.writestr(filename, sheet_buf.getvalue().encode("utf-8"))

    buf.seek(0)
    return buf.read(), "application/zip"
