# ==============================================================
# Newsconseen — KPI Goal Tracking Routes
# ==============================================================
# Endpoints:
#   GET  /goals              — get current goals + live status
#   POST /goals              — save goals for a company
#   DELETE /goals/{goal_id}  — remove a single goal
#   GET  /goals/metrics      — list available metric keys
#
# Cron hook (called from /cron/etl-all):
#   run_goal_tracking(company_ids)
# ==============================================================

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from goals.engine import evaluate_goals, METRIC_REGISTRY

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/goals", tags=["KPI Goals"])

# In-memory store: company_id → list of goal dicts
# Goals persist across requests; reset on Railway redeploy
# (operators re-enter via Settings UI — goals are few and lightweight)
_GOALS: dict[str, list] = {}

# Cache of last evaluated results — avoids re-querying analytics on every GET
_CACHE: dict[str, list] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Pydantic models ────────────────────────────────────────────
class Goal(BaseModel):
    metric:    str
    target:    float
    period:    str = "monthly"   # monthly | weekly | annual | rolling_30d
    direction: str = "higher_is_better"
    label:     Optional[str] = None
    unit:      Optional[str] = None


class GoalSet(BaseModel):
    company_id: str
    goals:      List[Goal]


# ── Endpoints ──────────────────────────────────────────────────
@router.get("/metrics")
def list_metrics():
    """Return available metric keys with labels and units."""
    return [
        {
            "key":       key,
            "label":     meta[1],
            "unit":      meta[2],
            "direction": meta[3],
        }
        for key, meta in METRIC_REGISTRY.items()
    ]


@router.get("")
def get_goals(
    company_id: str  = Query(...),
    evaluate:   bool = Query(True, description="Run live evaluation (uses cache)"),
):
    """
    Return current goals for a company with live status.
    Pass ?evaluate=false to return stored goals without refreshing metrics.
    """
    raw_goals = _GOALS.get(company_id, [])
    if not raw_goals:
        return {"company_id": company_id, "goals": [], "evaluated_at": None}

    if evaluate:
        results = evaluate_goals(company_id, raw_goals)
        _CACHE[company_id] = results
    else:
        results = _CACHE.get(company_id, raw_goals)

    evaluated_at = None
    for r in results:
        evaluated_at = r.get("evaluated_at") or evaluated_at

    return {
        "company_id":   company_id,
        "goals":        results,
        "total":        len(results),
        "on_track":     sum(1 for g in results if g.get("status") == "on_track"),
        "at_risk":      sum(1 for g in results if g.get("status") == "at_risk"),
        "behind":       sum(1 for g in results if g.get("status") == "behind"),
        "exceeded":     sum(1 for g in results if g.get("status") == "exceeded"),
        "evaluated_at": evaluated_at,
    }


@router.post("")
def save_goals(body: GoalSet):
    """
    Save the full goal set for a company (replaces existing goals).
    Each goal gets a stable id for deletion.
    """
    goals = []
    existing = {g["id"]: g for g in _GOALS.get(body.company_id, [])}

    for goal in body.goals:
        d = goal.dict()
        # Preserve existing id if metric+period match (stable across saves)
        stable_key = f"{goal.metric}:{goal.period}"
        match = next(
            (g for g in existing.values()
             if f"{g['metric']}:{g['period']}" == stable_key),
            None,
        )
        d["id"] = match["id"] if match else str(uuid.uuid4())
        goals.append(d)

    _GOALS[body.company_id] = goals
    # Clear cache so next GET re-evaluates
    _CACHE.pop(body.company_id, None)

    logger.info("goals: saved %d goals for company=%s", len(goals), body.company_id)
    return {"status": "saved", "company_id": body.company_id, "count": len(goals)}


@router.delete("/{goal_id}")
def delete_goal(goal_id: str, company_id: str = Query(...)):
    """Remove a single goal by id."""
    goals = _GOALS.get(company_id, [])
    before = len(goals)
    _GOALS[company_id] = [g for g in goals if g.get("id") != goal_id]
    _CACHE.pop(company_id, None)
    removed = before - len(_GOALS[company_id])
    return {"status": "deleted" if removed else "not_found", "goal_id": goal_id}


# ── Cron hook ─────────────────────────────────────────────────
def run_goal_tracking(company_ids: list) -> dict:
    """
    Called from /cron/etl-all after anomaly detection.
    Re-evaluates all goals and warms the cache.
    """
    results: dict = {}
    total_behind = 0

    for cid in company_ids:
        goals = _GOALS.get(str(cid), [])
        if not goals:
            continue
        try:
            evaluated = evaluate_goals(str(cid), goals)
            _CACHE[str(cid)] = evaluated
            behind = sum(1 for g in evaluated if g.get("status") in ("behind", "at_risk"))
            total_behind += behind
            results[str(cid)] = {
                "goals":    len(evaluated),
                "behind":   behind,
                "on_track": sum(1 for g in evaluated if g.get("status") == "on_track"),
                "exceeded": sum(1 for g in evaluated if g.get("status") == "exceeded"),
            }
            logger.info(
                "goals cron: company=%s goals=%d behind=%d",
                cid, len(evaluated), behind,
            )
        except Exception as e:
            logger.warning("goals cron: company=%s failed — %s", cid, e)

    return {
        "evaluated":    len(company_ids),
        "tracked":      len(results),
        "total_behind": total_behind,
        "results":      results,
    }
