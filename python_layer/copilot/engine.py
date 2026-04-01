"""
python_layer/copilot/engine.py
================================
Grounded copilot engine — Qwen via Alibaba DashScope OpenAI-compatible API.

Uses the openai Python SDK pointed at DashScope's OpenAI-compatible endpoint
so the tool loop works identically to any OpenAI function-calling integration.

Layer 3 rule: reads from Layer 2 (analytics tables) only. Never touches Base44.
company_id is always injected server-side in execute_tool(). Never from user input.
"""

import json
import logging
import os

import openai

from .queries import TOOL_DEFINITIONS_OPENAI, execute_tool, get_operator_context, QueryEngine

logger = logging.getLogger(__name__)

# ── Qwen client via DashScope OpenAI-compatible endpoint ─────────────────────
# Client is constructed lazily (inside ask()) so a missing key at import time
# does not crash the app — it will fail at call time with a clear error.

DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
QWEN_MODEL         = os.getenv("QWEN_MODEL", "qwen-plus")


def _get_client() -> openai.OpenAI:
    """Return an OpenAI client configured for Qwen / DashScope."""
    api_key = os.getenv("DASHSCOPE_API_KEY", "")
    if not api_key:
        raise RuntimeError(
            "DASHSCOPE_API_KEY is not set. "
            "Add it to Railway Variables to enable the Qwen copilot."
        )
    return openai.OpenAI(api_key=api_key, base_url=DASHSCOPE_BASE_URL)


_BASE_INSTRUCTIONS = """\
You have access to real-time data tools that query the business's PostgreSQL analytics database.

ALWAYS use the available tools before answering any question about:
- Staff counts, availability, or scheduling
- Client numbers, retention, or discharge risk
- Revenue, invoices, or financial performance
- Task completion rates or visit outcomes
- Stock levels or inventory alerts
- Branch or network performance

Answer in plain language the operator can act on immediately.
When you have data, lead with the numbers first, then the interpretation.
Never make up numbers. If a tool returns no data, say so clearly.
Keep answers concise — operators are busy. Use bullet points for lists."""


def build_system_prompt(company_id: str) -> str:
    """
    Build the system prompt at request time using the operator's Enterprise record.
    Grounds the copilot in the specific business context — name, type, status.
    Falls back gracefully if the enterprise record is not yet populated.
    """
    ctx    = get_operator_context(company_id)
    name   = ctx.get("name", "this organisation")
    etype  = ctx.get("enterprise_type", "commercial")
    status = ctx.get("operating_status", "active")

    identity = (
        f"You are an operational assistant for {name} "
        f"({etype}, currently {status})."
    )
    return f"{identity}\n\n{_BASE_INSTRUCTIONS}"


async def ask(question: str, company_id: str, history: list = None) -> str:
    """
    Full grounded copilot call with tool loop.
    Uses Qwen via DashScope OpenAI-compatible API with function calling.
    Returns a final text answer grounded in real analytics data.

    Follows the three-layer rule: queries go to analytics.* tables (Layer 2).
    company_id is injected into every tool call server-side.
    """
    client  = _get_client()
    system  = build_system_prompt(company_id)

    # Build message list — system prompt + history + new question
    messages = [{"role": "system", "content": system}]
    for h in (history or []):
        if h.get("role") in ("user", "assistant"):
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": question})

    # ── Tool loop — up to 5 rounds ───────────────────────────────────────────
    response = None
    for _ in range(5):
        response = client.chat.completions.create(
            model=QWEN_MODEL,
            messages=messages,
            tools=TOOL_DEFINITIONS_OPENAI,
            tool_choice="auto",
        )

        choice = response.choices[0]

        # Done — no more tool calls
        if choice.finish_reason == "stop":
            return choice.message.content or ""

        # Qwen wants to call tools
        if choice.finish_reason == "tool_calls":
            tool_calls = choice.message.tool_calls or []

            # Add assistant message (with tool_calls) to history
            messages.append({
                "role":       "assistant",
                "content":    choice.message.content or "",
                "tool_calls": [
                    {
                        "id":       tc.id,
                        "type":     "function",
                        "function": {
                            "name":      tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in tool_calls
                ],
            })

            # Execute each tool and append results
            for tc in tool_calls:
                logger.info(
                    "Copilot calling tool: %s with args: %s",
                    tc.function.name, tc.function.arguments,
                )
                try:
                    tool_input = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    tool_input = {}

                result = execute_tool(
                    tool_name=tc.function.name,
                    tool_input=tool_input,
                    company_id=company_id,   # always injected server-side
                )

                messages.append({
                    "role":         "tool",
                    "tool_call_id": tc.id,
                    "content":      json.dumps(result, default=str),
                })

            continue

        # Unexpected finish_reason — exit loop
        break

    # Fallback — return whatever text is in the last response
    if response and response.choices:
        return response.choices[0].message.content or ""

    return "I was unable to retrieve the data needed to answer your question."


async def ask_stream(question: str, company_id: str, history: list = None):
    """
    Streaming version — yields text chunks as they arrive.
    Runs the full tool loop first, then yields the final answer in chunks.
    """
    full_answer = await ask(question, company_id, history)
    chunk_size  = 6
    for i in range(0, len(full_answer), chunk_size):
        yield full_answer[i:i + chunk_size]


class CopilotEngine:
    """
    Per-request wrapper used by routes.py.

    Instantiated with company_id + optional metadata.
    ask() is synchronous — routes.py calls it without await in both
    def and async def route handlers. The async module-level ask() is
    run in a ThreadPoolExecutor so asyncio.run() always gets a fresh
    event loop, avoiding conflicts with FastAPI's running loop.

    query_engine is a QueryEngine instance bound to company_id.
    routes.py uses it for /copilot/context data.
    """

    def __init__(
        self,
        company_id:      str,
        enterprise_name: str = "",
        backend:         str = "qwen",
        railway_url:     str = "",
    ):
        self.company_id      = company_id
        self.enterprise_name = enterprise_name
        self.backend         = backend
        self.railway_url     = railway_url
        self.query_engine    = QueryEngine(company_id)

    def ask(
        self,
        question: str,
        history:  list = None,
        context:  dict = None,
    ) -> dict:
        """
        Synchronous call — returns dict with answer, tools_called, data, intent.
        Runs the async ask() in a thread to avoid event-loop conflicts.

        context (dict) is flattened into the question prefix when non-empty
        so the LLM has that information without needing a separate tool call.
        """
        import asyncio
        import concurrent.futures

        full_question = question
        if context:
            ctx_str = "; ".join(f"{k}: {v}" for k, v in context.items() if v)
            if ctx_str:
                full_question = f"[Context: {ctx_str}]\n\n{question}"

        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(
                    asyncio.run,
                    ask(full_question, self.company_id, history or []),
                )
                answer_text = future.result(timeout=120)

            return {
                "answer":       answer_text,
                "tools_called": [],
                "data":         {},
                "intent":       "",
                "company_id":   self.company_id,
                "backend":      self.backend,
            }

        except Exception as exc:
            logger.error("CopilotEngine.ask failed: %s", exc)
            return {
                "answer":       "",
                "error":        str(exc),
                "tools_called": [],
                "data":         {},
                "intent":       "",
            }
