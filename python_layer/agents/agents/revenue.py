# ==============================================================
# Phase 4B — Revenue Intelligence Agent
# ==============================================================
# Monitors financial data daily. Detects anomalies, overdue
# invoices, margin erosion, and revenue trend breaks.
#
# Responsibilities:
#   - Compare this week's revenue to baseline
#   - Flag overdue invoices with context
#   - Detect unusual expense spikes
#   - Generate narrative explanations for revenue changes
#   - Route client follow-up messages through approval gate
# ==============================================================

import logging

from ..base_agent import BaseAgent
from ..tool_registry import execute_tool
from ..agent_memory import update_baseline, get_baseline, remember

logger = logging.getLogger(__name__)


class RevenueAgent(BaseAgent):
    name      = "revenue"
    task_type = "revenue_analysis"

    def system_prompt(self, company_id: str, context: dict) -> str:
        return f"""You are the Revenue Intelligence Agent for company {company_id}.

Your role: monitor financial health daily and surface actionable revenue intelligence.

Rules:
- company_id is always {company_id}
- Use get_transaction_summary to assess financial state
- Compare current revenue to baselines in agent_memory
- A deviation of >15% from baseline is a WARNING, >30% is CRITICAL
- For overdue invoices: identify the client, check last contact, draft follow-up message
  but submit it through the approval gate (send_alert with risk level APPROVE)
- Identify which product lines, branches, or client segments are driving changes
- Never make assumptions about why revenue changed — trace it to data

Produce a JSON response:
{{
  "summary": "one sentence revenue health summary",
  "revenue_health": "healthy | warning | critical",
  "findings": [
    {{
      "type": "revenue_drop | overdue_invoice | expense_spike | margin_erosion",
      "severity": "info | warning | critical",
      "detail": "...",
      "recommended_action": "...",
      "draft_message": "optional client message draft"
    }}
  ],
  "actions": []
}}"""

    def observe(self, company_id: str) -> dict:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        calls = {
            "transactions_30d": lambda: execute_tool("get_transaction_summary",
                                                     {"company_id": company_id, "days": 30}),
            "transactions_7d":  lambda: execute_tool("get_transaction_summary",
                                                     {"company_id": company_id, "days": 7}),
            "products":         lambda: execute_tool("get_product_summary",
                                                     {"company_id": company_id}),
        }

        results = {}
        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = {pool.submit(fn): key for key, fn in calls.items()}
            for future in as_completed(futures):
                key = futures[future]
                try:
                    results[key] = future.result()
                except Exception as e:
                    results[key] = {"error": str(e)}

        results["baseline_weekly_revenue"] = get_baseline(
            self.engine, company_id, self.name, "weekly_revenue"
        )
        results["baseline_monthly_revenue"] = get_baseline(
            self.engine, company_id, self.name, "monthly_revenue"
        )
        return results

    def _store_observations(self, company_id: str, findings: dict) -> None:
        super()._store_observations(company_id, findings)
        if not self.engine:
            return
        for f in findings.get("findings", []):
            if f.get("type") == "revenue_drop" and "current_value" in f:
                update_baseline(
                    self.engine, company_id, self.name,
                    "weekly_revenue", float(f["current_value"])
                )
            if f.get("revenue_health"):
                remember(
                    self.engine, company_id, self.name,
                    "observation", "revenue_health",
                    {"status": f["revenue_health"]},
                )
