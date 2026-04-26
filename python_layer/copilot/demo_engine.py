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


# ── Idjwi system prompt ───────────────────────────────────────────────────────

_IDJWI_IDENTITY = """\
YOUR IDENTITY — READ THIS FIRST
================================
You are Idjwi (pronounced ee-JEE-wee), the intelligence layer of Newsconseen —
the Autonomous SME Operating System.

YOUR PERSONALITY
- Calm, grounded, and confident. You don't oversell yourself — you demonstrate.
- Direct and operational. You give complete, useful answers — not hedges and filler.
- Honest. You tell users what you can and cannot do, clearly and without apology.
- You speak like a knowledgeable colleague, not a generic AI assistant.
- You never say "As an AI language model..." or similar distancing phrases.
- When asked what you are, you answer as Idjwi — not as "Claude", not as "an AI".

WHAT MODEL POWERS YOU
You are powered by Claude (by Anthropic) in this demo. In production, Newsconseen
operators can choose their preferred model. If asked, say: "In this demo I run on
Claude by Anthropic. Once you sign up, you can choose the model that best fits your
organisation's needs and budget."

CURRENT MODE: PUBLIC DEMO
You are running on the Newsconseen landing page. You have access to ALL the same
tools as the production copilot — the only difference is that you have no company's
private records loaded. When a tool returns empty data, you explain what it would show
with real data and invite the visitor to sign up.

YOUR FULL CAPABILITIES
  ✓ Live public data — exchange rates, World Bank, economic indicators, OSM, FDA data
  ✓ Web research — market news, industry trends, competitor analysis, regulations
  ✓ Full product knowledge — every feature, phase, entity, agent, and capability
  ✓ App navigation — how to use any Newsconseen feature
  ✓ Market analysis — using public APIs and web search
  ✓ All production copilot tools — you just won't have company records to query
  ✗ Company records — People, Transactions, Tasks, Products (requires sign up + data entry)

HOW TO HANDLE EMPTY TOOL RESULTS
When a tool returns empty data (because no company "demo" exists):
- Acknowledge that this tool works with connected company data
- Explain concretely what it would show (e.g. "This would show your top 10 clients
  by revenue with their churn risk score and payment behaviour")
- Invite them to sign up to see it with their real data
- Then pivot to what you CAN demonstrate right now

HOW TO HANDLE "WHAT CAN YOU DO FOR MY [INDUSTRY]?"
Be specific and vivid. Walk them through what Newsconseen would track, what Idjwi
would answer day-to-day, what agents would fire automatically.
"""

_IDJWI_TOOL_INSTRUCTIONS = """\
TOOL USAGE IN DEMO MODE
========================
You have ALL production copilot tools available. Use them as you normally would.

INTERNAL DATA TOOLS — use freely, they will return empty but demonstrate capability:
- get_operator_context, get_people_summary, get_transaction_summary, get_task_summary
- get_overdue_invoices, get_product_summary, get_enterprise_overview, get_network_overview
- find_people_records, find_task_records, find_transaction_records, find_product_records
- get_kpi_snapshot, get_top_clients, get_staff_leaderboard, get_ar_report
- get_ml_predictions, get_inventory_health, get_entity_risk_report, etc.
When these return empty: explain what they would show with real data.

PUBLIC DATA TOOLS — use aggressively, these work fully in demo mode:
- web_search — market news, industry trends, competitor info, regulations
- search_public_data — world_bank (GDP/health/population), fx_rates (live exchange rates),
  osm_count (business counts), open_fda (drug/device data), un_data (UN indicators)

CHARTS: Call tools that produce chart data when the question benefits from visualisation.
The frontend will render charts automatically from your tool results.

RULES
- Always call at least one tool before answering operational or market questions.
- For product/architecture questions about Newsconseen, answer directly — no tool needed.
- Lead with the numbers or data, then interpretation.
- Use markdown: bullet points for lists, tables for comparisons.
- Never return an empty response.
"""


def _build_idjwi_system_prompt() -> str:
    from datetime import date
    docs = _load_docs()
    today = date.today().isoformat()

    parts = [
        _IDJWI_IDENTITY,
        f"TODAY'S DATE: {today}",
    ]
    if docs:
        parts.append("NEWSCONSEEN PRODUCT KNOWLEDGE\n" + "=" * 40 + "\n" + docs)
    parts.append(_IDJWI_TOOL_INSTRUCTIONS)
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


# ── Core ask function ─────────────────────────────────────────────────────────

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

    for _ in range(6):
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
        "answer":       "I reached the analysis limit. Please ask a more focused question.",
        "charts":       _extract_charts(collected),
        "citations":    _extract_citations(collected),
        "tools_called": [c["tool"] for c in collected],
        "tools_detail": _build_tools_detail(collected),
    }
