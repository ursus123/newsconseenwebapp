"""
Agent orchestrator.

Central registry and dispatcher for company-scoped agents. The core agents are
deterministic Idjwi closed-loop operators; optional adviser-backed agents can
still live beside them.
"""

import logging

logger = logging.getLogger(__name__)

_REGISTRY: dict = {}


def _load_agents():
    global _REGISTRY
    if _REGISTRY:
        return

    from .closed_loop_agent import (
        DailyHealthCheckAgent,
        EnrichmentAgent,
        ImportCleanupAgent,
        InventoryClosedLoopAgent,
        OnboardingClosedLoopAgent,
        OperationsClosedLoopAgent,
        RelationshipRepairAgent,
        RevenueClosedLoopAgent,
        RiskMonitoringAgent,
    )

    _REGISTRY = {
        "daily_health_check": DailyHealthCheckAgent,
        "import_cleanup": ImportCleanupAgent,
        "relationship_repair": RelationshipRepairAgent,
        "risk_monitoring": RiskMonitoringAgent,
        "revenue": RevenueClosedLoopAgent,
        "operations": OperationsClosedLoopAgent,
        "inventory": InventoryClosedLoopAgent,
        "onboarding": OnboardingClosedLoopAgent,
        "enrichment": EnrichmentAgent,
    }


def list_agents() -> list[dict]:
    """Return metadata for all registered agents."""
    _load_agents()
    meta = {
        "daily_health_check": {
            "phase": "9",
            "description": "Closed-loop daily health review: KPIs, graph gaps, anomalies, alerts, actions, memory, and outcome.",
            "schedule": "0 6 * * *",
        },
        "import_cleanup": {
            "phase": "9",
            "description": "Closed-loop cleanup after imports: unmapped fields, weak relationships, proposed repairs, and approval queue.",
            "schedule": "after import",
        },
        "relationship_repair": {
            "phase": "9",
            "description": "Closed-loop ontology repair: unlinked records, likely relationship fixes, approval status, and memory updates.",
            "schedule": "0 3 * * *",
        },
        "risk_monitoring": {
            "phase": "9",
            "description": "Closed-loop risk monitoring for churn, concentration, anomalies, and high-risk entities.",
            "schedule": "0 7 * * *",
        },
        "operations": {
            "phase": "9",
            "description": "Closed-loop operations review for overdue work, staff bottlenecks, proposed actions, and measurable outcomes.",
            "schedule": "*/15 * * * *",
        },
        "revenue": {
            "phase": "9",
            "description": "Closed-loop revenue review for overdue invoices, AR aging, debtor exposure, actions, and outcomes.",
            "schedule": "0 7 * * *",
        },
        "inventory": {
            "phase": "9",
            "description": "Closed-loop inventory review for stock risk, expiry/reorder signals, proposals, memory, and outcomes.",
            "schedule": "0 6 * * *",
        },
        "onboarding": {
            "phase": "9",
            "description": "Closed-loop onboarding guidance for data priorities, upload vs connector decisions, graph gaps, and next actions.",
            "schedule": "event-driven",
        },
        "enrichment": {
            "phase": "9",
            "description": "Closed-loop enrichment planning from the source registry, required inputs, and safe public sources.",
            "schedule": "0 4 * * *",
        },
    }
    return [{"name": name, **meta.get(name, {})} for name in _REGISTRY]


def run_agent(agent_name: str, company_id: str, trigger: str = "manual", engine=None) -> dict:
    """Instantiate and run a named agent for a company."""
    _load_agents()

    AgentClass = _REGISTRY.get(agent_name)
    if AgentClass is None:
        return {"error": f"Unknown agent: {agent_name}", "available": list(_REGISTRY.keys())}

    try:
        agent = AgentClass(engine=engine)
        return agent.run(company_id=company_id, trigger=trigger)
    except Exception as e:
        logger.error("Orchestrator: agent %s failed for %s: %s", agent_name, company_id, e)
        return {"error": str(e), "agent": agent_name, "company_id": company_id}


def run_all(company_id: str, trigger: str = "scheduled", engine=None) -> dict:
    """Run all agents for a company sequentially."""
    _load_agents()
    results = {}
    for name in _REGISTRY:
        logger.info("Orchestrator: running %s for %s", name, company_id)
        results[name] = run_agent(name, company_id, trigger, engine)
    return results


def run_scheduled(engine=None) -> dict:
    """Scheduler entrypoint: run all agents for companies with analytics data."""
    from database import get_engine_safe
    from sqlalchemy import text

    eng = engine or get_engine_safe()
    if not eng:
        return {"error": "No database connection"}

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
        "status": "completed",
        "companies": len(company_ids),
        "results": all_results,
    }
