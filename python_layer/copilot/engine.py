"""
python_layer/copilot/engine.py
================================
The grounded copilot engine.
Passes TOOL_DEFINITIONS to the Anthropic API so Claude can
call real PostgreSQL query functions before answering.
"""

import json
import logging
import os
from .queries import TOOL_DEFINITIONS, execute_tool, get_operator_context, QueryEngine

logger = logging.getLogger(__name__)

# Lazy-initialised — do NOT create at module level.
# Creating anthropic.Anthropic() at import time crashes the whole module
# (and every /copilot/* route) if ANTHROPIC_API_KEY is missing.
_anthropic_client = None


def _get_client():
    """Return a cached Anthropic client, or raise a clear error if key is missing."""
    global _anthropic_client
    if _anthropic_client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. "
                "Add it to Railway environment variables to enable the copilot."
            )
        import anthropic as _anthropic
        _anthropic_client = _anthropic.Anthropic(api_key=api_key)
    return _anthropic_client

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
    ctx = get_operator_context(company_id)
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
    Returns a final text answer grounded in real data.
    """
    messages = list(history or [])
    messages.append({"role": "user", "content": question})

    client = _get_client()

    # ── Tool loop — up to 5 rounds ───────────────────────────────────────────
    for _ in range(5):
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=build_system_prompt(company_id),
            tools=TOOL_DEFINITIONS,
            messages=messages,
        )

        # If Claude is done (no more tool calls) return the text
        if response.stop_reason == "end_turn":
            text_blocks = [b.text for b in response.content if hasattr(b, "text")]
            return "\n".join(text_blocks)

        # If Claude wants to call tools — execute them all
        if response.stop_reason == "tool_use":
            # Add Claude's response (with tool_use blocks) to messages
            messages.append({"role": "assistant", "content": response.content})

            # Execute each tool call and collect results
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue

                logger.info(
                    "Copilot calling tool: %s with input: %s",
                    block.name,
                    block.input,
                )

                result = execute_tool(
                    tool_name=block.name,
                    tool_input=block.input,
                    company_id=company_id,  # always injected server-side
                )

                tool_results.append({
                    "type":        "tool_result",
                    "tool_use_id": block.id,
                    "content":     json.dumps(result, default=str),
                })

            # Add tool results to messages and loop again
            messages.append({"role": "user", "content": tool_results})
            continue

        # Unexpected stop reason
        break

    # Fallback — extract any text from last response
    if response and response.content:
        text_blocks = [b.text for b in response.content if hasattr(b, "text")]
        if text_blocks:
            return "\n".join(text_blocks)

    return "I was unable to retrieve the data needed to answer your question."


async def ask_stream(question: str, company_id: str, history: list = None):
    """
    Streaming version — yields text chunks as they arrive.
    Tool calls are executed silently, then the final answer streams.
    """
    # Run the full tool loop first (non-streaming)
    # then stream the final answer for UX
    full_answer = await ask(question, company_id, history)

    # Simulate streaming by yielding the answer in chunks
    chunk_size = 6
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
        company_id: str,
        enterprise_name: str = "",
        backend: str = "anthropic",
        railway_url: str = "",
    ):
        self.company_id      = company_id
        self.enterprise_name = enterprise_name
        self.backend         = backend
        self.railway_url     = railway_url
        self.query_engine    = QueryEngine(company_id)

    def ask(
        self,
        question: str,
        history: list = None,
        context: dict = None,
    ) -> dict:
        """
        Synchronous call — returns dict with answer, tools_called, data, intent.
        Runs the async ask() in a thread to avoid event-loop conflicts.

        context (dict) is flattened into the question prefix when non-empty
        so the LLM has that information without needing a separate tool call.
        """
        import asyncio
        import concurrent.futures

        # Flatten context dict into question prefix
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
