# ==============================================================
# Phase 4 — Agents FastAPI Router
# ==============================================================

import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

from .orchestrator import list_agents, run_agent, run_all, run_scheduled
from .approval_gate import get_pending, resolve, get_recent_runs, ensure_tables
from .agent_memory import summarise_memory, ensure_tables as ensure_memory_tables
from .agents.market_research import MarketResearchAgent, ensure_market_tables
from database import get_engine_safe

import os

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agents", tags=["Agents — Phase 4"])

CRON_SECRET = os.getenv("CRON_SECRET", "")


def _auth(secret: str):
    if CRON_SECRET and secret != CRON_SECRET:
        raise HTTPException(status_code=401, detail="Invalid x-cron-secret")


# ── Models ────────────────────────────────────────────────────────────────────

class RunRequest(BaseModel):
    company_id: str
    trigger:    str = "manual"


class ResolveRequest(BaseModel):
    decision:    str   # "approved" | "rejected"
    resolved_by: str   = "operator"
    note:        str   = ""


class OnboardingTrigger(BaseModel):
    company_id:  str
    entity_type: str
    entity_id:   str
    entity_data: dict = {}


# ── List agents ───────────────────────────────────────────────────────────────

@router.get("/list")
def agents_list():
    """List all registered agents with metadata."""
    return {"agents": list_agents()}


# ── Run a single agent ────────────────────────────────────────────────────────

@router.post("/run/{agent_name}")
def run_one_agent(agent_name: str, req: RunRequest,
                  x_api_key: str = Header(default="")):
    engine = get_engine_safe()
    result = run_agent(agent_name, req.company_id, req.trigger, engine)
    return result


# ── Run all agents for a company ──────────────────────────────────────────────

@router.post("/run-all")
def run_all_agents(req: RunRequest,
                   x_cron_secret: str = Header(default="")):
    _auth(x_cron_secret)
    engine = get_engine_safe()
    return run_all(req.company_id, req.trigger, engine)


# ── Scheduled run (all companies) ────────────────────────────────────────────

@router.post("/scheduled")
def scheduled_run(x_cron_secret: str = Header(default="")):
    """Called by Railway cron — runs all agents for all companies."""
    _auth(x_cron_secret)
    engine = get_engine_safe()
    return run_scheduled(engine)


# ── Onboarding trigger (event-driven) ────────────────────────────────────────

@router.post("/trigger/onboarding")
def trigger_onboarding(req: OnboardingTrigger):
    """Trigger the onboarding agent when a new entity is created."""
    from .agents.onboarding import OnboardingAgent
    engine = get_engine_safe()
    agent  = OnboardingAgent(engine=engine)
    return agent.run_for_entity(
        company_id=req.company_id,
        entity_type=req.entity_type,
        entity_id=req.entity_id,
        entity_data=req.entity_data,
    )


# ── Approval gate ─────────────────────────────────────────────────────────────

@router.get("/approvals/pending")
def get_pending_approvals(company_id: str = Query(...)):
    """Get all pending agent actions awaiting human approval."""
    engine = get_engine_safe()
    if not engine:
        return {"pending": []}
    return {"pending": get_pending(engine, company_id)}


@router.post("/approvals/{approval_id}/resolve")
def resolve_approval(approval_id: str, req: ResolveRequest):
    """Approve or reject a pending agent action."""
    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return resolve(engine, approval_id, req.decision, req.resolved_by, req.note)


# ── Agent run history ─────────────────────────────────────────────────────────

@router.get("/runs")
def agent_runs(company_id: str = Query(...), limit: int = 20):
    """Get recent agent run records for a company."""
    engine = get_engine_safe()
    if not engine:
        return {"runs": []}
    return {"runs": get_recent_runs(engine, company_id, limit)}


# ── Agent memory summary ──────────────────────────────────────────────────────

@router.get("/memory/{agent_name}")
def agent_memory_summary(agent_name: str, company_id: str = Query(...)):
    engine = get_engine_safe()
    if not engine:
        return {"memory": {}}
    return {"memory": summarise_memory(engine, company_id, agent_name)}


# ── Market intelligence ───────────────────────────────────────────────────────

@router.get("/market/briefings")
def market_briefings(company_id: str = Query(...), limit: int = 4):
    """Get recent weekly market intelligence briefings."""
    engine = get_engine_safe()
    if not engine:
        return {"briefings": []}
    agent = MarketResearchAgent(engine=engine)
    return {"briefings": agent.get_recent_briefings(company_id, limit)}


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status")
def agents_status(company_id: str = Query(...)):
    """Get agent framework status and recent run summary for a company."""
    engine = get_engine_safe()
    db_ok = engine is not None

    recent_runs = []
    pending_count = 0
    if db_ok:
        recent_runs   = get_recent_runs(engine, company_id, limit=10)
        pending_count = len(get_pending(engine, company_id))

    return {
        "agents_enabled": bool(os.getenv("ANTHROPIC_API_KEY")),
        "opus_enabled":   os.getenv("OPUS_ENABLED", "false").lower() == "true",
        "database_ok":    db_ok,
        "registered_agents": [a["name"] for a in list_agents()],
        "pending_approvals": pending_count,
        "recent_runs":    recent_runs[:5],
    }


# ── DB setup (called on startup) ──────────────────────────────────────────────

def setup_agent_tables(engine) -> None:
    """Create all agent-related tables. Called from app.py lifespan."""
    try:
        ensure_tables(engine)          # approval_gate tables
        ensure_memory_tables(engine)   # agent_memory table
        ensure_market_tables(engine)   # market research tables
        logger.info("Agent tables ready")
    except Exception as e:
        logger.warning("Agent table setup failed: %s", e)
