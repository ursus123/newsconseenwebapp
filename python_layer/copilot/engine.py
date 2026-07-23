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
import re
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from .queries import (
    TOOL_DEFINITIONS, execute_tool, get_operator_context, QueryEngine,
)
from .llm_adapters import get_adapter
from .llm_registry import IDJWI_CAPABILITIES, capability_for_tool, get_model, resolve_model
from .idjwi_security import authorize_capability
from .execution_brain import apply_execution_style, build_execution_trace
from .trust import build_trust_packet
from .company_context import (
    answer_company_context_question,
    build_company_context,
    format_company_context_for_prompt,
)

# ── Documentation loader ─────────────────────────────────────────────────────
# Loaded at request time so docs updates are reflected immediately without
# redeploy. Rule: whenever newsconseen_docs.md is changed, the copilot knows
# about it on the very next request.

_DOCS_PATH = Path(__file__).parent / "docs" / "newsconseen_docs.md"
_ARCHITECTURE_PATH = Path(__file__).resolve().parents[2] / "src" / "ARCHITECTURE.md"


def _load_docs() -> str:
    """Load Newsconseen default-brain docs from disk at request time."""
    parts = []
    try:
        product_docs = _DOCS_PATH.read_text(encoding="utf-8")
        if product_docs:
            parts.append("# Newsconseen Product Documentation\n\n" + product_docs)
    except Exception:
        pass
    try:
        architecture_docs = _ARCHITECTURE_PATH.read_text(encoding="utf-8")
        if architecture_docs:
            parts.append("# Newsconseen Architecture Contract\n\n" + architecture_docs)
    except Exception:
        pass
    return "\n\n---\n\n".join(parts)

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

# Minimal fallback used only if the docs file cannot be read.
_SELF_KNOWLEDGE_FALLBACK = """\
ABOUT THIS SYSTEM — NEWSCONSEEN AUTONOMOUS SME OPERATING SYSTEM
================================================================
You are Idjwi, the governed operational mind of Newsconseen, the Autonomous SME Operating System.
You answer any question: operational data, ML predictions, market research, and
product questions about Newsconseen itself — all in one conversation.

You have real-time access to this organisation's people, finances, inventory, tasks,
and ML predictions. You can search the web, query public datasets, and explain how
Newsconseen works. Always call at least one tool before answering operational questions."""

_BASE_INSTRUCTIONS = """\
UNIFIED COPILOT — CAPABILITIES AND TOOL USAGE
=============================================
You are the single unified Idjwi operational mind. You handle ALL question types in one
conversation — no modes, no switching. You draw on three capability areas:

  1. OPERATIONAL INTELLIGENCE  — query this organisation's own live data
  2. ML & PREDICTIVE INSIGHTS  — ML predictions, forecasts, churn risk, segments
  3. MARKET & EXTERNAL DATA    — web search, public datasets, industry research
  4. PRODUCT KNOWLEDGE         — explain Newsconseen features, architecture, how-to

You decide autonomously which tools to use based on what the question requires.
Mix capability areas freely in one answer when relevant.

IDJWI OPERATING LOOP
====================
For every request, behave like a disciplined operating brain:
Observe -> understand -> ask missing questions -> choose tool -> verify result -> explain -> recommend next action -> optionally act with approval.

Recognize the active operating mode:
- product_explanation: explain Newsconseen, Idjwi, architecture, ontology, and capabilities from the default brain.
- onboarding_help: help users add data, make templates, choose connectors, and map spreadsheets to ontology entities.
- company_data_lookup: read tenant-scoped records, counts, names, dates, and summaries.
- graph_reasoning: inspect relationships, joins, unlinked records, graph gaps, and ontology connections.
- enrichment_planning: select public/connector sources, ask for missing inputs, and map enrichments to entities.
- statistical_analysis: compute trends, rankings, comparisons, outliers, charts, and BI summaries.
- risk_analysis: explain churn, exposure, concentration, overdue, anomaly, or entity risk with evidence.
- action_execution: create or propose governed tasks, updates, messages, or records.
- data_repair: detect missing stamps, duplicates, broken mappings, and propose safe repairs.
- workflow_automation: run or propose agents/workflows with audit and approval boundaries.

If required inputs are missing, ask for them before pretending to execute. If a write/action is requested, use the approval gate instead of silently changing records.

─────────────────────────────────────────────
INTERNAL DATA TOOLS (this organisation's data)
─────────────────────────────────────────────
Analytics / aggregate tools:
- get_operator_context    — company name, type, status, contact
- get_people_summary      — headcount by person_type and status
- get_person_churn_risk   — inactive / at-risk people
- get_staff_availability  — active staff count by branch/role
- get_transaction_summary — revenue, expenses, outstanding amounts
- get_overdue_invoices    — unpaid invoices past due date
- get_task_summary        — task completion rates by type
- get_task_outcomes       — outcome breakdown (completed, overdue, missed)
- get_product_summary     — stock levels, expiry alerts, low-stock items
- get_enterprise_overview — branch and department structure
- get_network_overview    — cross-branch performance comparison
- get_ml_predictions      — all ML model results (churn risk, LTV segments, demand forecast)
- get_relationship_summary— entity relationship map
- get_address_overview    — location data
- get_service_overview    — service catalogue
- get_product_at_risk     — items below reorder level or expiring within N days
- get_operational_trends  — month-by-month task completion % and headcount changes
- get_top_debtors         — counterparties with highest outstanding amounts

Intelligence analytics (deep pre-computed insights — use for trends, rankings, risk):
- get_kpi_snapshot        — one-row business snapshot: revenue, expenses, headcount, health score
- get_top_clients         — top clients by lifetime revenue with RFM segment + churn risk
- get_staff_leaderboard   — staff ranked by completion rate, SLA breach rate, or workload
- get_ar_report           — accounts receivable aging: 0-30 / 31-60 / 61-90 / 90+ day buckets
- get_inventory_health    — stock coverage days, dead stock, reorder urgency per product
- get_network_kpis        — cross-branch: revenue_rank, performance_score, tier per enterprise
- get_concentration_risk  — HHI revenue/client/staff concentration risk + actionable flags
- get_entity_risk_report  — composite risk scores: sanctions, AML, country risk, recalls

Gap / monitoring tools:
- get_kpi_goals           — KPI targets with current status (on_track/at_risk/behind/exceeded)
- get_anomaly_report      — z-score outliers + metric drift since last ETL
- get_alert_history       — alerts and notifications sent by the system in last N days

Time / Attendance tools (clock-in/out data from Tasks):
- get_attendance_report   — daily clock-in/out records per person (actual time entries)
- get_time_summary        — total hours per person aggregated by week or month
- get_utilisation_report  — staff utilisation % vs scheduled hours; classifies as overloaded/under-utilised

Raw record tools (use when operator asks for names, not counts):
- find_people_records      — search people by name/type/status/enterprise; returns actual rows
- find_task_records        — search tasks by assignee/type/status/overdue; returns titles, due dates
- find_transaction_records — search transactions by counterparty/type/status/amount
- find_relationship_records— search relationships by person/enterprise/type
- find_product_records     — search products by name/type/status; returns stock, prices, expiry
- find_address_records     — search addresses by city/type/entity
- inspect_raw_record       — fetch a single complete record by ID (drill-down from any tool result)

Cross-entity tool:
- get_entity_join — join two raw entity tables in one call.
  Supported joins: people+tasks, people+transactions, people+relationships,
                   enterprises+people, enterprises+tasks, enterprises+transactions.
  Use for: "people at Branch X with their overdue tasks", "clients with unpaid invoices".

Action tool (write-back through approval gate):
- request_action — create tasks, update records, flag items, send messages.
  Low-risk (create_task, flag_record, update_task_status) execute immediately.
  Higher-risk queue in the Agents panel for operator review.
  Always tell the operator what you are requesting before calling this.

Ingestion tool:
- execute_ingestion_plan — after the operator uploads a file in chat and sees the analysis
  summary, call this when they confirm they want to load the data.
  ONLY call after explicit confirmation ("yes", "load it", "go ahead", "confirm").
  Never call speculatively. Always restate what will be loaded before calling.

Memory tool:
- save_copilot_memory — persist a preference, instruction, or context for ALL future sessions.
  Only call when the operator explicitly asks you to remember something or states a standing
  preference. Never save transient facts (today's numbers, one-off answers).

─────────────────────────────────────────────
WEB & PUBLIC DATA TOOLS (external sources)
─────────────────────────────────────────────
- web_search        — Brave Search → DuckDuckGo → Wikipedia fallback chain
  Use for: market news, industry trends, competitor info, regulations, best practices
- search_public_data — structured public datasets:
  world_bank (GDP/health/education), us_census (US demographics),
  open_fda (drug/pharmacy/device data), osm_count (business counts by location),
  fx_rates (live currency exchange rates), un_data (UN development indicators)

─────────────────────────────────────────────
WHEN TO USE WHICH TOOL
─────────────────────────────────────────────
- "How many active staff?"                 → get_people_summary (aggregate count)
- "Who are our active staff?"              → find_people_records (actual names)
- "What is our task completion rate?"      → get_task_summary (aggregate %)
- "Which tasks are overdue?"               → find_task_records overdue_only=true
- "How much revenue this month?"           → get_transaction_summary (aggregate sum)
- "Show me invoices for ABC Corp"          → find_transaction_records (actual rows)
- "Show people at Branch X with tasks"     → get_entity_join (cross-entity)
- "What is our churn risk?"                → get_ml_predictions or get_person_churn_risk
- "Forecast demand for next quarter"       → get_ml_predictions (demand forecast model)
- "Segment our customers by LTV"           → get_ml_predictions (segmentation model)
- "What are industry trends?"              → web_search
- "What is GDP in our country?"            → search_public_data dataset=world_bank
- "Create a follow-up task for John"       → request_action (write-back)
- "Remember that we call clients patients" → save_copilot_memory
- "yes load it" / "go ahead import" / "confirm"  → execute_ingestion_plan (only after plan shown)
- "Who clocked in today?"                  → get_attendance_report days_back=1
- "Hours worked this week?"                → get_time_summary period=week
- "Who is underutilised?"                  → get_utilisation_report max_utilisation=70
- "Who is overloaded?"                     → get_utilisation_report min_utilisation=110
- "What is Newsconseen?"                   → answer from product documentation (no tool needed)
- "How does the ETL work?"                 → answer from product documentation (no tool needed)
- "What agents do you have?"               → answer from product documentation (no tool needed)

─────────────────────────────────────────────
ONTOLOGY-NATIVE TOOLS (graph · enrichment · intelligence)
─────────────────────────────────────────────
- get_company_graph_context — subgraph around one entity (relationships, tasks, transactions)
  "Who is connected to enterprise X?", "What tasks are linked to this person?", "Show me Y's connections"
- get_enrichment_context    — external data collected for an entity (competitors, news, economic)
  "What do we know about this market?", "Has this enterprise been enriched?"
- search_intelligence       — search stored insights/risks/opportunities/recommendations
  "What risks exist?", "What has the system found?", "Show pending recommendations"
- get_ontology_schema       — full entity schema with valid enum values
  Call before complex queries when you need to know what fields/values are valid.

─────────────────────────────────────────────
PROPOSE TOOLS (create for approval — never execute directly)
─────────────────────────────────────────────
- propose_task          — propose a follow-up, review, or escalation task
- propose_chart         — propose a chart/visualization (returns preview immediately)
- propose_record_update — propose correcting or enriching a record's fields

RULES for propose_* tools:
  1. ALWAYS state what you are about to propose BEFORE calling the tool.
  2. Call propose_task/propose_chart when the operator asks you to "create", "add", or "schedule".
  3. The approval_id in the result links to the Agents panel where the operator can approve/reject.
  4. After calling a propose tool, tell the operator: "I've proposed [X] for your approval in the Agents panel."

─────────────────────────────────────────────
WRITE TOOLS (execute immediately — no approval)
─────────────────────────────────────────────
- write_insight — save a meaningful conclusion to the intelligence layer (no approval required).
  Use when you derive an important finding from data that is worth storing.
  Good triggers: "Revenue declined because...", "Client X shows churn signals...",
                 "Product Y is trending below reorder level."

─────────────────────────────────────────────
STRUCTURED ANSWER FORMAT
─────────────────────────────────────────────
For substantive operational questions, structure your answer with these sections:

**Answer**
[Direct answer — key numbers first, then interpretation]

**Evidence**
- [Data point 1: source, value, date range]
- [Data point 2: source, value, comparison]

**Recommended Actions** (only when actionable steps are clear)
- [Action 1: brief description]
- [Action 2: brief description]

**Limitations** (only when data is missing/stale)
- [What was unavailable or stale]

For simple questions (greetings, product questions, follow-ups), no structure needed — just answer directly.

─────────────────────────────────────────────
RULES
─────────────────────────────────────────────
- ALWAYS call at least one tool before answering operational questions. Never fabricate statistics.
- For product/architecture questions about Newsconseen, answer directly from the documentation
  loaded into this prompt — no tool call required.
- Lead with the numbers, then the interpretation.
- Clearly distinguish: "Your data shows…" vs "Public sources indicate…"
- Always give a complete, useful answer — never return an empty response.
- Use bullet points for lists. Use markdown tables for comparisons.
- Mix operational data with market research in one answer when the question calls for it.
- If get_ml_predictions returns empty: explain that ML models run during the ETL cron and
  predictions appear after the next scheduled run (or trigger POST /cron/etl-all manually).

WHEN A TOOL RETURNS AN ERROR OR EMPTY RESULT:
- If a tool result contains "unable_to_fetch": true or "error": "...", do NOT fail silently.
  Respond with: "I was unable to retrieve [data type] at this time. The data source may be
  unavailable or the analytics tables may not have been populated yet. Try triggering a data
  refresh via POST /cron/etl-all, or ask me a different question."
- If a tool returns an empty list or zero count, say so explicitly: "No [records] were found
  matching [filters]. This could mean the data doesn't exist yet or the ETL hasn't run."
- Never return a blank response or an unhandled error. Always explain what failed and why.

WHEN THE USER MENTIONS A SPECIFIC COUNT (e.g. "the 76 inactive clients"):
- They already know the count from a previous answer or dashboard. They want the actual names.
- Call find_people_records with the correct filters AND set limit to at least that number.
- Example: "Who are the 76 inactive clients?" →
    find_people_records(person_type="client", status="inactive", limit=100)
- Example: "Name all 34 overdue tasks" →
    find_task_records(overdue_only=True, limit=50)
- Never call find_people_records with the default limit when the user has told you the full
  count — you would return fewer records than they asked for."""


def _get_readiness_note(company_id: str) -> str:
    """
    Return a brief data-quality note to include in the system prompt.
    Only included when score < 80 or critical issues exist.
    Reads from the dataquality in-memory cache — zero network cost.
    """
    try:
        from dataquality.routes import _CACHE, _is_stale
        cached = _CACHE.get(company_id)
        if not cached or _is_stale(cached):
            return ""
        score    = cached.get("overall_score", 100)
        critical = cached.get("critical_count", 0)
        if score >= 80 and critical == 0:
            return ""
        issues        = cached.get("issues", [])
        critical_msgs = [i["message"] for i in issues if i["severity"] == "critical"][:3]
        lines = [f"DATA QUALITY NOTE (AI Readiness Score: {score}/100)"]
        if critical_msgs:
            lines.append("Critical data gaps detected: " + "; ".join(critical_msgs))
        lines.append(
            "When your answer draws on entities with critical gaps, note that "
            "figures may be understated and recommend the operator check Settings > AI Readiness."
        )
        return "\n".join(lines)
    except Exception:
        return ""


_TENANT_ACCESS_DENIED_BLOCK = """\
TENANT ACCESS
=============
You do NOT currently have authorized access to any company's private data —
either nobody is signed in, or the signed-in account is not authorized for
this company_id.

You can still fully answer from Newsconseen's default brain: what Newsconseen
and Idjwi are, the ontology, the source registry and enrichment guidance, the
risk framework, and general statistical/graph reasoning concepts. None of
that requires company data — answer it directly and completely.

Do NOT attempt any tool that reads or writes company records (people,
enterprises, products, transactions, tasks, documents, company graph,
company memory, reports, or private analytics) — those calls will be
denied. If the operator asks for any of that, do not silently fail: tell
them plainly that you cannot access this company's private data because the
account is not authorized for this company, then offer to explain how that
feature works once access is available, or offer to demonstrate it from the
default brain instead."""


def build_system_prompt(company_id: str, tenant_authorized: bool = True) -> str:
    """
    Build the runtime system prompt.
    Layers:
      1. Newsconseen product documentation (loaded from docs/newsconseen_docs.md at request time)
         Rule: edit newsconseen_docs.md → change is live on the very next copilot request.
      2. Operator identity (who THIS operator is) — only when tenant_authorized;
         otherwise a tenant-access notice so the model never fabricates a company.
      3. Persistent memory — global/source/industry brain always; company-scoped
         memory only when tenant_authorized.
      4. Tool instructions (how to use the tools)
      5. Data quality note (only when score < 80 or critical issues exist; tenant only)
    """
    from datetime import date as _date
    today_str = _date.today().isoformat()

    # Load product documentation fresh on every request so docs edits are
    # immediately reflected without redeploy.
    docs = _load_docs() or _SELF_KNOWLEDGE_FALLBACK

    if tenant_authorized:
        ctx    = get_operator_context(company_id)
        name   = ctx.get("name", "this organisation")
        etype  = ctx.get("enterprise_type", "commercial")
        status = ctx.get("operating_status", "active")

        operator_identity = (
            f"CURRENT OPERATOR\n"
            f"================\n"
            f"TODAY: {today_str}\n"
            f"You are answering for: {name}\n"
            f"Enterprise type: {etype}\n"
            f"Operating status: {status}\n"
            + (f"Phone: {ctx['phone']}\n"   if ctx.get("phone")   else "")
            + (f"Email: {ctx['email']}\n"   if ctx.get("email")   else "")
            + (f"Website: {ctx['website']}\n" if ctx.get("website") else "")
        )
    else:
        operator_identity = f"TODAY: {today_str}\n\n" + _TENANT_ACCESS_DENIED_BLOCK

    # ── Idjwi's default brain — product/ontology/source knowledge. Not
    # tenant data, so this loads regardless of tenant_authorized. ─────────────
    brain_section = ""
    try:
        from .idjwi_brain import build_prompt_section
        brain_section = build_prompt_section(company_id)
    except Exception:
        brain_section = ""

    memory_section = ""
    try:
        from .idjwi_memory import recall
        from .idjwi_brain import (
            GLOBAL_MEMORY_COMPANY_ID,
            INDUSTRY_MEMORY_COMPANY_ID,
            SOURCE_MEMORY_COMPANY_ID,
        )
        # Global/source/industry memory is shared product knowledge, not
        # tenant data — always loaded. Company-scoped memory is private and
        # only loaded once the caller is authorized for this company_id.
        scopes = [GLOBAL_MEMORY_COMPANY_ID, SOURCE_MEMORY_COMPANY_ID, INDUSTRY_MEMORY_COMPANY_ID]
        if tenant_authorized:
            scopes.append(company_id)
        memories = []
        for cid in scopes:
            memories.extend(recall(cid, limit=80))
        if memories:
            lines = ["OPERATOR MEMORY (from prior conversations — apply these always)"]
            lines.append("=" * 60)
            for m in memories:
                lines.append(f"[{m.get('owner', 'idjwi')}:{m['memory_type']}] {m['key']}: {m['value']}")
            lines.append(
                "\nApply these remembered preferences and instructions to every response. "
                "If the operator asks you to update or remove a memory, use save_copilot_memory "
                "with the same key to overwrite it."
            )
            memory_section = "\n".join(lines)
    except Exception:
        pass

    readiness_note = _get_readiness_note(company_id) if tenant_authorized else ""

    parts = [docs, operator_identity]
    if brain_section:
        parts.append(brain_section)
    if memory_section:
        parts.append(memory_section)
    parts.append(_BASE_INSTRUCTIONS)
    if readiness_note:
        parts.append(readiness_note)

    return "\n\n".join(parts)


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

        if tool_name == "get_monthly_kpis":
            months = result.get("months", [])
            if not months:
                return None
            data = [
                {
                    "name":    m.get("year_month", ""),
                    "Revenue": float(m.get("revenue", 0) or 0),
                    "Expense": float(m.get("expense", 0) or 0),
                    "Net":     float(m.get("net", 0) or 0),
                }
                for m in months[-12:]
            ]
            if not data or all(d["Revenue"] == 0 and d["Expense"] == 0 for d in data):
                return None
            return {
                "type": "area", "title": "Monthly Revenue vs Expense",
                "data": data,
                "keys": [
                    {"key": "Revenue", "color": "#10b981"},
                    {"key": "Expense", "color": "#ef4444"},
                    {"key": "Net",     "color": "#3b82f6"},
                ],
                "unit": "$",
            }

        if tool_name == "get_top_debtors":
            debtors = result.get("debtors", [])
            if debtors:
                data = [
                    {
                        "name": (str(d.get("counterparty_name") or "Unknown"))[:20],
                        "Outstanding": round(float(d.get("total_outstanding") or 0), 2),
                    }
                    for d in debtors[:10]
                    if float(d.get("total_outstanding") or 0) > 0
                ]
                if data:
                    return {
                        "type": "bar", "title": "Top Debtors — Outstanding Amount",
                        "data": data,
                        "keys": [{"key": "Outstanding", "color": "#ef4444"}],
                        "unit": "$",
                    }

        if tool_name == "get_operational_trends":
            trend = result.get("trend", [])
            if trend:
                data = [
                    {
                        "name": m.get("month", ""),
                        "Completion %": m.get("task_completion_rate") or 0,
                        "Headcount": m.get("headcount") or 0,
                    }
                    for m in trend
                ]
                if data:
                    return {
                        "type": "area", "title": "Operational Trends",
                        "data": data,
                        "keys": [
                            {"key": "Completion %", "color": "#10b981"},
                            {"key": "Headcount",    "color": "#3b82f6"},
                        ],
                    }

        if tool_name == "get_company_scorecard":
            sc = result.get("scorecard")
            if not sc:
                return None
            data = [
                {"name": "Active People",   "value": int(sc.get("active_people", 0) or 0)},
                {"name": "Active Clients",  "value": int(sc.get("active_clients", 0) or 0)},
                {"name": "Active Staff",    "value": int(sc.get("active_staff", 0) or 0)},
                {"name": "Overdue Tasks",   "value": int(sc.get("overdue_tasks", 0) or 0)},
                {"name": "Low Stock",       "value": int(sc.get("low_stock_count", 0) or 0)},
            ]
            data = [d for d in data if d["value"] > 0]
            if not data:
                return None
            return {"type": "bar", "title": "Operational Snapshot",
                    "data": data, "keys": [{"key": "value", "color": "#8b5cf6"}]}

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


def _count_rows(result: dict) -> int | None:
    """Estimate the number of data rows returned by a tool."""
    for key in (
        "records", "people", "enterprises", "transactions", "tasks",
        "products", "results", "breakdown", "months", "predictions",
        "items", "addresses", "relationships", "services",
    ):
        val = result.get(key)
        if isinstance(val, list):
            return len(val)
    # summary dict — sum totals
    summary = result.get("summary")
    if isinstance(summary, dict):
        total = sum(
            v.get("total", 0) if isinstance(v, dict) else 0
            for v in summary.values()
        )
        if total > 0:
            return total
    # scorecard / overview — single record
    if result.get("scorecard") or result.get("enterprises"):
        ents = result.get("enterprises")
        if isinstance(ents, list):
            return len(ents)
        return 1
    return None


def _generate_display_sql(tool: str, params: dict, company_id: str) -> str | None:
    """
    Generate a representative, runnable SQL for each tool so operators can
    paste it into Query Builder and verify the answer themselves.
    Uses placeholder [company_id] so the string is safe to display.
    """
    cid = "[company_id]"
    p = params  # shorthand

    templates = {
        "find_people_records": (
            "SELECT id, first_name, last_name, person_type, status, email, phone\n"
            f"FROM raw.people\nWHERE company_id = '{cid}'"
            + (f"\n  AND (first_name ILIKE '%{p.get('name','%')}%' OR last_name ILIKE '%{p.get('name','%')}%')" if p.get("name") else "")
            + (f"\n  AND person_type = '{p['person_type']}'" if p.get("person_type") else "")
            + (f"\n  AND status = '{p['status']}'" if p.get("status") else "")
            + f"\nLIMIT {p.get('limit', 100)}"
        ),
        "find_task_records": (
            "SELECT id, title, task_type, status, assigned_to, due_date, outcome\n"
            f"FROM raw.tasks\nWHERE company_id = '{cid}'"
            + (f"\n  AND (assigned_to ILIKE '%{p.get('assignee_name','%')}%')" if p.get("assignee_name") else "")
            + (f"\n  AND status = '{p['status']}'" if p.get("status") else "")
            + ("\n  AND due_date < CURRENT_DATE\n  AND status NOT IN ('completed','done','closed','cancelled')" if p.get("overdue_only") else "")
            + f"\nORDER BY due_date NULLS LAST\nLIMIT {p.get('limit', 20)}"
        ),
        "find_transaction_records": (
            "SELECT id, description, transaction_type, amount, currency, status, transaction_date\n"
            f"FROM raw.transactions\nWHERE company_id = '{cid}'"
            + (f"\n  AND transaction_type = '{p['transaction_type']}'" if p.get("transaction_type") else "")
            + (f"\n  AND status = '{p['status']}'" if p.get("status") else "")
            + f"\nORDER BY transaction_date DESC\nLIMIT {p.get('limit', 20)}"
        ),
        "find_product_records": (
            "SELECT id, name, sku, item_type, status, unit_price, currency\n"
            f"FROM raw.products\nWHERE company_id = '{cid}'"
            + (f"\n  AND name ILIKE '%{p.get('name','%')}%'" if p.get("name") else "")
            + f"\nLIMIT {p.get('limit', 20)}"
        ),
        "find_relationship_records": (
            "SELECT id, relationship_type, from_name, to_name, status, role\n"
            f"FROM raw.relationships\nWHERE company_id = '{cid}'\nLIMIT 50"
        ),
        "find_address_records": (
            "SELECT id, label, street, city, region, country, postal_code\n"
            f"FROM raw.addresses\nWHERE company_id = '{cid}'\nLIMIT 50"
        ),
        "get_people_summary": (
            "SELECT person_type, status, COUNT(*) AS count\n"
            f"FROM raw.people\nWHERE company_id = '{cid}'\n"
            "GROUP BY person_type, status\nORDER BY count DESC"
        ),
        "get_task_summary": (
            "SELECT task_type, status, COUNT(*) AS count\n"
            f"FROM raw.tasks\nWHERE company_id = '{cid}'\n"
            "GROUP BY task_type, status\nORDER BY count DESC"
        ),
        "get_transaction_summary": (
            "SELECT transaction_type,\n"
            "  COUNT(*) AS count,\n"
            "  SUM(amount) AS total_amount,\n"
            "  SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) AS paid_amount\n"
            f"FROM raw.transactions\nWHERE company_id = '{cid}'\n"
            "GROUP BY transaction_type\nORDER BY total_amount DESC"
        ),
        "get_overdue_invoices": (
            "SELECT id, description, amount, currency, transaction_date, counterparty_name\n"
            f"FROM raw.transactions\nWHERE company_id = '{cid}'\n"
            "  AND status NOT IN ('paid','cancelled')\n"
            "  AND transaction_date < CURRENT_DATE\nORDER BY transaction_date ASC\nLIMIT 50"
        ),
        "get_staff_leaderboard": (
            "SELECT\n"
            "  COALESCE(NULLIF(TRIM(assigned_to),''), NULLIF(TRIM(assignee_name),'')) AS person_name,\n"
            "  COUNT(*) AS tasks_assigned_total,\n"
            "  COUNT(CASE WHEN LOWER(status) IN ('completed','done','closed') THEN 1 END) AS tasks_completed,\n"
            "  COUNT(CASE WHEN LOWER(status) NOT IN ('completed','done','closed','cancelled') THEN 1 END) AS tasks_open\n"
            f"FROM raw.tasks\nWHERE company_id = '{cid}'\n"
            "  AND (assigned_to IS NOT NULL OR assignee_name IS NOT NULL)\n"
            f"GROUP BY 1\nORDER BY {p.get('metric','tasks_assigned_total')} DESC\nLIMIT {p.get('top_n',10)}"
        ),
        "get_enterprise_overview": (
            "SELECT enterprise_name, enterprise_type, status, city, country\n"
            f"FROM raw.enterprises\nWHERE company_id = '{cid}'\nORDER BY enterprise_name\nLIMIT 50"
        ),
        "get_product_summary": (
            "SELECT item_type, status, COUNT(*) AS count, AVG(unit_price) AS avg_price\n"
            f"FROM raw.products\nWHERE company_id = '{cid}'\n"
            "GROUP BY item_type, status\nORDER BY count DESC"
        ),
        "get_top_clients": (
            "SELECT first_name, last_name, status, person_type\n"
            f"FROM raw.people\nWHERE company_id = '{cid}'\n"
            "  AND person_type = 'client'\nORDER BY created_date DESC\n"
            f"LIMIT {p.get('top_n',10)}"
        ),
        "get_top_debtors": (
            "SELECT counterparty_name, SUM(amount) AS total_owed\n"
            f"FROM raw.transactions\nWHERE company_id = '{cid}'\n"
            "  AND status NOT IN ('paid','cancelled')\n"
            "GROUP BY counterparty_name\nORDER BY total_owed DESC\nLIMIT 10"
        ),
    }
    return templates.get(tool)


def _build_tools_detail(collected: list) -> list:
    """
    Build a rich metadata list per tool call for the transparency panel.
    Excludes web_search and search_public_data (those are handled by citations).
    Strips company_id from visible params — it's never useful to show the operator.
    Includes a display SQL that operators can paste into Query Builder to verify.
    """
    detail = []
    for c in collected:
        tool = c["tool"]
        if tool in ("web_search", "search_public_data"):
            continue
        params = {k: v for k, v in c.get("input", {}).items() if k != "company_id"}
        company_id = c.get("input", {}).get("company_id", "")
        result = c.get("result", {})
        detail.append({
            "tool":        tool,
            "params":      params,
            "data_as_of":  result.get("data_as_of"),
            "data_source": result.get("data_source"),
            "row_count":   _count_rows(result),
            "sql":         _generate_display_sql(tool, params, company_id),
        })
    return detail


def _extract_data_freshness(collected_tools: list) -> dict:
    """
    Walk all tool results and return the oldest data_as_of string found,
    plus a combined source label.

    Returns e.g.:
      {"label": "4 min ago", "source": "analytics"}
      {"label": "Supabase live", "source": "supabase_live"}
      {"label": "just now", "source": "analytics"}
    """
    sources    = set()
    timestamps = []  # collect parseable age strings for picking the oldest

    for item in collected_tools:
        result = item.get("result", {})
        dao    = result.get("data_as_of")
        src    = result.get("data_source")
        if dao:
            timestamps.append(dao)
        if src:
            sources.add(src)

    if not timestamps:
        return {}

    # If any tool fell back to live data, the whole answer is live
    has_live = bool({"supabase_live", "base44_live"} & sources)
    # Pick the least fresh label to surface to the user
    # Priority: "Supabase live" > "today (cached)" > "Xh Ym ago" > "X min ago" > "just now"
    def _rank(label: str) -> int:
        if label in ("Supabase live", "Base44 live"): return 0
        if label == "today (cached)":       return 1
        if "h" in label and "m" in label:   return 2
        if "min ago" in label:              return 3
        return 4  # "just now"

    label = min(timestamps, key=_rank)

    return {
        "label":  label,
        "source": "supabase_live" if has_live else "analytics",
    }


def _extract_chart_configs(collected_tools: list) -> list:
    """Extract chart configs from all collected tool results."""
    charts = []
    for item in collected_tools:
        result = item.get("result", {})
        if isinstance(result, dict) and isinstance(result.get("charts"), list):
            charts.extend([cfg for cfg in result.get("charts", []) if cfg])
        cfg = _make_chart_config(item["tool"], item["result"])
        if cfg:
            charts.append(cfg)
    return charts


def _extract_created_objects(collected: list) -> tuple:
    """
    Walk collected tool calls and extract any propose_* or write_insight results.
    Returns (created_recommendations, created_insights).
    """
    _PROPOSE_TOOLS = {"propose_task", "propose_chart", "propose_record_update"}
    recommendations: list = []
    insights:        list = []

    for item in collected:
        tool   = item["tool"]
        result = item.get("result", {})

        if tool in _PROPOSE_TOOLS and result.get("approval_id"):
            recommendations.append({
                "action_type": result.get("action_type"),
                "title":       result.get("title") or result.get("message", ""),
                "approval_id": result.get("approval_id"),
                "status":      result.get("status", "pending"),
                "rationale":   result.get("rationale"),
                "preview":     result.get("preview"),
                "message":     result.get("message"),
            })

        if tool == "write_insight" and result.get("insight_id"):
            insights.append({
                "insight_id":   result.get("insight_id"),
                "insight_type": (result.get("insight") or {}).get("insight_type"),
                "title":        (result.get("insight") or {}).get("title"),
                "status":       result.get("status"),
                "storage":      result.get("storage"),
            })

    return recommendations, insights


def _extract_citations(collected_tools: list) -> list:
    """Extract web search citations from collected tool results."""
    citations = []
    for item in collected_tools:
        if item["tool"] in ("web_search", "search_public_data", "route_source_request"):
            result = item.get("result", {}) or {}
            nested_public = result.get("result") if item["tool"] == "route_source_request" else None
            citation_result = nested_public if isinstance(nested_public, dict) else result
            for r in citation_result.get("results", []):
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


def _extract_missing_data_caveats(collected_tools: list) -> list:
    """Return structured caveats about unavailable, empty, or incomplete data."""
    caveats: list[str] = []
    seen: set[str] = set()

    def _add(text: str) -> None:
        text = (text or "").strip()
        if text and text not in seen:
            seen.add(text)
            caveats.append(text)

    for item in collected_tools:
        tool = item.get("tool", "tool")
        result = item.get("result") or {}

        if result.get("unable_to_fetch") or result.get("error"):
            _add(f"{tool} could not fetch all requested data.")

        row_count = _count_rows(result)
        if row_count == 0 and tool not in ("propose_task", "propose_chart", "propose_record_update", "write_insight"):
            _add(f"{tool} returned no matching rows for this question.")

        missing_inputs = result.get("missing_inputs") or []
        if missing_inputs:
            _add(
                "Source recommendations need these inputs before enrichment can run: "
                + ", ".join(str(x) for x in missing_inputs[:8])
            )

        for key in ("missing_data", "missing_fields", "limitations", "caveats"):
            values = result.get(key)
            if isinstance(values, str):
                _add(values)
            elif isinstance(values, list):
                for value in values[:5]:
                    _add(str(value))

    return caveats[:8]


def _extract_answer_confidence(collected_tools: list) -> dict:
    """Estimate answer confidence from tool coverage and explicit failures."""
    if not collected_tools:
        return {
            "score": 0.45,
            "label": "Limited",
            "reason": "No data tools were used, so the answer is based on general context.",
        }

    failed = 0
    empty = 0
    source_count = 0
    for item in collected_tools:
        result = item.get("result") or {}
        source_count += 1
        if result.get("unable_to_fetch") or result.get("error"):
            failed += 1
        elif _count_rows(result) == 0:
            empty += 1

    score = 0.84
    score -= min(failed * 0.22, 0.45)
    score -= min(empty * 0.08, 0.24)
    if any(item.get("tool") in ("web_search", "search_public_data", "route_source_request", "recommend_enrichment_sources") for item in collected_tools):
        score += 0.04
    score = max(0.2, min(round(score, 2), 0.97))

    if score >= 0.8:
        label = "High"
    elif score >= 0.6:
        label = "Medium"
    else:
        label = "Limited"

    reason_parts = [f"{source_count} source{'s' if source_count != 1 else ''} checked"]
    if failed:
        reason_parts.append(f"{failed} fetch issue{'s' if failed != 1 else ''}")
    if empty:
        reason_parts.append(f"{empty} empty result{'s' if empty != 1 else ''}")

    return {
        "score": score,
        "label": label,
        "reason": "; ".join(reason_parts) + ".",
    }


# ── Autonomous mode (no LLM) ─────────────────────────────────────────────────

def _with_trust(
    result: dict,
    *,
    question: str,
    company_id: str,
    principal=None,
    collected_tools: list | None = None,
    execution_trace: dict | None = None,
    company_context: dict | None = None,
    memory_used: bool = False,
    default_brain_used: bool | None = None,
    tenant_brain_used: bool | None = None,
) -> dict:
    collected_tools = collected_tools or []
    tools_detail = result.get("tools_detail") or _build_tools_detail(collected_tools)
    citations = result.get("citations") or []
    confidence = result.get("confidence") or _extract_answer_confidence(collected_tools)
    caveats = result.get("missing_data_caveats") or _extract_missing_data_caveats(collected_tools)
    trust = build_trust_packet(
        question=question,
        company_id=company_id,
        principal=principal,
        mode=result.get("mode") or "autonomous",
        operating_mode=result.get("operating_mode") or (execution_trace or {}).get("mode") or "",
        collected_tools=collected_tools,
        tools_detail=tools_detail,
        citations=citations,
        confidence=confidence,
        caveats=caveats,
        data_freshness=result.get("data_freshness") or {},
        execution_trace=execution_trace,
        company_context=company_context,
        memory_used=memory_used,
        default_brain_used=default_brain_used,
        tenant_brain_used=tenant_brain_used,
        error=result.get("error"),
    )
    result["tools_detail"] = tools_detail
    result["confidence"] = confidence
    result["missing_data_caveats"] = trust.get("missing_data_caveats", caveats)
    result["trust"] = trust
    return result


# Intent table: first matching entry wins.
# Each entry: (list-of-keywords, tool_name)
_AUTONOMOUS_INTENTS = [
    (["what is idjwi", "tell me about idjwi", "who are you", "what can you do",
      "your capabilities", "what are you"],
     "__self_describe__"),
    (["memory layers", "memory manifest", "structured memory", "how does your memory work",
      "how your memory works", "memory lifecycle", "memory provenance",
      "confirmed memory", "inferred memory", "enterprise memory", "global memory",
      "industry memory", "decision memory", "correction memory"],
     "get_idjwi_memory_manifest"),
    (["why do you remember", "why remember", "why did you remember",
      "explain memory", "explain your memory", "where did that memory come from",
      "memory provenance for", "what is the source of that memory"],
     "explain_idjwi_memory"),
    (["conflicting memory", "memory conflicts", "conflict in memory",
      "conflicting memories", "show memory conflicts"],
     "find_idjwi_memory_conflicts"),
    # ── Product-knowledge intents — Idjwi's default brain. Checked before
    # every tenant-data intent below so a product question never gets
    # mistaken for an operational one. Answered from idjwi_brain.py's
    # structured knowledge and newsconseen_docs.md — no LLM, no tenant data.
    (["what is newsconseen", "what does newsconseen do", "tell me about newsconseen",
      "what is this product", "what is this platform", "what is this app",
      "what is this system"],
     "__what_is_newsconseen__"),
    (["ontology", "what entities", "entity types", "canonical entities",
      "data model", "what objects", "universal entities"],
     "__ontology__"),
    (["public api", "public apis", "data source", "data sources", "source registry",
      "enrich", "enrichment", "external data", "what should i connect",
      "what data should i connect", "what can you connect"],
     "plan_source_enrichment"),
    (["how newsconseen works", "system works", "architecture", "frontend app",
      "frontend structure", "supabase", "python layer", "python_layer", "etl",
      "datamart", "tenant isolation", "security boundary", "pages relate",
      "pages and tools", "connectors", "workflows", "agents"],
     "__system_explainer__"),
    (["what data should i add first", "what should i add first", "data should i add first",
      "what data is missing", "what is missing before", "before idjwi can analyze",
      "before idjwi can analyse", "how do i add a clinic", "add a clinic",
      "what should a farm connect first", "farm connect first", "how do i map my spreadsheet",
      "map my spreadsheet", "spreadsheet into the ontology", "data onboarding",
      "onboarding guide", "help me insert data", "help me add data",
      "should i upload", "should i connect", "connector is better", "which connector",
      "what relationships will be created", "what analysis becomes available",
      "after upload", "after importing", "ingestion onboarding"],
     "plan_onboarding_intake"),
    (["import template", "make an import template", "generate import template",
      "blank template", "columns do i need", "what columns", "csv template"],
     "generate_import_template"),
    (["data repair", "repair data", "fix data", "fix relationships",
      "propose repair", "submit repair", "relationship repair",
      "probably belongs", "likely belongs", "stamp enterprise", "enterprise stamp",
      "duplicate people", "duplicate person", "duplicate products", "duplicate product",
      "same person", "same product", "merge duplicate", "likely assignee",
      "assign task", "unassigned task", "map imported column", "missing entity",
      "create missing entity"],
     "plan_data_repairs"),
    (["not assigned a relationship", "missing relationship", "without relationship",
      "no relationship", "not connected", "unconnected records", "unlinked",
      "orphan", "floating records", "graph gaps", "data gaps", "not assigned",
      "unassigned", "no assignee", "which records are not"],
     "find_graph_gaps"),
    (["what is in people", "what is in persons", "what is in enterprises",
      "what is in products", "what is in tasks", "what is in transactions",
      "what is in relationships", "what is in addresses", "name the people",
      "name the enterprises", "name the products", "name the tasks",
      "list records", "show records", "actual records", "task dates",
      "date of tasks", "assigned to whom", "who is assigned"],
     "find_ontology_records"),
    (["gdp", "gdp per capita", "gdp growth", "inflation", "unemployment",
      "population", "life expectancy", "literacy", "health spending",
      "education spending", "internet users", "mobile subscriptions",
      "world bank", "economic indicator", "economic indicators"],
     "search_public_data"),
    (["exchange rate", "exchange rates", "currency rate", "fx rate", "fx rates"],
     "search_public_data"),
    (["weather forecast", "weather in", "rain forecast", "temperature in"],
     "search_public_data"),
    (["risk framework", "how do you calculate risk", "risk formula", "risk categories",
      "how do you assess risk", "how is risk scored"],
     "__risk_framework__"),
    (["what charts", "what statistics", "what analysis", "analysis capabilities",
      "graph methods", "statistical methods", "what can you visualize",
      "what can you visualise", "what kind of charts"],
     "__analysis_capabilities__"),
    (["analyze my business", "analyse my business", "true analysis",
      "decision analysis", "reason from the data", "what should we do",
      "what should i do next", "what matters", "what changed", "descriptive statistics",
      "statistical analysis", "trend analysis", "anomaly detection", "cohort analysis",
      "inventory health", "ar aging", "accounts receivable aging", "task bottleneck",
      "task bottlenecks", "relationship centrality", "centrality",
      "enterprise performance comparison", "compare enterprise performance",
      "missing data impact", "analysis modules", "decision-ready findings"],
     "run_analysis_modules"),
    (["chart", "graph", "visualize", "visualise", "plot",
      "bar chart", "line chart", "time series", "risk card", "graph view",
      "dashboard widget", "downloadable report", "download report",
      "report of", "report on", "by enterprise", "by branch", "by status",
      "by assignee", "by product"],
     "plan_visual_output"),
    (["show me overdue tasks", "list overdue tasks", "show overdue tasks",
      "list tasks for", "show me tasks", "list tasks"],
     "find_task_records"),
    (["show me unpaid invoices", "list unpaid invoices", "show transactions",
      "list transactions", "list invoices"],
     "find_transaction_records"),
    (["show me products", "list products", "list items below reorder",
      "show items below reorder", "show low stock items"],
     "find_product_records"),
    (["show me staff", "show staff", "list staff", "list inactive clients",
      "show me people", "list people", "inactive clients", "who are our"],
     "find_people_records"),
    (["how many people", "people count", "headcount", "number of people", "staff count",
      "how many staff", "how many client", "how many contact"],
     "get_people_summary"),
    (["how many enterprise", "enterprise count", "number of enterprise",
      "how many branch", "branch count", "how many location", "how many organisation",
      "how many organization"],
     "get_enterprise_overview"),
    (["how many product", "product count", "inventory", "stock level",
      "how many item", "how many sku"],
     "get_product_summary"),
    (["how many task", "task count", "completion rate", "overdue task",
      "how many overdue"],
     "get_task_summary"),
    (["overdue invoice", "unpaid", "outstanding invoice"],
     "get_overdue_invoices"),
    (["revenue", "transaction", "invoice total", "income", "financial summary",
      "money", "payment total"],
     "get_transaction_summary"),
    (["churn", "at risk", "inactive people", "inactive client"],
     "get_person_churn_risk"),
    (["overview", "scorecard", "how are we doing", "business summary",
      "operational health", "health check"],
     "get_company_scorecard"),
    (["who is available", "available staff", "staff on duty", "availability"],
     "get_staff_availability"),
    (["task outcomes", "outcome breakdown", "what happened with tasks", "task results"],
     "get_task_outcomes"),
    (["kpi", "business snapshot", "health score", "how is the business doing"],
     "get_kpi_snapshot"),
    (["top clients", "best clients", "biggest clients", "highest value clients", "top customers"],
     "get_top_clients"),
    (["top performers", "who is performing", "leaderboard", "staff ranking", "team performance"],
     "get_staff_leaderboard"),
    (["accounts receivable", "ar report", "aging", "who owes us"],
     "get_ar_report"),
    (["inventory health", "reorder", "stock coverage", "dead stock"],
     "get_inventory_health"),
    (["compare branches", "branch performance", "network kpis", "network performance"],
     "get_network_kpis"),
    (["concentration risk", "client concentration", "hhi"],
     "get_concentration_risk"),
    (["targets", "goals", "are we on track", "kpi goals"],
     "get_kpi_goals"),
    (["anomalies", "unusual", "outliers", "what changed", "flagged anything"],
     "get_anomaly_report"),
    (["recent alerts", "notifications sent", "alerts fired", "alert history"],
     "get_alert_history"),
    (["trends", "month by month", "over time", "trend"],
     "get_operational_trends"),
    (["top debtors", "biggest outstanding", "who owes the most"],
     "get_top_debtors"),
    (["low stock", "expiring", "products at risk", "reorder urgency"],
     "get_product_at_risk"),
    (["attendance", "who clocked in", "who is in today"],
     "get_attendance_report"),
    (["hours worked", "time summary", "time this week"],
     "get_time_summary"),
    (["utilisation", "utilization", "underutilised", "underutilized", "overloaded staff"],
     "get_utilisation_report"),
    (["insights", "recommendations", "what has been found", "saved insights"],
     "search_intelligence"),
    (["show me staff", "show staff", "list staff", "list inactive clients",
      "show me people", "list people", "inactive clients", "who are our"],
     "find_people_records"),
    (["show me overdue tasks", "list overdue tasks", "show overdue tasks",
      "list tasks for", "show me tasks", "list tasks"],
     "find_task_records"),
    (["show me unpaid invoices", "list unpaid invoices", "show transactions",
      "list transactions", "list invoices"],
     "find_transaction_records"),
    (["show me products", "list products", "list items below reorder",
      "show items below reorder", "show low stock items"],
     "find_product_records"),
    # broad fallbacks — must come after specific ones
    (["people", "person", "staff", "client", "employee", "member", "patient", "student"],
     "get_people_summary"),
    (["enterprise", "branch", "location", "organisation", "organization"],
     "get_enterprise_overview"),
    (["product", "item", "goods", "stock"],
     "get_product_summary"),
    (["task", "assignment", "work order", "job"],
     "get_task_summary"),
    (["transaction", "revenue", "expense", "invoice"],
     "get_transaction_summary"),
]


def _detect_autonomous_tool(question: str) -> str | None:
    q = question.lower()
    for keywords, tool_name in _AUTONOMOUS_INTENTS:
        if any(kw in q for kw in keywords):
            return tool_name
    return None


def _idjwi_self_describe() -> str:
    caps = [c for c in IDJWI_CAPABILITIES if not c["requires_llm"]]
    return (
        "Idjwi is the autonomous intelligence layer of Newsconseen. "
        "It can answer questions about your operational data, run workflows, "
        "manage memory, and execute actions - with or without an LLM.\n\n"
        "Autonomous capabilities (no LLM needed): "
        + ", ".join(c["name"] for c in caps)
    )


# ── Deterministic product-knowledge answers — Idjwi's default brain ─────────
# Sourced from idjwi_brain.py (structured) and newsconseen_docs.md (prose).
# No Anthropic call anywhere in this section — this is what lets Idjwi
# explain the product, ontology, sources, risk framework, and analysis
# capabilities before any company has connected data, with no LLM dependency.

_DOC_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "how", "what", "why", "when",
    "where", "who", "does", "do", "did", "can", "could", "would", "should", "to",
    "of", "in", "on", "for", "and", "or", "it", "its", "this", "that", "with",
    "about", "explain", "tell", "me", "i", "you", "your", "newsconseen", "idjwi",
}


def _split_docs_sections(docs: str) -> list[tuple[str, str]]:
    """Split newsconseen_docs.md into (title, body) sections on '## ' headers."""
    sections: list[tuple[str, str]] = []
    current_title = "Overview"
    current_body: list[str] = []
    for line in docs.splitlines():
        if line.startswith("## ") and not line.startswith("### "):
            if current_body:
                sections.append((current_title, "\n".join(current_body).strip()))
            current_title = line[3:].strip()
            current_body = []
        else:
            current_body.append(line)
    if current_body:
        sections.append((current_title, "\n".join(current_body).strip()))
    return sections


def _doc_keywords(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {w for w in words if w not in _DOC_STOPWORDS and len(w) > 2}


def _docs_answer(question: str) -> str | None:
    """
    Best-effort deterministic answer from newsconseen_docs.md section
    titles/bodies — a keyword/title match, not a generative answer. Returns
    None if the docs can't be loaded or nothing scores above zero.
    """
    docs = _load_docs()
    sections = _split_docs_sections(docs)
    if not sections:
        return None
    q_words = _doc_keywords(question)
    if not q_words:
        return None
    scored = [
        (len(q_words & _doc_keywords(title)) * 3 + len(q_words & _doc_keywords(body)), title, body)
        for title, body in sections
    ]
    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best_title, best_body = scored[0]
    if best_score == 0:
        return None
    return f"**{best_title}**\n\n{best_body[:1200].strip()}"


def _what_is_newsconseen_answer() -> str:
    docs_hit = _docs_answer("what is newsconseen overview autonomous sme operating system")
    if docs_hit:
        return docs_hit
    from .idjwi_brain import PRODUCT_BRAIN
    return (
        f"{PRODUCT_BRAIN['north_star']}\n\n"
        "How it fits together:\n"
        + "\n".join(f"- {line}" for line in PRODUCT_BRAIN["system_model"])
    )


def _ontology_answer() -> str:
    from .idjwi_brain import ONTOLOGY_BRAIN
    entities = ", ".join(ONTOLOGY_BRAIN["entities"])
    connections = "\n".join(f"- {c}" for c in ONTOLOGY_BRAIN["connections"])
    return (
        "**Newsconseen's universal ontology**\n\n"
        f"Entities: {entities}\n\n"
        f"How they connect:\n{connections}"
    )


def _sources_answer(question: str) -> str:
    from .idjwi_brain import recommend_sources, INDUSTRY_MEMORY
    q = question.lower()
    industry = next((name for name in INDUSTRY_MEMORY if name in q), None)
    result = recommend_sources(industry=industry, limit=8)
    sources = result.get("sources", [])
    if not sources:
        return (
            "I don't have a matching source in the registry for that yet — ask about a "
            "specific entity type (person, product, enterprise) or industry (clinic, "
            "farm, retail) and I can recommend enrichment sources for it."
        )
    heading = f"**Sources Idjwi can use{' for a ' + industry if industry else ''}**"
    lines = [heading]
    for src in sources[:8]:
        entities = ", ".join(src.get("entities_enriched", [])[:4]) or "general records"
        requires = ", ".join(src.get("requires", []) or []) or "nothing extra"
        lines.append(
            f"- **{src.get('source_id')}** ({src.get('source_type')}): enriches "
            f"{entities}; needs {requires}; confidence {src.get('confidence', 'unknown')}"
        )
    return "\n".join(lines)


def _risk_framework_answer() -> str:
    from .idjwi_brain import RISK_BRAIN
    return (
        "**Idjwi's risk framework**\n\n"
        f"Formula: {RISK_BRAIN['formula']}\n\n"
        f"Categories tracked: {', '.join(RISK_BRAIN['categories'])}\n\n"
        f"Every risk answer explains: {', '.join(RISK_BRAIN['required_explanation'])}"
    )


def _analysis_capabilities_answer() -> str:
    from .idjwi_brain import ANALYSIS_BRAIN
    chart_rules = "; ".join(f"{k} -> {v}" for k, v in ANALYSIS_BRAIN["chart_rules"].items())
    return (
        "**What Idjwi can analyse and chart**\n\n"
        f"Statistics: {', '.join(ANALYSIS_BRAIN['statistics'])}\n\n"
        f"Graph methods: {', '.join(ANALYSIS_BRAIN['graph_methods'])}\n\n"
        f"Chart type by use case: {chart_rules}"
    )


def _system_explainer_answer(question: str) -> str:
    from .idjwi_brain import SYSTEM_EXPLAINER_BRAIN
    docs_hit = _docs_answer(question)
    lines = [
        "**How Newsconseen works end to end**",
        "",
        "Default brain:",
        "- Product docs, architecture docs, ontology schema, source registry, public APIs, onboarding guidance, analysis/risk/chart defaults, and demo/no-data behavior.",
        "- This layer belongs to Newsconseen and is safe before tenant authorization.",
        "",
        "Company-stamped brain:",
        "- Company records, memory, graph, enrichment rows, risks, workflows, and approved decisions.",
        "- This layer is scoped by `company_id` and requires tenant authorization.",
        "",
        "System layers:",
        *[f"- {item}" for item in SYSTEM_EXPLAINER_BRAIN["layers"]],
        "",
        "Pages and tools:",
        *[f"- {item}" for item in SYSTEM_EXPLAINER_BRAIN["page_model"]],
        "",
        "Security:",
        *[f"- {item}" for item in SYSTEM_EXPLAINER_BRAIN["security_model"]],
    ]
    if docs_hit:
        lines.extend(["", "Architecture/docs match:", docs_hit[:1200]])
    return "\n".join(lines)


def _industry_from_question(question: str) -> str:
    q = question.lower()
    for name in ("clinic", "farm", "retail"):
        if name in q:
            return name
    if any(term in q for term in ("shop", "store", "sku", "barcode")):
        return "retail"
    return ""


def _onboarding_guide_answer(question: str) -> str:
    from .idjwi_brain import DATA_ENTRY_BRAIN, INDUSTRY_MEMORY
    industry = _industry_from_question(question)
    lines = [
        "**Idjwi can help you set up Newsconseen before company data exists.**",
        "",
        "Add data in this order:",
        *[f"- {item}" for item in DATA_ENTRY_BRAIN["minimum_sequence"]],
        "",
        "What is missing before Idjwi can analyze a business:",
        *[f"- {item}" for item in DATA_ENTRY_BRAIN["missing_before_analysis"]],
        "",
        "Spreadsheet mapping rule:",
        *[f"- {item}" for item in DATA_ENTRY_BRAIN["import_flow"]],
    ]
    if industry and industry in DATA_ENTRY_BRAIN["industry_starters"]:
        lines.extend([
            "",
            f"{industry.title()} starter dataset:",
            *[f"- {item}" for item in DATA_ENTRY_BRAIN["industry_starters"][industry]],
        ])
        industry_memory = INDUSTRY_MEMORY.get(industry, {})
        if industry_memory:
            lines.extend([
                "",
                "Default terms and source priorities:",
                f"- Terms: {industry_memory.get('terms', {})}",
                f"- Priority sources: {', '.join(industry_memory.get('priority_sources', []))}",
                f"- Common risks: {', '.join(industry_memory.get('risks', []))}",
            ])
    lines.extend([
        "",
        "You can ask for a template next, for example: `make an import template for products`.",
    ])
    return "\n".join(lines)


def _entity_from_question(question: str) -> str:
    q = question.lower()
    entity_aliases = {
        "people": "person",
        "persons": "person",
        "staff": "person",
        "clients": "person",
        "patients": "person",
        "enterprises": "enterprise",
        "companies": "enterprise",
        "clinics": "enterprise",
        "farms": "enterprise",
        "shops": "enterprise",
        "products": "product",
        "items": "product",
        "inventory": "product",
        "services": "service",
        "tasks": "task",
        "transactions": "transaction",
        "relationships": "relationship",
        "addresses": "address",
        "documents": "document",
        "schedules": "schedule",
        "signals": "signal",
        "channels": "channel",
        "territories": "territory",
        "animals": "animal",
        "plots": "plot",
        "observations": "observation",
    }
    for key, value in entity_aliases.items():
        if key in q:
            return value
    match = re.search(r"\b(?:for|of)\s+([a-z_]+)\b", q)
    return match.group(1) if match else "person"


_PRODUCT_BRAIN_SUFFIX = "\n\n*(Answered from Idjwi's default brain — no LLM needed)*"


def _graph_gap_input(question: str) -> dict:
    q = question.lower()
    entity = _entity_from_question(question)
    gap_type = "all"
    if any(term in q for term in ("unassigned", "not assigned", "no assignee", "assigned to whom")):
        gap_type = "unassigned_task" if entity in ("task", "person") else "missing_relationship"
        if entity == "person":
            entity = "task"
    elif any(term in q for term in ("orphan address", "orphaned address")):
        entity = "address"
        gap_type = "orphan_address"
    elif any(term in q for term in ("missing enterprise", "no enterprise", "without enterprise")):
        gap_type = "missing_enterprise"
    elif any(term in q for term in ("missing person", "no person", "without person", "missing counterparty")):
        gap_type = "missing_person"
    elif any(term in q for term in ("missing product", "no product", "without product", "missing item")):
        gap_type = "missing_product"
    elif any(term in q for term in ("relationship", "connected", "unlinked", "orphan", "graph")):
        gap_type = "missing_relationship"
    if "all" in q or ("records" in q and entity == "person" and not any(term in q for term in ("people", "person", "staff", "client", "patient"))):
        entity = "all"
    return {"entity_type": entity, "gap_type": gap_type, "limit": 50}


def _data_repair_input(question: str) -> dict:
    q = question.lower()
    entity = _entity_from_question(question)
    focus = "all"
    if any(term in q for term in ("duplicate", "same person", "same product", "merge")):
        focus = "duplicate"
    elif any(term in q for term in ("assign", "assignee", "unassigned", "who should")):
        focus = "assignment"
        entity = "task"
    elif any(term in q for term in ("stamp enterprise", "enterprise stamp", "enterprise_id", "belongs to", "likely belongs", "probably belongs")):
        focus = "enterprise_stamp"
    elif any(term in q for term in ("map imported column", "imported column", "column mapping", "spreadsheet column")):
        focus = "imported_column"
        entity = "import"
    elif any(term in q for term in ("missing entity", "create missing entity", "create candidate")):
        focus = "missing_entity"
    elif any(term in q for term in ("relationship", "unlinked", "not connected")):
        focus = "relationship"

    if entity == "person" and not any(term in q for term in ("people", "person", "staff", "client", "patient", "assignee")):
        entity = "all"

    submit_terms = (
        "submit", "propose", "for approval", "fix it", "repair it", "go ahead",
        "create approval", "queue", "send to approval",
    )
    return {
        "repair_focus": focus,
        "entity_type": entity,
        "submit_for_approval": any(term in q for term in submit_terms),
        "limit": 20,
    }


def _analysis_modules_input(question: str) -> dict:
    q = question.lower()
    analysis_type = "all"
    if any(term in q for term in ("descriptive", "summary statistics", "statistical profile")):
        analysis_type = "descriptive"
    elif any(term in q for term in ("trend", "over time", "month by month", "what changed")):
        analysis_type = "trend"
    elif any(term in q for term in ("anomaly", "anomalies", "outlier", "unusual")):
        analysis_type = "anomaly"
    elif any(term in q for term in ("churn", "retention", "at risk")):
        analysis_type = "churn_risk"
    elif "cohort" in q:
        analysis_type = "cohort"
    elif any(term in q for term in ("inventory", "stock", "reorder", "expiry", "expiring")):
        analysis_type = "inventory"
    elif any(term in q for term in ("ar aging", "accounts receivable aging", "receivable aging", "collections")):
        analysis_type = "ar_aging"
    elif any(term in q for term in ("bottleneck", "overdue task", "task load")):
        analysis_type = "task_bottleneck"
    elif any(term in q for term in ("centrality", "central node", "dependency")):
        analysis_type = "centrality"
    elif any(term in q for term in ("enterprise performance", "branch performance", "compare enterprises", "compare branches")):
        analysis_type = "enterprise_performance"
    elif any(term in q for term in ("missing data impact", "data impact", "data quality impact")):
        analysis_type = "missing_data_impact"

    entity = _entity_from_question(question)
    if entity == "person" and not any(term in q for term in ("people", "person", "staff", "client", "patient", "churn")):
        entity = "all"
    return {"analysis_type": analysis_type, "entity_type": entity, "limit": 20}


def _visual_output_input(question: str) -> dict:
    q = question.lower()
    output_type = "auto"
    if "table" in q or "list" in q:
        output_type = "table"
    elif "bar" in q:
        output_type = "bar_chart"
    elif any(term in q for term in ("line", "time series", "trend", "over time", "by month", "monthly")):
        output_type = "line_chart"
    elif "area" in q:
        output_type = "area_chart"
    elif any(term in q for term in ("pie", "share", "mix", "percentage")):
        output_type = "pie_chart"
    elif "risk card" in q or "at risk" in q:
        output_type = "risk_card"
    elif any(term in q for term in ("graph view", "relationship graph", "network graph", "entity graph")):
        output_type = "graph_view"
    elif "download" in q or "report" in q:
        output_type = "downloadable_report"
    elif "dashboard" in q or "widget" in q or "pin" in q:
        output_type = "dashboard_widget"

    entity = _entity_from_question(question)
    if any(term in q for term in ("invoice", "invoices", "unpaid", "outstanding", "revenue", "ar aging")):
        entity = "transaction"
    if "relationship" in q or "graph" in q:
        entity = "relationship"
    group_by = None
    if "by enterprise" in q or "by branch" in q:
        group_by = "enterprise_name"
    elif "by status" in q:
        group_by = "status"
    elif "by assignee" in q or "by staff" in q:
        group_by = "assigned_to"
    elif "by product" in q:
        group_by = "product_name"

    metric = None
    if any(term in q for term in ("invoice", "revenue", "amount", "owed", "unpaid")):
        metric = "amount"
    elif any(term in q for term in ("stock", "inventory")):
        metric = "stock_quantity"

    return {
        "question": question,
        "output_type": output_type,
        "entity_type": entity,
        "group_by": group_by,
        "metric": metric,
        "limit": 20,
    }


def _source_enrichment_input(question: str) -> dict:
    q = question.lower()
    industry = None
    for key in ("clinic", "healthcare", "farm", "retail"):
        if key in q:
            industry = key
            break
    entity = _entity_from_question(question)
    if any(term in q for term in ("clinic", "farm", "shop", "store", "business", "company", "enterprise")):
        entity = "Enterprise"
    elif any(term in q for term in ("product", "sku", "item", "drug", "medicine")):
        entity = "Product"
    elif any(term in q for term in ("address", "location", "site")):
        entity = "Address"
    elif any(term in q for term in ("person", "client", "customer", "patient", "staff")):
        entity = "Person"
    return {"question": question, "entity_type": entity, "industry": industry, "limit": 8}


def _onboarding_intake_input(question: str) -> dict:
    q = question.lower()
    industry = None
    for candidate in ("clinic", "healthcare", "farm", "retail"):
        if candidate in q:
            industry = candidate
            break
    source_kind = "question"
    file_type = ""
    for ext in (".csv", ".xlsx", ".xls", ".pdf", ".docx", ".json", ".xml"):
        if ext in q:
            source_kind = "file"
            file_type = ext
            break
    connector_id = ""
    connector_terms = {
        "quickbooks": "quickbooks",
        "xero": "xero",
        "sage": "sage",
        "shopify": "shopify",
        "square": "square",
        "toast": "toast",
        "stripe": "stripe",
        "openmrs": "openmrs",
        "epic": "epic_fhir",
        "dhis2": "dhis2",
        "mpesa": "mpesa",
        "m-pesa": "mpesa",
        "bank statement": "bank_statement",
        "google sheets": "google_sheets",
    }
    for term, cid in connector_terms.items():
        if term in q:
            connector_id = cid
            source_kind = "connector"
            break
    entities = []
    entity_terms = {
        "people": "Person", "person": "Person", "staff": "Person", "client": "Person", "customer": "Person", "patient": "Person",
        "enterprise": "Enterprise", "branch": "Enterprise", "clinic": "Enterprise", "farm": "Enterprise", "shop": "Enterprise",
        "product": "Product", "inventory": "Product", "sku": "Product",
        "transaction": "Transaction", "invoice": "Transaction", "payment": "Transaction",
        "task": "Task", "appointment": "Task", "visit": "Task",
        "address": "Address", "location": "Address",
        "plot": "Plot", "animal": "Animal", "observation": "Observation",
    }
    for term, entity in entity_terms.items():
        if term in q and entity not in entities:
            entities.append(entity)
    scope_mode = "company"
    if "specific enterprise" in q or "one enterprise" in q or "one branch" in q:
        scope_mode = "enterprise"
    elif "mixed" in q or "multiple enterprise" in q or "different enterprises" in q:
        scope_mode = "mixed"
    elif "infer" in q:
        scope_mode = "infer"
    page = "Connectors" if "connector" in q or connector_id else "Ingestion" if "upload" in q or "import" in q else "Add Data"
    return {
        "source_name": question[:120],
        "source_kind": source_kind,
        "file_type": file_type,
        "detected_entities": entities,
        "scope_mode": scope_mode,
        "connector_id": connector_id,
        "industry": industry or "",
        "current_page": page,
    }


def _ontology_records_input(question: str) -> dict:
    q = question.lower()
    entity = _entity_from_question(question)
    payload = {"entity_type": entity, "limit": 50}
    if any(term in q for term in ("inactive", "closed", "completed", "pending", "active", "open")):
        for status in ("inactive", "closed", "completed", "pending", "active", "open"):
            if status in q:
                payload["status"] = status
                break
    if entity == "task" and any(term in q for term in ("unassigned", "not assigned", "no assignee")):
        payload["unassigned_only"] = True
    if any(term in q for term in ("without relationship", "no relationship", "not connected", "unlinked")):
        payload["missing_relationship"] = True
    return payload


def _country_from_question(question: str) -> str:
    q = question.lower()
    aliases = {
        "usa": "USA",
        "u.s.a": "USA",
        "u.s.": "USA",
        "united states": "USA",
        "america": "USA",
        "uk": "GBR",
        "united kingdom": "GBR",
        "great britain": "GBR",
    }
    for key, code in aliases.items():
        if key in q:
            return code
    match = re.search(r"\b(?:of|for|in)\s+([a-z][a-z\s]{1,40}?)(?:\?|$|,|\.|\s+from\s+|\s+between\s+)", q)
    if match:
        return match.group(1).strip()
    return ""


def _public_data_input(question: str) -> dict:
    q = question.lower()
    if any(term in q for term in ("exchange rate", "exchange rates", "currency rate", "fx rate", "fx rates")):
        currency = "USD"
        match = re.search(r"\b([A-Z]{3})\b", question)
        if match:
            currency = match.group(1).upper()
        return {"dataset": "fx_rates", "query": currency, "location": ""}
    if any(term in q for term in ("weather forecast", "weather in", "rain forecast", "temperature in")):
        location = _country_from_question(question) or question
        return {"dataset": "weather", "query": question, "location": location}
    return {
        "dataset": "world_bank",
        "query": question,
        "location": _country_from_question(question),
    }


def _memory_explain_input(question: str) -> dict:
    q = question.strip()
    quoted = re.search(r"[\"'`](.+?)[\"'`]", q)
    if quoted:
        return {"key": quoted.group(1).strip()}

    lowered = q.lower()
    for marker in ("memory about ", "remember about ", "remember this ", "remember "):
        if marker in lowered:
            idx = lowered.find(marker) + len(marker)
            key = q[idx:].strip(" ?.!")
            if key:
                return {"key": key}
    return {}


def _value_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:,.2f}".rstrip("0").rstrip(".")
    if isinstance(value, int):
        return f"{value:,}"
    return str(value)


def _first_present(row: dict, keys: list[str], default: str = "") -> str:
    for key in keys:
        val = row.get(key)
        if val not in (None, ""):
            return _value_text(val)
    return default


def _format_records(title: str, records: list[dict], name_keys: list[str], detail_keys: list[str]) -> str:
    if not records:
        return f"No {title.lower()} found."
    lines = [f"**{len(records)} {title.lower()}**"]
    for idx, row in enumerate(records[:15], 1):
        name = _first_present(row, name_keys, "Unnamed")
        details = [_first_present(row, [key]) for key in detail_keys]
        details = [d for d in details if d]
        lines.append(f"{idx}. {name}" + (f" - {' | '.join(details[:4])}" if details else ""))
    return "\n".join(lines)


def _format_rows(title: str, rows: list[dict], name_keys: list[str], metric_keys: list[str]) -> str:
    if not rows:
        return f"No {title.lower()} data found."
    lines = [f"**{title}**"]
    for idx, row in enumerate(rows[:10], 1):
        name = _first_present(row, name_keys, f"Row {idx}")
        metrics = []
        for key in metric_keys:
            val = row.get(key)
            if val not in (None, ""):
                metrics.append(f"{key.replace('_', ' ')}: {_value_text(val)}")
        lines.append(f"{idx}. {name}" + (f" - {' | '.join(metrics[:4])}" if metrics else ""))
    return "\n".join(lines)


def _format_autonomous_answer(tool_name: str, result: dict) -> str:
    """Convert a tool result dict into a plain-text answer for autonomous mode."""

    if tool_name == "search_public_data":
        dataset = result.get("dataset", "public_data")
        if result.get("error"):
            return result.get("note") or f"I could not query {dataset}: {result.get('error')}"

        if dataset == "world_bank":
            data = result.get("data") or []
            indicator = (result.get("indicator_name") or result.get("indicator") or "indicator").replace("_", " ").title()
            country = data[0].get("country") if data else result.get("country", "")
            if not data:
                return f"I queried World Bank Open Data for {indicator}, but no recent value was returned."
            latest = data[0]
            value = latest.get("value")
            year = latest.get("year")
            value_text = _value_text(value)
            if "gdp" in indicator.lower() and value:
                try:
                    value_text = f"${float(value) / 1_000_000_000_000:,.2f} trillion USD"
                except Exception:
                    pass
            lines = [
                f"**{indicator} for {country or result.get('country', 'the selected country')}**",
                f"- Latest available value: **{value_text}** ({year})",
            ]
            if len(data) > 1:
                lines.append("- Recent values:")
                for row in data[1:5]:
                    row_value = _value_text(row.get("value"))
                    if "gdp" in indicator.lower() and row.get("value"):
                        try:
                            row_value = f"${float(row.get('value')) / 1_000_000_000_000:,.2f}T"
                        except Exception:
                            pass
                    lines.append(f"  - {row.get('year')}: {row_value}")
            lines.append(f"\n{result.get('note', 'Source: public data')}")
            return "\n".join(lines)

        if dataset in ("fx_rates", "exchange_rates"):
            rates = result.get("rates") or result.get("data", {}).get("rates") or {}
            base = result.get("base") or result.get("query") or "USD"
            if not rates:
                return "I queried exchange rates, but no rates were returned."
            top = list(rates.items())[:10]
            lines = [f"**Exchange rates for {base}**"]
            lines.extend(f"- {code}: {_value_text(rate)}" for code, rate in top)
            return "\n".join(lines)

        if dataset == "weather":
            forecast = result.get("forecast") or result.get("data") or []
            if not forecast:
                return result.get("note") or "I queried weather data, but no forecast was returned."
            return f"**Weather data**\n\n{result.get('note', '')}\n\n" + _format_rows(
                "Forecast", forecast, ["date", "day"], ["temp_max_c", "temp_min_c", "precipitation_mm"]
            )

        rows = result.get("data") or result.get("results") or []
        if isinstance(rows, list) and rows:
            return _format_rows(dataset.replace("_", " ").title(), rows, ["country", "name", "title"], ["value", "year", "count"])
        return result.get("note") or f"I queried {dataset}, but no rows were returned."

    if tool_name == "generate_import_template":
        if result.get("error"):
            return result.get("error")
        columns = result.get("columns") or []
        entity_type = result.get("entity_type") or "Entity"
        lines = [
            f"**Import template for {entity_type}**",
            "",
            "Use this when you want to put data into Newsconseen before Idjwi has company records to analyze.",
            "",
            "Columns:",
            ", ".join(f"`{col}`" for col in columns[:80]) or "No columns returned.",
        ]
        if result.get("sample_row"):
            sample = result["sample_row"]
            preview = ", ".join(f"{k}: {v}" for k, v in list(sample.items())[:12])
            lines.extend(["", "Sample row:", preview])
        if result.get("download_url"):
            lines.extend(["", f"Template endpoint: `{result.get('download_url')}`"])
        if result.get("instructions"):
            lines.extend(["", result["instructions"]])
        return "\n".join(lines)

    if tool_name == "get_idjwi_memory_manifest":
        layers = result.get("layers") or {}
        lifecycle = result.get("lifecycle") or []
        controls = result.get("trust_controls") or []
        lines = ["**Idjwi structured memory**"]
        lines.append("Idjwi memory is layered so default product knowledge, tenant knowledge, enterprise-specific facts, user preferences, workflows, decisions, and corrections do not collapse into one unsafe note pile.")
        if layers:
            lines.append("")
            lines.append("Layers:")
            for key, desc in list(layers.items())[:12]:
                lines.append(f"- {str(key).replace('_', ' ').title()}: {desc}")
        if lifecycle:
            lines.append("")
            lines.append("Lifecycle states: " + ", ".join(str(s) for s in lifecycle))
        if controls:
            lines.append("")
            lines.append("Trust controls:")
            for item in controls[:8]:
                lines.append(f"- {item}")
        return "\n".join(lines)

    if tool_name == "explain_idjwi_memory":
        if not result.get("found"):
            return result.get("reason") or "I could not find that memory. Ask me to list memory first, then choose the exact key or memory id."
        memory = result.get("memory") or {}
        lines = ["**Why I remember this**"]
        if result.get("explanation"):
            lines.append(result["explanation"])
        lines.append("")
        lines.append(f"- Key: {memory.get('key')}")
        lines.append(f"- Layer: {memory.get('layer') or memory.get('scope')}")
        lines.append(f"- Status: {memory.get('review_status')}")
        lines.append(f"- Confidence: {memory.get('confidence')}")
        if memory.get("subject_type") or memory.get("subject_id"):
            lines.append(f"- Applies to: {memory.get('subject_type') or 'subject'} `{memory.get('subject_id')}`")
        if memory.get("source"):
            lines.append(f"- Source: {memory.get('source')}")
        if memory.get("provenance"):
            lines.append(f"- Provenance: {_value_text(memory.get('provenance'))}")
        if memory.get("expires_at") or memory.get("valid_to"):
            lines.append(f"- Valid until: {memory.get('valid_to') or memory.get('expires_at')}")
        return "\n".join(lines)

    if tool_name == "find_idjwi_memory_conflicts":
        conflicts = result.get("conflicts") or []
        if not conflicts:
            return "No conflicting Idjwi memories found for this company."
        lines = [f"**{len(conflicts)} memory conflict(s)**"]
        for idx, item in enumerate(conflicts[:20], 1):
            key = item.get("key") or item.get("memory_key") or "memory"
            mtype = item.get("memory_type") or "memory"
            values = item.get("values") or item.get("conflicting_values") or []
            if not values and item.get("memories"):
                values = [m.get("value") for m in item.get("memories", []) if isinstance(m, dict)]
            lines.append(f"{idx}. `{key}` ({mtype}) has conflicting remembered values.")
            if values:
                lines.append(f"   Values: {', '.join(str(v) for v in values[:4])}")
        lines.append("Use review/update/forget controls to confirm the right memory, expire the stale one, or mark the conflict resolved.")
        return "\n".join(lines)

    if tool_name == "scope_idjwi_memory":
        if not result.get("updated"):
            return result.get("reason") or "I could not scope that memory. I need a memory id and the target enterprise/entity id."
        return (
            "**Memory scoped**\n"
            f"- Memory id: `{result.get('memory_id')}`\n"
            f"- Layer: {result.get('layer')}\n"
            f"- Applies only to: {result.get('subject_type')} `{result.get('subject_id')}`"
        )

    if tool_name == "get_people_summary":
        summary = result.get("summary", {})
        total = result.get("total_people") or sum(
            v.get("total", 0) for v in summary.values() if isinstance(v, dict)
        )
        if total == 0 and not summary:
            return "No people records found."
        lines = [f"**{total} people** in the system."]
        for pt, counts in summary.items():
            if isinstance(counts, dict) and counts.get("total", 0) > 0:
                active = counts.get("active", 0)
                t = counts.get("total", 0)
                lines.append(f"- {pt.replace('_', ' ').title()}: {t} total ({active} active)")
        return "\n".join(lines)

    if tool_name == "get_enterprise_overview":
        enterprises = result.get("enterprises", [])
        total = result.get("total") or len(enterprises)
        if total == 0:
            return "No enterprise records found."
        lines = [f"**{total} enterprise(s)** in the system."]
        for e in enterprises[:10]:
            name = e.get("name") or e.get("enterprise_name") or "Unnamed"
            etype = e.get("enterprise_type", "")
            status = e.get("status", "")
            lines.append(f"- {name}" + (f" ({etype}, {status})" if etype or status else ""))
        return "\n".join(lines)

    if tool_name == "get_product_summary":
        total = result.get("total_products", 0)
        breakdown = result.get("breakdown", [])
        if total == 0 and not breakdown:
            return "No product records found."
        lines = [f"**{total} product(s)** in the system."]
        for row in breakdown[:8]:
            it = (row.get("item_type") or "Unknown").replace("_", " ").title()
            cnt = row.get("count", 0)
            lines.append(f"- {it}: {cnt}")
        return "\n".join(lines)

    if tool_name == "get_task_summary":
        total = result.get("total_tasks", 0)
        overdue = result.get("overdue_tasks", 0)
        rate = result.get("completion_rate_pct", result.get("completion_rate", 0))
        if total == 0:
            return "No task records found."
        return (
            f"**{total} task(s)** in the system.\n"
            f"- Completion rate: {rate}%\n"
            f"- Overdue: {overdue}"
        )

    if tool_name == "get_transaction_summary":
        total_rev = result.get("total_revenue", result.get("total_amount", 0))
        total_tx = result.get("total_transactions", result.get("count", 0))
        if total_tx == 0 and total_rev == 0:
            return "No transaction records found."
        return (
            f"**{total_tx} transaction(s)** totalling {total_rev}.\n"
            + (f"- Outstanding: {result.get('total_outstanding', 0)}" if result.get("total_outstanding") else "")
        )

    if tool_name == "get_overdue_invoices":
        invoices = result.get("invoices", [])
        total_due = result.get("total_overdue_amount", 0)
        return (
            f"**{len(invoices)} overdue invoice(s)**, total outstanding: {total_due}."
            if invoices else "No overdue invoices found."
        )

    if tool_name == "get_person_churn_risk":
        high = result.get("high_risk_count", result.get("high_risk", 0))
        medium = result.get("medium_risk_count", result.get("medium_risk", 0))
        return f"Churn risk: **{high} high-risk**, {medium} medium-risk."

    if tool_name == "get_company_scorecard":
        sc = result.get("scorecard") or {}
        if not sc:
            return "No scorecard data available yet. Run ETL to populate."
        return (
            f"**Operational snapshot:**\n"
            f"- Active people: {sc.get('active_people', 0)}\n"
            f"- Active clients: {sc.get('active_clients', 0)}\n"
            f"- Active staff: {sc.get('active_staff', 0)}\n"
            f"- Overdue tasks: {sc.get('overdue_tasks', 0)}\n"
            f"- Low-stock items: {sc.get('low_stock_count', 0)}"
        )

    # Generic fallback — stringify the result
    if tool_name == "get_kpi_snapshot":
        sc = result.get("snapshot") or {}
        if not sc:
            return result.get("note") or "No KPI snapshot is available yet."
        keys = ["health_score", "active_people", "active_clients", "active_staff",
                "total_revenue", "total_expenses", "net_profit", "task_completion_rate",
                "open_invoice_count", "dead_stock_count", "churn_risk_count"]
        lines = ["**KPI snapshot**"]
        for key in keys:
            if key in sc and sc.get(key) is not None:
                lines.append(f"- {key.replace('_', ' ').title()}: {_value_text(sc.get(key))}")
        if result.get("data_as_of"):
            lines.append(f"- Data as of: {result.get('data_as_of')}")
        return "\n".join(lines)

    if tool_name == "find_ontology_records":
        entity = (result.get("entity_type") or "record").replace("_", " ")
        return _format_records(f"{entity.title()} records", result.get("records", []),
                               ["full_name", "name", "enterprise_name", "title", "reference_number", "counterparty_name", "label", "tag_id", "id"],
                               ["status", "person_type", "task_type", "relationship_type", "enterprise_name", "assigned_to", "assignee_name", "due_date", "transaction_date", "amount", "currency", "city", "country"])

    if tool_name == "find_graph_gaps":
        gaps = result.get("gaps", [])
        if not gaps:
            return "No graph or assignment gaps found for that scope."
        lines = [f"**{result.get('gap_count', len(gaps))} graph/data gap(s)**"]
        by_type = result.get("by_type") or {}
        if by_type:
            lines.append("Breakdown: " + ", ".join(f"{k.replace('_', ' ')}: {v}" for k, v in by_type.items()))
        for idx, gap in enumerate(gaps[:20], 1):
            label = gap.get("record_label") or gap.get("record_id") or "Unnamed record"
            entity = (gap.get("entity_type") or "record").replace("_", " ")
            gap_name = (gap.get("gap_type") or "gap").replace("_", " ")
            details = gap.get("details") or ""
            lines.append(f"{idx}. {label} ({entity}) - {gap_name}" + (f": {details}" if details else ""))
        return "\n".join(lines)

    if tool_name == "plan_data_repairs":
        proposals = result.get("proposals", [])
        if not proposals:
            return (
                "No high-confidence data repair proposals found for that scope.\n\n"
                "Idjwi checked likely relationships, enterprise stamps, duplicate people/products, "
                "unassigned task assignees, missing entities, and import column mappings where applicable."
            )
        lines = [f"**{result.get('repair_count', len(proposals))} data repair proposal(s)**"]
        by_type = result.get("by_type") or {}
        if by_type:
            lines.append("Breakdown: " + ", ".join(f"{k.replace('_', ' ')}: {v}" for k, v in by_type.items()))
        if result.get("submitted_for_approval"):
            lines.append("Submitted to approval gate: yes")
        else:
            lines.append("No records were changed. Ask me to submit these for approval if you want to queue them.")
        for idx, proposal in enumerate(proposals[:20], 1):
            target = proposal.get("target") or {}
            action = proposal.get("suggested_action") or {}
            repair = (proposal.get("repair_type") or "repair").replace("_", " ")
            confidence = proposal.get("confidence")
            label = target.get("label") or target.get("entity_id") or "Unnamed record"
            entity = (target.get("entity_type") or "record").replace("_", " ")
            lines.append(f"{idx}. {repair.title()} - {label} ({entity}), confidence {confidence}")
            reasoning = proposal.get("reasoning")
            if reasoning:
                lines.append(f"   Reason: {reasoning}")
            evidence = proposal.get("evidence") or []
            if evidence:
                lines.append(f"   Evidence: {'; '.join(str(e) for e in evidence[:3])}")
            action_type = action.get("action_type") or repair
            lines.append(f"   Safe action: {str(action_type).replace('_', ' ')}")
            if proposal.get("approval_id"):
                lines.append(f"   Approval: {proposal.get('approval_id')} ({proposal.get('approval_status', 'pending')})")
        return "\n".join(lines)

    if tool_name == "run_analysis_modules":
        findings = result.get("findings", [])
        if not findings:
            return (
                "No decision-ready analysis findings were produced for that scope.\n\n"
                "That usually means the tenant needs more dated transactions, tasks, relationships, products, or enterprise-stamped records before deeper analysis is possible."
            )
        lines = [f"**Idjwi analysis brief: {result.get('analysis_type', 'all').replace('_', ' ')}**"]
        lines.append(f"Findings: {result.get('finding_count', len(findings))}")
        for idx, finding in enumerate(findings[:12], 1):
            severity = str(finding.get("severity") or "info").upper()
            title = finding.get("title") or finding.get("module") or "Finding"
            module = str(finding.get("module") or "analysis").replace("_", " ")
            lines.append(f"{idx}. [{severity}] {title} ({module})")
            evidence = finding.get("evidence") or []
            if evidence:
                lines.append(f"   Evidence: {'; '.join(str(e) for e in evidence[:3])}")
            recommendation = finding.get("recommendation")
            if recommendation:
                lines.append(f"   Decision: {recommendation}")
            records = finding.get("records") or []
            if records:
                labels = []
                for record in records[:3]:
                    label = (
                        record.get("full_name") or record.get("name") or record.get("enterprise_name") or
                        record.get("title") or record.get("reference_number") or record.get("counterparty_name") or
                        record.get("id")
                    )
                    if label:
                        labels.append(str(label))
                if labels:
                    lines.append(f"   Example records: {', '.join(labels)}")
        decisions = result.get("decisions") or []
        if decisions:
            lines.append("")
            lines.append("Recommended next moves:")
            for decision in decisions[:5]:
                lines.append(f"- {decision.get('recommended_next_action')}")
        return "\n".join(lines)

    if tool_name == "plan_visual_output":
        viz = result.get("visualization") or {}
        visual_language = result.get("visual_language") or {}
        output = (viz.get("output_type") or visual_language.get("selected_output") or "visual").replace("_", " ")
        title = viz.get("title") or "Idjwi visual output"
        lines = [f"**{title}**"]
        lines.append(f"Best output: {output}.")
        if viz.get("reason"):
            lines.append(f"Why: {viz.get('reason')}")
        lines.append(f"Records used: {result.get('record_count', 0)}.")
        filters = viz.get("filters") or []
        if filters:
            lines.append("Filters: " + ", ".join(filters))
        if result.get("charts"):
            lines.append("I prepared a renderable chart below.")
        if result.get("table", {}).get("columns"):
            lines.append("A table snapshot is included in the visual spec and can be saved into Reports.")
        if result.get("report_spec"):
            lines.append("A report spec is included with summary, visual, and row sections.")
        contract = visual_language.get("chart_contract")
        if contract:
            lines.append(f"Visual contract: {contract}")
        return "\n".join(lines)

    if tool_name == "plan_onboarding_intake":
        if result.get("answer"):
            return result["answer"]
        brief = result.get("brief") or {}
        entities = ", ".join(brief.get("detected_entities") or [])
        lines = ["**Idjwi onboarding brief**"]
        lines.append(f"Detected ontology path: {entities or 'not enough data yet'}.")
        if brief.get("enterprise_guidance"):
            lines.append(f"Enterprise scope: {brief.get('enterprise_guidance')}")
        connector = brief.get("connector_recommendation") or {}
        if connector.get("reason"):
            lines.append(f"Recommended path: {connector.get('recommended_path')} - {connector.get('reason')}")
        if brief.get("relationship_plan"):
            lines.append("Expected relationships:")
            for rel in brief["relationship_plan"][:5]:
                lines.append(f"- {rel.get('from')} -> {rel.get('relationship')} -> {rel.get('to')}: {rel.get('basis')}")
        if brief.get("incomplete_after_upload"):
            lines.append("Incomplete after upload:")
            lines.extend(f"- {item}" for item in brief["incomplete_after_upload"][:5])
        if brief.get("analysis_unlocked"):
            lines.append("Analysis unlocked:")
            lines.extend(f"- {item}" for item in brief["analysis_unlocked"][:5])
        return "\n".join(lines)

    if tool_name == "plan_source_enrichment":
        if result.get("answer"):
            return result["answer"]
        sources = result.get("sources", [])
        if not sources:
            return "I could not match a source-registry enrichment plan for that request yet."
        lines = [f"**Source enrichment plan for {result.get('entity_type', 'entity')}**"]
        input_plan = result.get("input_plan") or {}
        if input_plan.get("minimum_inputs"):
            lines.append("I need: " + ", ".join(input_plan["minimum_inputs"]) + ".")
        for src in sources[:8]:
            lines.append(
                f"- **{src.get('source_id')}** ({src.get('access_level')}): "
                f"creates {', '.join(src.get('fields_created', [])[:4]) or 'context fields'}."
            )
        return "\n".join(lines)

    if tool_name == "find_people_records":
        return _format_records("People records", result.get("records", []),
                               ["full_name", "name", "person_name"],
                               ["person_type", "status", "enterprise_name", "email"])

    if tool_name == "find_task_records":
        return _format_records("Task records", result.get("records", []),
                               ["title", "task_type"],
                               ["status", "assigned_to", "assignee_name", "due_date", "priority"])

    if tool_name == "find_transaction_records":
        return _format_records("Transaction records", result.get("records", []),
                               ["counterparty_name", "reference_number", "description", "transaction_type"],
                               ["transaction_type", "payment_status", "amount", "currency", "transaction_date", "due_date"])

    if tool_name == "find_product_records":
        return _format_records("Product records", result.get("records", []),
                               ["name", "item_subtype", "item_type"],
                               ["item_type", "status", "stock_quantity", "reorder_level", "expiry_date"])

    if tool_name == "get_top_clients":
        return _format_rows("Top clients", result.get("clients", []),
                            ["person_name", "name", "full_name"],
                            ["total_revenue", "transaction_count", "rfm_segment", "churn_risk"])

    if tool_name == "get_staff_leaderboard":
        metric = result.get("ranked_by", "performance")
        return _format_rows(f"Staff leaderboard by {metric.replace('_', ' ')}", result.get("staff", []),
                            ["person_name", "full_name", "name"],
                            ["tasks_assigned_total", "tasks_completed_total", "completion_rate_pct",
                             "tasks_overdue", "performance_tier"])

    if tool_name in (
        "get_ar_report", "get_inventory_health", "get_network_kpis",
        "get_concentration_risk", "get_kpi_goals", "get_anomaly_report",
        "get_alert_history", "get_operational_trends", "get_top_debtors",
        "get_product_at_risk", "get_attendance_report", "get_time_summary",
        "get_utilisation_report", "get_staff_availability", "get_task_outcomes",
        "search_intelligence",
    ):
        rows = (
            result.get("records") or result.get("items") or result.get("clients") or
            result.get("staff") or result.get("products") or result.get("debtors") or
            result.get("alerts") or result.get("anomalies") or result.get("goals") or
            result.get("trends") or result.get("branches") or result.get("availability") or
            result.get("outcomes") or result.get("insights") or []
        )
        if isinstance(rows, list) and rows:
            metric_keys = [k for k in rows[0].keys() if k not in ("id", "company_id")][:6]
            return _format_rows(tool_name.replace("_", " ").title(), rows,
                                ["name", "title", "person_name", "product_name",
                                 "enterprise_name", "action_label", "metric"],
                                metric_keys)
        lines = [f"**{tool_name.replace('_', ' ').title()}**"]
        for key, val in result.items():
            if key in ("note", "summary") and val:
                lines.append(str(val))
            elif isinstance(val, (str, int, float)) and val not in ("", None):
                lines.append(f"- {key.replace('_', ' ').title()}: {_value_text(val)}")
        return "\n".join(lines) if len(lines) > 1 else str(result)

    return str(result)


def _autonomous_answer(question: str, company_id: str, principal=None) -> str:
    """
    Answer a question without an LLM by detecting intent and calling one tool directly.
    Returns empty string if intent cannot be detected or tool fails.
    This is Idjwi Autonomous System Mode — no LLM, deterministic tool execution.
    """
    tool_name = _detect_autonomous_tool(question)
    if not tool_name:
        return ""
    try:
        logger.info("_autonomous_answer: no-LLM fallback → %s", tool_name)
        if tool_name == "__self_describe__":
            return _idjwi_self_describe() + "\n\n*(Answered from Idjwi capability registry - no LLM needed)*"
        result = execute_tool(
            tool_name,
            {"company_id": company_id},
            company_id,
            principal=principal,
            llm_available=False,
        )
        answer = _format_autonomous_answer(tool_name, result)
        if answer:
            suffix = "\n\n*(Answered in Idjwi Autonomous Mode — LLM service unavailable)*"
            if "not found" in answer.lower() or "no " in answer[:30].lower():
                suffix = (
                    f"\n\n*(Autonomous mode — searched company_id: `{company_id}` — "
                    "if this is wrong, check your user_profiles.company_id in Supabase. "
                    "LLM service unavailable.)*"
                )
            return answer + suffix
    except Exception as e:
        logger.warning("_autonomous_answer tool %s failed: %s", tool_name, e)
    return ""


def _recall_autonomous_memories(question: str, company_id: str) -> list[dict]:
    try:
        from .idjwi_memory import recall
        memories = recall(
            company_id,
            review_status="confirmed",
            min_confidence=0.7,
            limit=80,
        )
    except Exception:
        return []

    stopwords = {
        "about", "again", "also", "and", "are", "can", "could", "for", "from",
        "have", "how", "into", "most", "our", "show", "that", "the", "their",
        "this", "what", "when", "where", "which", "who", "why", "with", "you",
        "your",
    }
    q_terms = {
        token
        for token in re.findall(r"[a-z0-9_]+", question.lower())
        if len(token) > 2 and token not in stopwords
    }
    if not q_terms:
        return []
    durable_types = {
        "terminology", "preference", "business_structure", "business_rule",
        "role_relationship", "recurring_pattern", "domain_context",
        "context", "note",
    }
    relevant = []
    for memory in memories:
        if memory.get("memory_type") not in durable_types:
            continue
        haystack = f"{memory.get('key', '')} {memory.get('value', '')}".lower()
        hay_terms = {
            token
            for token in re.findall(r"[a-z0-9_]+", haystack)
            if len(token) > 2 and token not in stopwords
        }
        overlap = q_terms & hay_terms
        key = str(memory.get("key", "")).lower()
        strong_key_hit = any(term in key for term in q_terms)
        if len(overlap) >= 2 or (len(overlap) == 1 and strong_key_hit):
            relevant.append(memory)
    return relevant[:8]


def _memory_context_text(memories: list[dict]) -> str:
    if not memories:
        return ""
    lines = []
    for memory in memories[:5]:
        value = memory.get("value")
        if isinstance(value, dict):
            value = value.get("value", value)
        lines.append(f"- {memory.get('key')}: {value}")
    return "Confirmed Idjwi memory used:\n" + "\n".join(lines)


def _autonomous_miss_answer(question: str, company_id: str, principal=None) -> tuple[str, list, dict]:
    tenant_authorized = principal.tenant_authorized if principal is not None else True

    # Source Registry Router: before giving up, let Idjwi's default brain
    # reason over every public/enrichment source in source_registry.json.
    # Public reads can execute without tenant auth; tenant/connector/write
    # routes return a security-aware plan instead of bypassing the gate.
    try:
        from .source_router import route_source_request
        route = route_source_request(
            question,
            company_id=company_id,
            principal=principal,
            execute_tool_fn=execute_tool,
        )
        if route.get("matched") and route.get("answer"):
            return (
                route["answer"] + "\n\n*(Routed by Idjwi's Source Registry Router - Advisor off)*",
                route.get("tools_called", ["source_registry_router"]),
                route.get("data") or {"source_registry_router": route},
            )
    except Exception as e:
        logger.warning("Source Registry Router failed: %s", e)

    # Try Idjwi's default brain (product/ontology/source/risk knowledge)
    # before assuming this is an operational question the tenant tools
    # can't reach. No LLM, no tenant data — safe for any caller.
    docs_hit = _docs_answer(question)
    if docs_hit:
        return (docs_hit + _PRODUCT_BRAIN_SUFFIX, [], {})

    broad = ["overview", "status", "snapshot", "health", "how are we doing", "today"]
    if any(term in question.lower() for term in broad):
        if not tenant_authorized:
            from .idjwi_security import TENANT_DENIED_REASON
            return (TENANT_DENIED_REASON, [], {})
        result = execute_tool(
            "get_kpi_snapshot",
            {"company_id": company_id},
            company_id,
            principal=principal,
            llm_available=False,
        )
        answer = _format_autonomous_answer("get_kpi_snapshot", result)
        return (
            answer + "\n\nI do not have a more specific autonomous answer for that question yet. Turn Advisor on for deeper analysis.",
            ["get_kpi_snapshot"],
            {"get_kpi_snapshot": result},
        )

    if tenant_authorized:
        return (
            "I do not have an autonomous answer for that question yet.\n\n"
            "I can answer operational questions about people, staff availability, tasks, transactions, products, inventory, KPIs, alerts, trends, attendance, time, and named records without Advisor.\n\n"
            "Turn Advisor on for deeper reasoning or open-ended analysis.",
            [],
            {},
        )
    return (
        "I don't have a specific answer for that yet. Ask me what Newsconseen or Idjwi "
        "is, about the ontology, data sources and enrichment, the risk framework, or "
        "what kind of analysis and charts Idjwi can produce.",
        [],
        {},
    )


def _autonomous_answer(question: str, company_id: str, principal=None, return_meta: bool = False):
    """
    Idjwi Autonomous Mode: deterministic memory recall plus one tool call.
    Always returns a useful answer. With return_meta=True, returns
    (answer, tools_called, data, memory_used).
    """
    tenant_authorized = principal.tenant_authorized if principal is not None else True
    memories = _recall_autonomous_memories(question, company_id) if tenant_authorized else []
    tool_name = _detect_autonomous_tool(question)
    if not tool_name:
        answer, tools, data = _autonomous_miss_answer(question, company_id, principal)
        if memories:
            answer = _memory_context_text(memories) + "\n\n" + answer
        return (answer, tools, data, bool(memories)) if return_meta else answer

    try:
        logger.info("_autonomous_answer: autonomous -> %s", tool_name)
        if tool_name == "__self_describe__":
            answer = _idjwi_self_describe() + "\n\n*(Answered from Idjwi capability registry - no Advisor needed)*"
            return (answer, [], {}, bool(memories)) if return_meta else answer

        # Product-knowledge sentinels — Idjwi's default brain. No tenant
        # gate needed: these read idjwi_brain.py / newsconseen_docs.md only,
        # never company data, so they're safe for any caller including
        # default_brain_principal (no company connected).
        _PRODUCT_ANSWERS = {
            "__what_is_newsconseen__": _what_is_newsconseen_answer,
            "__ontology__": _ontology_answer,
            "__risk_framework__": _risk_framework_answer,
            "__analysis_capabilities__": _analysis_capabilities_answer,
            "__system_explainer__": lambda: _system_explainer_answer(question),
            "__onboarding_guide__": lambda: _onboarding_guide_answer(question),
        }
        if tool_name in _PRODUCT_ANSWERS:
            answer = _PRODUCT_ANSWERS[tool_name]() + _PRODUCT_BRAIN_SUFFIX
            return (answer, [], {}, bool(memories)) if return_meta else answer
        if tool_name == "__sources__":
            answer = _sources_answer(question) + _PRODUCT_BRAIN_SUFFIX
            return (answer, [], {}, bool(memories)) if return_meta else answer

        # Tenant gate — checked here (not just inside execute_tool) so a
        # denial reads as a clear, on-topic answer instead of being forced
        # through _format_autonomous_answer's tool-shaped formatting, which
        # would otherwise render a denial as a misleading "no records found."
        gate = authorize_capability(
            capability_for_tool(tool_name), principal=principal, llm_available=False,
        )
        if not gate.get("allowed"):
            answer = gate.get("reason", "I cannot access that right now.")
            if memories:
                answer = _memory_context_text(memories) + "\n\n" + answer
            return (answer, [], {}, bool(memories)) if return_meta else answer

        tool_input = {"company_id": company_id}
        if tool_name == "search_public_data":
            tool_input.update(_public_data_input(question))
        if tool_name == "generate_import_template":
            tool_input["entity_type"] = _entity_from_question(question)
        if tool_name == "find_graph_gaps":
            tool_input.update(_graph_gap_input(question))
        if tool_name == "plan_data_repairs":
            tool_input.update(_data_repair_input(question))
        if tool_name == "run_analysis_modules":
            tool_input.update(_analysis_modules_input(question))
        if tool_name == "plan_visual_output":
            tool_input.update(_visual_output_input(question))
        if tool_name == "plan_onboarding_intake":
            tool_input.update(_onboarding_intake_input(question))
        if tool_name == "plan_source_enrichment":
            tool_input.update(_source_enrichment_input(question))
        if tool_name == "find_ontology_records":
            tool_input.update(_ontology_records_input(question))
        if tool_name == "explain_idjwi_memory":
            tool_input.update(_memory_explain_input(question))
        if tool_name == "find_idjwi_memory_conflicts":
            tool_input["limit"] = 50
        q = question.lower()
        if tool_name == "find_task_records" and "overdue" in q:
            tool_input["overdue_only"] = True
        if tool_name == "find_transaction_records" and ("unpaid" in q or "outstanding" in q):
            tool_input["payment_status"] = "unpaid"
        if tool_name == "find_product_records" and ("low stock" in q or "below reorder" in q or "reorder" in q):
            tool_input["low_stock_only"] = True
        if tool_name == "find_people_records":
            if "inactive" in q:
                tool_input["status"] = "inactive"
            if "staff" in q:
                tool_input["person_type"] = "staff"
            if "client" in q or "patient" in q:
                tool_input["person_type"] = "client"

        result = execute_tool(
            tool_name,
            tool_input,
            company_id,
            principal=principal,
            llm_available=False,
        )
        answer = _format_autonomous_answer(tool_name, result)
        prefix = _memory_context_text(memories) + "\n\n" if memories else ""
        suffix = "\n\n*(Answered in Idjwi Autonomous Mode - Advisor off)*"
        if "not found" in answer.lower() or "no " in answer[:30].lower():
            suffix = (
                f"\n\n*(Autonomous mode - searched company_id: `{company_id}` - "
                "if this is wrong, check your user_profiles.company_id in Supabase. "
                "Advisor is off.)*"
            )
        final = prefix + answer + suffix
        return (final, [tool_name], {tool_name: result}, bool(memories)) if return_meta else final
    except Exception as e:
        logger.warning("_autonomous_answer tool %s failed: %s", tool_name, e)

    answer = "I could not complete that autonomous tool call. Turn Advisor on for a reasoning-backed retry."
    return (answer, [], {}, bool(memories)) if return_meta else answer


def _run_tool_loop(
    messages: list,
    company_id: str,
    on_tool_call=None,      # optional callback(tool_name, tool_input) → None
    _collected=None,        # if list, append {"tool", "input", "result"} per call
    model: str = None,      # caller-selected LLM model ID
    principal=None,         # IdjwiPrincipal for role/capability checks
    advisor_api_key: str = None,  # request-scoped tenant credential, never logged
) -> str:
    """
    Run the selected advisor adapter loop and return the final text proposal.
    Always returns a non-empty string — never raises to callers.

    on_tool_call: optional callable invoked before each tool executes,
                  used by the streaming path to yield progress events.
    """
    resolved_spec = get_model(model) if advisor_api_key else resolve_model(model)
    adapter = get_adapter(resolved_spec, api_key=advisor_api_key)
    tenant_authorized = principal.tenant_authorized if principal is not None else True
    system = build_system_prompt(company_id, tenant_authorized=tenant_authorized)
    for attempt in range(6):
        try:
            response = adapter.create(
                system=system,
                tools=TOOL_DEFINITIONS,
                messages=messages,
            )
        except Exception as e:
            logger.error("%s API call failed (attempt %d): %s", resolved_spec.provider, attempt + 1, e)
            # Before returning the error, try Idjwi Autonomous Mode —
            # deterministic tool execution that needs no LLM.
            user_text = next(
                (m["content"] for m in reversed(messages) if m.get("role") == "user"
                 and isinstance(m.get("content"), str)),
                "",
            )
            autonomous = _autonomous_answer(user_text, company_id, principal=principal)
            if autonomous:
                return autonomous
            return (
                "The selected advisor was unavailable, so Idjwi could not complete the advisor-assisted portion. "
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
                        principal=principal,
                        llm_available=True,
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


def _classify_memory_candidate(text_line: str) -> tuple[str, str] | None:
    line = text_line.strip().strip("-*0123456789. ")
    lower = line.lower()
    if len(line) < 18:
        return None
    durable_patterns = [
        ("terminology", ["call clients", "call customers", "called patients", "called clients", "terminology"]),
        ("preference", ["prefer", "preference", "always lead", "report should", "reports should"]),
        ("business_structure", ["branches are", "locations are", "departments are", "teams are"]),
        ("business_rule", ["threshold", "reorder", "rule", "policy", "must be", "should be"]),
        ("role_relationship", ["reports to", "managed by", "supervised by", "director is"]),
        ("recurring_pattern", ["spikes every", "every december", "seasonal", "recurs", "recurring"]),
        ("domain_context", ["serves", "operates as", "business is", "enterprise is"]),
    ]
    for memory_type, patterns in durable_patterns:
        if any(pattern in lower for pattern in patterns):
            key = lower.split(":", 1)[0][:80].replace(" ", "_")
            key = "".join(ch for ch in key if ch.isalnum() or ch in ("_", "-")).strip("_")
            return memory_type, key or memory_type
    return None


def _ingest_advisor_memory_async(company_id: str, question: str, answer: str) -> int:
    """
    Store durable-looking Advisor learnings as pending memory.
    Pending Advisor memory is intentionally not injected into Autonomous answers.
    """
    try:
        from .idjwi_memory import remember
    except Exception:
        return 0

    candidates = []
    for line in (answer or "").splitlines():
        classified = _classify_memory_candidate(line)
        if classified:
            memory_type, key = classified
            candidates.append((memory_type, key, line.strip()))
        if len(candidates) >= 5:
            break

    saved = 0
    for memory_type, key, value in candidates:
        result = remember(
            company_id=company_id,
            key=key,
            value={"value": value, "question": question},
            memory_type=memory_type,
            owner="idjwi",
            confidence=0.7,
            source="advisor_extracted",
            review_status="pending",
        )
        saved += 1 if result.get("saved") else 0
    return saved


def _run_advisor_comparison(messages: list, company_id: str, model_ids: list[str], principal=None) -> tuple[str, list[dict]]:
    """Collect independent, read-only advisor assessments for Idjwi review."""
    contributions = []
    tenant_authorized = principal.tenant_authorized if principal is not None else True
    system = build_system_prompt(company_id, tenant_authorized=tenant_authorized) + (
        "\n\nYou are an optional advisor to Idjwi. Give an independent assessment with "
        "claims, assumptions, evidence needed, risks, and a proposed next step. Do not claim "
        "that you executed tools or changed records."
    )
    for model_id in model_ids[:3]:
        spec = resolve_model(model_id)
        try:
            response = get_adapter(spec).create(system=system, tools=[], messages=list(messages))
            text_blocks = [block.text for block in response.content if hasattr(block, "text")]
            assessment = "\n".join(text_blocks).strip()
            if assessment:
                contributions.append({"provider": spec.provider, "model_id": spec.id, "assessment": assessment})
        except Exception as exc:
            contributions.append({"provider": spec.provider, "model_id": spec.id, "error": str(exc)})
    successful = [item for item in contributions if item.get("assessment")]
    if not successful:
        return "No permitted advisor completed the comparison. Idjwi Core remains available.", contributions
    sections = ["## Idjwi advisor comparison"]
    for index, item in enumerate(successful, 1):
        sections.append(f"### Independent assessment {index}\n{item['assessment']}")
    sections.append(
        "### Idjwi governance note\nThese are independent advisor proposals, not established facts or authorized "
        "actions. Verify evidence and resolve material disagreements before approval."
    )
    return "\n\n".join(sections), contributions


# ── Public async interface ───────────────────────────────────────────────────

async def ask(question: str, company_id: str, history: list = None) -> str:
    """Full grounded copilot call. Always returns a non-empty string."""
    messages = list(history or [])
    messages.append({"role": "user", "content": question})
    return _run_tool_loop(messages, company_id)


async def ask_stream_events(question: str, company_id: str, history: list = None, principal=None):
    """
    Real SSE generator — yields JSON event strings as the tool loop progresses.

    Events:
      {"event": "thinking",  "content": "..."}                — initial acknowledgement
      {"event": "tool_call", "tool": "...", "input": {...}}    — before each tool
      {"event": "chart",     "config": {...}}                  — one per chart extracted from tool results
      {"event": "answer",    "content": "..."}                  — final answer
      {"event": "done", "citations": [...], "tools_called": [...]}  — stream end
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
    collected: list = []  # populated with {"tool", "input", "result"} per call for chart/citation extraction

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(_run_tool_loop, loop_messages, company_id, _on_tool, collected, None, principal)

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

    for cfg in _extract_chart_configs(collected):
        yield json.dumps({"event": "chart", "config": cfg}, default=str)

    yield json.dumps({"event": "answer", "content": answer})
    yield json.dumps({
        "event": "done",
        "citations": _extract_citations(collected),
        "tools_called": [c["tool"] for c in collected],
    }, default=str)


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
        model: str = None,
        advisor_api_key: str = None,
    ):
        self.company_id      = company_id
        self.enterprise_name = enterprise_name
        self.backend         = backend
        self.railway_url     = railway_url
        self.model           = model  # caller-selected LLM; None = use engine default
        self.advisor_api_key = advisor_api_key
        self.principal       = None
        self.query_engine    = QueryEngine(company_id)
        # Ensure Idjwi memory table exists (idempotent, fast after first call)
        try:
            from .idjwi_memory import ensure_table
            ensure_table()
        except Exception:
            pass

    def ask(
        self,
        question: str,
        history: list = None,
        context: dict = None,
        session_id: str = "",
        advisor_enabled: bool = False,
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

        request_context = dict(context or {})
        if self.enterprise_name and not request_context.get("enterprise_name"):
            request_context["enterprise_name"] = self.enterprise_name
        company_context = build_company_context(
            self.company_id,
            request_context,
            history=resolved_history,
            session_id=session_id,
            principal=self.principal,
        )

        # Flatten context dict into question prefix
        full_question = question
        ctx_str = format_company_context_for_prompt(company_context)
        if ctx_str:
            full_question = f"[Context]\n{ctx_str}\n\n{question}"

        messages = list(resolved_history)
        messages.append({"role": "user", "content": full_question})

        try:
            context_answer = answer_company_context_question(company_context, question)
            if context_answer:
                execution_trace = build_execution_trace(
                    full_question,
                    [],
                    {"company_context": company_context},
                    context=company_context,
                    tenant_authorized=getattr(self.principal, "tenant_authorized", True),
                    advisor_enabled=advisor_enabled,
                    memory_used=False,
                )
                answer_text = apply_execution_style(context_answer, execution_trace)
                if session_id:
                    updated = list(resolved_history)
                    updated.append({"role": "user", "content": full_question})
                    updated.append({"role": "assistant", "content": answer_text})
                    save_session_history(self.company_id, session_id, updated)
                result = {
                    "answer": answer_text,
                    "tools_called": [],
                    "data": {"company_context": company_context},
                    "charts": [],
                    "citations": [],
                    "data_freshness": {},
                    "tools_detail": [],
                    "confidence": {"level": "high", "reason": "Answered from request/session/company context."},
                    "missing_data_caveats": company_context.get("missing_data") or [],
                    "intent": "company_context",
                    "operating_mode": execution_trace.get("mode"),
                    "execution_trace": execution_trace,
                    "company_context": company_context,
                    "company_id": self.company_id,
                    "backend": self.backend,
                    "mode": "autonomous",
                    "advisor_enabled": False,
                    "memory_used": False,
                    "memory_candidates_created": 0,
                    "created_recommendations": [],
                    "created_insights": [],
                }
                return _with_trust(
                    result,
                    question=full_question,
                    company_id=self.company_id,
                    principal=self.principal,
                    collected_tools=[],
                    execution_trace=execution_trace,
                    company_context=company_context,
                    memory_used=False,
                    default_brain_used=True,
                    tenant_brain_used=False,
                )

            if not advisor_enabled:
                answer_text, tools_called, data, memory_used = _autonomous_answer(
                    full_question,
                    self.company_id,
                    principal=self.principal,
                    return_meta=True,
                )
                autonomous_collected = [
                    {"tool": tool, "input": {"company_id": self.company_id}, "result": data.get(tool, {})}
                    for tool in tools_called
                ]
                execution_trace = build_execution_trace(
                    full_question,
                    tools_called,
                    data,
                    context=company_context,
                    tenant_authorized=getattr(self.principal, "tenant_authorized", True),
                    advisor_enabled=False,
                    memory_used=memory_used,
                )
                answer_text = apply_execution_style(answer_text, execution_trace)
                if session_id:
                    updated = list(resolved_history)
                    updated.append({"role": "user", "content": full_question})
                    updated.append({"role": "assistant", "content": answer_text})
                    save_session_history(self.company_id, session_id, updated)
                result = {
                    "answer": answer_text,
                    "tools_called": tools_called,
                    "data": data,
                    "charts": _extract_chart_configs(autonomous_collected),
                    "citations": [],
                    "data_freshness": {},
                    "tools_detail": [
                        {"tool": tool, "params": {"company_id": self.company_id}}
                        for tool in tools_called
                    ],
                    "confidence": _extract_answer_confidence(autonomous_collected),
                    "missing_data_caveats": _extract_missing_data_caveats(autonomous_collected),
                    "intent": "",
                    "operating_mode": execution_trace.get("mode"),
                    "execution_trace": execution_trace,
                    "company_context": company_context,
                    "company_id": self.company_id,
                    "backend": self.backend,
                    "mode": "autonomous",
                    "advisor_enabled": False,
                    "memory_used": memory_used,
                    "memory_candidates_created": 0,
                    "created_recommendations": [],
                    "created_insights": [],
                }
                return _with_trust(
                    result,
                    question=full_question,
                    company_id=self.company_id,
                    principal=self.principal,
                    collected_tools=autonomous_collected,
                    execution_trace=execution_trace,
                    company_context=company_context,
                    memory_used=memory_used,
                )

            collected: list = []
            advisor_contributions = []
            advisor_selection = request_context.get("advisor_selection") or {}
            comparison_models = advisor_selection.get("comparison_models") or []
            if advisor_selection.get("mode") == "compare" and len(comparison_models) >= 2:
                answer_text, advisor_contributions = _run_advisor_comparison(
                    messages, self.company_id, comparison_models, self.principal,
                )
            else:
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    future = pool.submit(
                        _run_tool_loop, messages, self.company_id, None, collected,
                        self.model, self.principal, self.advisor_api_key,
                    )
                    answer_text = future.result(timeout=120)

            charts    = _extract_chart_configs(collected)
            citations = _extract_citations(collected)
            created_recommendations, created_insights = _extract_created_objects(collected)
            memory_candidates_created = _ingest_advisor_memory_async(
                self.company_id,
                full_question,
                answer_text,
            )
            tools_called = [c["tool"] for c in collected]
            data = {c["tool"]: c["result"] for c in collected}
            execution_trace = build_execution_trace(
                full_question,
                tools_called,
                data,
                context=company_context,
                tenant_authorized=getattr(self.principal, "tenant_authorized", True),
                advisor_enabled=True,
                memory_used=False,
            )
            answer_text = apply_execution_style(answer_text, execution_trace)

            # Save updated history to session store after execution style is applied.
            if session_id:
                updated = list(resolved_history)
                updated.append({"role": "user",      "content": full_question})
                updated.append({"role": "assistant",  "content": answer_text})
                save_session_history(self.company_id, session_id, updated)

            result = {
                "answer":                   answer_text,
                "tools_called":             tools_called,
                "data":                     data,
                "charts":                   charts,
                "citations":                citations,
                "data_freshness":           _extract_data_freshness(collected),
                "tools_detail":             _build_tools_detail(collected),
                "confidence":               _extract_answer_confidence(collected),
                "missing_data_caveats":      _extract_missing_data_caveats(collected),
                "intent":                   "",
                "operating_mode":           execution_trace.get("mode"),
                "execution_trace":          execution_trace,
                "company_context":          company_context,
                "company_id":               self.company_id,
                "backend":                  self.backend,
                "mode":                     "advisor",
                "advisor_enabled":           True,
                "advisor_contributions":     advisor_contributions,
                "memory_used":               False,
                "memory_candidates_created":  memory_candidates_created,
                "created_recommendations":  created_recommendations,
                "created_insights":         created_insights,
            }
            return _with_trust(
                result,
                question=full_question,
                company_id=self.company_id,
                principal=self.principal,
                collected_tools=collected,
                execution_trace=execution_trace,
                company_context=company_context,
                memory_used=False,
            )

        except Exception as exc:
            logger.error("CopilotEngine.ask failed: %s", exc)
            execution_trace = build_execution_trace(
                question,
                [],
                {},
                context=context,
                tenant_authorized=getattr(self.principal, "tenant_authorized", True),
                advisor_enabled=advisor_enabled,
                memory_used=False,
                error=str(exc),
            )
            result = {
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
                "operating_mode": execution_trace.get("mode"),
                "execution_trace": execution_trace,
                "company_context": company_context if "company_context" in locals() else {},
                "company_id":   self.company_id,
            }
            return _with_trust(
                result,
                question=question,
                company_id=self.company_id,
                principal=self.principal,
                collected_tools=[],
                execution_trace=execution_trace,
                company_context=company_context if "company_context" in locals() else {},
                memory_used=False,
                default_brain_used=True,
                tenant_brain_used=False,
            )
