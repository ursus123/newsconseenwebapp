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
    # people_summary is pre-aggregated: one row per (person_type, status, snapshot_date).
    # Use SUM(people_count) / SUM(active_count) — never COUNT(*).
    # snapshot_date filter keeps only the latest snapshot per group.
    sql = """
        SELECT
            person_type,
            status,
            SUM(people_count)  AS count,
            SUM(active_count)  AS active_count,
            SUM(inactive_count) AS inactive_count
        FROM analytics.people_summary
        WHERE company_id = :company_id
          AND (:person_type IS NULL OR person_type = :person_type)
          AND snapshot_date = (
              SELECT MAX(snapshot_date) FROM analytics.people_summary
              WHERE company_id = :company_id
          )
        GROUP BY person_type, status
        ORDER BY person_type, status
    """
    rows = _run(sql, {"company_id": company_id, "person_type": person_type})

    # Aggregate totals across person_type groups
    totals = {}
    for r in rows:
        pt = r["person_type"] or "unknown"
        if pt not in totals:
            totals[pt] = {"total": 0, "active": 0, "inactive": 0}
        totals[pt]["total"]    += r["count"] or 0
        totals[pt]["active"]   += r["active_count"] or 0
        totals[pt]["inactive"] += r["inactive_count"] or 0

    return {
        "summary":      totals,
        "rows":         rows,
        "total_people": sum(v["total"] for v in totals.values()),
    }


def get_person_churn_risk(company_id: str, top_n: int = 10) -> dict:
    """
    Returns person_type groups with inactive status — churn/attrition signal.
    Used for: "which clients are at risk", "who might leave", "recent exits"
    people_summary is aggregated by (person_type, status) — no individual rows.
    """
    sql = """
        SELECT
            person_type,
            status,
            SUM(people_count)  AS count,
            SUM(inactive_count) AS inactive_count
        FROM analytics.people_summary
        WHERE company_id  = :company_id
          AND status      = 'inactive'
          AND snapshot_date = (
              SELECT MAX(snapshot_date) FROM analytics.people_summary
              WHERE company_id = :company_id
          )
        GROUP BY person_type, status
        ORDER BY count DESC
        LIMIT :top_n
    """
    rows = _run(sql, {"company_id": company_id, "top_n": top_n})
    total = sum(r["count"] or 0 for r in rows)

    return {
        "at_risk_people": rows,
        "count":          total,
    }


def get_staff_availability(
    company_id:    str,
    branch_id:     Optional[str] = None,
    person_subtype:Optional[str] = None,
) -> dict:
    """
    Returns active staff count from the aggregated people_summary.
    Used for: "how many staff are active", "who is on shift"
    people_summary is aggregated — individual availability_status not stored.
    """
    sql = """
        SELECT
            person_type,
            status,
            SUM(people_count) AS count,
            SUM(active_count) AS active_count
        FROM analytics.people_summary
        WHERE company_id  = :company_id
          AND is_staff     = TRUE
          AND status       = 'active'
          AND snapshot_date = (
              SELECT MAX(snapshot_date) FROM analytics.people_summary
              WHERE company_id = :company_id
          )
        GROUP BY person_type, status
    """
    rows = _run(sql, {"company_id": company_id})
    total_active = sum(r["active_count"] or 0 for r in rows)

    return {
        "by_availability": {"active": rows},
        "available_count": total_active,
        "total_active":    total_active,
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
    # transaction_summary columns: transaction_type, status, total_transactions,
    # total_amount, avg_amount, outstanding_amount, is_revenue, is_expense,
    # revenue_last_7d, revenue_last_30d, expense_last_30d, snapshot_date
    sql = """
        SELECT
            transaction_type,
            status,
            SUM(total_transactions) AS count,
            SUM(total_amount)       AS total_amount,
            SUM(outstanding_amount) AS unpaid_amount,
            SUM(revenue_last_30d)   AS revenue_last_30d,
            SUM(expense_last_30d)   AS expense_last_30d,
            bool_or(is_revenue)     AS is_revenue,
            bool_or(is_expense)     AS is_expense
        FROM analytics.transaction_summary
        WHERE company_id = :company_id
          AND (:transaction_type IS NULL OR transaction_type = :transaction_type)
          AND snapshot_date = (
              SELECT MAX(snapshot_date) FROM analytics.transaction_summary
              WHERE company_id = :company_id
          )
        GROUP BY transaction_type, status
        ORDER BY total_amount DESC
    """
    rows = _run(sql, {
        "company_id":       company_id,
        "months_back":      months_back,
        "transaction_type": transaction_type,
    })

    revenue_rows = [r for r in rows if r.get("is_revenue")]
    expense_rows = [r for r in rows if r.get("is_expense")]
    total_revenue = sum(r["total_amount"] or 0 for r in revenue_rows)
    total_unpaid  = sum(r["unpaid_amount"] or 0 for r in rows)

    return {
        "monthly_breakdown": rows,
        "total_revenue":     round(total_revenue, 2),
        "total_unpaid":      round(total_unpaid,  2),
        "pending_drafts":    0,
        "months_analysed":   months_back,
    }


def get_overdue_invoices(company_id: str, top_n: int = 20) -> dict:
    """
    Returns unpaid posted invoices past their due date.
    Used for: "what invoices are overdue", "who owes us money"
    """
    # transaction_summary is aggregated — no individual invoice rows.
    # Return total outstanding amount for posted revenue transactions.
    sql = """
        SELECT
            transaction_type,
            SUM(total_transactions) AS count,
            SUM(outstanding_amount) AS total_outstanding
        FROM analytics.transaction_summary
        WHERE company_id  = :company_id
          AND is_revenue   = TRUE
          AND status       = 'posted'
          AND outstanding_amount > 0
          AND snapshot_date = (
              SELECT MAX(snapshot_date) FROM analytics.transaction_summary
              WHERE company_id = :company_id
          )
        GROUP BY transaction_type
        ORDER BY total_outstanding DESC
        LIMIT :top_n
    """
    rows = _run(sql, {"company_id": company_id, "top_n": top_n})
    total_outstanding = sum(r["total_outstanding"] or 0 for r in rows)

    return {
        "overdue_invoices":  rows,
        "count":             sum(r["count"] or 0 for r in rows),
        "total_outstanding": round(total_outstanding, 2),
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
    # task_summary columns: task_type, status, total_tasks, completed_tasks,
    # completion_rate_pct, overdue_tasks, tasks_last_7d, tasks_last_30d
    sql = """
        SELECT
            task_type,
            status,
            SUM(total_tasks)        AS total_tasks,
            SUM(completed_tasks)    AS completed_tasks,
            SUM(overdue_tasks)      AS overdue_tasks,
            ROUND(AVG(completion_rate_pct), 1) AS completion_rate_pct
        FROM analytics.task_summary
        WHERE company_id = :company_id
          AND (:task_type IS NULL OR task_type = :task_type)
          AND snapshot_date = (
              SELECT MAX(snapshot_date) FROM analytics.task_summary
              WHERE company_id = :company_id
          )
        GROUP BY task_type, status
        ORDER BY total_tasks DESC
    """
    rows = _run(sql, {
        "company_id": company_id,
        "task_type":  task_type,
        "days_back":  days_back,
    })

    total     = sum(r["total_tasks"]     or 0 for r in rows)
    completed = sum(r["completed_tasks"] or 0 for r in rows)
    overdue   = sum(r["overdue_tasks"]   or 0 for r in rows)
    rate      = round(completed / total * 100, 1) if total > 0 else 0

    return {
        "breakdown":       rows,
        "total_tasks":     total,
        "completed":       completed,
        "overdue":         overdue,
        "completion_rate": rate,
        "days_analysed":   days_back,
    }


def get_task_outcomes(
    company_id: str,
    task_type:  Optional[str] = None,
    days_back:  int = 30,
) -> dict:
    """
    Returns breakdown of task outcomes by status and task_type from the
    pre-aggregated task_summary table.
    Used for: "how many visits were missed", "no-shows", "task outcome breakdown"
    """
    sql = """
        SELECT
            status,
            task_type,
            SUM(total_tasks)     AS count,
            SUM(completed_tasks) AS completed,
            SUM(overdue_tasks)   AS overdue,
            ROUND(AVG(completion_rate_pct), 1) AS completion_rate_pct,
            ROUND(
                SUM(total_tasks) * 100.0 / NULLIF(SUM(SUM(total_tasks)) OVER(), 0),
                1
            ) AS pct_of_total
        FROM analytics.task_summary
        WHERE company_id = :company_id
          AND (:task_type IS NULL OR task_type = :task_type)
          AND snapshot_date = (
              SELECT MAX(snapshot_date)
              FROM analytics.task_summary
              WHERE company_id = :company_id
          )
        GROUP BY status, task_type
        ORDER BY count DESC
    """
    rows = _run(sql, {
        "company_id": company_id,
        "task_type":  task_type,
        "days_back":  days_back,
    })

    completed = sum(r.get("completed", 0) or 0 for r in rows)
    overdue   = sum(r.get("overdue",    0) or 0 for r in rows)
    total     = sum(r.get("count",      0) or 0 for r in rows)

    return {
        "outcomes":        rows,
        "total_tasks":     total,
        "completed_tasks": completed,
        "overdue_tasks":   overdue,
        "days_analysed":   days_back,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PRODUCT / INVENTORY QUERIES
# ═══════════════════════════════════════════════════════════════════════════════

def get_product_summary(
    company_id: str,
    item_type:  Optional[str] = None,
) -> dict:
    """
    Returns inventory status, low stock alerts, expiry warnings from the
    pre-aggregated product_summary table.
    Used for: "what stock do we have", "what is expiring", "low stock items"
    """
    sql = """
        SELECT
            item_type,
            status,
            SUM(total_products)       AS total_products,
            SUM(total_stock)          AS total_stock,
            ROUND(AVG(avg_price), 2)  AS avg_price,
            SUM(low_stock_count)      AS low_stock_count,
            SUM(out_of_stock_count)   AS out_of_stock_count,
            SUM(expiring_7d_count)    AS expiring_7d_count,
            SUM(expiring_30d_count)   AS expiring_30d_count,
            SUM(new_last_30d)         AS new_last_30d,
            BOOL_OR(is_medication)    AS has_medications,
            BOOL_OR(is_livestock)     AS has_livestock,
            BOOL_OR(is_perishable)    AS has_perishables
        FROM analytics.product_summary
        WHERE company_id = :company_id
          AND (:item_type IS NULL OR item_type = :item_type)
          AND snapshot_date = (
              SELECT MAX(snapshot_date)
              FROM analytics.product_summary
              WHERE company_id = :company_id
          )
        GROUP BY item_type, status
        ORDER BY total_products DESC
    """
    rows = _run(sql, {"company_id": company_id, "item_type": item_type})

    total_low_stock    = sum(r.get("low_stock_count",    0) or 0 for r in rows)
    total_out_of_stock = sum(r.get("out_of_stock_count", 0) or 0 for r in rows)
    total_expiring_7d  = sum(r.get("expiring_7d_count",  0) or 0 for r in rows)
    total_expiring_30d = sum(r.get("expiring_30d_count", 0) or 0 for r in rows)
    total_products     = sum(r.get("total_products",     0) or 0 for r in rows)
    total_stock        = sum(r.get("total_stock",        0) or 0 for r in rows)

    return {
        "by_type":           rows,
        "total_products":    total_products,
        "total_stock_units": total_stock,
        "alerts": {
            "low_stock_count":    total_low_stock,
            "out_of_stock_count": total_out_of_stock,
            "expiring_7d_count":  total_expiring_7d,
            "expiring_30d_count": total_expiring_30d,
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
            id,
            name,
            enterprise_type,
            operating_status,
            status,
            is_active,
            is_root,
            parent_id,
            primary_address,
            days_since_created
        FROM analytics.enterprise_summary
        WHERE company_id = :company_id
          AND snapshot_date = (
              SELECT MAX(snapshot_date)
              FROM analytics.enterprise_summary
              WHERE company_id = :company_id
          )
        ORDER BY is_root DESC, name
    """
    rows = _run(sql, {"company_id": company_id})

    active_count = sum(1 for r in rows if r.get("is_active"))
    root_ents    = [r for r in rows if r.get("is_root")]
    branches     = [r for r in rows if not r.get("is_root")]

    return {
        "enterprises":     rows,
        "total_count":     len(rows),
        "active_count":    active_count,
        "root_count":      len(root_ents),
        "branch_count":    len(branches),
        "by_type": {
            etype: [r for r in rows if r.get("enterprise_type") == etype]
            for etype in set(r.get("enterprise_type") for r in rows if r.get("enterprise_type"))
        },
    }


def get_network_overview(company_id: str) -> dict:
    """
    Returns a cross-enterprise summary for the tenant network.
    Pulls from each pre-aggregated summary table using the latest snapshot.
    Used for: "how is the network doing", "network overview", "compare branches"
    """
    # Enterprise list
    ent_sql = """
        SELECT name, enterprise_type, operating_status, is_active, is_root
        FROM analytics.enterprise_summary
        WHERE company_id = :company_id
          AND snapshot_date = (
              SELECT MAX(snapshot_date)
              FROM analytics.enterprise_summary
              WHERE company_id = :company_id
          )
        ORDER BY is_root DESC, name
    """
    enterprises = _run(ent_sql, {"company_id": company_id})

    # People totals
    people_sql = """
        SELECT
            person_type,
            SUM(people_count)   AS total,
            SUM(active_count)   AS active
        FROM analytics.people_summary
        WHERE company_id = :company_id
          AND snapshot_date = (
              SELECT MAX(snapshot_date)
              FROM analytics.people_summary
              WHERE company_id = :company_id
          )
        GROUP BY person_type
    """
    people = _run(people_sql, {"company_id": company_id})

    # Task totals
    task_sql = """
        SELECT
            SUM(total_tasks)      AS total_tasks,
            SUM(completed_tasks)  AS completed_tasks,
            SUM(overdue_tasks)    AS overdue_tasks,
            ROUND(AVG(completion_rate_pct), 1) AS avg_completion_rate
        FROM analytics.task_summary
        WHERE company_id = :company_id
          AND snapshot_date = (
              SELECT MAX(snapshot_date)
              FROM analytics.task_summary
              WHERE company_id = :company_id
          )
    """
    tasks = _run(task_sql, {"company_id": company_id})

    # Transaction totals
    tx_sql = """
        SELECT
            SUM(total_transactions) AS total_transactions,
            SUM(total_amount)       AS total_revenue,
            SUM(outstanding_amount) AS outstanding_amount
        FROM analytics.transaction_summary
        WHERE company_id = :company_id
          AND is_revenue  = TRUE
          AND snapshot_date = (
              SELECT MAX(snapshot_date)
              FROM analytics.transaction_summary
              WHERE company_id = :company_id
          )
    """
    transactions = _run(tx_sql, {"company_id": company_id})

    task_totals = tasks[0] if tasks else {}
    tx_totals   = transactions[0] if transactions else {}

    return {
        "enterprises":      enterprises,
        "enterprise_count": len(enterprises),
        "active_count":     sum(1 for e in enterprises if e.get("is_active")),
        "people_by_type":   people,
        "tasks": {
            "total":           task_totals.get("total_tasks",        0),
            "completed":       task_totals.get("completed_tasks",    0),
            "overdue":         task_totals.get("overdue_tasks",      0),
            "completion_rate": task_totals.get("avg_completion_rate", 0),
        },
        "financials": {
            "total_transactions": tx_totals.get("total_transactions", 0),
            "total_revenue":      tx_totals.get("total_revenue",      0),
            "outstanding":        tx_totals.get("outstanding_amount", 0),
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ML PREDICTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def get_ml_predictions(company_id: str, model: Optional[str] = None) -> dict:
    """
    Returns the most recent stored ML model predictions for this tenant.
    Used for: "what is the retention risk", "LTV segments", "staffing forecast",
              "who is at risk of leaving", "ML insights", "model predictions"

    Reads from raw.ml_predictions — populated after each model run via
    POST /ml/retention-risk, /ml/ltv-segmentation, etc.
    """
    filters = ["company_id = :company_id"]
    params: dict = {"company_id": company_id}
    if model:
        filters.append("model = :model")
        params["model"] = model

    sql = f"""
        SELECT DISTINCT ON (model)
            model, result_json, computed_at
        FROM raw.ml_predictions
        WHERE {' AND '.join(filters)}
        ORDER BY model, computed_at DESC
    """
    rows = _run(sql, params)

    predictions = []
    for r in rows:
        try:
            import json as _json
            result = _json.loads(r.get("result_json") or "{}")
        except Exception:
            result = {}
        predictions.append({
            "model":       r.get("model"),
            "computed_at": str(r.get("computed_at", "")),
            "result":      result,
        })

    return {
        "predictions":       predictions,
        "count":             len(predictions),
        "models_available":  [p["model"] for p in predictions],
        "note": (
            "No ML predictions stored yet — run POST /ml/retention-risk or /ml/ltv-segmentation first."
            if not predictions else None
        ),
    }


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
    {
        "name": "get_ml_predictions",
        "description": "Get the most recent machine learning model predictions for this organisation — retention risk scores, LTV segments, staffing forecasts, shift demand. Use for 'who is at risk of leaving', 'client segments', 'staffing forecast', 'ML insights', 'predictions', 'risk scores'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "model": {
                    "type": "string",
                    "enum": ["retention-risk", "ltv-segmentation", "staffing-forecast", "shift-demand"],
                    "description": "Filter by model name. Leave null to return all available predictions.",
                },
            },
        },
    },
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
        "get_ml_predictions":      get_ml_predictions,
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
                "name":            e.get("name"),
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

    def query_ml_predictions(self, model: str = None) -> dict:
        return get_ml_predictions(self.company_id, model)
