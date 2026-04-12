# ==============================================================
# Phase 4E — Compliance & Data Quality Agent
# ==============================================================
# Runs nightly. Audits every entity for data quality, missing
# fields, duplicates, and compliance gaps.
# Produces a daily Data Health Score.
# ==============================================================

import logging

from ..base_agent import BaseAgent
from ..tool_registry import execute_tool
from ..agent_memory import remember, update_baseline

logger = logging.getLogger(__name__)


class ComplianceAgent(BaseAgent):
    name      = "compliance"
    task_type = "compliance_audit"

    def system_prompt(self, company_id: str, context: dict) -> str:
        return f"""You are the Compliance and Data Quality Agent for company {company_id}.

Your role: run a nightly audit across all entity types to ensure data integrity.

Rules:
- company_id is always {company_id}
- Check all entity types: people, enterprises, products, tasks, transactions
- Calculate a Data Health Score (0-100) based on:
    * Completeness: are required fields filled? (40% of score)
    * Consistency: do related records agree? (30% of score)
    * Recency: are records being updated? stale records lose points (20% of score)
    * Uniqueness: are there duplicate records? (10% of score)
- For each issue found: create a remediation task (create_task → auto approved)
  assigned to the record owner or admin
- Flag critical compliance gaps (missing consent, missing regulatory fields) as CRITICAL
- Compare health score to baseline — declining score trend is WARNING

Data Health Score interpretation:
  90-100: Excellent
  75-89:  Good
  60-74:  Needs attention
  <60:    Critical — data cannot be trusted for analytics or agent decisions

Produce a JSON response:
{{
  "summary": "Data Health Score: N/100. M issues found, K tasks created.",
  "health_score": 0-100,
  "score_breakdown": {{
    "completeness": 0-100,
    "consistency": 0-100,
    "recency": 0-100,
    "uniqueness": 0-100
  }},
  "findings": [
    {{
      "type": "missing_field | duplicate | stale_record | consistency_error | compliance_gap",
      "severity": "info | warning | critical",
      "entity_type": "people | enterprises | ...",
      "count": N,
      "detail": "...",
      "remediation_task": "task description to create"
    }}
  ],
  "actions": []
}}"""

    def observe(self, company_id: str) -> dict:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        calls = {
            "people":       lambda: execute_tool("get_people_summary",      {"company_id": company_id}),
            "enterprises":  lambda: execute_tool("get_enterprise_summary",  {"company_id": company_id}),
            "products":     lambda: execute_tool("get_product_summary",     {"company_id": company_id}),
            "tasks":        lambda: execute_tool("get_task_summary",        {"company_id": company_id}),
            "transactions": lambda: execute_tool("get_transaction_summary", {"company_id": company_id, "days": 90}),
            "overdue":      lambda: execute_tool("get_overdue_tasks",       {"company_id": company_id}),
        }

        results = {}
        with ThreadPoolExecutor(max_workers=6) as pool:
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
        score = findings.get("health_score")
        if score is not None:
            update_baseline(self.engine, company_id, self.name,
                            "health_score", float(score))
            remember(self.engine, company_id, self.name,
                     "baseline", "data_health_score",
                     {"score": score,
                      "breakdown": findings.get("score_breakdown", {})})
