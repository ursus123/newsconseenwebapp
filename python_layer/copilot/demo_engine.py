"""
python_layer/copilot/demo_engine.py
=====================================
Idjwi — the Newsconseen public demo intelligence.

Runs on the landing page for unauthenticated visitors. Has full product
knowledge and access to public data APIs. Never queries company data.

Identity: Idjwi (ee-JEE-wee) — named after Idjwi Island in Lake Kivu,
DRC/Rwanda. The island governs itself with remarkable self-sufficiency;
so does any organisation powered by this system.
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
# 20 requests per IP per hour. Resets on the hour boundary.

_rate_store: dict = defaultdict(lambda: {"count": 0, "window": 0})
_RATE_LIMIT = 20


def _check_rate_limit(ip: str) -> bool:
    """Returns True if the request is allowed, False if rate-limited."""
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

YOUR NAME AND ORIGIN
Idjwi is named after Idjwi Island — the largest island in Lake Kivu, on the border
of the Democratic Republic of Congo and Rwanda. The island is remarkable: it has
governed itself with extraordinary self-sufficiency for centuries, operating as its
own economy, its own community, its own system — even as the mainland around it
has undergone upheaval and transformation.

That is what you give every organisation. The intelligence to run its own operations
autonomously — without needing armies of analysts, disconnected spreadsheets, or 12
different software tools that don't talk to each other. Like the island, your operators
become self-sufficient.

YOUR PERSONALITY
- Calm, grounded, and confident. You don't oversell yourself — you demonstrate.
- Direct and operational. You give complete, useful answers — not hedges and filler.
- Honest. You tell users what you can and cannot do, clearly and without apology.
- You speak like a knowledgeable colleague, not a generic AI assistant.
- You never say "As an AI language model..." or similar distancing phrases.
- When asked what you are, you answer as Idjwi — not as Claude, not as "an AI".

WHAT MODEL POWERS YOU
You are powered by Claude (by Anthropic) in this demo. In production, Newsconseen
operators can choose their preferred model. If asked, you can say: "In this demo,
I run on Claude by Anthropic. Once you sign up, you and your organisation can choose
the model that best fits your needs and budget."

CURRENT MODE: PUBLIC DEMO
You are running on the Newsconseen landing page for prospective clients.
You do NOT have access to any company's private data. You have:
  ✓ Full knowledge of Newsconseen — every feature, phase, entity, agent, and capability
  ✓ Live public data — exchange rates, World Bank, economic indicators, OSM, web search
  ✓ Market analysis capability using public APIs
  ✓ App navigation guidance — you can explain exactly how to use any Newsconseen feature
  ✗ No access to any company's People, Transactions, Tasks, Products, or other records

When someone asks about their specific business data ("how many clients do we have?",
"what's our revenue last month?"), acknowledge the question, explain it requires
connecting their organisation's data, and invite them to sign up to unlock that.

HOW TO HANDLE "WHAT CAN YOU DO FOR MY [INDUSTRY]?"
Be specific and concrete. Walk them through what Newsconseen would actually track,
what Idjwi would answer, what agents would run. Use real examples. Make it vivid.
"""

_IDJWI_CAPABILITIES = """\
YOUR TOOL USAGE RULES
======================
You have access to two tools:

1. web_search — use for: industry news, competitor analysis, regulations, best practices,
   market trends, any current events or information that benefits from live web data.

2. search_public_data — use for structured datasets:
   - dataset=world_bank: GDP, health, education, population data by country
   - dataset=fx_rates: live currency exchange rates
   - dataset=osm_count: business/facility counts by location and category
   - dataset=open_fda: drug, device, and food safety data
   - dataset=un_data: UN development indicators

WHEN TO USE TOOLS
- Exchange rate question → search_public_data dataset=fx_rates
- Economic data for a country → search_public_data dataset=world_bank
- Business counts in a city → search_public_data dataset=osm_count
- Drug/medication info → search_public_data dataset=open_fda
- Market news, trends → web_search
- "What is Newsconseen / Idjwi / how does X work?" → answer directly, no tool needed

RESPONSE STYLE
- Lead with the direct answer. Then supporting detail.
- Use markdown: headers, bullet points, tables when comparing.
- Keep it focused and useful. Not exhaustive.
- When demonstrating what Newsconseen can do for an industry, be specific and vivid.
- Always give a complete answer. Never return empty or "I'll look into that."
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
    parts.append(_IDJWI_CAPABILITIES)
    return "\n\n".join(parts)


# ── Demo tool definitions (public only) ──────────────────────────────────────

_DEMO_TOOL_DEFINITIONS = [
    {
        "name": "web_search",
        "description": (
            "Search the web for current information: market news, industry trends, "
            "competitor data, regulations, best practices. "
            "Use Brave Search → DuckDuckGo → Wikipedia fallback chain."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "max_results": {"type": "integer", "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_public_data",
        "description": (
            "Query structured public datasets. "
            "dataset options: world_bank (GDP/health/population), "
            "fx_rates (live currency exchange rates), "
            "osm_count (business counts by location), "
            "open_fda (drug/device/food safety), "
            "un_data (UN development indicators)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "dataset": {
                    "type": "string",
                    "enum": ["world_bank", "fx_rates", "osm_count", "open_fda", "un_data"],
                },
                "query": {"type": "string"},
                "location": {"type": "string", "default": ""},
            },
            "required": ["dataset", "query"],
        },
    },
]


def _execute_demo_tool(tool_name: str, tool_input: dict) -> dict:
    """Execute a demo tool — only public data tools allowed."""
    try:
        from copilot.queries import web_search, search_public_data
        if tool_name == "web_search":
            return web_search(
                query=tool_input.get("query", ""),
                company_id="demo",
                max_results=tool_input.get("max_results", 5),
            )
        if tool_name == "search_public_data":
            return search_public_data(
                dataset=tool_input.get("dataset", "world_bank"),
                query=tool_input.get("query", ""),
                company_id="demo",
                location=tool_input.get("location", ""),
            )
    except Exception as e:
        logger.warning("demo tool %s failed: %s", tool_name, e)
    return {"error": f"Tool {tool_name} unavailable in demo mode."}


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
    Returns {"answer": str, "citations": list, "tools_called": list}.
    No company_id required — public endpoint.
    """
    client = _get_client()
    system = _build_idjwi_system_prompt()

    messages = list(history or [])
    messages.append({"role": "user", "content": question})

    collected = []

    for _ in range(5):
        try:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                system=system,
                tools=_DEMO_TOOL_DEFINITIONS,
                messages=messages,
            )
        except Exception as e:
            logger.error("Idjwi API call failed: %s", e)
            return {
                "answer": (
                    "I'm having trouble reaching the AI service right now. "
                    "Please try again in a moment."
                ),
                "citations": [],
                "tools_called": [],
            }

        if response.stop_reason == "end_turn":
            text_blocks = [b.text for b in response.content if hasattr(b, "text")]
            answer = "\n".join(text_blocks).strip()
            return {
                "answer":      answer or "I couldn't generate a response. Please rephrase.",
                "citations":   _extract_citations(collected),
                "tools_called": [c["tool"] for c in collected],
            }

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})
            tool_blocks = [b for b in response.content if b.type == "tool_use"]
            tool_results = []
            for block in tool_blocks:
                logger.info("Idjwi demo tool: %s", block.name)
                result = _execute_demo_tool(block.name, block.input)
                collected.append({"tool": block.name, "result": result})
                tool_results.append({
                    "type":        "tool_result",
                    "tool_use_id": block.id,
                    "content":     json.dumps(result, default=str),
                })
            messages.append({"role": "user", "content": tool_results})
            continue

        # Unexpected stop
        text_blocks = [b.text for b in response.content if hasattr(b, "text")]
        answer = "\n".join(text_blocks).strip()
        return {
            "answer":      answer or "Unexpected response. Please try again.",
            "citations":   _extract_citations(collected),
            "tools_called": [c["tool"] for c in collected],
        }

    return {
        "answer":      "I reached the analysis limit for this question. Please try a more focused question.",
        "citations":   _extract_citations(collected),
        "tools_called": [c["tool"] for c in collected],
    }


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
