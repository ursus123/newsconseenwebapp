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
from pathlib import Path
from .queries import (
    TOOL_DEFINITIONS, execute_tool, get_operator_context, QueryEngine,
    load_copilot_memory, _ensure_copilot_memory_table,
)

# ── Documentation loader ─────────────────────────────────────────────────────
# Loaded at request time so docs updates are reflected immediately without
# redeploy. Rule: whenever newsconseen_docs.md is changed, the copilot knows
# about it on the very next request.

_DOCS_PATH = Path(__file__).parent / "docs" / "newsconseen_docs.md"


def _load_docs() -> str:
    """Load Newsconseen product documentation from disk at request time."""
    try:
        return _DOCS_PATH.read_text(encoding="utf-8")
    except Exception:
        return ""  # fall back to _SELF_KNOWLEDGE_FALLBACK if docs missing

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
You are the Unified Copilot of Newsconseen, the Autonomous SME Operating System.
You answer any question: operational data, ML predictions, market research, and
product questions about Newsconseen itself — all in one conversation.

You have real-time access to this organisation's people, finances, inventory, tasks,
and ML predictions. You can search the web, query public datasets, and explain how
Newsconseen works. Always call at least one tool before answering operational questions."""

_BASE_INSTRUCTIONS = """\
UNIFIED COPILOT — CAPABILITIES AND TOOL USAGE
=============================================
You are the single unified Newsconseen Copilot. You handle ALL question types in one
conversation — no modes, no switching. You draw on three capability areas:

  1. OPERATIONAL INTELLIGENCE  — query this organisation's own live data
  2. ML & PREDICTIVE INSIGHTS  — ML predictions, forecasts, churn risk, segments
  3. MARKET & EXTERNAL DATA    — web search, public datasets, industry research
  4. PRODUCT KNOWLEDGE         — explain Newsconseen features, architecture, how-to

You decide autonomously which tools to use based on what the question requires.
Mix capability areas freely in one answer when relevant.

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


def build_system_prompt(company_id: str) -> str:
    """
    Build the runtime system prompt.
    Layers:
      1. Newsconseen product documentation (loaded from docs/newsconseen_docs.md at request time)
         Rule: edit newsconseen_docs.md → change is live on the very next copilot request.
      2. Operator identity (who THIS operator is)
      3. Persistent memory — operator preferences/context from prior sessions
      4. Tool instructions (how to use the tools)
      5. Data quality note (only when score < 80 or critical issues exist)
    """
    from datetime import date as _date
    today_str = _date.today().isoformat()

    # Load product documentation fresh on every request so docs edits are
    # immediately reflected without redeploy.
    docs = _load_docs() or _SELF_KNOWLEDGE_FALLBACK

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

    # ── Persistent memory — inject what the operator has told us before ───────
    memory_section = ""
    try:
        memories = load_copilot_memory(company_id)
        if memories:
            lines = ["OPERATOR MEMORY (from prior conversations — apply these always)"]
            lines.append("=" * 60)
            for m in memories:
                lines.append(f"[{m['memory_type']}] {m['key']}: {m['value']}")
            lines.append(
                "\nApply these remembered preferences and instructions to every response. "
                "If the operator asks you to update or remove a memory, use save_copilot_memory "
                "with the same key to overwrite it."
            )
            memory_section = "\n".join(lines)
    except Exception:
        pass

    readiness_note = _get_readiness_note(company_id)

    parts = [docs, operator_identity]
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
      {"label": "Base44 live", "source": "base44_live"}
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
    has_live = "base44_live" in sources
    # Pick the least fresh label to surface to the user
    # Priority: "Base44 live" > "today (cached)" > "Xh Ym ago" > "X min ago" > "just now"
    def _rank(label: str) -> int:
        if label == "Base44 live":          return 0
        if label == "today (cached)":       return 1
        if "h" in label and "m" in label:   return 2
        if "min ago" in label:              return 3
        return 4  # "just now"

    label = min(timestamps, key=_rank)

    return {
        "label":  label,
        "source": "base44_live" if has_live else "analytics",
    }


def _extract_chart_configs(collected_tools: list) -> list:
    """Extract chart configs from all collected tool results."""
    charts = []
    for item in collected_tools:
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
        # Ensure copilot memory table exists (idempotent, fast after first call)
        try:
            _ensure_copilot_memory_table()
        except Exception:
            pass

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
            created_recommendations, created_insights = _extract_created_objects(collected)

            return {
                "answer":                   answer_text,
                "tools_called":             [c["tool"] for c in collected],
                "data":                     {c["tool"]: c["result"] for c in collected},
                "charts":                   charts,
                "citations":                citations,
                "data_freshness":           _extract_data_freshness(collected),
                "tools_detail":             _build_tools_detail(collected),
                "intent":                   "",
                "company_id":               self.company_id,
                "backend":                  self.backend,
                "created_recommendations":  created_recommendations,
                "created_insights":         created_insights,
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
