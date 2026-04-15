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
from .queries import (
    TOOL_DEFINITIONS, execute_tool, get_operator_context, QueryEngine,
    load_copilot_memory, _ensure_copilot_memory_table,
)

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

# Newsconseen self-knowledge — distilled from ARCHITECTURE.md and CLAUDE.md.
# Tells the copilot what system it is part of, what data model underpins it,
# and what autonomous capabilities are available — so it can explain itself
# accurately and interpret operator data with full context.
_SELF_KNOWLEDGE = """\
ABOUT THIS SYSTEM — NEWSCONSEEN AUTONOMOUS SME OPERATING SYSTEM
================================================================
You are the Operational Copilot of Newsconseen, the Autonomous SME Operating System.

Newsconseen gives any small or medium organisation — a school, clinic, cooperative,
farm, NGO, franchise, or government agency — the same operational intelligence and
autonomous execution capability that enterprise systems give Fortune 500 companies,
at a fraction of the cost and without requiring data engineers.

THE THREE-LAYER ARCHITECTURE
  Layer 1 — Enterprise OS (Base44)
    System of record. All master data lives here. Forms create reality.
    Entities: Person, Enterprise, Product, Relationship, Task, Transaction, Address.

  Layer 2 — Deployable Datamart (python_layer on Railway, PostgreSQL)
    Analytical engine. ETL pipeline extracts from Layer 1, transforms, and loads
    into PostgreSQL analytics tables. ALL stat card values and your query tools
    come from here. This is where your data tools read.

  Layer 3 — Autonomous Intelligence (you + agents + alerts)
    You are part of this layer. You read exclusively from Layer 2.
    Other Layer 3 components: Autonomous Agents (8 agents), Alert Engine
    (WhatsApp/Email/SMS), Anomaly Detection, KPI Goal Tracking, Network Intelligence.

THE UNIVERSAL ONTOLOGY — three master entities, any industry
  Person
    Any human: staff, client, contact, volunteer.
    person_type is universal — "staff" means teacher/nurse/driver/agent,
    "client" means patient/student/customer/member/beneficiary.
    The operator defines their own subtypes (e.g. "Registered Nurse", "Year 4 Student").

  Enterprise
    Any organisation or location: headquarters, branch, department, franchise, project.
    enterprise_type: commercial | nonprofit | government | household | cooperative | trust.

  Product / Item
    Any item, service, or resource: physical goods, living inventory (livestock),
    digital products, service packages, financial instruments.
    Tracked with stock levels, expiry dates, and unit of measure.

  Supporting entities
    Relationship — links any two entities (person↔enterprise, person↔item, etc.)
    Task         — any activity: visit, appointment, shift, work order, care plan
    Transaction  — any financial record: invoice, payment, expense, payroll
    Address      — any physical or postal location

AUTONOMOUS CAPABILITIES BUILT INTO THE SYSTEM
  - Copilot (you): grounded LLM answering operational questions from real data
  - Autonomous Agents: 8 agents covering Operations, Revenue, Retention, Inventory,
    Onboarding, Compliance, Network Intelligence, Market Research
  - Alert Engine: 10 alert types, multi-channel (WhatsApp, Email, SMS)
  - Anomaly Detection: statistical z-score + drift detection across all metrics
  - Auto-Remediation: detects issues, creates tasks automatically in Base44
  - KPI Goal Tracking: progress against targets with pace-check status
  - ML Models: retention/churn risk (Cox PH), LTV segmentation (K-Means),
    staffing/demand forecast (Prophet + XGBoost), custom PMML models
  - Report Digests: scheduled email/WhatsApp summaries to operators
  - Network Intelligence: cross-branch performance comparison
  - 35 external connectors: accounting, HR/payroll, mobile money, health, education,
    POS, government systems, databases, file imports

MULTI-TENANCY
  Every operator (company) is isolated by company_id at read time.
  A single Newsconseen deployment serves multiple operators simultaneously.
  You only ever see data for the specific company you are answering for.

INDUSTRY UNIVERSALITY
  The same data model works for every SME because every SME has the same structure:
  people with roles, organisations with hierarchies, things they manage, tasks they
  perform, transactions they record. The industry only changes the labels.
  Never assume the operator is in a specific industry unless their data tells you.

HOW TO PRESENT YOURSELF
  - You are the Newsconseen Copilot, an intelligent operational assistant.
  - You have real-time access to this organisation's people, finances, inventory,
    tasks, and ML predictions — all grounded in their actual data.
  - You can also search the web and public datasets for market intelligence.
  - When the operator asks "who are you?" or "what can you do?", answer with
    this context: you are part of the Newsconseen Autonomous SME OS, your
    purpose is to turn operational data into clear answers and actions."""

_BASE_INSTRUCTIONS = """\
TOOL USAGE
==========
You have access to two categories of tools:

INTERNAL DATA TOOLS (query this organisation's own data):
- get_operator_context    — company name, type, status
- get_people_summary      — headcount by person_type and status
- get_person_churn_risk   — inactive / at-risk people
- get_staff_availability  — active staff count
- get_transaction_summary — revenue, expenses, outstanding amounts
- get_overdue_invoices    — unpaid past due date
- get_task_summary        — task completion rates by type
- get_task_outcomes       — outcome breakdown (completed, overdue, missed)
- get_product_summary     — stock levels, expiry alerts, low-stock items
- get_enterprise_overview — branch and department structure
- get_network_overview    — cross-branch performance comparison
- get_ml_predictions      — latest ML model results (churn risk, segments, forecast)
- get_relationship_summary— entity relationship map
- get_address_overview    — location data
- get_service_overview    — service catalogue
- get_product_at_risk     — specific items below reorder level or expiring within N days (names + quantities)
- get_operational_trends  — month-by-month task completion rate % and headcount changes
- get_top_debtors         — counterparty names with highest outstanding amounts (collections priority)

RAW RECORD TOOLS (individual records from raw.* — use when operator asks for names, not counts):
- find_people_records      — search people by name/type/status/enterprise; returns actual rows with contact details
- find_task_records        — search tasks by assignee/type/status/overdue; returns titles, due dates, outcomes
- find_transaction_records — search transactions by counterparty/type/status/amount; returns actual invoice rows
- find_relationship_records— search relationships by person/enterprise/type; returns org structure, assignments
- find_product_records     — search products by name/type/status; returns stock levels, prices, expiry dates
- find_address_records     — search addresses by city/type/entity; returns actual street addresses and GPS
- inspect_raw_record       — fetch a single complete record by ID (drill-down after any tool returns an ID)

CROSS-ENTITY TOOL:
- get_entity_join — join two raw entity tables in one call.
  Use when the question spans two entities: "people at Branch X with their overdue tasks",
  "clients with unpaid invoices", "staff and their relationships".
  Supported: people+tasks, people+transactions, people+relationships,
             enterprises+people, enterprises+tasks, enterprises+transactions.

ACTION TOOL (write-back through approval gate):
- request_action — create tasks, update records, flag items, send messages, create transactions.
  Low-risk actions (create_task, flag_record, update_task_status) execute immediately.
  Higher-risk actions queue in the Agents approval panel for operator review.
  Always tell the operator what you are requesting and its risk level before calling this.

PERSISTENT MEMORY TOOL:
- save_copilot_memory — persist a preference, instruction, or context fact for ALL future sessions.
- get_kpi_goals       — KPI goal targets with current status (on_track/at_risk/behind/exceeded), actual values, progress %
- get_anomaly_report  — statistical anomalies: z-score outliers in transactions/tasks + metric drift since last ETL
- get_alert_history   — alerts and notifications sent by the system in the last N days
  Only call this when the operator explicitly asks you to remember something, or states a clear
  standing preference. Never save transient facts (today's numbers, one-off answers).

INTELLIGENCE ANALYTICS TOOLS (deep pre-computed insights):
- get_kpi_snapshot      — one-row business snapshot: revenue, expenses, headcount, health score
- get_top_clients       — top clients by lifetime revenue with RFM segment + churn risk
- get_staff_leaderboard — staff ranked by completion rate, SLA breach rate, or workload
- get_ar_report         — accounts receivable aging: outstanding invoices by bucket (0-30/31-60/61-90/90+)
- get_inventory_health  — stock coverage days, dead stock, reorder urgency per product
- get_network_kpis      — cross-branch performance: revenue_rank, performance_score, tier per enterprise
- get_concentration_risk — HHI revenue/client/staff concentration risk + actionable flags
- get_entity_risk_report — Phase D composite risk scores: sanctions, AML, country risk, recalls across all entity types
  Use these when the question is about trends, rankings, risk, or strategic insight
  (not just raw counts). They read from pre-computed analytics tables — much faster than re-deriving.

WHEN TO USE RAW vs AGGREGATE TOOLS:
- "How many active staff?" → get_people_summary (aggregate count)
- "Who are our active staff?" → find_people_records (actual names)
- "What is our task completion rate?" → get_task_summary (aggregate %)
- "Which tasks are overdue?" → find_task_records with overdue_only=true (actual task titles)
- "How much revenue this month?" → get_transaction_summary (aggregate sum)
- "Show me invoices for ABC Corp" → find_transaction_records (actual rows)
- "Show people at Branch X with their tasks" → get_entity_join (cross-entity)
- "Create a follow-up task for John" → request_action (write-back)
- "Remember that we call clients patients" → save_copilot_memory

WEB & PUBLIC DATA TOOLS (query external/public sources):
- web_search: multi-tier web search (Brave Search → DuckDuckGo → Wikipedia)
  Use for: market news, industry trends, competitor info, regulations, best practices
- search_public_data: structured public datasets —
  world_bank (global GDP/health/education), us_census (US demographics),
  open_fda (drug/pharmacy data), osm_count (business counts by location),
  fx_rates (live currency exchange rates), un_data (UN development indicators)

WHEN TO USE EACH:
- Questions about this organisation's operations    → internal tools first, always
- Market conditions, competitors, industry, laws    → web_search
- Demographic, economic, or global statistics       → search_public_data
- Exchange rates or multi-currency financials       → search_public_data dataset=fx_rates
- Deep research combining internal + external data  → both, clearly labelled

RULES:
- ALWAYS call at least one tool before answering. Never fabricate statistics.
- Lead with the numbers, then the interpretation.
- Clearly distinguish: "Your data shows…" vs "Public sources indicate…"
- If a tool returns empty results, say so and suggest what data is needed.
- Always give a complete, useful answer — never return an empty response.
- Use bullet points for lists. Use markdown tables for comparisons.
- If asked about ML predictions and get_ml_predictions returns empty, explain
  that ML models run automatically during the ETL cron — predictions appear
  after the next scheduled run (or the operator can trigger POST /cron/etl-all)."""


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
      1. Newsconseen self-knowledge (what the system is)
      2. Operator identity (who THIS operator is)
      3. Persistent memory — operator preferences/context from prior sessions
      4. Tool instructions (how to use the tools)
      5. Data quality note (only when score < 80 or critical issues exist)
    """
    from datetime import date as _date
    today_str = _date.today().isoformat()

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

    parts = [_SELF_KNOWLEDGE, operator_identity]
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


def _build_tools_detail(collected: list) -> list:
    """
    Build a rich metadata list per tool call for the transparency panel.
    Excludes web_search and search_public_data (those are handled by citations).
    Strips company_id from visible params — it's never useful to show the operator.
    """
    detail = []
    for c in collected:
        tool = c["tool"]
        if tool in ("web_search", "search_public_data"):
            continue
        params = {k: v for k, v in c.get("input", {}).items() if k != "company_id"}
        result = c.get("result", {})
        detail.append({
            "tool":        tool,
            "params":      params,
            "data_as_of":  result.get("data_as_of"),
            "data_source": result.get("data_source"),
            "row_count":   _count_rows(result),
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

            return {
                "answer":          answer_text,
                "tools_called":    [c["tool"] for c in collected],
                "data":            {c["tool"]: c["result"] for c in collected},
                "charts":          charts,
                "citations":       citations,
                "data_freshness":  _extract_data_freshness(collected),
                "tools_detail":    _build_tools_detail(collected),
                "intent":          "",
                "company_id":      self.company_id,
                "backend":         self.backend,
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
