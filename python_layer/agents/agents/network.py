# ==============================================================
# Phase 4E — Network Coordinator Agent
# ==============================================================
# Weekly cross-branch performance comparison.
# Identifies best practices and branches needing intervention.
# ==============================================================

import logging

from ..base_agent import BaseAgent
from ..tool_registry import execute_tool
from ..agent_memory import remember, update_baseline

logger = logging.getLogger(__name__)


class NetworkAgent(BaseAgent):
    name      = "network"
    task_type = "network_compare"

    def system_prompt(self, company_id: str, context: dict) -> str:
        return f"""You are the Network Coordinator Agent for company {company_id}.

Your role: compare performance across all branches, identify top performers,
surface replicable best practices, and flag underperforming branches.

Rules:
- company_id is always {company_id}
- Use get_network_overview for cross-branch data
- Use get_transaction_summary to assess revenue by branch
- Use get_task_summary to assess operational efficiency by branch
- Use get_people_summary to assess staffing by branch
- Identify the single best-performing branch and explain WHY it outperforms
- Identify the single worst-performing branch and explain what is different
- Produce 2-3 specific, actionable recommendations that underperforming branches can adopt
- Check agent_memory for trends: is a branch's trajectory improving or declining?

Performance dimensions to assess:
  1. Revenue per staff member
  2. Task completion rate
  3. Client retention signals
  4. Staff availability and utilisation
  5. Data quality (completeness of records)

Produce a JSON response:
{{
  "summary": "Network health summary across N branches.",
  "network_health": "healthy | mixed | at_risk",
  "branch_count": N,
  "top_performer": {{
    "branch_name": "...",
    "key_strength": "...",
    "replicable_practice": "..."
  }},
  "needs_intervention": {{
    "branch_name": "...",
    "primary_issue": "...",
    "recommended_action": "..."
  }},
  "findings": [
    {{
      "type": "branch_underperformance | best_practice | staffing_imbalance | revenue_gap",
      "severity": "info | warning | critical",
      "branch_name": "...",
      "detail": "...",
      "recommended_action": "..."
    }}
  ],
  "actions": []
}}"""

    def observe(self, company_id: str) -> dict:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        calls = {
            "network":      lambda: execute_tool("get_network_overview",     {"company_id": company_id}),
            "transactions": lambda: execute_tool("get_transaction_summary",  {"company_id": company_id, "days": 30}),
            "tasks":        lambda: execute_tool("get_task_summary",         {"company_id": company_id}),
            "people":       lambda: execute_tool("get_people_summary",       {"company_id": company_id}),
            "enterprises":  lambda: execute_tool("get_enterprise_summary",   {"company_id": company_id}),
        }

        results = {}
        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = {pool.submit(fn): key for key, fn in calls.items()}
            for future in as_completed(futures):
                key = futures[future]
                try:
                    results[key] = future.result()
                except Exception as e:
                    results[key] = {"error": str(e)}
        return results

    def _store_observations(self, company_id: str, findings: dict) -> None:
        super()._store_observations(company_id, findings)
        if not self.engine:
            return
        remember(self.engine, company_id, self.name,
                 "observation", "network_health",
                 {"status": findings.get("network_health", "unknown"),
                  "branch_count": findings.get("branch_count", 0),
                  "top_performer": findings.get("top_performer", {}).get("branch_name"),
                  "needs_intervention": findings.get("needs_intervention", {}).get("branch_name")})
