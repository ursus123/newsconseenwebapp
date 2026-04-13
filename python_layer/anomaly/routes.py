# ==============================================================
# Newsconseen — Anomaly Detection Routes
# ==============================================================
# Endpoints:
#   GET  /anomaly/report   — latest anomaly report for a company
#   POST /anomaly/evaluate — run fresh evaluation + cache result
#
# Cron hook (called from /cron/etl-all):
#   run_anomaly_detection(company_ids)
# ==============================================================

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Query

from anomaly.engine import evaluate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/anomaly", tags=["Anomaly Detection"])

# In-memory cache — keyed by company_id
# Stores last report + metrics snapshot (used as baseline for next run)
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
    """Evaluate anomalies using previous snapshot as baseline, then cache."""
    # Extract previous metrics snapshot to use as drift baseline
    previous = _CACHE.get(company_id, {}).get("metrics_snapshot")
    try:
        report = evaluate(company_id, baseline=previous)
        _CACHE[company_id] = report
        logger.info(
            "anomaly: company=%s anomalies=%d critical=%d",
            company_id, report["anomaly_count"], report["critical_count"],
        )
        return report
    except Exception as e:
        logger.warning("anomaly: evaluation failed for %s — %s", company_id, e)
        return {
            "company_id":     company_id,
            "anomaly_count":  0,
            "critical_count": 0,
            "warning_count":  0,
            "anomalies":      [],
            "metrics_snapshot": {},
            "evaluated_at":   _now_iso(),
            "error": str(e),
        }


@router.get("/report")
def get_anomaly_report(
    company_id: str  = Query(...),
    force:      bool = Query(False, description="Bypass cache and re-evaluate"),
):
    """
    Return the latest anomaly detection report for a company.
    Returns cached result if <1 hour old.
    Pass ?force=true to trigger a fresh evaluation synchronously.
    """
    cached = _CACHE.get(company_id)
    if cached and not force and not _is_stale(cached):
        return {**cached, "cached": True}
    return {**_run_and_cache(company_id), "cached": False}


@router.post("/evaluate", status_code=202)
def trigger_evaluation(company_id: str = Query(...)):
    """
    Trigger a fresh anomaly evaluation in the background.
    Returns immediately with 202 Accepted.
    """
    from fastapi import BackgroundTasks
    _run_and_cache(company_id)
    return {"status": "accepted", "company_id": company_id}


def run_anomaly_detection(company_ids: list) -> dict:
    """
    Called from /cron/etl-all after auto-remediation.
    Evaluates anomalies for every company and warms the cache.
    """
    results: dict = {}
    total_anomalies = 0
    for cid in company_ids:
        try:
            report = _run_and_cache(str(cid))
            cnt = report.get("anomaly_count", 0)
            results[str(cid)] = {
                "anomalies": cnt,
                "critical":  report.get("critical_count", 0),
            }
            total_anomalies += cnt
        except Exception as e:
            logger.warning("anomaly cron: company=%s failed — %s", cid, e)
    return {
        "evaluated":        len(company_ids),
        "total_anomalies":  total_anomalies,
        "results":          results,
    }
