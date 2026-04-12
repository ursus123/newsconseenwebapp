# ==============================================================
# Phase 4C — Client Retention Agent
# ==============================================================
# Runs weekly. Identifies high-risk clients before they leave.
# Prepares personalised re-engagement messages for approval.
# ==============================================================

import logging

from ..base_agent import BaseAgent
from ..tool_registry import execute_tool
from ..agent_memory import remember, get_baseline, update_baseline
from ..approval_gate import submit_action

logger = logging.getLogger(__name__)


class RetentionAgent(BaseAgent):
    name      = "retention"
    task_type = "retention_check"

    def system_prompt(self, company_id: str, context: dict) -> str:
        return f"""You are the Client Retention Agent for company {company_id}.

Your role: identify clients at risk of disengaging and prepare targeted re-engagement actions.

Rules:
- company_id is always {company_id}
- Use get_retention_risk to get ML-scored clients
- Use get_people_summary and get_transaction_summary to understand client context
- Use semantic_search to find similar clients who were retained successfully (for context)
- For each HIGH-RISK client: draft a personalised re-engagement message
  IMPORTANT: submit draft messages through send_alert — they will be routed to approval gate
- Consider: last transaction date, contact frequency, lifetime value, segment
- Prioritise high-LTV clients — losing them hurts more
- Never send messages directly — always prepare for human approval

Produce a JSON response:
{{
  "summary": "N high-risk clients identified. M re-engagement messages prepared for approval.",
  "retention_health": "healthy | at_risk | critical",
  "high_risk_count": N,
  "findings": [
    {{
      "type": "high_churn_risk",
      "severity": "warning | critical",
      "client_name": "...",
      "risk_score": 0.0-1.0,
      "last_contact_days": N,
      "ltv_segment": "high | medium | low",
      "detail": "...",
      "draft_message": "personalised re-engagement message"
    }}
  ],
  "actions": []
}}"""

    def observe(self, company_id: str) -> dict:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        calls = {
            "retention_risk": lambda: execute_tool("get_retention_risk",      {"company_id": company_id}),
            "ltv_segments":   lambda: execute_tool("get_ltv_segments",        {"company_id": company_id}),
            "transactions":   lambda: execute_tool("get_transaction_summary", {"company_id": company_id, "days": 90}),
            "people":         lambda: execute_tool("get_people_summary",      {"company_id": company_id}),
        }

        results = {}
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(fn): key for key, fn in calls.items()}
            for future in as_completed(futures):
                key = futures[future]
                try:
                    results[key] = future.result()
                except Exception as e:
                    results[key] = {"error": str(e)}

        results["baseline_churn_rate"] = get_baseline(
            self.engine, company_id, self.name, "churn_rate"
        )
        return results

    def _store_observations(self, company_id: str, findings: dict) -> None:
        super()._store_observations(company_id, findings)
        if not self.engine:
            return
        high_risk = findings.get("high_risk_count", 0)
        if high_risk is not None:
            update_baseline(self.engine, company_id, self.name,
                            "high_risk_count", float(high_risk))
        remember(self.engine, company_id, self.name,
                 "observation", "retention_health",
                 {"status": findings.get("retention_health", "unknown"),
                  "high_risk": high_risk})
