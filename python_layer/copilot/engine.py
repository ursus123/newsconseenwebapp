# ==============================================================
# Newsconseen Operational Copilot — Engine
# ==============================================================
# The core engine that orchestrates:
#   1. Intent classification  — what is the user asking?
#   2. Query execution        — fetch the relevant data
#   3. LLM response           — ground the answer in real data
#
# MODEL-AGNOSTIC DESIGN:
# The engine works with any LLM that supports:
#   - A system prompt
#   - Tool/function calling (preferred)
#   - OR simple message completion (fallback)
#
# Supported backends (set COPILOT_BACKEND in .env):
#   anthropic  — Claude claude-sonnet-4-20250514 (default)
#   openai     — GPT-4o
#   mistral    — Mistral Large
#   local      — Ollama local model
#
# The LLMAdapter class abstracts the differences.
# Swap the backend without changing anything else.
# ==============================================================

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from copilot.prompts import (
    build_system_prompt,
    INTENT_CLASSIFICATION_PROMPT,
    TEMPLATES,
)
from copilot.queries import QueryEngine

logger = logging.getLogger(__name__)


# ----------------------------------------------------------
# Tool definitions — the bridge between LLM and query engine
# These are passed to the LLM as callable tools.
# When the LLM wants data it calls one of these.
# ----------------------------------------------------------

COPILOT_TOOLS = [
    {
        "name": "query_people",
        "description": "Fetch people analytics. Use for questions about staff, clients, volunteers, headcount, availability, retention.",
        "input_schema": {
            "type": "object",
            "properties": {
                "person_type":    {"type": "string", "description": "staff | client | contact | volunteer"},
                "person_subtype": {"type": "string", "description": "e.g. Teacher, Nurse, Student Customer, Patient"},
                "status":         {"type": "string", "description": "active | inactive | on_leave"},
                "enterprise_id":  {"type": "string", "description": "filter by specific branch/enterprise"},
            },
        },
    },
    {
        "name": "query_products",
        "description": "Fetch inventory/product analytics. Use for stock levels, expiry alerts, low stock, inventory value.",
        "input_schema": {
            "type": "object",
            "properties": {
                "item_type":    {"type": "string", "description": "physical | living | digital | service_package"},
                "item_subtype": {"type": "string", "description": "e.g. Medication, Equipment, Cattle, Software"},
                "low_stock":    {"type": "boolean", "description": "true to return only items below reorder level"},
                "expiring":     {"type": "boolean", "description": "true to return only items expiring soon"},
                "expiry_days":  {"type": "integer", "description": "days ahead for expiry filter (default 30)"},
            },
        },
    },
    {
        "name": "query_tasks",
        "description": "Fetch task/attendance analytics. Use for completion rates, overdue tasks, attendance.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_type":     {"type": "string", "description": "e.g. attendance, maintenance, delivery"},
                "enterprise_id": {"type": "string"},
                "overdue_only":  {"type": "boolean", "description": "true to return only overdue tasks"},
            },
        },
    },
    {
        "name": "query_transactions",
        "description": "Fetch financial analytics. Use for revenue, expenses, cash flow, payment totals.",
        "input_schema": {
            "type": "object",
            "properties": {
                "revenue_only":  {"type": "boolean", "description": "true to return only revenue transactions"},
                "expense_only":  {"type": "boolean", "description": "true to return only expense transactions"},
                "period":        {"type": "string", "description": "7d | 30d | all"},
                "enterprise_id": {"type": "string"},
            },
        },
    },
    {
        "name": "query_relationships",
        "description": "Fetch relationship data. Use for who works where, what is assigned to whom.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category":       {"type": "string", "description": "person_enterprise | item_enterprise | item_person"},
                "enterprise_name":{"type": "string", "description": "filter by enterprise name"},
                "person_name":    {"type": "string", "description": "filter by person name"},
                "active_only":    {"type": "boolean"},
            },
        },
    },
    {
        "name": "query_enterprises",
        "description": "Fetch enterprise/branch data. Use for branch list, locations, performance overview.",
        "input_schema": {
            "type": "object",
            "properties": {
                "enterprise_type": {"type": "string", "description": "commercial | nonprofit | government"},
                "active_only":     {"type": "boolean"},
                "is_root":         {"type": "boolean", "description": "true to return only top-level enterprises"},
            },
        },
    },
    {
        "name": "query_network_overview",
        "description": "Fetch a comprehensive cross-entity overview with alerts. Use for 'how are we doing' questions.",
        "input_schema": {"type": "object", "properties": {}},
    },
]


class CopilotEngine:
    """
    The Newsconseen Operational Copilot engine.

    Takes a natural language question, fetches grounded data,
    and returns a grounded natural language answer.

    Usage:
        engine = CopilotEngine(company_id="abc123", backend="anthropic")
        response = engine.ask("Which medications expire this month?")
        print(response["answer"])
    """

    def __init__(
        self,
        company_id:       str,
        backend:          str = "anthropic",
        enterprise_name:  str = "",
        railway_url:      str = "https://newsconseenwebapp-production.up.railway.app",
    ):
        self.company_id      = company_id
        self.enterprise_name = enterprise_name
        self.query_engine    = QueryEngine(company_id=company_id, base_url=railway_url)
        self.adapter         = LLMAdapter(backend=backend)
        self.system_prompt   = build_system_prompt(company_id, enterprise_name)

    def ask(
        self,
        question:      str,
        history:       list[dict] = None,
        context:       dict = None,
    ) -> dict:
        """
        Answer a natural language question using real ontology data.

        Args:
            question: The operator's question in plain language
            history:  Previous messages in this conversation
                      [{"role": "user"|"assistant", "content": "..."}]
            context:  Optional context dict — current page, selected enterprise, etc.

        Returns:
            {
                answer:       str   — the grounded natural language answer
                data:         dict  — raw data used to generate the answer
                tools_called: list  — which query tools were called
                intent:       str   — classified intent
                error:        str   — error message if failed
            }
        """
        logger.info(
            "CopilotEngine.ask: company_id=%s question='%s'",
            self.company_id, question[:100],
        )

        tools_called = []
        query_results = {}

        try:
            # Build messages
            messages = list(history or [])
            messages.append({"role": "user", "content": question})

            # First LLM call — let the LLM decide which tools to call
            response = self.adapter.complete(
                system=self.system_prompt,
                messages=messages,
                tools=COPILOT_TOOLS,
            )

            # Process tool calls in a loop until no more tool calls
            max_iterations = 5
            iteration = 0

            while response.get("tool_calls") and iteration < max_iterations:
                iteration += 1

                for tool_call in response["tool_calls"]:
                    tool_name  = tool_call["name"]
                    tool_input = tool_call.get("input", {})
                    tool_id    = tool_call.get("id", tool_name)

                    logger.info(
                        "CopilotEngine: calling tool %s with %s",
                        tool_name, tool_input,
                    )

                    # Execute the tool
                    result = self._execute_tool(tool_name, tool_input)
                    query_results[tool_name] = result
                    tools_called.append({
                        "tool":   tool_name,
                        "input":  tool_input,
                        "count":  result.get("count", 0),
                        "error":  result.get("error"),
                    })

                    # Add tool result to messages for next LLM call
                    messages.append({
                        "role":    "assistant",
                        "content": response.get("content", ""),
                        "tool_calls": response["tool_calls"],
                    })
                    messages.append({
                        "role":       "tool",
                        "tool_use_id":tool_id,
                        "content":    json.dumps(self._serialize_result(result)),
                    })

                # Next LLM call with tool results
                response = self.adapter.complete(
                    system=self.system_prompt,
                    messages=messages,
                    tools=COPILOT_TOOLS,
                )

            answer = response.get("content", "")

            # Classify intent (for analytics/logging)
            intent = self._classify_intent(question)

            logger.info(
                "CopilotEngine: answered — intent=%s tools=%s",
                intent, [t["tool"] for t in tools_called],
            )

            return {
                "answer":       answer,
                "data":         query_results,
                "tools_called": tools_called,
                "intent":       intent,
                "error":        None,
                "timestamp":    datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            logger.error("CopilotEngine.ask: failed — %s", e)
            return {
                "answer":       "I encountered an error processing your question. Please try again.",
                "data":         {},
                "tools_called": tools_called,
                "intent":       "unknown",
                "error":        str(e),
                "timestamp":    datetime.now(timezone.utc).isoformat(),
            }

    def _execute_tool(self, tool_name: str, tool_input: dict) -> dict:
        """Dispatch a tool call to the query engine."""
        method_map = {
            "query_people":           self.query_engine.query_people,
            "query_products":         self.query_engine.query_products,
            "query_tasks":            self.query_engine.query_tasks,
            "query_transactions":     self.query_engine.query_transactions,
            "query_relationships":    self.query_engine.query_relationships,
            "query_enterprises":      self.query_engine.query_enterprises,
            "query_network_overview": self.query_engine.query_network_overview,
        }

        method = method_map.get(tool_name)
        if not method:
            return {"data": [], "count": 0, "error": f"Unknown tool: {tool_name}"}

        try:
            return method(**tool_input)
        except TypeError as e:
            # Invalid parameters — try without params
            logger.warning("CopilotEngine: tool %s invalid params %s — %s", tool_name, tool_input, e)
            return method()
        except Exception as e:
            logger.error("CopilotEngine: tool %s failed — %s", tool_name, e)
            return {"data": [], "count": 0, "error": str(e)}

    def _classify_intent(self, question: str) -> str:
        """Classify the question intent for logging."""
        q = question.lower()
        if any(w in q for w in ["expire", "expiry", "expiring", "use by"]):
            return "stock_expiry"
        if any(w in q for w in ["low stock", "reorder", "running out", "out of stock"]):
            return "stock_low"
        if any(w in q for w in ["stock", "inventory", "quantity", "how many items"]):
            return "stock_levels"
        if any(w in q for w in ["revenue", "income", "earned", "sales"]):
            return "financial_revenue"
        if any(w in q for w in ["expense", "cost", "spent", "payment"]):
            return "financial_expenses"
        if any(w in q for w in ["cash", "profit", "net", "balance"]):
            return "financial_cashflow"
        if any(w in q for w in ["available", "on leave", "busy", "shift"]):
            return "people_availability"
        if any(w in q for w in ["how many staff", "how many clients", "headcount", "total people"]):
            return "people_count"
        if any(w in q for w in ["overdue", "late", "missed", "pending"]):
            return "task_overdue"
        if any(w in q for w in ["attendance", "completion", "rate"]):
            return "task_completion"
        if any(w in q for w in ["overview", "summary", "how are we", "dashboard"]):
            return "network_overview"
        return "unknown"

    def _serialize_result(self, result: dict) -> dict:
        """Serialize query result for JSON — limit data size for LLM context."""
        if result.get("error"):
            return {"error": result["error"]}

        # Limit data records sent to LLM to prevent context overflow
        MAX_RECORDS = 20
        data = result.get("data", [])
        truncated = len(data) > MAX_RECORDS

        return {
            "count":     result.get("count", len(data)),
            "summary":   result.get("summary", {}),
            "data":      data[:MAX_RECORDS],
            "truncated": truncated,
            "note":      f"Showing {MAX_RECORDS} of {len(data)} records" if truncated else None,
        }


# ----------------------------------------------------------
# LLM Adapter — model-agnostic interface
# ----------------------------------------------------------

class LLMAdapter:
    """
    Model-agnostic LLM interface.

    Abstracts the differences between Anthropic, OpenAI,
    Mistral, and local models behind a single complete() method.

    Set COPILOT_BACKEND in .env:
        anthropic  (default) — Claude claude-sonnet-4-20250514
        openai               — GPT-4o
        mistral              — Mistral Large
        local                — Ollama (requires local Ollama install)
    """

    def __init__(self, backend: str = "anthropic"):
        self.backend = backend.lower()
        logger.info("LLMAdapter: using backend=%s", self.backend)

    def complete(
        self,
        system:   str,
        messages: list[dict],
        tools:    list[dict] = None,
    ) -> dict:
        """
        Send a completion request to the configured LLM.

        Returns:
            {
                content:    str        — text response
                tool_calls: list|None  — tool calls if any
            }
        """
        if self.backend == "anthropic":
            return self._complete_anthropic(system, messages, tools)
        elif self.backend == "openai":
            return self._complete_openai(system, messages, tools)
        elif self.backend == "mistral":
            return self._complete_mistral(system, messages, tools)
        elif self.backend == "local":
            return self._complete_local(system, messages, tools)
        else:
            logger.warning("LLMAdapter: unknown backend %s — using anthropic", self.backend)
            return self._complete_anthropic(system, messages, tools)

    def _complete_anthropic(
        self, system: str, messages: list, tools: list
    ) -> dict:
        """Claude API via Anthropic SDK."""
        try:
            import anthropic
            client = anthropic.Anthropic()

            # Convert tool format to Anthropic format
            anthropic_tools = []
            if tools:
                for tool in tools:
                    anthropic_tools.append({
                        "name":         tool["name"],
                        "description":  tool["description"],
                        "input_schema": tool.get("input_schema", {"type": "object", "properties": {}}),
                    })

            # Normalize messages for Anthropic format
            normalized = self._normalize_messages_anthropic(messages)

            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2048,
                system=system,
                messages=normalized,
                tools=anthropic_tools if anthropic_tools else anthropic.NOT_GIVEN,
            )

            # Extract text and tool use blocks
            content_text  = ""
            tool_calls    = []

            for block in response.content:
                if block.type == "text":
                    content_text = block.text
                elif block.type == "tool_use":
                    tool_calls.append({
                        "id":    block.id,
                        "name":  block.name,
                        "input": block.input,
                    })

            return {
                "content":    content_text,
                "tool_calls": tool_calls if tool_calls else None,
            }

        except ImportError:
            logger.error("LLMAdapter: anthropic SDK not installed — pip install anthropic")
            return {"content": "Anthropic SDK not installed.", "tool_calls": None}
        except Exception as e:
            logger.error("LLMAdapter._complete_anthropic: %s", e)
            return {"content": f"LLM error: {str(e)}", "tool_calls": None}

    def _complete_openai(
        self, system: str, messages: list, tools: list
    ) -> dict:
        """OpenAI GPT-4o API."""
        try:
            from openai import OpenAI
            client = OpenAI()

            openai_messages = [{"role": "system", "content": system}]
            for msg in messages:
                if msg.get("role") == "tool":
                    openai_messages.append({
                        "role":         "tool",
                        "tool_call_id": msg.get("tool_use_id", ""),
                        "content":      msg.get("content", ""),
                    })
                else:
                    openai_messages.append({
                        "role":    msg["role"],
                        "content": msg.get("content", ""),
                    })

            # Convert tools to OpenAI format
            openai_tools = []
            if tools:
                for tool in tools:
                    openai_tools.append({
                        "type": "function",
                        "function": {
                            "name":        tool["name"],
                            "description": tool["description"],
                            "parameters":  tool.get("input_schema", {"type": "object", "properties": {}}),
                        },
                    })

            response = client.chat.completions.create(
                model="gpt-4o",
                messages=openai_messages,
                tools=openai_tools if openai_tools else None,
                tool_choice="auto" if openai_tools else None,
                max_tokens=2048,
            )

            message  = response.choices[0].message
            content  = message.content or ""
            tool_calls = []

            if message.tool_calls:
                for tc in message.tool_calls:
                    try:
                        args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        args = {}
                    tool_calls.append({
                        "id":    tc.id,
                        "name":  tc.function.name,
                        "input": args,
                    })

            return {
                "content":    content,
                "tool_calls": tool_calls if tool_calls else None,
            }

        except ImportError:
            logger.error("LLMAdapter: openai SDK not installed — pip install openai")
            return {"content": "OpenAI SDK not installed.", "tool_calls": None}
        except Exception as e:
            logger.error("LLMAdapter._complete_openai: %s", e)
            return {"content": f"LLM error: {str(e)}", "tool_calls": None}

    def _complete_mistral(
        self, system: str, messages: list, tools: list
    ) -> dict:
        """Mistral Large API."""
        try:
            from mistralai import Mistral
            client = Mistral()

            mistral_messages = [{"role": "system", "content": system}]
            for msg in messages:
                mistral_messages.append({
                    "role":    msg["role"] if msg["role"] != "tool" else "tool",
                    "content": msg.get("content", ""),
                })

            mistral_tools = []
            if tools:
                for tool in tools:
                    mistral_tools.append({
                        "type": "function",
                        "function": {
                            "name":        tool["name"],
                            "description": tool["description"],
                            "parameters":  tool.get("input_schema", {"type": "object", "properties": {}}),
                        },
                    })

            response = client.chat.complete(
                model="mistral-large-latest",
                messages=mistral_messages,
                tools=mistral_tools if mistral_tools else None,
                max_tokens=2048,
            )

            message    = response.choices[0].message
            content    = message.content or ""
            tool_calls = []

            if message.tool_calls:
                for tc in message.tool_calls:
                    try:
                        args = json.loads(tc.function.arguments)
                    except json.JSONDecodeError:
                        args = {}
                    tool_calls.append({
                        "id":    tc.id,
                        "name":  tc.function.name,
                        "input": args,
                    })

            return {
                "content":    content,
                "tool_calls": tool_calls if tool_calls else None,
            }

        except ImportError:
            logger.error("LLMAdapter: mistralai SDK not installed")
            return {"content": "Mistral SDK not installed.", "tool_calls": None}
        except Exception as e:
            logger.error("LLMAdapter._complete_mistral: %s", e)
            return {"content": f"LLM error: {str(e)}", "tool_calls": None}

    def _complete_local(
        self, system: str, messages: list, tools: list
    ) -> dict:
        """
        Local model via Ollama.
        Requires Ollama running locally: https://ollama.ai
        Recommended model: ollama pull llama3.1:8b
        Note: local models have limited tool-calling support.
        """
        try:
            import requests as req

            ollama_url   = "http://localhost:11434/api/chat"
            model        = "llama3.1:8b"

            ollama_messages = [{"role": "system", "content": system}]
            for msg in messages:
                ollama_messages.append({
                    "role":    "assistant" if msg["role"] in ("tool", "tool_result") else msg["role"],
                    "content": msg.get("content", ""),
                })

            resp = req.post(
                ollama_url,
                json={
                    "model":    model,
                    "messages": ollama_messages,
                    "stream":   False,
                },
                timeout=60,
            )
            resp.raise_for_status()
            content = resp.json().get("message", {}).get("content", "")

            return {"content": content, "tool_calls": None}

        except Exception as e:
            logger.error("LLMAdapter._complete_local: %s", e)
            return {
                "content": "Local model unavailable. Install Ollama and run: ollama pull llama3.1:8b",
                "tool_calls": None,
            }

    def _normalize_messages_anthropic(self, messages: list) -> list:
        """
        Normalize message history to Anthropic API format.
        Handles tool result messages correctly.
        """
        normalized = []
        for msg in messages:
            role = msg.get("role", "user")

            if role == "tool":
                # Anthropic expects tool results in a specific format
                normalized.append({
                    "role": "user",
                    "content": [{
                        "type":        "tool_result",
                        "tool_use_id": msg.get("tool_use_id", ""),
                        "content":     msg.get("content", ""),
                    }],
                })
            elif role == "assistant" and msg.get("tool_calls"):
                # Assistant message with tool calls
                content_blocks = []
                if msg.get("content"):
                    content_blocks.append({"type": "text", "text": msg["content"]})
                for tc in msg["tool_calls"]:
                    content_blocks.append({
                        "type":  "tool_use",
                        "id":    tc.get("id", tc["name"]),
                        "name":  tc["name"],
                        "input": tc.get("input", {}),
                    })
                normalized.append({"role": "assistant", "content": content_blocks})
            else:
                normalized.append({"role": role, "content": msg.get("content", "")})

        return normalized
