"""
python_layer/copilot/queries.py
================================
All query tools available to the copilot.
Each function hits the real PostgreSQL analytics tables
and returns structured data the LLM can reason over.

Every function signature matches the tool definition in engine.py.
"""

import logging
from typing import Optional
from sqlalchemy import text
from database import get_engine_safe

logger = logging.getLogger(__name__)

# ── DB helper ────────────────────────────────────────────────────────────────

def _run(sql: str, params: dict) -> list[dict]:
    """Execute SQL and return list of dicts. Returns [] on any error."""
    engine = get_engine_safe()
    if not engine:
        return []
    try:
        with engine.connect() as conn:
            result = conn.execute(text(sql), params)
            cols = result.keys()
            return [dict(zip(cols, row)) for row in result.fetchall()]
    except Exception as e:
        logger.warning("Copilot query failed: %s", e)
        return []


# ═══════════════════════════════════════════════════════════════════════════════
# OPERATOR CONTEXT
# ═══════════════════════════════════════════════════════════════════════════════

def get_operator_context(company_id: str) -> dict:
    """
    Returns the root enterprise record — name, type, description, sector.
    Used by build_system_prompt() to ground the copilot in the operator's
    specific business context.
    Called first in every conversation so Claude knows who it is talking to.
    """
    sql = """
        SELECT
            name,
            enterprise_type,
            status,
            operating_status,
            phone,
            email,
            website,
            created_date
        FROM analytics.enterprise_summary
        WHERE company_id = :company_id
          AND is_root    = TRUE
        ORDER BY created_date ASC
        LIMIT 1
    """
    rows = _run(sql, {"company_id": company_id})

    if rows:
        ctx = rows[0]
        return {
            "name":            ctx.get("name") or "this organisation",
            "enterprise_type": ctx.get("enterprise_type") or "commercial",
            "operating_status": ctx.get("operating_status") or "active",
            "phone":           ctx.get("phone"),
            "email":           ctx.get("email"),
            "website":         ctx.get("website"),
        }

    # Fallback when no enterprise record exists yet
    return {
        "name":            "this organisation",
        "enterprise_type": "commercial",
        "operating_status": "active",
        "phone":           None,
        "email":           None,
        "website":         None,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PEOPLE QUERIES
# ═══════════════════════════════════════════════════════════════════════════════

def get_people_summary(company_id: str, person_type: Optional[str] = None) -> dict:
    """
    Returns headcount breakdown by person_type and status.
    Used for: "how many staff do we have", "how many active clients"
    """
    sql = """
        SELECT
            person_type,
            status,
            COUNT(*)            AS count,
            COUNT(*) FILTER (WHERE status = 'active')   AS active_count,
            COUNT(*) FILTER (WHERE status = 'inactive') AS inactive_count
        FROM analytics.people_summary
        WHERE company_id = :company_id
          AND (:person_type IS NULL OR person_type = :person_type)
        GROUP BY person_type, status
        ORDER BY person_type, status
    """
    rows = _run(sql, {"company_id": company_id, "person_type": person_type})

    # Aggregate totals
    totals = {}
    for r in rows:
        pt = r["person_type"] or "unknown"
        if pt not in totals:
            totals[pt] = {"total": 0, "active": 0, "inactive": 0}
        totals[pt]["total"]    += r["count"]
        totals[pt]["active"]   += r["active_count"] or 0
        totals[pt]["inactive"] += r["inactive_count"] or 0

    return {
        "summary":    totals,
        "rows":       rows,
        "total_people": sum(v["total"] for v in totals.values()),
    }


def get_person_churn_risk(company_id: str, top_n: int = 10) -> dict:
    """
    Returns people who show churn/attrition risk signals:
    - any person_type inactive or with an end_date in last 90 days
    Used for: "which clients are at risk", "who might leave", "recent exits"
    """
    sql = """
        SELECT
            first_name || ' ' || last_name   AS client_name,
            person_subtype,
            status,
            end_date,
            internal_notes,
            enterprise_name,
            company_id
        FROM analytics.people_summary
        WHERE company_id    = :company_id
          AND person_type   = 'client'
          AND (
              status = 'inactive'
              OR end_date >= CURRENT_DATE - INTERVAL '90 days'
          )
        ORDER BY end_date DESC NULLS LAST
        LIMIT :top_n
    """
    rows = _run(sql, {"company_id": company_id, "top_n": top_n})

    # Parse discharge reason from internal_notes
    for r in rows:
        notes = r.get("internal_notes") or ""
        r["end_reason"] = "Not recorded"
        for prefix in ["End reason:", "Discharge reason:", "Exit reason:", "Left reason:"]:
            if prefix in notes:
                r["end_reason"] = notes.split(prefix)[-1].split("|")[0].strip()
                break

    return {
        "at_risk_people": rows,
        "count":          len(rows),
    }


def get_staff_availability(
    company_id:    str,
    branch_id:     Optional[str] = None,
    person_subtype:Optional[str] = None,
) -> dict:
    """
    Returns staff availability status breakdown.
    Used for: "who is available", "how many nurses are on shift"
    """
    sql = """
        SELECT
            first_name || ' ' || last_name AS staff_name,
            person_subtype                  AS role,
            availability_status,
            enterprise_name                 AS branch,
            phone,
            email
        FROM analytics.people_summary
        WHERE company_id  = :company_id
          AND person_type = 'staff'
          AND status      = 'active'
          AND (:branch_id      IS NULL OR enterprise_id   = :branch_id)
          AND (:person_subtype IS NULL OR person_subtype  = :person_subtype)
        ORDER BY availability_status, person_subtype
    """
    rows = _run(sql, {
        "company_id":     company_id,
        "branch_id":      branch_id,
        "person_subtype": person_subtype,
    })

    by_status = {}
    for r in rows:
        s = r["availability_status"] or "unknown"
        by_status.setdefault(s, []).append(r)

    return {
        "by_availability": by_status,
        "available_count": len(by_status.get("available", [])),
        "total_active":    len(rows),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# TRANSACTION QUERIES
# ═══════════════════════════════════════════════════════════════════════════════

def get_transaction_summary(
    company_id:       str,
    months_back:      int = 3,
    transaction_type: Optional[str] = None,
) -> dict:
    """
    Returns revenue and transaction metrics for recent months.
    Used for: "how much revenue", "what are our earnings", "financial overview"
    """
    sql = """
        SELECT
            DATE_TRUNC('month', date)   AS month,
            transaction_type,
            COUNT(*)                    AS count,
            SUM(amount)                 AS total_amount,
            SUM(CASE WHEN payment_status = 'paid'   THEN amount ELSE 0 END) AS paid_amount,
            SUM(CASE WHEN payment_status = 'unpaid' THEN amount ELSE 0 END) AS unpaid_amount,
            COUNT(CASE WHEN status = 'draft'  THEN 1 END) AS draft_count,
            COUNT(CASE WHEN status = 'posted' THEN 1 END) AS posted_count
        FROM analytics.transaction_summary
        WHERE company_id = :company_id
          AND date      >= CURRENT_DATE - (:months_back || ' months')::INTERVAL
          AND (:transaction_type IS NULL OR transaction_type = :transaction_type)
        GROUP BY DATE_TRUNC('month', date), transaction_type
        ORDER BY month DESC, total_amount DESC
    """
    rows = _run(sql, {
        "company_id":       company_id,
        "months_back":      months_back,
        "transaction_type": transaction_type,
    })

    total_revenue  = sum(r["total_amount"]  or 0 for r in rows)
    total_unpaid   = sum(r["unpaid_amount"] or 0 for r in rows)
    total_draft    = sum(r["draft_count"]   or 0 for r in rows)

    return {
        "monthly_breakdown": rows,
        "total_revenue":     round(total_revenue,  2),
        "total_unpaid":      round(total_unpaid,   2),
        "pending_drafts":    total_draft,
        "months_analysed":   months_back,
    }


def get_overdue_invoices(company_id: str, top_n: int = 20) -> dict:
    """
    Returns unpaid posted invoices past their due date.
    Used for: "what invoices are overdue", "who owes us money"
    """
    sql = """
        SELECT
            counterparty,
            enterprise,
            amount,
            amount - COALESCE(amount_paid, 0) AS outstanding,
            due_date,
            CURRENT_DATE - due_date            AS days_overdue,
            reference_number,
            transaction_type
        FROM analytics.transaction_summary
        WHERE company_id     = :company_id
          AND payment_status = 'unpaid'
          AND status         = 'posted'
          AND due_date       < CURRENT_DATE
        ORDER BY days_overdue DESC
        LIMIT :top_n
    """
    rows = _run(sql, {"company_id": company_id, "top_n": top_n})
    total_outstanding = sum(r["outstanding"] or 0 for r in rows)

    return {
        "overdue_invoices":    rows,
        "count":               len(rows),
        "total_outstanding":   round(total_outstanding, 2),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# TASK / VISIT QUERIES
# ═══════════════════════════════════════════════════════════════════════════════

def get_task_summary(
    company_id:  str,
    task_type:   Optional[str] = None,
    days_back:   int = 30,
) -> dict:
    """
    Returns task completion rates, overdue tasks, outcomes.
    Used for: "how are visits going", "completion rate", "what tasks are overdue"
    """
    sql = """
        SELECT
            task_type,
            status,
            outcome,
            enterprise_name                            AS branch,
            COUNT(*)                                   AS count,
            COUNT(*) FILTER (WHERE status = 'completed')  AS completed_count,
            COUNT(*) FILTER (WHERE status = 'open'
              AND due_date < CURRENT_DATE)              AS overdue_count
        FROM analytics.task_summary
        WHERE company_id = :company_id
          AND (:task_type IS NULL OR task_type = :task_type)
          AND (scheduled_date >= CURRENT_DATE - (:days_back || ' days')::INTERVAL
               OR scheduled_date IS NULL)
        GROUP BY task_type, status, outcome, enterprise_name
        ORDER BY count DESC
    """
    rows = _run(sql, {
        "company_id": company_id,
        "task_type":  task_type,
        "days_back":  days_back,
    })

    total       = sum(r["count"]           or 0 for r in rows)
    completed   = sum(r["completed_count"] or 0 for r in rows)
    overdue     = sum(r["overdue_count"]   or 0 for r in rows)
    rate        = round(completed / total * 100, 1) if total > 0 else 0

    return {
        "breakdown":        rows,
        "total_tasks":      total,
        "completed":        completed,
        "overdue":          overdue,
        "completion_rate":  rate,
        "days_analysed":    days_back,
    }


def get_task_outcomes(
    company_id: str,
    task_type:  Optional[str] = None,
    days_back:  int = 30,
) -> dict:
    """
    Returns breakdown of task outcomes (completed, no-show, rescheduled, etc).
    Used for: "how many visits were missed", "no-shows", "task outcome breakdown"
    """
    sql = """
        SELECT
            outcome,
            COUNT(*)   AS count,
            ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER(), 0), 1) AS pct
        FROM analytics.task_summary
        WHERE company_id = :company_id
          AND (:task_type IS NULL OR task_type = :task_type)
          AND scheduled_date >= CURRENT_DATE - (:days_back || ' days')::INTERVAL
        GROUP BY outcome
        ORDER BY count DESC
    """
    rows = _run(sql, {
        "company_id": company_id,
        "task_type":  task_type,
        "days_back":  days_back,
    })

    return {
        "outcomes":      rows,
        "days_analysed": days_back,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PRODUCT / INVENTORY QUERIES
# ═══════════════════════════════════════════════════════════════════════════════

def get_product_summary(
    company_id: str,
    item_type:  Optional[str] = None,
) -> dict:
    """
    Returns inventory status, low stock alerts, expiry warnings.
    Used for: "what stock do we have", "what is expiring", "low stock items"
    """
    sql = """
        SELECT
            product_name,
            item_type,
            item_subtype,
            item_class,
            stock_quantity,
            reorder_level,
            expiry_date,
            status,
            CASE
                WHEN stock_quantity <= 0              THEN 'out_of_stock'
                WHEN stock_quantity <= reorder_level  THEN 'low_stock'
                ELSE 'ok'
            END AS stock_status,
            CASE
                WHEN expiry_date <= CURRENT_DATE              THEN 'expired'
                WHEN expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
                ELSE 'ok'
            END AS expiry_status
        FROM analytics.product_summary
        WHERE company_id = :company_id
          AND status     = 'active'
          AND (:item_type IS NULL OR item_type = :item_type)
        ORDER BY stock_status DESC, expiry_status DESC, product_name
    """
    rows = _run(sql, {"company_id": company_id, "item_type": item_type})

    out_of_stock   = [r for r in rows if r["stock_status"]  == "out_of_stock"]
    low_stock      = [r for r in rows if r["stock_status"]  == "low_stock"]
    expiring_soon  = [r for r in rows if r["expiry_status"] == "expiring_soon"]
    expired        = [r for r in rows if r["expiry_status"] == "expired"]

    return {
        "all_products":   rows,
        "out_of_stock":   out_of_stock,
        "low_stock":      low_stock,
        "expiring_soon":  expiring_soon,
        "expired":        expired,
        "alerts": {
            "out_of_stock_count":  len(out_of_stock),
            "low_stock_count":     len(low_stock),
            "expiring_soon_count": len(expiring_soon),
            "expired_count":       len(expired),
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ENTERPRISE / NETWORK QUERIES
# ═══════════════════════════════════════════════════════════════════════════════

def get_enterprise_overview(company_id: str) -> dict:
    """
    Returns enterprise / branch structure and operating status.
    Used for: "how many branches", "which locations are open"
    """
    sql = """
        SELECT
            enterprise_name,
            enterprise_type,
            enterprise_tier,
            operating_status,
            status,
            city,
            region,
            country
        FROM analytics.enterprise_summary
        WHERE company_id = :company_id
        ORDER BY enterprise_tier, enterprise_name
    """
    rows = _run(sql, {"company_id": company_id})

    open_branches = [r for r in rows if r["operating_status"] == "open"]

    return {
        "enterprises":     rows,
        "total_count":     len(rows),
        "open_count":      len(open_branches),
        "by_tier": {
            tier: [r for r in rows if r["enterprise_tier"] == tier]
            for tier in set(r["enterprise_tier"] for r in rows if r["enterprise_tier"])
        },
    }


def get_network_overview(company_id: str) -> dict:
    """
    Returns a cross-enterprise summary if the operator is part of a network.
    Used for: "how is the network doing", "compare branches"
    """
    sql = """
        SELECT
            e.enterprise_name,
            e.enterprise_tier,
            COUNT(DISTINCT p.id)  FILTER (WHERE p.person_type = 'client' AND p.status = 'active') AS active_clients,
            COUNT(DISTINCT p.id)  FILTER (WHERE p.person_type = 'staff'  AND p.status = 'active') AS active_staff,
            COUNT(DISTINCT t.id)  FILTER (WHERE t.status = 'open')                                 AS open_tasks,
            COALESCE(SUM(tx.amount) FILTER (WHERE tx.status = 'posted'), 0)                        AS revenue_posted
        FROM analytics.enterprise_summary   e
        LEFT JOIN analytics.people_summary  p  ON p.enterprise_id = e.id AND p.company_id = e.company_id
        LEFT JOIN analytics.task_summary    t  ON t.enterprise_id = e.id AND t.company_id = e.company_id
        LEFT JOIN analytics.transaction_summary tx ON tx.enterprise = e.enterprise_name AND tx.company_id = e.company_id
        WHERE e.company_id = :company_id
        GROUP BY e.enterprise_name, e.enterprise_tier
        ORDER BY e.enterprise_tier, active_clients DESC
    """
    rows = _run(sql, {"company_id": company_id})
    return {"network_summary": rows, "branch_count": len(rows)}


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL DEFINITIONS — registered with Anthropic API
# ═══════════════════════════════════════════════════════════════════════════════

TOOL_DEFINITIONS = [
    {
        "name": "get_operator_context",
        "description": "Get the operator's enterprise name, type, and operating status. Call this first whenever you need to personalise your response or understand the business context.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_people_summary",
        "description": "Get headcount breakdown by person_type (staff, client, contact) and status. Use for questions about team size, client count, staffing levels.",
        "input_schema": {
            "type": "object",
            "properties": {
                "person_type": {
                    "type": "string",
                    "enum": ["staff", "client", "contact", "volunteer"],
                    "description": "Filter by person type. Leave null for all types.",
                },
            },
        },
    },
    {
        "name": "get_person_churn_risk",
        "description": "Get people showing attrition/churn risk — recently ended or inactive in last 90 days. Works for any person_type. Use for retention, dropout, membership loss questions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "top_n": {
                    "type": "integer",
                    "description": "Max number of at-risk people to return. Default 10.",
                },
            },
        },
    },
    {
        "name": "get_staff_availability",
        "description": "Get active staff availability breakdown — available, busy, on leave. Filter by branch or role subtype (operator-defined).",
        "input_schema": {
            "type": "object",
            "properties": {
                "branch_id":      {"type": "string", "description": "Filter by branch enterprise ID"},
                "person_subtype": {"type": "string", "description": "Filter by role subtype (operator-defined, e.g. specific job title)"},
            },
        },
    },
    {
        "name": "get_transaction_summary",
        "description": "Get revenue and transaction metrics for recent months. Returns monthly breakdown, totals, paid vs unpaid amounts. Use for financial questions, revenue, earnings.",
        "input_schema": {
            "type": "object",
            "properties": {
                "months_back":      {"type": "integer", "description": "How many months back to analyse. Default 3."},
                "transaction_type": {"type": "string",  "description": "Filter by type e.g. 'product_sale', 'service_fee', 'payroll'"},
            },
        },
    },
    {
        "name": "get_overdue_invoices",
        "description": "Get unpaid invoices that are past their due date. Returns client name, amount outstanding, days overdue. Use for 'overdue invoices', 'who owes us', 'accounts receivable'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "top_n": {"type": "integer", "description": "Max invoices to return. Default 20."},
            },
        },
    },
    {
        "name": "get_task_summary",
        "description": "Get task and care visit metrics — completion rates, overdue tasks, outcomes by branch. Use for 'task completion', 'how are visits going', 'overdue tasks'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_type": {"type": "string", "description": "Filter by task type (operator-defined)"},
                "days_back": {"type": "integer", "description": "Days back to analyse. Default 30."},
            },
        },
    },
    {
        "name": "get_task_outcomes",
        "description": "Get breakdown of task outcomes — completed, no-show, rescheduled, missed. Use for 'missed visits', 'no-shows', 'task outcome breakdown', 'visit quality'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_type": {"type": "string", "description": "Filter by task type (operator-defined). Null for all types."},
                "days_back": {"type": "integer", "description": "Days back to analyse. Default 30."},
            },
        },
    },
    {
        "name": "get_product_summary",
        "description": "Get inventory status — stock levels, low stock alerts, expiring items. Use for 'stock levels', 'what is expiring', 'inventory alerts', 'supplies'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "item_type": {"type": "string", "enum": ["physical", "digital", "service_package", "living"], "description": "Filter by item type"},
            },
        },
    },
    {
        "name": "get_enterprise_overview",
        "description": "Get branch and enterprise structure — locations, operating status, tiers. Use for 'how many branches', 'which locations are open', 'office overview'.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_network_overview",
        "description": "Get cross-branch summary comparing clients, staff, tasks, and revenue across all branches. Use for 'network overview', 'compare branches', 'consolidated view'.",
        "input_schema": {"type": "object", "properties": {}},
    },
]


# ── OpenAI-compatible tool definitions (for Qwen via DashScope) ──────────────
# Converts Anthropic format (input_schema) to OpenAI format (parameters).
# Keeps TOOL_DEFINITIONS as the single source of truth — no duplication.

TOOL_DEFINITIONS_OPENAI = [
    {
        "type": "function",
        "function": {
            "name":        t["name"],
            "description": t["description"],
            "parameters":  t["input_schema"],
        },
    }
    for t in TOOL_DEFINITIONS
]


# ── Tool dispatcher ───────────────────────────────────────────────────────────

def execute_tool(tool_name: str, tool_input: dict, company_id: str) -> dict:
    """
    Called by the engine when Claude selects a tool.
    Injects company_id (never from user input) and dispatches to the right function.
    """
    # Inject company_id — never trust it from tool_input
    kwargs = {k: v for k, v in tool_input.items() if k != "company_id"}
    kwargs["company_id"] = company_id

    dispatch = {
        "get_operator_context":    get_operator_context,
        "get_people_summary":      get_people_summary,
        "get_person_churn_risk":   get_person_churn_risk,
        "get_staff_availability":  get_staff_availability,
        "get_transaction_summary": get_transaction_summary,
        "get_overdue_invoices":    get_overdue_invoices,
        "get_task_summary":        get_task_summary,
        "get_task_outcomes":       get_task_outcomes,
        "get_product_summary":     get_product_summary,
        "get_enterprise_overview": get_enterprise_overview,
        "get_network_overview":    get_network_overview,
    }

    fn = dispatch.get(tool_name)
    if not fn:
        return {"error": f"Unknown tool: {tool_name}"}

    try:
        return fn(**kwargs)
    except TypeError as e:
        logger.warning("Tool %s called with bad args %s: %s", tool_name, kwargs, e)
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# QueryEngine — class wrapper used by CopilotEngine and routes.py
#
# Wraps the module-level query functions with company_id bound at construction.
# routes.py accesses this via engine.query_engine.<method>().
#
# Reshaping notes:
#   query_enterprises()      → returns {"data": [...]} where each item has
#                              id, name, enterprise_type keys (routes.py shape)
#   query_network_overview() → returns raw get_network_overview() result;
#                              routes.py reads .get("summary", {}) which safely
#                              returns {} when the key is absent.
# ═══════════════════════════════════════════════════════════════════════════════

class QueryEngine:
    def __init__(self, company_id: str):
        self.company_id = company_id

    def query_operator_context(self) -> dict:
        return get_operator_context(self.company_id)

    def query_people_summary(self, person_type: str = None) -> dict:
        return get_people_summary(self.company_id, person_type)

    def query_churn_risk(self, top_n: int = 10) -> dict:
        return get_person_churn_risk(self.company_id, top_n)

    def query_staff_availability(
        self, branch_id: str = None, person_subtype: str = None
    ) -> dict:
        return get_staff_availability(self.company_id, branch_id, person_subtype)

    def query_transaction_summary(
        self, months_back: int = 3, transaction_type: str = None
    ) -> dict:
        return get_transaction_summary(self.company_id, months_back, transaction_type)

    def query_overdue_invoices(self, top_n: int = 20) -> dict:
        return get_overdue_invoices(self.company_id, top_n)

    def query_task_summary(self, task_type: str = None, days_back: int = 30) -> dict:
        return get_task_summary(self.company_id, task_type, days_back)

    def query_task_outcomes(self, task_type: str = None, days_back: int = 30) -> dict:
        return get_task_outcomes(self.company_id, task_type, days_back)

    def query_product_summary(self, item_type: str = None) -> dict:
        return get_product_summary(self.company_id, item_type)

    def query_enterprise_overview(self) -> dict:
        return get_enterprise_overview(self.company_id)

    def query_enterprises(self) -> dict:
        """
        Reshape get_enterprise_overview() into the shape routes.py expects:
            {"data": [{"id": ..., "name": ..., "enterprise_type": ...}, ...]}
        """
        result = get_enterprise_overview(self.company_id)
        data = [
            {
                "id":              e.get("id"),
                "name":            e.get("enterprise_name") or e.get("name"),
                "enterprise_type": e.get("enterprise_type"),
            }
            for e in result.get("enterprises", [])
        ]
        return {"data": data}

    def query_network_overview(self) -> dict:
        """
        Returns get_network_overview() result.
        routes.py reads .get("summary", {}) → safely returns {} when absent.
        """
        return get_network_overview(self.company_id)
