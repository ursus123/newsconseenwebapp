"""
bi/routes.py
-------------
BI export endpoints.

GET /bi/export
  ?report   = people | transactions | products | tasks | enterprises | scores
  ?format   = excel | tableau | csv
  ?company_id = <operator company_id>

Returns a file download with appropriate Content-Type and Content-Disposition.
No auth required beyond company_id — same pattern as other analytics endpoints.
The data returned is always scoped to the requesting company.

GET /bi/reports
  Returns the list of available reports and formats (for frontend ExportMenu).
"""

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import Response

from bi.generators import REPORT_GENERATORS
from bi.formats.excel     import build_excel
from bi.formats.tableau   import build_tableau
from bi.formats.csv_export import build_csv
from onboarding.auth import verify_tenant_access

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/bi", tags=["BI Export"])


# ── Format registry ───────────────────────────────────────────────────────────

_FORMATS = {
    "excel":   {
        "label":     "Power BI / Excel",
        "mime":      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "extension": "xlsx",
    },
    "tableau": {
        "label":     "Tableau",
        "mime":      "application/octet-stream",
        "extension": "twbx",
    },
    "csv": {
        "label":     "CSV / Looker Studio",
        "mime":      "text/csv",
        "extension": "csv",
    },
}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/reports")
def list_reports():
    """Return available reports and export formats for the frontend ExportMenu."""
    return {
        "reports": [
            {"id": "people",       "label": "People",        "description": "Headcount, churn risk, CLV, enrichment"},
            {"id": "transactions", "label": "Transactions",  "description": "Revenue, invoices, payment behaviour"},
            {"id": "products",     "label": "Products",      "description": "Stock, demand trend, stockout risk"},
            {"id": "tasks",        "label": "Tasks",         "description": "Task completion, SLA risk, overdue"},
            {"id": "enterprises",  "label": "Enterprises",   "description": "Enterprise overview, revenue trend"},
            {"id": "scores",       "label": "Risk Scores",   "description": "Composite entity risk & quality scores"},
        ],
        "formats": [
            {"id": "excel",   "label": "Power BI (.xlsx)",   "icon": "powerbi",  "tip": "Open in Power BI Desktop: Get Data → Excel"},
            {"id": "tableau", "label": "Tableau (.twbx)",    "icon": "tableau",  "tip": "Open in Tableau Desktop or upload to Tableau Public"},
            {"id": "csv",     "label": "CSV / Looker Studio","icon": "looker",   "tip": "Import to Google Sheets then connect Looker Studio"},
        ],
    }


@router.get("/export")
def export_report(
    report:     str = Query(..., description="Report ID: people|transactions|products|tasks|enterprises|scores"),
    format:     str = Query(..., description="Format: excel|tableau|csv"),
    company_id: str = Query(..., description="Operator company_id"),
    authorization: Optional[str] = Header(None),
):
    """
    Download a report in the requested BI format.

    Scoped to company_id — only the requesting operator's data is included.
    Data sourced from analytics.* tables (three-tier fallback in generators).
    """
    verify_tenant_access(authorization, company_id)
    # Validate report
    if report not in REPORT_GENERATORS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown report '{report}'. Available: {', '.join(REPORT_GENERATORS)}",
        )

    # Validate format
    format = format.lower()
    if format not in _FORMATS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown format '{format}'. Available: excel, tableau, csv",
        )

    # Get DB engine
    try:
        from database import get_engine_safe
        engine = get_engine_safe()
    except Exception:
        engine = None

    if not engine:
        raise HTTPException(
            status_code=503,
            detail="Database unavailable — BI exports require the analytics layer. Run ETL first.",
        )

    # Generate report data
    try:
        report_data = REPORT_GENERATORS[report](company_id, engine)
    except Exception as exc:
        logger.error("bi/export: generator failed for %s — %s", report, exc)
        raise HTTPException(status_code=500, detail=f"Report generation failed: {exc}")

    # Check non-empty
    all_empty = all(s["df"].empty for s in report_data["sheets"])
    if all_empty:
        raise HTTPException(
            status_code=404,
            detail=f"No data found for report '{report}' and company_id '{company_id}'. "
                   "Run ETL to populate analytics tables.",
        )

    # Build the file
    fmt_meta  = _FORMATS[format]
    today_str = date.today().strftime("%Y%m%d")
    filename  = f"newsconseen_{report}_{today_str}.{fmt_meta['extension']}"

    try:
        if format == "excel":
            content      = build_excel(report_data)
            content_type = fmt_meta["mime"]

        elif format == "tableau":
            content      = build_tableau(report_data)
            content_type = fmt_meta["mime"]

        else:  # csv
            content, content_type = build_csv(report_data)
            # If multi-sheet zip, adjust filename
            if content_type == "application/zip":
                filename = filename.replace(".csv", ".zip")

    except Exception as exc:
        logger.error("bi/export: format builder failed for %s/%s — %s", report, format, exc)
        raise HTTPException(status_code=500, detail=f"File generation failed: {exc}")

    logger.info(
        "bi/export: company=%s report=%s format=%s size=%d bytes filename=%s",
        company_id, report, format, len(content), filename,
    )

    return Response(
        content=content,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Report":            report,
            "X-Format":            format,
            "X-Company-Id":        company_id,
        },
    )
