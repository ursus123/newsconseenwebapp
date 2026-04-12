# ==============================================================
# Phase 4C — Inventory Agent
# ==============================================================
# Monitors stock levels daily. Predicts stockouts 2 weeks ahead.
# Drafts purchase orders for critical items.
# ==============================================================

import logging

from ..base_agent import BaseAgent
from ..tool_registry import execute_tool
from ..agent_memory import remember, update_baseline, get_baseline

logger = logging.getLogger(__name__)


class InventoryAgent(BaseAgent):
    name      = "inventory"
    task_type = "inventory_check"

    def system_prompt(self, company_id: str, context: dict) -> str:
        return f"""You are the Inventory Agent for company {company_id}.

Your role: monitor stock levels, predict stockouts, and prepare purchase orders.

Rules:
- company_id is always {company_id}
- Use get_product_summary to assess current stock levels
- Use get_transaction_summary to understand consumption rates
- Calculate days-of-stock-remaining for each product
- Flag products with < 14 days of stock as WARNING, < 7 days as CRITICAL
- For critical stock: identify the supplier in get_enterprise_summary,
  draft a purchase order, submit as a create_purchase_order action
  (this will route through the approval gate automatically)
- Look for seasonal patterns in agent_memory to anticipate demand spikes
- Never create a purchase order without routing through approval gate

Produce a JSON response:
{{
  "summary": "N products at critical stock levels. M purchase orders prepared.",
  "inventory_health": "healthy | low_stock | critical",
  "findings": [
    {{
      "type": "low_stock | critical_stock | stockout_predicted | expiry_risk",
      "severity": "info | warning | critical",
      "product_name": "...",
      "current_stock": N,
      "days_remaining": N,
      "recommended_order_qty": N,
      "supplier_name": "...",
      "detail": "..."
    }}
  ],
  "actions": []
}}"""

    def observe(self, company_id: str) -> dict:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        calls = {
            "products":     lambda: execute_tool("get_product_summary",      {"company_id": company_id}),
            "transactions": lambda: execute_tool("get_transaction_summary",  {"company_id": company_id, "days": 30}),
            "enterprises":  lambda: execute_tool("get_enterprise_summary",   {"company_id": company_id}),
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

        results["seasonal_baseline"] = get_baseline(
            self.engine, company_id, self.name, "avg_monthly_consumption"
        )
        return results

    def _store_observations(self, company_id: str, findings: dict) -> None:
        super()._store_observations(company_id, findings)
        if not self.engine:
            return
        remember(self.engine, company_id, self.name,
                 "observation", "inventory_health",
                 {"status": findings.get("inventory_health", "unknown")})
