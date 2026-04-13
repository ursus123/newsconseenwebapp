"""
python_layer/copilot/engine.py
================================
The grounded copilot engine.
Passes TOOL_DEFINITIONS to the Anthropic API so Claude can
call real PostgreSQL query functions before answering.

Fixes applied:
  - max_tokens raised to 8192 (was 1024 — caused truncation)
  - Real SSE streaming: ask_stream_events() yields events as tools execute
  - In-memory session store: last 20 messages per (company_id, session_id)
  - Copilot always responds: never returns empty / raises to caller
"""

import json
import logging
import os
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from .queries import TOOL_DEFINITIONS, execute_tool, get_operator_context, QueryEngine

logger = logging.getLogger(__name__)

# ── Lazy Anthropic client ────────────────────────────────────────────────────

_anthropic_client = None


def _get_client():
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


# ── In-memory session store ──────────────────────────────────────────────────
# Key: (company_id, session_id)  Value: list of message dicts
# Bounded to MAX_SESSIONS entries (LRU eviction). Each session keeps
# MAX_HISTORY_MESSAGES messages so context does not grow unbounded.

MAX_SESSIONS          = 500
MAX_HISTORY_MESSAGES  = 20
SESSION_TTL_SECONDS   = 3600   # 1 hour

_session_store: OrderedDict = OrderedDict()   # {key: {"messages": [], "ts": float}}


def _session_key(company_id: str, session_id: str) -> str:
    return f"{company_id}::{session_id}"


def get_session_history(company_id: str, session_id: str) -> list:
    """Return stored history for this session, or [] if none / expired."""
    key = _session_key(company_id, session_id)
    entry = _session_store.get(key)
    if not entry:
        return []
    if time.time() - entry["ts"] > SESSION_TTL_SECONDS:
        _session_store.pop(key, None)
        return []
    return list(entry["messages"])


def save_session_history(company_id: str, session_id: str, messages: list) -> None:
    """Persist messages for this session (bounded, LRU)."""
    key = _session_key(company_id, session_id)
    # Trim to last MAX_HISTORY_MESSAGES
    trimmed = messages[-MAX_HISTORY_MESSAGES:]
    _session_store[key] = {"messages": trimmed, "ts": time.time()}
    _session_store.move_to_end(key)
    # Evict oldest if over limit
    while len(_session_store) > MAX_SESSIONS:
        _session_store.popitem(last=False)


# ── System prompt ────────────────────────────────────────────────────────────

_BASE_INSTRUCTIONS = """\
You have access to two categories of tools:

INTERNAL DATA TOOLS (query this organisation's own data):
- get_operator_context, get_people_summary, get_person_churn_risk
- get_staff_availability, get_transaction_summary, get_overdue_invoices
- get_task_summary, get_task_outcomes, get_product_summary
- get_enterprise_overview, get_network_overview, get_ml_predictions
- get_relationship_summary, get_address_overview, get_service_overview

WEB & PUBLIC DATA TOOLS (query external/public sources):
- web_search: multi-tier web search (Brave Search → DuckDuckGo → Wikipedia)
  Use for: market news, industry trends, competitor info, regulations, best practices
- search_public_data: structured public datasets —
  us_census (US demographics), world_bank (global GDP/health/education indicators),
  open_fda (drug/pharmacy data), osm_count (business counts by location),
  fx_rates (live currency exchange rates), un_data (UN development indicators),
  cms_pharmacy, state_pharmacy, dea_pharmacy (US pharmacy licensing)

WHEN TO USE EACH:
- Questions about this organisation's own operations → internal tools first
- Questions about market conditions, competitors, industry, regulations → web_search
- Demographic, economic, or global data → search_public_data (world_bank or un_data)
- Exchange rates, multi-currency financials → search_public_data with dataset=fx_rates
- Research and analysis → combine: get own context first, then web/public data

RULES:
- ALWAYS use the available tools before answering. Never make up statistics.
- When you have tool data, lead with the numbers first, then the interpretation.
- Clearly distinguish internal data (this organisation's own records) vs
  external data (public sources) in your answer.
- If a tool returns an error, try another tool or answer from what you do know.
- Always give a complete, useful answer — never return an empty response.
- Keep answers structured. Use bullet points for lists. Use markdown tables for comparisons."""


def build_system_prompt(company_id: str) -> str:
    """Build runtime system prompt grounded in the operator's Enterprise record."""
    ctx = get_operator_context(company_id)
    name   = ctx.get("name", "this organisation")
    etype  = ctx.get("enterprise_type", "commercial")
    status = ctx.get("operating_status", "active")
    identity = (
        f"You are an operational assistant for {name} "
        f"({etype}, currently {status})."
    )
    return f"{identity}\n\n{_BASE_INSTRUCTIONS}"


# ── Core tool loop ───────────────────────────────────────────────────────────

def _make_chart_config(tool_name: str, result: dict):
    """Generate a Recharts-compatible chart config from a tool result, or None."""
    try:
        if tool_name == "get_transaction_summary":
            rows = result.get("monthly_breakdown", [])
            if not rows:
                return None
            data = []
            for r in rows[:10]:
                tt = (r.get("transaction_type") or "Other").replace("_", " ").title()
                amt = round(float(r.get("total_amount") or 0), 2)
                data.append({"name": tt, "Amount": amt})
            data = sorted(data, key=lambda x: x["Amount"], reverse=True)[:8]
            if not data or all(d["Amount"] == 0 for d in data):
                return None
            return {"type": "bar", "title": "Revenue by Transaction Type",
                    "data": data, "keys": [{"key": "Amount", "color": "#10b981"}], "unit": "$"}

        if tool_name == "get_people_summary":
            summary = result.get("summary", {})
            if not summary:
                return None
            data = [
                {"name": k.replace("_", " ").title(), "value": v.get("total", 0)}
                for k, v in summary.items() if v.get("total", 0) > 0
            ]
            if not data:
                return None
            return {"type": "pie", "title": "People by Type", "data": data}

        if tool_name == "get_task_summary":
            breakdown = result.get("breakdown", [])
            if not breakdown:
                return None
            from collections import defaultdict
            by_type: dict = defaultdict(lambda: {"Total": 0, "Completed": 0, "Overdue": 0})
            for r in breakdown:
                tt = (r.get("task_type") or "Unknown").replace("_", " ").title()
                by_type[tt]["Total"]     += int(r.get("total_tasks", 0) or 0)
                by_type[tt]["Completed"] += int(r.get("completed_tasks", 0) or 0)
                by_type[tt]["Overdue"]   += int(r.get("overdue_tasks", 0) or 0)
            data = [{"name": k, **v} for k, v in list(by_type.items())[:8]]
            if not data:
                return None
            return {
                "type": "bar", "title": "Task Completion",
                "data": data,
                "keys": [
                    {"key": "Total",     "color": "#94a3b8"},
                    {"key": "Completed", "color": "#10b981"},
                    {"key": "Overdue",   "color": "#ef4444"},
                ],
            }

        if tool_name == "get_network_overview":
            enterprises = result.get("enterprises", [])
            if enterprises and len(enterprises) > 1:
                data = [
                    {"name": e.get("name", "Branch")[:18],
                     "People": int(e.get("people_count") or 0),
                     "Tasks":  int(e.get("task_count") or 0)}
                    for e in enterprises[:8]
                    if e.get("people_count") or e.get("task_count")
                ]
                if data:
                    return {
                        "type": "bar", "title": "Network Overview",
                        "data": data,
                        "keys": [
                            {"key": "People", "color": "#3b82f6"},
                            {"key": "Tasks",  "color": "#f59e0b"},
                        ],
                    }

        if tool_name == "get_ml_predictions":
            predictions = result.get("predictions", [])
            for pred in predictions[:2]:
                cfg = _ml_chart(pred.get("model", ""), pred.get("result", {}))
                if cfg:
                    return cfg

    except Exception as e:
        logger.debug("_make_chart_config(%s) error: %s", tool_name, e)
    return None


def _ml_chart(model: str, result: dict):
    """Chart config for a single ML model result."""
    try:
        if any(k in model for k in ("churn", "retention", "survival", "risk")):
            risk_data = []
            if "risk_distribution" in result:
                for level, count in result["risk_distribution"].items():
                    risk_data.append({"name": level.title(), "Count": int(count)})
            elif "high_risk" in result or "medium_risk" in result:
                risk_data = [
                    {"name": "High Risk",   "Count": int(result.get("high_risk", 0) or 0)},
                    {"name": "Medium Risk", "Count": int(result.get("medium_risk", 0) or 0)},
                    {"name": "Low Risk",    "Count": int(result.get("low_risk", 0) or 0)},
                ]
            if risk_data:
                return {"type": "bar", "title": "Retention Risk Distribution",
                        "data": risk_data, "keys": [{"key": "Count", "color": "#ef4444"}]}

        if any(k in model for k in ("segment", "ltv", "cluster")):
            segments = result.get("segments", result.get("cluster_summary", []))
            if segments:
                data = [
                    {"name": s.get("label") or s.get("segment") or f"Seg {i+1}",
                     "value": int(s.get("count", 0) or 0)}
                    for i, s in enumerate(segments[:6])
                ]
                if data:
                    return {"type": "pie", "title": "Customer Segments", "data": data}

        if any(k in model for k in ("demand", "forecast")):
            forecast = result.get("forecast", result.get("predictions", []))
            if forecast:
                data = [
                    {"name": f.get("period") or str(f.get("date", ""))[:7],
                     "Forecast": round(float(f.get("value") or f.get("forecast", 0)), 0)}
                    for f in forecast[:12]
                ]
                if data:
                    return {"type": "area", "title": "Demand Forecast",
                            "data": data, "keys": [{"key": "Forecast", "color": "#8b5cf6"}]}
    except Exception:
        pass
    return None


def _extract_chart_configs(collected_tools: list) -> list:
    """Extract chart configs from all collected tool results."""
    charts = []
    for item in collected_tools:
        cfg = _make_chart_config(item["tool"], item["result"])
        if cfg:
            charts.append(cfg)
    return charts


def _extract_citations(collected_tools: list) -> list:
    """Extract web search citations from collected tool results."""
    citations = []
    for item in collected_tools:
        if item["tool"] in ("web_search", "search_public_data"):
            for r in item.get("result", {}).get("results", []):
                url   = r.get("url", "")
                title = r.get("title", "")
                if url or title:
                    citations.append({
                        "title":   title or url,
                        "url":     url,
                        "snippet": r.get("snippet", ""),
                        "source":  item["tool"].replace("_", " ").title(),
                    })
    return citations[:8]


def _run_tool_loop(
    messages: list,
    company_id: str,
    on_tool_call=None,      # optional callback(tool_name, tool_input) → None
    _collected=None,        # if list, append {"tool", "input", "result"} per call
) -> str:
    """
    Run the Anthropic tool loop and return the final text answer.
    Always returns a non-empty string — never raises to callers.

    on_tool_call: optional callable invoked before each tool executes,
                  used by the streaming path to yield progress events.
    """
    client = _get_client()
    system = build_system_prompt(company_id)

    for attempt in range(6):
        try:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=8192,           # FIX: was 1024, caused truncated answers
                system=system,
                tools=TOOL_DEFINITIONS,
                messages=messages,
            )
        except Exception as e:
            logger.error("Anthropic API call failed (attempt %d): %s", attempt + 1, e)
            return (
                "I encountered an error reaching the AI service. "
                "Please try again in a moment. "
                f"(Error: {e})"
            )

        if response.stop_reason == "end_turn":
            text_blocks = [b.text for b in response.content if hasattr(b, "text")]
            answer = "\n".join(text_blocks).strip()
            return answer if answer else "I was unable to produce a response. Please rephrase your question."

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})

            tool_blocks = [b for b in response.content if b.type == "tool_use"]

            # Notify streaming caller before executing (sequential — ordering matters for UX)
            if on_tool_call:
                for block in tool_blocks:
                    try:
                        on_tool_call(block.name, block.input)
                    except Exception:
                        pass

            # Execute all tool calls in PARALLEL — each is an independent DB read.
            # When Claude requests get_people_summary + get_transaction_summary together,
            # both database queries run simultaneously instead of sequentially.
            # Results are keyed by tool_use_id to preserve ordering for the API response.
            def _run_tool(block):
                logger.info("Copilot tool [parallel]: %s  input: %s", block.name, block.input)
                try:
                    return block.id, execute_tool(
                        tool_name=block.name,
                        tool_input=block.input,
                        company_id=company_id,
                    )
                except Exception as e:
                    logger.warning("Tool %s raised: %s", block.name, e)
                    return block.id, {
                        "error": str(e),
                        "note": "Tool failed — answer from available context.",
                    }

            result_map = {}
            if len(tool_blocks) == 1:
                # Single tool — skip thread overhead
                bid, res = _run_tool(tool_blocks[0])
                result_map[bid] = res
            else:
                with ThreadPoolExecutor(
                    max_workers=len(tool_blocks),
                    thread_name_prefix="copilot-tool",
                ) as pool:
                    futures = {pool.submit(_run_tool, b): b for b in tool_blocks}
                    for future in as_completed(futures):
                        bid, res = future.result()
                        result_map[bid] = res

            # Collect tool results for chart/citation extraction
            if _collected is not None:
                for block in tool_blocks:
                    _collected.append({
                        "tool":   block.name,
                        "input":  dict(block.input) if hasattr(block.input, "items") else {},
                        "result": result_map.get(block.id, {}),
                    })

            # Preserve original tool ordering in the API message
            tool_results = [
                {
                    "type":        "tool_result",
                    "tool_use_id": block.id,
                    "content":     json.dumps(result_map[block.id], default=str),
                }
                for block in tool_blocks
            ]

            messages.append({"role": "user", "content": tool_results})
            continue

        # Unexpected stop reason — extract whatever text exists
        logger.warning("Unexpected stop_reason: %s", response.stop_reason)
        text_blocks = [b.text for b in response.content if hasattr(b, "text")]
        answer = "\n".join(text_blocks).strip()
        return answer if answer else "I was unable to complete the analysis. Please try again."

    return "I reached the maximum number of tool calls. Here is what I found so far — please ask a more specific question."


# ── Public async interface ───────────────────────────────────────────────────

async def ask(question: str, company_id: str, history: list = None) -> str:
    """Full grounded copilot call. Always returns a non-empty string."""
    messages = list(history or [])
    messages.append({"role": "user", "content": question})
    return _run_tool_loop(messages, company_id)


async def ask_stream_events(question: str, company_id: str, history: list = None):
    """
    Real SSE generator — yields JSON event strings as the tool loop progresses.

    Events:
      {"event": "thinking",  "content": "..."}       — initial acknowledgement
      {"event": "tool_call", "tool": "...", "input": {...}}  — before each tool
      {"event": "answer",    "content": "..."}        — final answer
      {"event": "done"}                               — stream end
    """
    messages = list(history or [])
    messages.append({"role": "user", "content": question})

    yield json.dumps({"event": "thinking", "content": "Analysing your question…"})

    tool_events = []

    def _on_tool(tool_name, tool_input):
        evt = json.dumps({"event": "tool_call", "tool": tool_name, "input": tool_input}, default=str)
        tool_events.append(evt)

    # Run synchronously in this coroutine (tool loop is CPU/IO bound, not async)
    import concurrent.futures
    loop_messages = list(messages)  # copy so we can report intermediate tools

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(_run_tool_loop, loop_messages, company_id, _on_tool)

        # Yield accumulated tool events while waiting
        prev_len = 0
        while not future.done():
            await _async_sleep(0.1)
            for evt in tool_events[prev_len:]:
                yield evt
            prev_len = len(tool_events)

        # Yield any remaining tool events
        for evt in tool_events[prev_len:]:
            yield evt

        answer = future.result()

    yield json.dumps({"event": "answer", "content": answer})
    yield json.dumps({"event": "done"})


async def _async_sleep(seconds: float):
    """Non-blocking sleep for use inside async generators."""
    import asyncio
    await asyncio.sleep(seconds)


# ── CopilotEngine class (used by routes.py) ──────────────────────────────────

class CopilotEngine:
    """
    Per-request wrapper used by routes.py.

    ask() is synchronous — wraps the async tool loop in a ThreadPoolExecutor.
    query_engine is a QueryEngine instance bound to company_id.
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
        session_id: str = "",
    ) -> dict:
        """
        Synchronous call — returns dict with answer, tools_called, data, intent.

        Session history:
          If session_id is provided, history is loaded from the in-memory
          session store and saved back after the response.
          Caller-supplied history takes precedence over session store.

        context (dict) is flattened into the question prefix when non-empty.
        """
        import asyncio
        import concurrent.futures

        # Resolve history: caller-supplied > session store > empty
        if history:
            resolved_history = list(history)
        elif session_id:
            resolved_history = get_session_history(self.company_id, session_id)
        else:
            resolved_history = []

        # Flatten context dict into question prefix
        full_question = question
        if context:
            ctx_str = "; ".join(f"{k}: {v}" for k, v in context.items() if v)
            if ctx_str:
                full_question = f"[Context: {ctx_str}]\n\n{question}"

        messages = list(resolved_history)
        messages.append({"role": "user", "content": full_question})

        try:
            collected: list = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(
                    _run_tool_loop, messages, self.company_id, None, collected
                )
                answer_text = future.result(timeout=120)

            # Save updated history to session store
            if session_id:
                updated = list(resolved_history)
                updated.append({"role": "user",      "content": full_question})
                updated.append({"role": "assistant",  "content": answer_text})
                save_session_history(self.company_id, session_id, updated)

            charts    = _extract_chart_configs(collected)
            citations = _extract_citations(collected)

            return {
                "answer":       answer_text,
                "tools_called": [c["tool"] for c in collected],
                "data":         {c["tool"]: c["result"] for c in collected},
                "charts":       charts,
                "citations":    citations,
                "intent":       "",
                "company_id":   self.company_id,
                "backend":      self.backend,
            }

        except Exception as exc:
            logger.error("CopilotEngine.ask failed: %s", exc)
            return {
                "answer": (
                    "I encountered an unexpected error processing your request. "
                    "Please try rephrasing your question, or check the Railway logs "
                    f"if this persists. (Detail: {exc})"
                ),
                "error":        str(exc),
                "tools_called": [],
                "data":         {},
                "charts":       [],
                "citations":    [],
                "intent":       "",
                "company_id":   self.company_id,
            }
