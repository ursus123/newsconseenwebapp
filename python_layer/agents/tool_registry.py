# ==============================================================
# Phase 4A — Agent Tool Registry
# ==============================================================
# All tools available to agents. Wraps existing python_layer
# capabilities: analytics queries, ML models, PostGIS, pgvector,
# alerts, Base44 write-back, ETL triggers.
#
# Each tool:
#   definition  — Anthropic tool schema (name, description, input_schema)
#   executor    — Python function that runs when Claude calls the tool
# ==============================================================

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

RAILWAY_URL = os.getenv(
    "RAILWAY_INTERNAL_URL",
    "http://localhost:8000",  # internal Railway service URL
)

# ── Internal HTTP helper ──────────────────────────────────────────────────────

def _call(method: str, path: str, params: dict = None, json: dict = None) -> dict:
    """Internal HTTP call to python_layer endpoints."""
    import requests
    url = f"{RAILWAY_URL}{path}"
    headers = {"x-api-key": os.getenv("API_KEY", "")}
    try:
        if method == "GET":
            r = requests.get(url, params=params, headers=headers, timeout=30)
        else:
            r = requests.post(url, params=params, json=json, headers=headers, timeout=60)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning("Tool call failed %s %s: %s", method, path, e)
        return {"error": str(e)}


# ── Tool executors ────────────────────────────────────────────────────────────

def _get_people_summary(company_id: str, **kw) -> dict:
    return _call("GET", "/people-summary", {"company_id": company_id})

def _get_enterprise_summary(company_id: str, **kw) -> dict:
    return _call("GET", "/enterprise-summary", {"company_id": company_id})

def _get_transaction_summary(company_id: str, days: int = 30, **kw) -> dict:
    return _call("GET", "/transaction-summary", {"company_id": company_id, "days": days})

def _get_task_summary(company_id: str, **kw) -> dict:
    return _call("GET", "/task-summary", {"company_id": company_id})

def _get_product_summary(company_id: str, **kw) -> dict:
    return _call("GET", "/product-summary", {"company_id": company_id})

def _get_overdue_tasks(company_id: str, **kw) -> dict:
    return _call("GET", "/tasks/overdue", {"company_id": company_id})

def _get_retention_risk(company_id: str, **kw) -> dict:
    return _call("POST", "/ml/retention-risk", params={"company_id": company_id})

def _get_ltv_segments(company_id: str, **kw) -> dict:
    return _call("POST", "/ml/ltv-segmentation", params={"company_id": company_id})

def _get_staffing_forecast(company_id: str, **kw) -> dict:
    return _call("POST", "/ml/staffing-forecast", params={"company_id": company_id})

def _get_nearby_locations(company_id: str, lat: float, lng: float,
                          radius_meters: int = 5000, **kw) -> dict:
    return _call("GET", "/postgis/nearby", {
        "company_id": company_id, "lat": lat, "lng": lng,
        "radius_meters": radius_meters,
    })

def _get_density_map(company_id: str, **kw) -> dict:
    return _call("GET", "/postgis/density", {"company_id": company_id})

def _semantic_search(company_id: str, query: str,
                     entity_type: str = "people", limit: int = 10, **kw) -> dict:
    return _call("GET", "/pgvector/search", {
        "company_id": company_id, "query": query,
        "entity_type": entity_type, "limit": limit,
    })

def _send_alert(company_id: str, channel: str, message: str,
                recipient: str = "", **kw) -> dict:
    return _call("POST", "/alerts/send", json={
        "company_id": company_id, "channel": channel,
        "message": message, "recipient": recipient,
    })

def _trigger_etl(company_id: str, entity: str = "all", **kw) -> dict:
    endpoint = "/cron/etl-all" if entity == "all" else f"/load/{entity}-summary"
    return _call("POST", endpoint, {"company_id": company_id})

def _copilot_ask(company_id: str, question: str, **kw) -> dict:
    return _call("POST", "/copilot/ask", json={
        "question": question, "company_id": company_id,
    })

def _get_network_overview(company_id: str, **kw) -> dict:
    return _call("GET", "/network/overview", {"company_id": company_id})

def _search_market(query: str, company_id: str, **kw) -> dict:
    return _call("GET", "/market/search", {"q": query, "company_id": company_id})

def _get_competitor_density(lat: float, lng: float,
                             radius_km: float = 10, **kw) -> dict:
    return _call("GET", "/market/nearby", {
        "lat": lat, "lng": lng, "radius_km": radius_km,
    })


# ── Phase 13: Write-back tool executors ──────────────────────────────────────
# These tools allow agents to propose Base44 mutations.
# They route through the approval gate (base_agent._execute_tools_parallel).
# Actual Base44 writes happen only after approval via action_executor.

def _create_task(company_id: str, title: str, task_type: str = "follow_up",
                 description: str = "", priority: str = "medium",
                 assigned_to_name: str = "", due_date: str = "",
                 notes: str = "", **kw) -> dict:
    """Propose creating a task — routes through approval gate."""
    return {
        "proposed": True,
        "action_type": "create_task",
        "inputs": {
            "company_id": company_id, "title": title, "task_type": task_type,
            "description": description, "priority": priority,
            "assigned_to_name": assigned_to_name, "due_date": due_date,
            "notes": notes,
        },
    }


def _flag_record(company_id: str, entity_type: str, record_id: str,
                 reason: str = "Flagged by agent", **kw) -> dict:
    """Propose flagging a record — routes through approval gate."""
    return {
        "proposed": True,
        "action_type": "flag_record",
        "inputs": {
            "company_id": company_id, "entity_type": entity_type,
            "record_id": record_id, "reason": reason,
        },
    }


def _update_record(company_id: str, entity_type: str, record_id: str,
                   updates: dict = None, **kw) -> dict:
    """Propose updating a record's fields — routes through approval gate."""
    return {
        "proposed": True,
        "action_type": "update_record",
        "inputs": {
            "company_id": company_id, "entity_type": entity_type,
            "record_id": record_id, "updates": updates or {},
        },
    }


def _create_follow_up(company_id: str, title: str, description: str = "",
                      assigned_to_name: str = "", due_date: str = "",
                      priority: str = "medium", **kw) -> dict:
    """Propose creating a follow-up task — routes through approval gate."""
    return _create_task(
        company_id=company_id, title=title, task_type="follow_up",
        description=description, assigned_to_name=assigned_to_name,
        due_date=due_date, priority=priority,
    )


# ── Tool definitions (Anthropic schema) ──────────────────────────────────────

TOOL_DEFINITIONS = [
    {
        "name": "get_people_summary",
        "description": "Get headcount, staff availability, and person breakdown for the company.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string", "description": "Company ID"}
            },
            "required": ["company_id"],
        },
    },
    {
        "name": "get_enterprise_summary",
        "description": "Get enterprise/branch count, status breakdown, and network structure.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"}
            },
            "required": ["company_id"],
        },
    },
    {
        "name": "get_transaction_summary",
        "description": "Get revenue totals, trends, overdue invoices, and financial health.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"},
                "days": {"type": "integer", "description": "Lookback days (default 30)"},
            },
            "required": ["company_id"],
        },
    },
    {
        "name": "get_task_summary",
        "description": "Get task completion rates, overdue tasks, and workload by assignee.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"}
            },
            "required": ["company_id"],
        },
    },
    {
        "name": "get_product_summary",
        "description": "Get stock levels, low-stock alerts, and product performance.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"}
            },
            "required": ["company_id"],
        },
    },
    {
        "name": "get_overdue_tasks",
        "description": "Get all tasks that are past their due date and not completed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"}
            },
            "required": ["company_id"],
        },
    },
    {
        "name": "get_retention_risk",
        "description": "Run retention risk ML model. Returns clients scored by churn probability.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"}
            },
            "required": ["company_id"],
        },
    },
    {
        "name": "get_ltv_segments",
        "description": "Run LTV segmentation. Returns client segments by lifetime value.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"}
            },
            "required": ["company_id"],
        },
    },
    {
        "name": "get_staffing_forecast",
        "description": "Run staffing demand forecast for the next 30 days.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"}
            },
            "required": ["company_id"],
        },
    },
    {
        "name": "get_nearby_locations",
        "description": "Find entities within a radius of a geographic point.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"},
                "lat": {"type": "number"},
                "lng": {"type": "number"},
                "radius_meters": {"type": "integer"},
            },
            "required": ["company_id", "lat", "lng"],
        },
    },
    {
        "name": "get_density_map",
        "description": "Get geographic density grid of entities for mapping and territory analysis.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"}
            },
            "required": ["company_id"],
        },
    },
    {
        "name": "semantic_search",
        "description": "Semantic similarity search across entity records.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"},
                "query": {"type": "string"},
                "entity_type": {"type": "string", "enum": ["people", "enterprises", "products", "tasks", "transactions"]},
                "limit": {"type": "integer"},
            },
            "required": ["company_id", "query"],
        },
    },
    {
        "name": "send_alert",
        "description": "Send a WhatsApp, email, or SMS alert. Use only for approved communications.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"},
                "channel": {"type": "string", "enum": ["whatsapp", "email", "sms"]},
                "message": {"type": "string"},
                "recipient": {"type": "string"},
            },
            "required": ["company_id", "channel", "message"],
        },
    },
    {
        "name": "trigger_etl",
        "description": "Trigger ETL pipeline to refresh analytics tables.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"},
                "entity": {"type": "string", "description": "Entity type or 'all'"},
            },
            "required": ["company_id"],
        },
    },
    {
        "name": "copilot_ask",
        "description": "Ask the Newsconseen copilot a grounded question about the business.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"},
                "question": {"type": "string"},
            },
            "required": ["company_id", "question"],
        },
    },
    {
        "name": "get_network_overview",
        "description": "Get cross-branch performance comparison for multi-location operators.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"}
            },
            "required": ["company_id"],
        },
    },
    {
        "name": "search_market",
        "description": "Search public market data — competitors, economic signals, industry news.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id": {"type": "string"},
                "query": {"type": "string"},
            },
            "required": ["company_id", "query"],
        },
    },
    {
        "name": "get_competitor_density",
        "description": "Get competitor counts and locations within a geographic radius (OpenStreetMap).",
        "input_schema": {
            "type": "object",
            "properties": {
                "lat": {"type": "number"},
                "lng": {"type": "number"},
                "radius_km": {"type": "number"},
            },
            "required": ["lat", "lng"],
        },
    },
    # ── Phase 13: Write-back action tools ─────────────────────────────────────
    {
        "name": "create_task",
        "description": (
            "Create a task or follow-up action for a person or team. "
            "Use this when you detect a condition that requires human follow-through "
            "(e.g. at-risk client needs a check-in call, overdue invoice needs chasing). "
            "Routes through approval gate — auto-approved for low-risk task types."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id":       {"type": "string"},
                "title":            {"type": "string", "description": "Task title"},
                "task_type":        {"type": "string", "description": "follow_up | call | visit | purchase_order | reminder | compliance_check"},
                "description":      {"type": "string"},
                "priority":         {"type": "string", "description": "low | medium | high | urgent"},
                "assigned_to_name": {"type": "string", "description": "Name of the person to assign to"},
                "due_date":         {"type": "string", "description": "ISO date YYYY-MM-DD"},
                "notes":            {"type": "string"},
            },
            "required": ["company_id", "title"],
        },
    },
    {
        "name": "create_follow_up",
        "description": (
            "Create a follow-up task for a specific person or client. "
            "Shorter form of create_task — always sets task_type=follow_up."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id":       {"type": "string"},
                "title":            {"type": "string"},
                "description":      {"type": "string"},
                "assigned_to_name": {"type": "string"},
                "due_date":         {"type": "string"},
                "priority":         {"type": "string"},
            },
            "required": ["company_id", "title"],
        },
    },
    {
        "name": "flag_record",
        "description": (
            "Flag a person, enterprise, product, or task record for operator attention. "
            "Use when a record requires review but no immediate action "
            "(e.g. duplicate suspected, compliance concern, stock anomaly). "
            "Auto-approved — executes immediately."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id":  {"type": "string"},
                "entity_type": {"type": "string", "description": "person | enterprise | product | task"},
                "record_id":   {"type": "string", "description": "Base44 entity ID"},
                "reason":      {"type": "string", "description": "Why this record is being flagged"},
            },
            "required": ["company_id", "entity_type", "record_id", "reason"],
        },
    },
    {
        "name": "update_record",
        "description": (
            "Update specific fields on an existing person, enterprise, product, or task record. "
            "Use for status changes, corrections, or enrichment "
            "(e.g. mark a person inactive, update product stock level). "
            "Routes through approval gate — risk level depends on entity type."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "company_id":  {"type": "string"},
                "entity_type": {"type": "string", "description": "person | enterprise | product | task | transaction"},
                "record_id":   {"type": "string"},
                "updates":     {
                    "type": "object",
                    "description": "Dict of field_name → new_value to apply",
                },
            },
            "required": ["company_id", "entity_type", "record_id", "updates"],
        },
    },
]

# ── Dispatcher ────────────────────────────────────────────────────────────────

_EXECUTORS: dict[str, Any] = {
    "get_people_summary":      _get_people_summary,
    "get_enterprise_summary":  _get_enterprise_summary,
    "get_transaction_summary": _get_transaction_summary,
    "get_task_summary":        _get_task_summary,
    "get_product_summary":     _get_product_summary,
    "get_overdue_tasks":       _get_overdue_tasks,
    "get_retention_risk":      _get_retention_risk,
    "get_ltv_segments":        _get_ltv_segments,
    "get_staffing_forecast":   _get_staffing_forecast,
    "get_nearby_locations":    _get_nearby_locations,
    "get_density_map":         _get_density_map,
    "semantic_search":         _semantic_search,
    "send_alert":              _send_alert,
    "trigger_etl":             _trigger_etl,
    "copilot_ask":             _copilot_ask,
    "get_network_overview":    _get_network_overview,
    "search_market":           _search_market,
    "get_competitor_density":  _get_competitor_density,
    # Phase 13 — write-back tools
    "create_task":             _create_task,
    "create_follow_up":        _create_follow_up,
    "flag_record":             _flag_record,
    "update_record":           _update_record,
}


def execute_tool(name: str, inputs: dict) -> dict:
    """Execute a registered tool by name. Returns result dict."""
    fn = _EXECUTORS.get(name)
    if fn is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        return fn(**inputs) or {}
    except Exception as e:
        logger.warning("Tool %s failed: %s", name, e)
        return {"error": str(e)}
