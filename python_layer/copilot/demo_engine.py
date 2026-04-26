"""
python_layer/copilot/demo_engine.py
=====================================
Idjwi — the Newsconseen public demo intelligence.

Runs on the landing page for unauthenticated visitors.
Has ALL production copilot capabilities — same tools, same chart extraction,
same response richness. The only difference: no company data (company_id="demo"
returns empty results, which Idjwi acknowledges gracefully).

Identity: Idjwi (ee-JEE-wee) — the intelligence layer of Newsconseen.
"""

import asyncio
import hashlib
import json
import logging
import os
import time
from collections import defaultdict
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Docs loader ───────────────────────────────────────────────────────────────

_DOCS_PATH = Path(__file__).parent / "docs" / "newsconseen_docs.md"


def _load_docs() -> str:
    try:
        return _DOCS_PATH.read_text(encoding="utf-8")
    except Exception:
        return ""


# ── Simple in-memory IP rate limiter ─────────────────────────────────────────
# 20 requests per IP per hour.

_rate_store: dict = defaultdict(lambda: {"count": 0, "window": 0})
_RATE_LIMIT = 20


def _check_rate_limit(ip: str) -> bool:
    window = int(time.time()) // 3600
    rec = _rate_store[ip]
    if rec["window"] != window:
        rec["count"] = 0
        rec["window"] = window
    if rec["count"] >= _RATE_LIMIT:
        return False
    rec["count"] += 1
    return True


# ── Public-data response cache ────────────────────────────────────────────────
# Avoids hammering external APIs for repeated demo prompts (FX, World Bank, etc.)

_cache: dict = {}
_CACHE_TTL = {
    "search_public_data": 3600,   # FX/WorldBank data — 1 hour
    "web_search":          600,   # Web results — 10 minutes
}

_TOOL_TIMEOUT = {
    "web_search":          10.0,
    "search_public_data":   8.0,
    "default":              6.0,
}


def _cache_key(tool_name: str, tool_input: dict) -> str:
    raw = json.dumps(tool_input, sort_keys=True, default=str)
    digest = hashlib.md5(raw.encode()).hexdigest()[:12]
    return f"{tool_name}:{digest}"


def _get_cached(tool_name: str, tool_input: dict):
    key = _cache_key(tool_name, tool_input)
    entry = _cache.get(key)
    if entry:
        ts, result = entry
        ttl = _CACHE_TTL.get(tool_name, 0)
        if time.time() - ts < ttl:
            logger.debug("Cache hit: %s", tool_name)
            return result
    return None


def _set_cached(tool_name: str, tool_input: dict, result: dict) -> None:
    if tool_name in _CACHE_TTL:
        _cache[_cache_key(tool_name, tool_input)] = (time.time(), result)


# ── Idjwi system prompt ───────────────────────────────────────────────────────

def _build_idjwi_system_prompt() -> str:
    from datetime import date
    docs = _load_docs()
    today = date.today().isoformat()

    identity = f"""\
You are Idjwi (ee-JEE-wee), the intelligence layer of Newsconseen — the Autonomous SME Operating System. Today is {today}.

You are calm, direct, and knowledgeable. You give complete answers, not hedges. You speak like a colleague, not a generic assistant. Never say "As an AI language model". When asked what you are, say you are Idjwi. If asked what powers you: "This demo runs on Claude by Anthropic. Once you sign up you can choose your preferred model."

You are running on the public landing page — all production tools are active. The only difference from the signed-in copilot: no company records are loaded (company_id="demo" returns empty). When a tool returns empty, briefly explain what it would show with real data and invite them to sign up, then continue with what you can demonstrate.

Use tools freely. For operational or market questions, call at least one tool. Public data tools (web_search, search_public_data) return live results. Internal data tools return empty in demo — use them to show capability. Lead with data, then interpretation. Use markdown for structure. Render charts when data benefits from visualisation — the frontend handles it automatically."""

    parts = [identity]
    if docs:
        parts.append("NEWSCONSEEN PRODUCT KNOWLEDGE\n" + docs)
    return "\n\n".join(parts)


# ── Chart extraction for public data results ──────────────────────────────────

def _make_demo_chart_config(tool_name: str, result: dict):
    """
    Generate chart configs from demo tool results.
    Covers both public data tools and (empty) internal data tools.
    """
    try:
        # FX rates → bar chart
        if tool_name == "search_public_data":
            rates = result.get("rates") or result.get("data", {}).get("rates")
            if rates and isinstance(rates, dict):
                top = sorted(rates.items(), key=lambda x: x[1])[:12]
                data = [{"name": k, "Rate": round(v, 4)} for k, v in top]
                if data:
                    return {
                        "type": "bar",
                        "title": f"Exchange Rates vs {result.get('base', 'USD')}",
                        "data": data,
                        "keys": [{"key": "Rate", "color": "#10b981"}],
                    }

            # World Bank / UN data → bar chart of countries
            wbdata = result.get("data") or result.get("results") or []
            if isinstance(wbdata, list) and len(wbdata) >= 2:
                chart_data = []
                for r in wbdata[:10]:
                    name = r.get("country") or r.get("name") or r.get("label", "")
                    val = r.get("value") or r.get("latest_value") or r.get("gdp") or 0
                    try:
                        val = float(val)
                    except (TypeError, ValueError):
                        continue
                    if name and val:
                        chart_data.append({"name": str(name)[:14], "Value": round(val, 2)})
                if len(chart_data) >= 2:
                    indicator = (
                        result.get("indicator_name")
                        or result.get("indicator")
                        or result.get("dataset", "indicator")
                        or "Value"
                    )
                    return {
                        "type": "bar",
                        "title": str(indicator)[:60],
                        "data": chart_data,
                        "keys": [{"key": "Value", "color": "#3b82f6"}],
                    }

            # OSM counts → bar chart
            counts = result.get("counts") or result.get("results")
            if isinstance(counts, list) and counts:
                data = [
                    {"name": str(c.get("category") or c.get("type") or c.get("name", ""))[:18],
                     "Count": int(c.get("count") or c.get("total") or 0)}
                    for c in counts[:10]
                    if c.get("count") or c.get("total")
                ]
                if len(data) >= 2:
                    return {
                        "type": "bar",
                        "title": "Facility / Business Counts",
                        "data": data,
                        "keys": [{"key": "Count", "color": "#8b5cf6"}],
                    }

        # Internal data tools — delegate to production chart builder
        from copilot.engine import _make_chart_config
        return _make_chart_config(tool_name, result)

    except Exception as e:
        logger.debug("_make_demo_chart_config(%s): %s", tool_name, e)
    return None


def _extract_charts(collected: list) -> list:
    charts = []
    for item in collected:
        cfg = _make_demo_chart_config(item["tool"], item["result"])
        if cfg:
            charts.append(cfg)
    return charts


def _extract_citations(collected: list) -> list:
    citations = []
    for item in collected:
        if item["tool"] in ("web_search", "search_public_data"):
            for r in item.get("result", {}).get("results", []):
                url   = r.get("url", "")
                title = r.get("title", "")
                if url or title:
                    citations.append({
                        "title":   title or url,
                        "url":     url,
                        "snippet": r.get("snippet", ""),
                    })
    return citations[:6]


def _build_tools_detail(collected: list) -> list:
    """Minimal tools detail for the demo transparency panel."""
    detail = []
    for c in collected:
        tool = c["tool"]
        if tool in ("web_search", "search_public_data"):
            continue
        params = {k: v for k, v in c.get("input", {}).items() if k != "company_id"}
        detail.append({
            "tool":        tool,
            "params":      params,
            "data_source": c.get("result", {}).get("data_source", "demo"),
        })
    return detail


# ── Async tool execution with per-tool budget ─────────────────────────────────

async def _run_tool_async(tool_name: str, tool_input: dict, company_id: str) -> dict:
    """Run a synchronous tool inside a thread with a per-tool timeout."""
    from copilot.queries import execute_tool

    cached = _get_cached(tool_name, tool_input)
    if cached is not None:
        return cached

    timeout = _TOOL_TIMEOUT.get(tool_name, _TOOL_TIMEOUT["default"])
    loop = asyncio.get_event_loop()

    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: execute_tool(tool_name, tool_input, company_id),
            ),
            timeout=timeout,
        )
        _set_cached(tool_name, tool_input, result)
        return result
    except asyncio.TimeoutError:
        logger.warning("Tool %s timed out (%.1fs budget)", tool_name, timeout)
        return {"skipped": True, "reason": "timeout", "note": f"{tool_name} timed out — budget {timeout}s exceeded."}
    except Exception as exc:
        logger.warning("Tool %s error: %s", tool_name, exc)
        return {"error": str(exc), "note": "Tool unavailable in demo mode."}


# ── Streaming ask function ────────────────────────────────────────────────────

async def ask_idjwi_stream(question: str, history: list = None):
    """
    Async generator — yields SSE-compatible dicts for the streaming endpoint.

    Event types emitted:
      {"type": "tool_start",   "tool": name}
      {"type": "tool_done",    "tool": name}
      {"type": "text_delta",   "text": chunk}
      {"type": "chart",        "config": {...}}
      {"type": "done",         "citations": [...], "tools_called": [...], "tools_detail": [...]}
      {"type": "error",        "message": str}
      {"type": "rate_limited"}
    """
    import anthropic

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        yield {"type": "error", "message": "Service configuration error. Please try again later."}
        return

    from copilot.queries import TOOL_DEFINITIONS

    aclient = anthropic.AsyncAnthropic(api_key=api_key)
    system = _build_idjwi_system_prompt()

    messages = list(history or [])
    messages.append({"role": "user", "content": question})

    collected: list = []

    for _round in range(10):
        try:
            response_content = []
            stop_reason = None

            async with aclient.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=system,
                tools=TOOL_DEFINITIONS,
                messages=messages,
            ) as stream:
                async for event in stream:
                    if event.type == "content_block_start":
                        if event.content_block.type == "tool_use":
                            yield {"type": "tool_start", "tool": event.content_block.name}
                    elif event.type == "content_block_delta":
                        if event.delta.type == "text_delta" and event.delta.text:
                            yield {"type": "text_delta", "text": event.delta.text}

                final = await stream.get_final_message()
                stop_reason = final.stop_reason
                response_content = final.content

        except Exception as exc:
            logger.error("Idjwi stream round %d error: %s", _round, exc)
            yield {"type": "error", "message": "Connection error. Please try again."}
            return

        if stop_reason == "end_turn":
            charts = _extract_charts(collected)
            for cfg in charts:
                yield {"type": "chart", "config": cfg}
            yield {
                "type":         "done",
                "citations":    _extract_citations(collected),
                "tools_called": [c["tool"] for c in collected],
                "tools_detail": _build_tools_detail(collected),
            }
            return

        if stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response_content})
            tool_results = []

            for block in response_content:
                if block.type != "tool_use":
                    continue
                yield {"type": "tool_start", "tool": block.name}
                result = await _run_tool_async(block.name, dict(block.input), "demo")
                yield {"type": "tool_done", "tool": block.name}

                collected.append({
                    "tool":   block.name,
                    "input":  dict(block.input) if hasattr(block.input, "items") else {},
                    "result": result,
                })
                tool_results.append({
                    "type":        "tool_result",
                    "tool_use_id": block.id,
                    "content":     json.dumps(result, default=str),
                })

            messages.append({"role": "user", "content": tool_results})
            continue

        # Unexpected stop reason — emit what we have and exit
        break

    # Loop exhausted or unexpected exit
    charts = _extract_charts(collected)
    for cfg in charts:
        yield {"type": "chart", "config": cfg}
    yield {
        "type":         "done",
        "citations":    _extract_citations(collected),
        "tools_called": [c["tool"] for c in collected],
        "tools_detail": _build_tools_detail(collected),
    }


# ── Core ask function (sync fallback) ────────────────────────────────────────

def _get_client():
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    import anthropic
    return anthropic.Anthropic(api_key=api_key)


def ask_idjwi(question: str, history: list = None) -> dict:
    """
    Ask Idjwi a question in demo mode.
    Uses ALL production tool definitions. Returns full richness:
    answer, charts, citations, tools_called, tools_detail.
    """
    from copilot.queries import TOOL_DEFINITIONS, execute_tool

    client = _get_client()
    system = _build_idjwi_system_prompt()

    messages = list(history or [])
    messages.append({"role": "user", "content": question})

    collected = []

    for _ in range(10):
        try:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=6144,
                system=system,
                tools=TOOL_DEFINITIONS,
                messages=messages,
            )
        except Exception as e:
            logger.error("Idjwi API call failed: %s", e)
            return {
                "answer": "I'm having trouble reaching the AI service right now. Please try again.",
                "charts": [], "citations": [], "tools_called": [], "tools_detail": [],
            }

        if response.stop_reason == "end_turn":
            text_blocks = [b.text for b in response.content if hasattr(b, "text")]
            answer = "\n".join(text_blocks).strip()
            return {
                "answer":       answer or "I couldn't generate a response. Please rephrase.",
                "charts":       _extract_charts(collected),
                "citations":    _extract_citations(collected),
                "tools_called": [c["tool"] for c in collected],
                "tools_detail": _build_tools_detail(collected),
            }

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})
            tool_blocks = [b for b in response.content if b.type == "tool_use"]
            tool_results = []

            for block in tool_blocks:
                logger.info("Idjwi demo tool: %s", block.name)
                try:
                    # All tools run with company_id="demo" — data tools return empty,
                    # public data tools return live results.
                    result = execute_tool(
                        tool_name=block.name,
                        tool_input=block.input,
                        company_id="demo",
                    )
                except Exception as e:
                    logger.warning("Idjwi tool %s failed: %s", block.name, e)
                    result = {"error": str(e), "note": "Tool unavailable in demo mode."}

                collected.append({
                    "tool":   block.name,
                    "input":  dict(block.input) if hasattr(block.input, "items") else {},
                    "result": result,
                })
                tool_results.append({
                    "type":        "tool_result",
                    "tool_use_id": block.id,
                    "content":     json.dumps(result, default=str),
                })

            messages.append({"role": "user", "content": tool_results})
            continue

        text_blocks = [b.text for b in response.content if hasattr(b, "text")]
        answer = "\n".join(text_blocks).strip()
        return {
            "answer":       answer or "Unexpected response. Please try again.",
            "charts":       _extract_charts(collected),
            "citations":    _extract_citations(collected),
            "tools_called": [c["tool"] for c in collected],
            "tools_detail": _build_tools_detail(collected),
        }

    return {
        "answer":       "This question required more steps than expected. Please try a more focused question.",
        "charts":       _extract_charts(collected),
        "citations":    _extract_citations(collected),
        "tools_called": [c["tool"] for c in collected],
        "tools_detail": _build_tools_detail(collected),
    }
