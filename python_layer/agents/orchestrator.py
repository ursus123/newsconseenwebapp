# ==============================================================
# Phase 4A — Agent Orchestrator
# ==============================================================
# Central registry and dispatcher for all agents.
# Routes run requests to the correct agent, manages scheduling,
# and provides the unified /agents API surface.
# ==============================================================

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ── Agent registry ────────────────────────────────────────────────────────────
# Populated lazily on first access to avoid import-time errors
# if optional dependencies (e.g. anthropic) are not installed.

_REGISTRY: dict = {}


def _load_agents():
    global _REGISTRY
    if _REGISTRY:
        return

    from .agents.operations    import OperationsAgent
    from .agents.revenue       import RevenueAgent
    from .agents.retention     import RetentionAgent
    from .agents.inventory     import InventoryAgent
    from .agents.onboarding    import OnboardingAgent
    from .agents.compliance    import ComplianceAgent
    from .agents.market_research import MarketResearchAgent
    from .agents.network       import NetworkAgent

    _REGISTRY = {
        "operations":      OperationsAgent,
        "revenue":         RevenueAgent,
        "retention":       RetentionAgent,
        "inventory":       InventoryAgent,
        "onboarding":      OnboardingAgent,
        "compliance":      ComplianceAgent,
        "market_research": MarketResearchAgent,
        "network":         NetworkAgent,
    }


def list_agents() -> list[dict]:
    """Return metadata for all registered agents."""
    _load_agents()
    meta = {
        "operations":      {"phase": "4B", "description": "Monitors task backlogs, staff availability, and operational health every 15 minutes.", "schedule": "*/15 * * * *"},
        "revenue":         {"phase": "4B", "description": "Monitors financial data daily — anomalies, overdue invoices, margin erosion.", "schedule": "0 7 * * *"},
        "retention":       {"phase": "4C", "description": "Runs retention risk weekly. Prepares re-engagement messages for high-risk clients.", "schedule": "0 8 * * 1"},
        "inventory":       {"phase": "4C", "description": "Monitors stock levels. Drafts purchase orders when stock is critical.", "schedule": "0 6 * * *"},
        "onboarding":      {"phase": "4C", "description": "Triggered when new Person/Enterprise created. Automates welcome workflow.", "schedule": "event-driven"},
        "compliance":      {"phase": "4E", "description": "Nightly audit of data quality, missing fields, duplicates, and compliance gaps.", "schedule": "0 2 * * *"},
        "market_research": {"phase": "4E", "description": "Deep market intelligence — competitor tracking, opportunity detection, weekly briefings.", "schedule": "0 5 * * 1"},
        "network":         {"phase": "4E", "description": "Weekly cross-branch performance comparison and best-practice propagation.", "schedule": "0 9 * * 1"},
    }
    return [
        {"name": name, **meta.get(name, {})}
        for name in _REGISTRY
    ]


def run_agent(agent_name: str, company_id: str,
              trigger: str = "manual",
              engine=None) -> dict:
    """
    Instantiate and run a named agent for a company.
    Returns the agent's findings dict.
    """
    _load_agents()

    AgentClass = _REGISTRY.get(agent_name)
    if AgentClass is None:
        return {"error": f"Unknown agent: {agent_name}",
                "available": list(_REGISTRY.keys())}

    try:
        agent = AgentClass(engine=engine)
        return agent.run(company_id=company_id, trigger=trigger)
    except Exception as e:
        logger.error("Orchestrator: agent %s failed for %s: %s",
                     agent_name, company_id, e)
        return {"error": str(e), "agent": agent_name, "company_id": company_id}


def run_all(company_id: str, trigger: str = "scheduled",
            engine=None) -> dict:
    """
    Run all agents for a company sequentially.
    Returns a dict of agent_name → findings.
    """
    _load_agents()
    results = {}
    for name in _REGISTRY:
        logger.info("Orchestrator: running %s for %s", name, company_id)
        results[name] = run_agent(name, company_id, trigger, engine)
    return results


def run_scheduled(engine=None) -> dict:
    """
    Entry point for the scheduler — runs all agents for all
    companies that have data in the analytics tables.
    Called by the cron endpoint.
    """
    from database import get_engine_safe
    from sqlalchemy import text

    eng = engine or get_engine_safe()
    if not eng:
        return {"error": "No database connection"}

    # Get all distinct company_ids from analytics tables
    company_ids = []
    try:
        with eng.connect() as conn:
            rows = conn.execute(text(
                "SELECT DISTINCT company_id FROM analytics.people_summary "
                "WHERE company_id IS NOT NULL LIMIT 200"
            )).fetchall()
            company_ids = [r[0] for r in rows if r[0]]
    except Exception as e:
        logger.warning("Orchestrator: could not fetch company IDs: %s", e)
        return {"error": str(e)}

    if not company_ids:
        return {"status": "no_companies", "message": "No companies with analytics data found."}

    all_results = {}
    for company_id in company_ids:
        all_results[company_id] = run_all(company_id, trigger="scheduled", engine=eng)

    return {
        "status":    "completed",
        "companies": len(company_ids),
        "results":   all_results,
    }
