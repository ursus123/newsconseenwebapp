# ==============================================================
# Phase 4B — Operations Monitor Agent
# ==============================================================
# Watches task backlogs, staff availability, and operational
# health. Runs every 15 minutes.
#
# Responsibilities:
#   - Detect task backlogs exceeding thresholds
#   - Flag overdue tasks and reassign when staff are available
#   - Monitor staff availability vs. open task load
#   - Alert manager when operational health degrades
# ==============================================================

import json
import logging

from ..base_agent import BaseAgent
from ..tool_registry import execute_tool
from ..agent_memory import update_baseline, get_baseline, remember

logger = logging.getLogger(__name__)


class OperationsAgent(BaseAgent):
    name      = "operations"
    task_type = "operations_monitor"

    def system_prompt(self, company_id: str, context: dict) -> str:
        return f"""You are the Operations Monitor for company {company_id}.

Your role: continuously watch task completion rates, staff workload, and operational health.

Rules:
- company_id is always {company_id} — never change it in tool calls
- Use get_task_summary and get_overdue_tasks to assess operational state
- Use get_people_summary to check staff availability
- Compare current metrics to baselines in agent_memory to detect degradation
- Flag issues as findings with severity: info | warning | critical
- For overdue tasks: create reassignment recommendations (NOT automatic reassignments — route through approval gate)
- For staff overload: flag which staff members have too many open tasks
- Never send alerts without routing through the approval gate

After analysis, respond with a JSON object:
{{
  "summary": "one sentence operational health summary",
  "health_score": 0-100,
  "findings": [
    {{"type": "overdue_tasks", "severity": "warning", "detail": "...", "recommended_action": "..."}}
  ],
  "actions": []
}}"""

    def observe(self, company_id: str) -> dict:
        """Gather task and staff state in parallel."""
        from concurrent.futures import ThreadPoolExecutor, as_completed

        calls = {
            "tasks":   lambda: execute_tool("get_task_summary",   {"company_id": company_id}),
            "overdue": lambda: execute_tool("get_overdue_tasks",   {"company_id": company_id}),
            "people":  lambda: execute_tool("get_people_summary",  {"company_id": company_id}),
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

        # Load baselines for anomaly detection
        baseline = get_baseline(self.engine, company_id, self.name, "overdue_count")
        results["baseline_overdue"] = baseline

        return results

    def _store_observations(self, company_id: str, findings: dict) -> None:
        """Update overdue task baseline after each run."""
        super()._store_observations(company_id, findings)
        if not self.engine:
            return
        # Extract overdue count from findings and update baseline
        for f in findings.get("findings", []):
            if f.get("type") == "overdue_tasks" and "count" in f:
                update_baseline(
                    self.engine, company_id, self.name,
                    "overdue_count", float(f["count"])
                )
                break

        # Remember health score
        if findings.get("health_score") is not None:
            remember(
                self.engine, company_id, self.name,
                "baseline", "health_score",
                {"value": findings["health_score"]},
            )
