"""
backup/routes.py
-----------------
FastAPI router for the backup system.

Endpoints:
  POST /backup/run      — trigger a database backup (cron-secret protected)
  GET  /backup/status   — last backup result + success rate
  GET  /backup/list     — recent backup log entries
"""

import logging
import os

from fastapi import APIRouter, Depends, Header, HTTPException, Query

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Backup"])


# ---------------------------------------------------------------------------
# Auth: backup endpoints require the cron secret
# ---------------------------------------------------------------------------

def _require_cron_secret(x_cron_secret: str = Header(default="")):
    from config.settings import settings
    if not settings.cron_secret:
        raise HTTPException(status_code=503, detail="Cron endpoints disabled — set CRON_SECRET env var")
    if x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=403, detail="Invalid cron secret")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/backup/run")
def trigger_backup(_auth=Depends(_require_cron_secret)):
    """
    Trigger a full database backup.
    Dumps the PostgreSQL database, compresses it, and stores to local /tmp
    and optionally to S3-compatible storage.

    Requires header: x-cron-secret
    """
    try:
        from backup.engine import run_backup
        result = run_backup()
        status_code = 200 if result.get("status") == "success" else 500
        if status_code == 500:
            raise HTTPException(status_code=500, detail=result.get("error", "Backup failed"))
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("backup/run endpoint failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/backup/status")
def backup_status():
    """
    Return the last backup result and overall success rate.
    Safe to call without auth — contains no sensitive data.
    """
    try:
        from backup.engine import get_backup_status
        return get_backup_status()
    except Exception as exc:
        logger.warning("backup/status failed — %s", exc)
        return {"status": "unavailable", "error": str(exc)[:200]}


@router.get("/backup/list")
def list_backups(
    limit: int = Query(20, ge=1, le=200),
    _auth=Depends(_require_cron_secret),
):
    """
    List recent backup log entries (newest first).
    Requires header: x-cron-secret
    """
    try:
        from backup.engine import list_backups as _list
        return _list(limit=limit)
    except Exception as exc:
        logger.warning("backup/list failed — %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
