# ==============================================================
# Phase 4C — Onboarding Agent
# ==============================================================
# Event-driven. Triggered when a new Person or Enterprise is
# created. Automates the full onboarding workflow:
#   - Duplicate detection
#   - Missing field identification
#   - Welcome task creation
#   - Relationship manager assignment
#   - Welcome message preparation
# ==============================================================

import logging

from ..base_agent import BaseAgent
from ..tool_registry import execute_tool
from ..agent_memory import remember

logger = logging.getLogger(__name__)


class OnboardingAgent(BaseAgent):
    name      = "onboarding"
    task_type = "onboarding"

    def system_prompt(self, company_id: str, context: dict) -> str:
        entity_type = context.get("entity_type", "person")
        entity_id   = context.get("entity_id", "unknown")
        return f"""You are the Onboarding Agent for company {company_id}.

A new {entity_type} (id: {entity_id}) has just been created.

Your role: ensure they are properly onboarded without any manual intervention.

Steps to complete:
1. Use semantic_search to check for likely duplicates in existing records
2. Assess which important fields are missing from the new record
3. Create a welcome/onboarding task (create_task action → auto approved)
4. Identify the appropriate relationship manager from get_people_summary
5. Prepare a personalised welcome message (submit via send_alert → approval gate)
6. Check if any related records should be linked (e.g. enterprise for a person)

Rules:
- company_id is always {company_id}
- Flag duplicates as findings but DO NOT merge — route for human review
- Missing critical fields (name, contact, type) are WARNING severity
- Missing optional fields are INFO severity
- Welcome messages always require approval — never send automatically

Produce a JSON response:
{{
  "summary": "New {entity_type} onboarded. N issues found.",
  "duplicate_risk": "none | possible | likely",
  "missing_fields": ["field1", "field2"],
  "findings": [
    {{
      "type": "duplicate_detected | missing_field | onboarding_complete",
      "severity": "info | warning | critical",
      "detail": "..."
    }}
  ],
  "actions": []
}}"""

    def observe(self, company_id: str) -> dict:
        # For onboarding, context comes from the trigger event
        # The entity details are passed in context by the caller
        from concurrent.futures import ThreadPoolExecutor, as_completed

        calls = {
            "people":      lambda: execute_tool("get_people_summary",     {"company_id": company_id}),
            "enterprises": lambda: execute_tool("get_enterprise_summary", {"company_id": company_id}),
        }

        results = {}
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = {pool.submit(fn): key for key, fn in calls.items()}
            for future in as_completed(futures):
                key = futures[future]
                try:
                    results[key] = future.result()
                except Exception as e:
                    results[key] = {"error": str(e)}

        return results

    def run_for_entity(self, company_id: str, entity_type: str,
                       entity_id: str, entity_data: dict) -> dict:
        """
        Specialised run triggered by entity creation event.
        Passes entity context into the agent loop.
        """
        from ..approval_gate import log_run
        from ..base_agent import _try_parse_json
        from ..llm_router import get_client, route, get_max_tokens
        from ..tool_registry import TOOL_DEFINITIONS
        import json

        context = {
            "entity_type": entity_type,
            "entity_id":   entity_id,
            "entity_data": entity_data,
            **self.observe(company_id),
        }

        return self.run(company_id=company_id, trigger=f"entity_created:{entity_type}:{entity_id}")

    def _store_observations(self, company_id: str, findings: dict) -> None:
        super()._store_observations(company_id, findings)
        if not self.engine:
            return
        remember(self.engine, company_id, self.name,
                 "observation", "last_onboarding",
                 {"duplicate_risk": findings.get("duplicate_risk", "none"),
                  "missing_fields": findings.get("missing_fields", [])})
