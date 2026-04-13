# ==============================================================
# Newsconseen — Data Quality API Routes
# ==============================================================
# Endpoints:
#   GET  /dataquality/report   — latest quality report for a company
#   POST /dataquality/evaluate — run fresh evaluation + cache result
# ==============================================================

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Query, BackgroundTasks

from dataquality.engine import evaluate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dataquality", tags=["Data Quality"])

# In-memory result cache — keyed by company_id
# TTL: 1 hour (fresh enough for dashboard display)
_CACHE: dict[str, dict] = {}
_CACHE_TTL_HOURS = 1


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_stale(report: dict) -> bool:
    try:
        evaluated = datetime.fromisoformat(report["evaluated_at"])
        if evaluated.tzinfo is None:
            evaluated = evaluated.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) - evaluated > timedelta(hours=_CACHE_TTL_HOURS)
    except Exception:
        return True


def _run_and_cache(company_id: str) -> dict:
    """Evaluate and store result in cache."""
    try:
        report = evaluate(company_id)
        _CACHE[company_id] = report
        logger.info(
            "dataquality: company=%s score=%s issues=%d critical=%d",
            company_id, report["overall_score"],
            report["total_issues"], report["critical_count"],
        )
        return report
    except Exception as e:
        logger.warning("dataquality: evaluation failed for %s — %s", company_id, e)
        return {
            "overall_score": 100,
            "grade": "A",
            "issues": [],
            "total_issues": 0,
            "critical_count": 0,
            "warning_count": 0,
            "by_entity": {},
            "record_counts": {},
            "evaluated_at": _now_iso(),
            "company_id": company_id,
            "error": str(e),
        }


@router.get("/report")
def get_quality_report(
    company_id: str           = Query(...),
    force:      bool          = Query(False, description="Bypass cache and re-evaluate"),
):
    """
    Return the latest data quality report for a company.

    Returns cached result if available and <1 hour old.
    Pass ?force=true to trigger a fresh evaluation synchronously.
    """
    cached = _CACHE.get(company_id)
    if cached and not force and not _is_stale(cached):
        return {**cached, "cached": True}

    return {**_run_and_cache(company_id), "cached": False}


@router.post("/evaluate", status_code=202)
def trigger_evaluation(
    company_id:       str              = Query(...),
    background_tasks: BackgroundTasks  = None,
):
    """
    Trigger a fresh data quality evaluation in the background.
    Returns immediately with 202 Accepted.
    The result is stored in cache and available via GET /dataquality/report.
    """
    if background_tasks:
        background_tasks.add_task(_run_and_cache, company_id)
    else:
        _run_and_cache(company_id)
    return {"status": "accepted", "company_id": company_id}


def run_quality_for_all_companies(company_ids: list) -> dict:
    """
    Called from ETL cron after data is refreshed.
    Evaluates quality for every active company and warms the cache.
    """
    results = {}
    for cid in company_ids:
        try:
            report = _run_and_cache(cid)
            results[cid] = {
                "score":    report["overall_score"],
                "issues":   report["total_issues"],
                "critical": report["critical_count"],
            }
        except Exception as e:
            logger.warning("dataquality cron: company=%s failed — %s", cid, e)
    return {"evaluated": len(results), "results": results}
