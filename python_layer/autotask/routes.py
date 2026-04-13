# ==============================================================
# Newsconseen — Auto-Remediation Routes
# ==============================================================
# Endpoints:
#   GET  /autotask/config             — get config for a company
#   POST /autotask/config             — save/update config
#   GET  /autotask/history            — recently auto-created tasks
#   POST /autotask/run                — trigger run immediately
#
# Cron hook (called from /cron/etl-all):
#   run_autotasks(company_ids)        — evaluate + create tasks for all companies
# ==============================================================

import logging
import os
from datetime import datetime, timezone
from typing import List, Optional

import requests

from fastapi import APIRouter, BackgroundTasks, Query
from pydantic import BaseModel

from autotask.engine import run_rules, RULES, DEFAULT_RULE_CONFIG
from config import settings, HEADERS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/autotask", tags=["Auto-Remediation"])

# ── In-memory stores ──────────────────────────────────────────
# Reset on Railway redeploy — cooldown prevents duplicate tasks
# even after restart (new run will re-evaluate on next ETL cycle).
_CONFIG:   dict[str, dict] = {}    # company_id → config
_HISTORY:  dict[str, list] = {}    # company_id → list of recent task records
_COOLDOWN: dict[str, str]  = {}    # dedup_key  → last_created_at ISO

RAILWAY_URL = os.getenv("RAILWAY_INTERNAL_URL", "http://localhost:8000")
API_KEY     = os.getenv("API_KEY", "")
_HEADERS    = {"x-api-key": API_KEY} if API_KEY else {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fetch_analytics(company_id: str) -> dict:
    """Fetch the analytics snapshots needed by all rules."""
    analytics: dict = {}
    endpoints = {
        "people_summary":      f"/people-summary?company_id={company_id}",
        "transaction_summary": f"/transaction-summary?company_id={company_id}",
        "task_summary":        f"/task-summary?company_id={company_id}",
        "product_summary":     f"/product-summary?company_id={company_id}",
    }
    for key, path in endpoints.items():
        try:
            r = requests.get(f"{RAILWAY_URL}{path}", headers=_HEADERS, timeout=15)
            if r.ok:
                analytics[key] = r.json()
        except Exception as e:
            logger.debug("autotask: could not fetch %s — %s", key, e)
    return analytics


def _fetch_dq(company_id: str) -> dict:
    """Fetch the data quality report (cached by dataquality.routes)."""
    try:
        r = requests.get(
            f"{RAILWAY_URL}/dataquality/report?company_id={company_id}",
            headers=_HEADERS,
            timeout=15,
        )
        if r.ok:
            return r.json()
    except Exception as e:
        logger.debug("autotask: could not fetch dq report — %s", e)
    return {}


def _run_for_company(company_id: str) -> dict:
    """Evaluate + create tasks for a single company. Returns result summary."""
    config = _CONFIG.get(str(company_id), {})
    if not config.get("enabled", False):
        return {"status": "disabled"}

    enabled_rules = config.get("enabled_rules", list(RULES.keys()))
    assignee_id   = config.get("assignee_id")
    rule_config   = {**DEFAULT_RULE_CONFIG, **config.get("rule_config", {})}

    analytics = _fetch_analytics(company_id)
    dq        = _fetch_dq(company_id)

    created = run_rules(
        company_id=str(company_id),
        analytics=analytics,
        dq_report=dq,
        rule_config=rule_config,
        cooldown_map=_COOLDOWN,
        enabled_rules=enabled_rules,
        assignee_id=assignee_id,
    )

    # Store history (last 50 tasks per company)
    cid = str(company_id)
    if cid not in _HISTORY:
        _HISTORY[cid] = []
    _HISTORY[cid] = (created + _HISTORY[cid])[:50]

    return {
        "status":  "ok",
        "created": len(created),
        "tasks":   created,
    }


# ── Pydantic models ────────────────────────────────────────────
class AutoTaskConfig(BaseModel):
    company_id:    str
    enabled:       bool = True
    enabled_rules: Optional[List[str]] = None   # None = all rules enabled
    assignee_id:   Optional[str] = None          # Base44 person_id
    rule_config:   Optional[dict] = None         # threshold overrides


# ── API Endpoints ──────────────────────────────────────────────
@router.get("/config")
def get_config(company_id: str = Query(...)):
    """Return auto-task configuration for a company."""
    config = _CONFIG.get(company_id, {})
    return {
        "company_id":    company_id,
        "enabled":       config.get("enabled", False),
        "enabled_rules": config.get("enabled_rules", list(RULES.keys())),
        "assignee_id":   config.get("assignee_id"),
        "rule_config":   {**DEFAULT_RULE_CONFIG, **config.get("rule_config", {})},
        "configured":    bool(config),
        "available_rules": list(RULES.keys()),
    }


@router.post("/config")
def save_config(body: AutoTaskConfig):
    """Save or update auto-task configuration for a company."""
    _CONFIG[body.company_id] = {
        "enabled":       body.enabled,
        "enabled_rules": body.enabled_rules or list(RULES.keys()),
        "assignee_id":   body.assignee_id,
        "rule_config":   body.rule_config or {},
    }
    logger.info(
        "autotask: config saved company=%s enabled=%s rules=%s",
        body.company_id, body.enabled,
        body.enabled_rules or "all",
    )
    return {"status": "saved", "company_id": body.company_id}


@router.get("/history")
def get_history(
    company_id: str = Query(...),
    limit:      int = Query(20, ge=1, le=50),
):
    """Return recently auto-created tasks for a company."""
    entries = _HISTORY.get(company_id, [])
    return {
        "company_id": company_id,
        "total":      len(entries),
        "tasks":      entries[:limit],
    }


@router.post("/run", status_code=202)
def trigger_run(
    company_id:       str             = Query(...),
    background_tasks: BackgroundTasks = None,
):
    """
    Trigger an immediate auto-task evaluation for a company.
    Returns 202 — evaluation and task creation happen in background.
    """
    if background_tasks:
        background_tasks.add_task(_run_for_company, company_id)
    else:
        _run_for_company(company_id)
    return {"status": "accepted", "company_id": company_id}


# ── Cron hook ─────────────────────────────────────────────────
def run_autotasks(company_ids: list) -> dict:
    """
    Called from /cron/etl-all after scheduled report delivery.
    Evaluates rules and creates tasks for every company that has
    auto-remediation enabled.
    """
    results: dict = {}
    total_created = 0
    for company_id in company_ids:
        cid = str(company_id)
        config = _CONFIG.get(cid, {})
        if not config.get("enabled", False):
            continue
        try:
            result = _run_for_company(cid)
            results[cid] = result
            total_created += result.get("created", 0)
            logger.info(
                "autotask cron: company=%s created=%s",
                cid, result.get("created", 0),
            )
        except Exception as e:
            logger.warning("autotask cron: company=%s failed — %s", cid, e)
            results[cid] = {"status": "error", "reason": str(e)}

    return {
        "evaluated":     len(company_ids),
        "active":        len(results),
        "tasks_created": total_created,
        "results":       results,
    }
