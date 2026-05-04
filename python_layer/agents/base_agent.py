# ==============================================================
# Phase 4A — Base Agent Loop
# ==============================================================
# The observe → think → act → report cycle every agent inherits.
#
# Flow:
#   1. Observe  — gather current state from tools
#   2. Think    — LLM reasons over observations, decides actions
#   3. Act      — execute tool calls, route through approval gate
#   4. Report   — produce findings summary, store in agent_runs
#
# Agents override observe() and get a system prompt.
# The think/act/report loop is universal.
# ==============================================================

import json
import logging
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

from .llm_router   import get_client, route, get_max_tokens
from .tool_registry import TOOL_DEFINITIONS, execute_tool
from .approval_gate import submit_action, log_run, get_risk_level, RiskLevel
from .agent_memory  import recall, remember, update_baseline

logger = logging.getLogger(__name__)

MAX_TOOL_LOOPS = 6


class BaseAgent(ABC):
    """
    Abstract base for all Newsconseen autonomous agents.

    Subclasses must implement:
        name            — agent identifier (used in DB, logs)
        task_type       — used by LLM router to pick model
        system_prompt() — instructions for this agent's role
        observe()       — gathers initial context for the LLM
    """

    name:      str = "base"
    task_type: str = "execution"

    def __init__(self, engine=None):
        from database import get_engine_safe
        self.engine = engine or get_engine_safe()

    @abstractmethod
    def system_prompt(self, company_id: str, context: dict) -> str:
        """Return the system prompt for this agent's run."""

    @abstractmethod
    def observe(self, company_id: str) -> dict:
        """
        Gather the initial observations this agent needs.
        Return a dict that becomes the first user message context.
        """

    # ── Public entry point ────────────────────────────────────────────────────

    def run(self, company_id: str, trigger: str = "scheduled") -> dict:
        """
        Execute the full observe → think → act → report cycle.
        Returns a findings dict.
        """
        logger.info("Agent %s starting for company %s (trigger=%s)",
                    self.name, company_id, trigger)

        # 1. Observe
        try:
            context = self.observe(company_id)
        except Exception as e:
            logger.error("Agent %s observe failed: %s", self.name, e)
            context = {"error": str(e)}

        # Recall relevant memories to enrich context
        memories = recall(self.engine, company_id, self.name) if self.engine else []
        if memories:
            context["agent_memory"] = memories[:10]  # top 10 strongest memories

        # 2. Think + Act loop
        try:
            findings = self._think_act_loop(company_id, context)
        except Exception as e:
            logger.error("Agent %s think/act failed: %s", self.name, e)
            findings = {"error": str(e), "actions": []}

        # 3. Report
        actions_taken   = len([a for a in findings.get("actions", []) if a.get("status") == "executed"])
        actions_pending = len([a for a in findings.get("actions", []) if a.get("status") == "pending"])
        summary = findings.get("summary", f"{self.name} completed run.")

        log_run(
            self.engine, company_id, self.name, trigger,
            status="completed" if "error" not in findings else "error",
            summary=summary,
            actions_taken=actions_taken,
            actions_pending=actions_pending,
            findings=findings.get("findings", []),
        )

        # Store key observations as memory
        self._store_observations(company_id, findings)

        # Write Insight + Recommendation records to intelligence layer
        self._write_intelligence(company_id, findings)

        logger.info("Agent %s finished — %d taken, %d pending",
                    self.name, actions_taken, actions_pending)
        return findings

    # ── Think + Act loop ─────────────────────────────────────────────────────

    def _think_act_loop(self, company_id: str, context: dict) -> dict:
        client    = get_client()
        model     = route(self.task_type)
        max_tokens = get_max_tokens(model)

        system    = self.system_prompt(company_id, context)
        user_msg  = (
            f"Current observations for company {company_id}:\n\n"
            f"{json.dumps(context, indent=2, default=str)}\n\n"
            "Analyse the situation, use tools as needed, then produce a JSON findings summary."
        )

        messages  = [{"role": "user", "content": user_msg}]
        actions:  list[dict] = []
        findings: list[dict] = []
        last_parsed: dict = {}  # full LLM JSON — passed to _store_observations as _raw

        for loop in range(MAX_TOOL_LOOPS):
            response = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                tools=TOOL_DEFINITIONS,
                messages=messages,
            )

            # Extract text blocks
            for block in response.content:
                if hasattr(block, "text") and block.text:
                    # Try to parse JSON findings from the response
                    text = block.text.strip()
                    parsed = _try_parse_json(text)
                    if parsed and isinstance(parsed, dict):
                        last_parsed = parsed  # capture full JSON for agent-specific use
                        findings = parsed.get("findings", findings)

            if response.stop_reason == "end_turn":
                break

            if response.stop_reason != "tool_use":
                break

            # Parallel tool execution
            tool_blocks = [b for b in response.content
                           if hasattr(b, "type") and b.type == "tool_use"]

            tool_results = self._execute_tools_parallel(
                company_id, tool_blocks, actions
            )

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user",      "content": tool_results})

        # Final text extraction for summary
        summary_text = ""
        for block in response.content:
            if hasattr(block, "text") and block.text:
                parsed = _try_parse_json(block.text)
                if parsed:
                    last_parsed = parsed
                    summary_text = parsed.get("summary", block.text[:300])
                    findings = parsed.get("findings", findings)
                else:
                    summary_text = block.text[:300]
                break

        return {
            "summary":  summary_text or f"{self.name} run complete.",
            "findings": findings,
            "actions":  actions,
            "_raw":     last_parsed,  # full LLM JSON (competitive_landscape, opportunities, etc.)
        }

    # ── Parallel tool execution ───────────────────────────────────────────────

    def _execute_tools_parallel(self, company_id: str,
                                 tool_blocks: list,
                                 actions: list) -> list[dict]:
        """Execute tool calls in parallel, routing through approval gate."""
        result_map: dict[str, dict] = {}

        def _run_one(block):
            tool_name = block.name
            inputs    = dict(block.input)
            # Always inject company_id — never trust agent-provided value
            inputs["company_id"] = company_id

            # Check if this action needs approval
            action_type = _map_tool_to_action(tool_name)
            risk = get_risk_level(action_type)

            if risk in (RiskLevel.APPROVE, RiskLevel.CRITICAL):
                # Route through approval gate — do NOT execute
                gate_result = submit_action(
                    self.engine, company_id, self.name,
                    action_type=action_type,
                    action_label=f"{tool_name}: {json.dumps(inputs)[:100]}",
                    action_payload={"tool": tool_name, "inputs": inputs},
                    reasoning=f"Agent {self.name} requested this action.",
                )
                actions.append({**gate_result, "tool": tool_name})
                return block.id, {"status": "pending_approval",
                                   "approval_id": gate_result.get("approval_id")}

            # Execute tool
            result = execute_tool(tool_name, inputs)

            # Phase 13: if the tool returned a write-back proposal (AUTO/NOTIFY),
            # execute it immediately via action_executor
            if isinstance(result, dict) and result.get("proposed"):
                from .action_executor import execute_action
                exec_result = execute_action(
                    action_type=result.get("action_type", action_type),
                    action_payload=result.get("inputs", inputs),
                    company_id=company_id,
                    agent_name=self.name,
                    engine=self.engine,
                )
                actions.append({"tool": tool_name, "status": "executed",
                                 "risk": risk.value, "execution": exec_result})
                return block.id, exec_result

            actions.append({"tool": tool_name, "status": "executed",
                             "risk": risk.value})
            return block.id, result

        with ThreadPoolExecutor(max_workers=min(len(tool_blocks), 6),
                                thread_name_prefix=f"agent-{self.name}") as pool:
            futures = {pool.submit(_run_one, b): b for b in tool_blocks}
            for future in as_completed(futures):
                try:
                    block_id, result = future.result()
                    result_map[block_id] = result
                except Exception as e:
                    block = futures[future]
                    result_map[block.id] = {"error": str(e)}

        return [
            {
                "type":        "tool_result",
                "tool_use_id": b.id,
                "content":     json.dumps(result_map.get(b.id, {}), default=str),
            }
            for b in tool_blocks
        ]

    # ── Intelligence layer write-back ─────────────────────────────────────────

    def _write_intelligence(self, company_id: str, findings: dict) -> None:
        """
        After every run, write Insight records for significant findings and
        Recommendation records for pending actions requiring approval.
        Fire-and-forget — never blocks the run result.
        """
        if "error" in findings:
            return

        try:
            from copilot.action_tools import write_insight, write_recommendation
        except Exception:
            return

        insight_id = None

        # Write one Insight per agent run summarising findings
        summary = findings.get("summary", "")
        raw_findings = findings.get("findings", [])
        if summary and raw_findings:
            try:
                result = write_insight(
                    company_id=company_id,
                    insight_type="trend",
                    title=f"{self.name.replace('_', ' ').title()} — {summary[:80]}",
                    body=summary,
                    subject_type="company",
                    subject_id=company_id,
                    evidence=[json.dumps(f, default=str)[:200] for f in raw_findings[:5]],
                )
                insight_id = result.get("insight_id")
            except Exception as e:
                logger.debug("_write_intelligence insight failed: %s", e)

        # Write Recommendation records for pending approval-gate actions
        pending_actions = [a for a in findings.get("actions", [])
                           if a.get("status") == "pending"]
        for action in pending_actions[:5]:  # cap at 5 per run
            try:
                tool = action.get("tool", "action")
                label = action.get("action_label", tool)
                write_recommendation(
                    company_id=company_id,
                    title=label[:120],
                    description=json.dumps(action.get("action_payload", {}), default=str)[:500],
                    action_type=action.get("action_type", tool),
                    source_agent=self.name,
                    priority="high" if action.get("risk") == "critical" else "medium",
                    insight_id=insight_id,
                    action_payload=action.get("action_payload"),
                    approval_required=True,
                )
            except Exception as e:
                logger.debug("_write_intelligence recommendation failed: %s", e)

    # ── Memory storage ────────────────────────────────────────────────────────

    def _store_observations(self, company_id: str, findings: dict) -> None:
        """
        Subclasses can override to store specific observations as memory.
        Default: store the summary as an observation.
        """
        if not self.engine or not findings.get("summary"):
            return
        remember(
            self.engine, company_id, self.name,
            memory_type="observation",
            key="last_run_summary",
            value={"summary": findings.get("summary", ""),
                   "findings_count": len(findings.get("findings", []))},
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _try_parse_json(text: str) -> Optional[dict]:
    """Try to extract JSON from a text block."""
    text = text.strip()
    # Find first { ... }
    start = text.find("{")
    end   = text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(text[start:end + 1])
    except Exception:
        return None


def _map_tool_to_action(tool_name: str) -> str:
    """Map tool name to action type for approval gate risk assessment."""
    _map = {
        # Read-only — auto
        "get_people_summary":        "read_data",
        "get_enterprise_summary":    "read_data",
        "get_transaction_summary":   "read_data",
        "get_task_summary":          "read_data",
        "get_product_summary":       "read_data",
        "get_overdue_tasks":         "read_data",
        "get_retention_risk":        "read_data",
        "get_ltv_segments":          "read_data",
        "get_staffing_forecast":     "read_data",
        "get_nearby_locations":      "read_data",
        "get_density_map":           "read_data",
        "semantic_search":           "read_data",
        "copilot_ask":               "read_data",
        "get_network_overview":      "read_data",
        "search_market":             "read_data",
        "get_competitor_density":    "read_data",
        "trigger_etl":               "trigger_etl",
        # Phase 13 — write-back tools
        "create_task":               "create_task",       # AUTO
        "create_follow_up":          "create_follow_up",  # AUTO
        "flag_record":               "flag_record",       # AUTO
        "update_record":             "update_record",     # NOTIFY
        "send_alert":                "send_client_message",  # APPROVE
    }
    return _map.get(tool_name, "update_record")
