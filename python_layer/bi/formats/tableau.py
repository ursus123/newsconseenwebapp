"""
bi/formats/tableau.py
---------------------
Generates a Tableau Packaged Workbook (.twbx) from a report dict.

A .twbx is a ZIP archive containing:
  - workbook.twb   — Tableau workbook XML (datasource definition + sheets)
  - data.csv       — the primary sheet's data embedded as a CSV extract

The operator opens the .twbx in Tableau Desktop or uploads to Tableau Public.
Data is already embedded — no database connection or API key required.

Tableau version target: 2022.x+ (version attribute 18.1)
"""

from __future__ import annotations

import csv
import io
import zipfile
from datetime import date, datetime, timezone
from xml.sax.saxutils import escape as xml_escape

import pandas as pd


# ── Tableau type inference ────────────────────────────────────────────────────

def _tableau_type(series: pd.Series) -> tuple[str, str]:
    """Return (datatype, role) for a pandas Series."""
    dtype = series.dtype
    if pd.api.types.is_integer_dtype(dtype):
        return "integer", "measure"
    if pd.api.types.is_float_dtype(dtype):
        return "real", "measure"
    if pd.api.types.is_bool_dtype(dtype):
        return "boolean", "dimension"
    # Dates stored as strings — detect common patterns
    if series.name and any(k in str(series.name).lower() for k in ("date", "at", "day", "_at")):
        return "date", "dimension"
    return "string", "dimension"


# ── CSV generation ─────────────────────────────────────────────────────────────

def _df_to_csv_bytes(df: pd.DataFrame) -> bytes:
    buf = io.StringIO()
    df.to_csv(buf, index=False, quoting=csv.QUOTE_NONNUMERIC)
    return buf.getvalue().encode("utf-8")


# ── Workbook XML generation ───────────────────────────────────────────────────

def _column_xml(df: pd.DataFrame) -> str:
    """Generate <column> elements for the datasource."""
    parts = []
    for col in df.columns:
        dtype, role = _tableau_type(df[col])
        name = f"[{col}]"
        caption = col.replace("_", " ").title()
        parts.append(
            f"      <column datatype='{dtype}' name='{name}' "
            f"role='{role}' type='{'quantitative' if role == 'measure' else 'nominal'}' "
            f"caption='{xml_escape(caption)}' />"
        )
    return "\n".join(parts)


def _worksheet_xml(sheet_name: str, df: pd.DataFrame, ds_name: str) -> str:
    """Generate a minimal worksheet that shows the data as a text table."""
    safe_name = xml_escape(sheet_name)
    cols = df.columns.tolist()

    # Show first 10 columns in the default view
    view_cols = cols[:10]
    rows_xml_parts = []
    for c in view_cols:
        col_ref = xml_escape("[" + c + "]")
        rows_xml_parts.append(
            f"        <column-instance column='{col_ref}' "
            f"derivation='None' name='{col_ref}' pivot='key' type='quantitative' />"
        )
    rows_xml = "\n".join(rows_xml_parts)

    return f"""
  <worksheet name='{safe_name}'>
    <table>
      <view>
        <datasources>
          <datasource caption='Newsconseen Export' name='{ds_name}' />
        </datasources>
        <datasource-dependencies datasource='{ds_name}'>
{rows_xml}
        </datasource-dependencies>
      </view>
      <style />
    </table>
  </worksheet>"""


def _build_twb(report: dict, csv_filename: str, primary_df: pd.DataFrame) -> str:
    """Build the Tableau workbook XML string."""
    ds_name    = "newsconseen_export"
    today      = date.today().isoformat()
    sheet_list = report["sheets"]

    # Column definitions from the primary DataFrame
    col_xml = _column_xml(primary_df)

    # Worksheets XML — one per non-empty sheet
    worksheets_xml = ""
    for spec in sheet_list:
        if not spec["df"].empty:
            worksheets_xml += _worksheet_xml(spec["name"], spec["df"], ds_name)

    # Window entries for each worksheet
    windows_xml = ""
    for spec in sheet_list:
        if not spec["df"].empty:
            safe = xml_escape(spec["name"])
            windows_xml += f"""
    <window maximized='true' type='worksheet' workspace='main' name='{safe}'>
      <viewpoint />
    </window>"""

    return f"""<?xml version='1.0' encoding='utf-8' ?>
<!-- Newsconseen BI Export — {report['title']} — {today} -->
<!-- {xml_escape(report['description'])} -->
<workbook source-build='2022.4.0' source-platform='win' version='18.1'
          xmlns:user='http://www.tableausoftware.com/xml/user'>

  <datasources>
    <datasource caption='Newsconseen Export' inline='true'
                name='{ds_name}' version='18.1'>
      <connection class='textscan' filename='{csv_filename}'>
        <format attribute='char-set' value='UTF-8' />
        <format attribute='field-separator' value=',' />
        <format attribute='first-row-contains-column-headings' value='yes' />
        <format attribute='text-qualifier' value='&quot;' />
        <relation name='{csv_filename}' table='[{csv_filename}]' type='table' />
      </connection>
{col_xml}
    </datasource>
  </datasources>

  <worksheets>
{worksheets_xml}
  </worksheets>

  <windows source-build='2022.4.0'>
{windows_xml}
  </windows>

</workbook>
"""


# ── Public API ────────────────────────────────────────────────────────────────

def build_tableau(report: dict) -> bytes:
    """
    Convert a report dict → .twbx bytes.

    The primary sheet's DataFrame is embedded as a CSV inside the ZIP.
    All sheets are accessible as worksheets in the workbook.
    """
    # Find the primary (first non-empty) DataFrame
    primary_df = pd.DataFrame()
    for spec in report["sheets"]:
        if not spec["df"].empty:
            primary_df = spec["df"]
            break

    csv_filename = "data.csv"
    csv_bytes    = _df_to_csv_bytes(primary_df)
    twb_xml      = _build_twb(report, csv_filename, primary_df)

    # Pack into a .twbx (ZIP)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("workbook.twb", twb_xml.encode("utf-8"))
        zf.writestr(csv_filename,   csv_bytes)

        # Write additional sheets as separate CSVs (accessible as extra data sources)
        for i, spec in enumerate(report["sheets"][1:], start=2):
            if not spec["df"].empty:
                extra_name = f"sheet_{i}_{spec['name'].lower().replace(' ', '_')}.csv"
                zf.writestr(extra_name, _df_to_csv_bytes(spec["df"]))

    buf.seek(0)
    return buf.read()
