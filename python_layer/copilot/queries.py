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


# ── Base44 live-data helpers (fallback when analytics tables are empty) ───────
#
# Each _b44_* function calls the same extract_*() used by the ETL pipeline.
# extract_*() fetches from Base44 live — so this is always current data.
# Tenant isolation: filter DataFrame by company_id after fetch.

def _b44_people(company_id: str):
    """Return Base44 people as a DataFrame, filtered to company_id."""
    try:
        from etl.people import extract_people
        df = extract_people()
        if not df.empty and company_id:
            df = df[df["company_id"] == company_id].copy()
        return df
    except Exception as e:
        logger.warning("_b44_people fallback failed: %s", e)
        import pandas as pd
        return pd.DataFrame()


def _b44_enterprises(company_id: str):
    try:
        from etl.enterprises import extract_enterprises
        df = extract_enterprises()
        if not df.empty and company_id:
            df = df[df["company_id"] == company_id].copy()
        return df
    except Exception as e:
        logger.warning("_b44_enterprises fallback failed: %s", e)
        import pandas as pd
        return pd.DataFrame()


def _b44_transactions(company_id: str):
    try:
        from etl.transactions import extract_transactions
        df = extract_transactions()
        if not df.empty and company_id:
            df = df[df["company_id"] == company_id].copy()
        return df
    except Exception as e:
        logger.warning("_b44_transactions fallback failed: %s", e)
        import pandas as pd
        return pd.DataFrame()


def _b44_tasks(company_id: str):
    try:
        from etl.tasks import extract_tasks
        df = extract_tasks()
        if not df.empty and company_id:
            df = df[df["company_id"] == company_id].copy()
        return df
    except Exception as e:
        logger.warning("_b44_tasks fallback failed: %s", e)
        import pandas as pd
        return pd.DataFrame()


def _b44_products(company_id: str):
    try:
        from etl.products import extract_products
        df = extract_products()
        if not df.empty and company_id:
            df = df[df["company_id"] == company_id].copy()
        return df
    except Exception as e:
        logger.warning("_b44_products fallback failed: %s", e)
        import pandas as pd
        return pd.DataFrame()


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
            "name":             ctx.get("name") or "this organisation",
            "enterprise_type":  ctx.get("enterprise_type") or "commercial",
            "operating_status": ctx.get("operating_status") or "active",
            "phone":            ctx.get("phone"),
            "email":            ctx.get("email"),
            "website":          ctx.get("website"),
        }

    # Base44 live fallback — analytics table empty (ETL not yet run)
    df = _b44_enterprises(company_id)
    if not df.empty:
        # Prefer the root/headquarters record; otherwise take the first row
        root = df[df.get("enterprise_tier", "").eq("headquarters")] if "enterprise_tier" in df.columns else df.iloc[:0]
        row = root.iloc[0] if not root.empty else df.iloc[0]
        return {
            "name":             row.get("enterprise_name") or row.get("name") or "this organisation",
            "enterprise_type":  row.get("enterprise_type") or "commercial",
            "operating_status": row.get("operating_status") or "active",
            "phone":            row.get("phone"),
            "email":            row.get("email"),
            "website":          row.get("website"),
        }

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

    if not rows:
        # Base44 live fallback
        df = _b44_people(company_id)
        if not df.empty:
            if person_type and "person_type" in df.columns:
                df = df[df["person_type"] == person_type]
            for col in ("person_type", "status"):
                if col not in df.columns:
                    df[col] = "unknown"
            grouped = df.groupby(["person_type", "status"]).size().reset_index(name="count")
            rows = grouped.to_dict(orient="records")
            for r in rows:
                r["active_count"]   = r["count"] if r.get("status") == "active" else 0
                r["inactive_count"] = r["count"] if r.get("status") != "active" else 0
            logger.info("get_people_summary: using Base44 fallback (%d rows)", len(df))

    totals = {}
    for r in rows:
        pt = r.get("person_type") or "unknown"
        if pt not in totals:
            totals[pt] = {"total": 0, "active": 0, "inactive": 0}
        totals[pt]["total"]    += r.get("count") or 0
        totals[pt]["active"]   += r.get("active_count") or 0
        totals[pt]["inactive"] += r.get("inactive_count") or 0

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

    if not rows:
        df = _b44_people(company_id)
        if not df.empty and "status" in df.columns:
            inactive = df[df["status"] == "inactive"]
            if "person_type" in inactive.columns:
                grouped = inactive.groupby("person_type").size().reset_index(name="count")
                rows = grouped.nlargest(top_n, "count").to_dict(orient="records")
                for r in rows:
                    r["inactive_count"] = r["count"]
            logger.info("get_person_churn_risk: using Base44 fallback (%d inactive)", len(inactive))

    total = sum(r.get("count") or 0 for r in rows)
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

    if not rows:
        df = _b44_people(company_id)
        if not df.empty:
            from config.taxonomy import PERSON_TYPE_SETS
            staff_types = PERSON_TYPE_SETS.get("staff", {"staff"})
            if "person_type" in df.columns:
                staff = df[df["person_type"].isin(staff_types)]
            else:
                staff = df
            active_staff = staff[staff["status"] == "active"] if "status" in staff.columns else staff
            rows = [{"person_type": "staff", "status": "active",
                     "count": len(active_staff), "active_count": len(active_staff)}]
            logger.info("get_staff_availability: using Base44 fallback (%d active staff)", len(active_staff))

    total_active = sum(r.get("active_count") or 0 for r in rows)
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

    if not rows:
        df = _b44_transactions(company_id)
        if not df.empty:
            if transaction_type and "transaction_type" in df.columns:
                df = df[df["transaction_type"] == transaction_type]
            from config.taxonomy import REVENUE_TYPES, EXPENSE_TYPES
            revenue_types = REVENUE_TYPES if "REVENUE_TYPES" in dir() else {"invoice", "payment", "sale"}
            expense_types = EXPENSE_TYPES if "EXPENSE_TYPES" in dir() else {"expense", "bill", "purchase"}
            for col in ("transaction_type", "status", "amount"):
                if col not in df.columns:
                    df[col] = None
            grouped = df.groupby(["transaction_type", "status"]).agg(
                count=("id", "count"),
                total_amount=("amount", "sum"),
            ).reset_index()
            rows = grouped.to_dict(orient="records")
            for r in rows:
                tt = (r.get("transaction_type") or "").lower()
                r["is_revenue"]       = tt in revenue_types
                r["is_expense"]       = tt in expense_types
                r["unpaid_amount"]    = 0
                r["revenue_last_30d"] = r["count"] if r.get("is_revenue") else 0
                r["expense_last_30d"] = r["count"] if r.get("is_expense") else 0
            logger.info("get_transaction_summary: using Base44 fallback (%d rows)", len(df))

    revenue_rows  = [r for r in rows if r.get("is_revenue")]
    total_revenue = sum(r.get("total_amount") or 0 for r in revenue_rows)
    total_unpaid  = sum(r.get("unpaid_amount") or 0 for r in rows)

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

    if not rows:
        df = _b44_transactions(company_id)
        if not df.empty:
            overdue_statuses = {"overdue", "unpaid", "outstanding"}
            revenue_types    = {"invoice", "sale", "payment_due"}
            mask = (
                df.get("status", "").isin(overdue_statuses) |
                (df.get("status", "") == "posted")
            ) if "status" in df.columns else df.index.isin([])
            if "transaction_type" in df.columns:
                mask = mask & df["transaction_type"].isin(revenue_types)
            overdue_df = df[mask] if mask.any() else df.head(0)
            total_amt = float(overdue_df["amount"].sum()) if "amount" in overdue_df.columns else 0.0
            rows = [{"transaction_type": "invoice", "count": len(overdue_df),
                     "total_outstanding": total_amt}] if not overdue_df.empty else []
            logger.info("get_overdue_invoices: using Base44 fallback (%d overdue)", len(overdue_df))

    total_outstanding = sum(r.get("total_outstanding") or 0 for r in rows)
    return {
        "overdue_invoices":  rows,
        "count":             sum(r.get("count") or 0 for r in rows),
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

    if not rows:
        df = _b44_tasks(company_id)
        if not df.empty:
            if task_type and "task_type" in df.columns:
                df = df[df["task_type"] == task_type]
            for col in ("task_type", "status"):
                if col not in df.columns:
                    df[col] = "unknown"
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            def _is_overdue(row):
                if row.get("status") in ("completed", "cancelled"):
                    return False
                due = row.get("due_date")
                if due:
                    try:
                        from dateutil.parser import parse
                        return parse(str(due)).replace(tzinfo=timezone.utc) < now
                    except Exception:
                        pass
                return False
            df["_overdue"] = df.apply(_is_overdue, axis=1)
            grouped = df.groupby(["task_type", "status"]).agg(
                total_tasks=("id", "count"),
                overdue_tasks=("_overdue", "sum"),
            ).reset_index()
            grouped["completed_tasks"] = grouped.apply(
                lambda r: r["total_tasks"] if r["status"] == "completed" else 0, axis=1)
            grouped["completion_rate_pct"] = grouped.apply(
                lambda r: 100.0 if r["status"] == "completed" else 0.0, axis=1)
            rows = grouped.to_dict(orient="records")
            logger.info("get_task_summary: using Base44 fallback (%d rows)", len(df))

    total     = sum(r.get("total_tasks")     or 0 for r in rows)
    completed = sum(r.get("completed_tasks") or 0 for r in rows)
    overdue   = sum(r.get("overdue_tasks")   or 0 for r in rows)
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

    if not rows:
        df = _b44_tasks(company_id)
        if not df.empty:
            if task_type and "task_type" in df.columns:
                df = df[df["task_type"] == task_type]
            for col in ("status", "task_type"):
                if col not in df.columns:
                    df[col] = "unknown"
            grouped = df.groupby(["status", "task_type"]).size().reset_index(name="count")
            total_all = len(df)
            grouped["completed"]         = grouped.apply(lambda r: r["count"] if r["status"] == "completed" else 0, axis=1)
            grouped["overdue"]           = 0
            grouped["completion_rate_pct"] = grouped.apply(lambda r: 100.0 if r["status"] == "completed" else 0.0, axis=1)
            grouped["pct_of_total"]      = grouped["count"].apply(lambda c: round(c / total_all * 100, 1) if total_all else 0)
            rows = grouped.to_dict(orient="records")
            logger.info("get_task_outcomes: using Base44 fallback (%d rows)", len(df))

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

    if not rows:
        df = _b44_products(company_id)
        if not df.empty:
            if item_type and "item_type" in df.columns:
                df = df[df["item_type"] == item_type]
            for col in ("item_type", "status", "stock_quantity", "min_stock_level", "unit_price"):
                if col not in df.columns:
                    df[col] = 0 if col in ("stock_quantity", "min_stock_level", "unit_price") else "unknown"
            from datetime import datetime, timezone, timedelta
            now = datetime.now(timezone.utc)
            def _days_to_expiry(val):
                if not val:
                    return None
                try:
                    from dateutil.parser import parse
                    return (parse(str(val)).replace(tzinfo=timezone.utc) - now).days
                except Exception:
                    return None
            if "expiry_date" in df.columns:
                df["_days_exp"] = df["expiry_date"].apply(_days_to_expiry)
            else:
                df["_days_exp"] = None
            df["_low_stock"]  = (df["stock_quantity"] > 0) & (df["min_stock_level"] > 0) & (df["stock_quantity"] <= df["min_stock_level"])
            df["_out_stock"]  = df["stock_quantity"] == 0
            df["_exp7"]       = df["_days_exp"].apply(lambda d: d is not None and 0 <= d <= 7)
            df["_exp30"]      = df["_days_exp"].apply(lambda d: d is not None and 0 <= d <= 30)
            grouped = df.groupby(["item_type", "status"]).agg(
                total_products=("id", "count"),
                total_stock=("stock_quantity", "sum"),
                avg_price=("unit_price", "mean"),
                low_stock_count=("_low_stock", "sum"),
                out_of_stock_count=("_out_stock", "sum"),
                expiring_7d_count=("_exp7", "sum"),
                expiring_30d_count=("_exp30", "sum"),
            ).reset_index()
            rows = grouped.to_dict(orient="records")
            logger.info("get_product_summary: using Base44 fallback (%d products)", len(df))

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

    if not rows:
        df = _b44_enterprises(company_id)
        if not df.empty:
            for col in ("enterprise_type", "operating_status", "status"):
                if col not in df.columns:
                    df[col] = "unknown"
            # Detect root: headquarters tier or first row
            is_root_mask = df.get("enterprise_tier", "").eq("headquarters") if "enterprise_tier" in df.columns else df.index.isin([df.index[0]])
            df["is_root"]   = is_root_mask
            df["is_active"] = df["status"].eq("active") if "status" in df.columns else True
            rows = df[[c for c in (
                "id", "enterprise_name", "enterprise_type", "operating_status",
                "status", "is_active", "is_root", "parent_id",
            ) if c in df.columns]].rename(columns={"enterprise_name": "name"}).to_dict(orient="records")
            logger.info("get_enterprise_overview: using Base44 fallback (%d enterprises)", len(df))

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
    if not enterprises:
        df_ent = _b44_enterprises(company_id)
        if not df_ent.empty:
            for col in ("enterprise_type", "operating_status", "status"):
                if col not in df_ent.columns:
                    df_ent[col] = "unknown"
            is_root_mask = df_ent.get("enterprise_tier", "").eq("headquarters") if "enterprise_tier" in df_ent.columns else df_ent.index.isin([df_ent.index[0]] if not df_ent.empty else [])
            df_ent["is_root"]   = is_root_mask
            df_ent["is_active"] = df_ent["status"].eq("active") if "status" in df_ent.columns else True
            enterprises = df_ent[[c for c in (
                "enterprise_name", "enterprise_type", "operating_status", "is_active", "is_root",
            ) if c in df_ent.columns]].rename(columns={"enterprise_name": "name"}).to_dict(orient="records")
            logger.info("get_network_overview: enterprises from Base44 fallback (%d)", len(enterprises))

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
    if not people:
        df_p = _b44_people(company_id)
        if not df_p.empty and "person_type" in df_p.columns:
            grp = df_p.groupby("person_type").agg(
                total=("id", "count"),
                active=("status", lambda s: (s == "active").sum()),
            ).reset_index()
            people = grp.to_dict(orient="records")
            logger.info("get_network_overview: people from Base44 fallback (%d groups)", len(people))

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
    if not tasks:
        df_t = _b44_tasks(company_id)
        if not df_t.empty:
            total = len(df_t)
            completed = int((df_t.get("status", "") == "completed").sum()) if "status" in df_t.columns else 0
            rate = round(completed / total * 100, 1) if total else 0
            tasks = [{"total_tasks": total, "completed_tasks": completed,
                      "overdue_tasks": 0, "avg_completion_rate": rate}]
            logger.info("get_network_overview: tasks from Base44 fallback (total=%d)", total)

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
    if not transactions:
        df_tx = _b44_transactions(company_id)
        if not df_tx.empty:
            revenue_types = {"invoice", "sale", "payment_due", "payment"}
            if "transaction_type" in df_tx.columns:
                rev_df = df_tx[df_tx["transaction_type"].isin(revenue_types)]
            else:
                rev_df = df_tx
            total_rev = float(rev_df["amount"].sum()) if "amount" in rev_df.columns else 0.0
            transactions = [{"total_transactions": len(rev_df),
                              "total_revenue": total_rev, "outstanding_amount": 0.0}]
            logger.info("get_network_overview: transactions from Base44 fallback (total=%d)", len(rev_df))

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
# WEB-GROUNDED TOOLS — public data sources, no API key required
# ═══════════════════════════════════════════════════════════════════════════════

def web_search(query: str, company_id: str, max_results: int = 5) -> dict:
    """
    Search the web for market intelligence, industry news, or public data.
    Uses DuckDuckGo Instant Answer API (no key required).
    Falls back to Wikipedia summary for factual/encyclopaedic queries.

    Used for: industry research, competitor news, market context,
              regulatory updates, economic conditions, public statistics.
    """
    import urllib.request
    import urllib.parse
    import json as _json
    import re

    results = []

    # ── DuckDuckGo Instant Answer ─────────────────────────────────────────
    try:
        ddg_url = f"https://api.duckduckgo.com/?q={urllib.parse.quote(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1"
        req = urllib.request.Request(ddg_url, headers={"User-Agent": "newsconseen-copilot/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = _json.loads(resp.read().decode())

        # Abstract (best single answer)
        if data.get("Abstract"):
            results.append({
                "source":  data.get("AbstractSource", "DuckDuckGo"),
                "title":   data.get("Heading", query),
                "snippet": data["Abstract"][:600],
                "url":     data.get("AbstractURL", ""),
            })

        # Related topics
        for topic in data.get("RelatedTopics", [])[:max_results - len(results)]:
            text = topic.get("Text", "")
            url  = topic.get("FirstURL", "")
            if text:
                results.append({
                    "source":  "DuckDuckGo",
                    "title":   text[:80],
                    "snippet": text[:400],
                    "url":     url,
                })

    except Exception as e:
        logger.warning("web_search DuckDuckGo failed: %s", e)

    # ── Wikipedia summary fallback ────────────────────────────────────────
    if len(results) < 2:
        try:
            wiki_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(query.replace(' ', '_'))}"
            req = urllib.request.Request(wiki_url, headers={"User-Agent": "newsconseen-copilot/1.0"})
            with urllib.request.urlopen(req, timeout=6) as resp:
                wiki = _json.loads(resp.read().decode())
            if wiki.get("extract"):
                results.insert(0, {
                    "source":  "Wikipedia",
                    "title":   wiki.get("title", query),
                    "snippet": wiki["extract"][:800],
                    "url":     wiki.get("content_urls", {}).get("desktop", {}).get("page", ""),
                })
        except Exception as e:
            logger.warning("web_search Wikipedia fallback failed: %s", e)

    if not results:
        return {
            "query":   query,
            "results": [],
            "note":    "No web results found. Try a more specific query.",
        }

    logger.info("web_search: %d results for '%s'", len(results), query[:60])
    return {
        "query":   query,
        "results": results[:max_results],
        "count":   len(results[:max_results]),
    }


def search_public_data(dataset: str, query: str, company_id: str, location: str = "") -> dict:
    """
    Query structured public datasets relevant to market research.
    Supported datasets:
      - "us_census"   : US Census Bureau QuickFacts (population, income, demographics)
      - "bls"         : US Bureau of Labor Statistics industry employment/wages
      - "world_bank"  : World Bank economic indicators (GDP, poverty, health spending)
      - "open_fda"    : OpenFDA drug/device/facility data (for healthcare/pharmacy)
      - "osm_count"   : OpenStreetMap business category count in a location

    Returns structured data directly usable in analysis.
    """
    import urllib.request
    import urllib.parse
    import json as _json

    dataset = dataset.lower().strip()

    # ── US Census QuickFacts ──────────────────────────────────────────────
    if dataset == "us_census":
        try:
            # Census QuickFacts API — state/county level statistics
            place = (location or query).replace(" ", "_")
            url = f"https://api.census.gov/data/2022/acs/acs5/profile?get=NAME,DP03_0062E,DP05_0001E,DP03_0087E&for=state:*"
            req = urllib.request.Request(url, headers={"User-Agent": "newsconseen-copilot/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw = _json.loads(resp.read().decode())
            headers = raw[0]
            rows = [dict(zip(headers, r)) for r in raw[1:]]
            # Filter by state name if location provided
            if location:
                loc_lower = location.lower()
                rows = [r for r in rows if loc_lower in r.get("NAME", "").lower()]
            return {
                "dataset":  "us_census_acs5",
                "location": location or "all states",
                "fields":   {"DP03_0062E": "median_household_income", "DP05_0001E": "total_population", "DP03_0087E": "mean_travel_time"},
                "data":     rows[:10],
                "note":     "Source: US Census Bureau ACS 5-Year Estimates 2022",
            }
        except Exception as e:
            logger.warning("search_public_data us_census failed: %s", e)
            return {"dataset": "us_census", "error": str(e), "data": []}

    # ── OpenFDA — pharmacy/drug data ──────────────────────────────────────
    elif dataset == "open_fda":
        try:
            search_term = urllib.parse.quote(query or location or "pharmacy")
            url = f"https://api.fda.gov/drug/label.json?search={search_term}&limit=5"
            req = urllib.request.Request(url, headers={"User-Agent": "newsconseen-copilot/1.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                raw = _json.loads(resp.read().decode())
            results = raw.get("results", [])
            simplified = [
                {
                    "brand_name":     r.get("openfda", {}).get("brand_name", [""])[0],
                    "generic_name":   r.get("openfda", {}).get("generic_name", [""])[0],
                    "manufacturer":   r.get("openfda", {}).get("manufacturer_name", [""])[0],
                    "product_type":   r.get("openfda", {}).get("product_type", [""])[0],
                    "route":          r.get("openfda", {}).get("route", [""])[0],
                }
                for r in results
            ]
            return {
                "dataset": "open_fda_drug_labels",
                "query":   query,
                "results": simplified,
                "count":   len(simplified),
                "note":    "Source: FDA Open Data — drug label database",
            }
        except Exception as e:
            logger.warning("search_public_data open_fda failed: %s", e)
            return {"dataset": "open_fda", "error": str(e), "data": []}

    # ── World Bank indicators ─────────────────────────────────────────────
    elif dataset == "world_bank":
        try:
            # Map common query terms to World Bank indicator codes
            INDICATORS = {
                "gdp": "NY.GDP.MKTP.CD",
                "health spending": "SH.XPD.CHEX.PC.CD",
                "hospital beds": "SH.MED.BEDS.ZS",
                "pharmacists": "SH.MED.PHYS.ZS",
                "population": "SP.POP.TOTL",
                "income": "NY.GNP.PCAP.CD",
            }
            indicator = next((v for k, v in INDICATORS.items() if k in query.lower()), "NY.GDP.MKTP.CD")
            country   = location[:2].upper() if location and len(location) >= 2 else "US"
            url = f"https://api.worldbank.org/v2/country/{country}/indicator/{indicator}?format=json&mrv=5"
            req = urllib.request.Request(url, headers={"User-Agent": "newsconseen-copilot/1.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                raw = _json.loads(resp.read().decode())
            data = [{"year": r["date"], "value": r["value"], "country": r["country"]["value"]}
                    for r in (raw[1] or []) if r.get("value") is not None]
            return {
                "dataset":   "world_bank",
                "indicator": indicator,
                "query":     query,
                "country":   country,
                "data":      data[:5],
                "note":      "Source: World Bank Open Data",
            }
        except Exception as e:
            logger.warning("search_public_data world_bank failed: %s", e)
            return {"dataset": "world_bank", "error": str(e), "data": []}

    # ── OpenStreetMap business count ──────────────────────────────────────
    elif dataset == "osm_count":
        try:
            # Use Nominatim + Overpass to count a business type in a location
            nominatim_url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(location or query)}&format=json&limit=1"
            req = urllib.request.Request(nominatim_url, headers={"User-Agent": "newsconseen-copilot/1.0"})
            with urllib.request.urlopen(req, timeout=6) as resp:
                hits = _json.loads(resp.read().decode())
            if not hits:
                return {"dataset": "osm_count", "error": "location not found", "data": []}
            bbox = hits[0]["boundingbox"]  # [min_lat, max_lat, min_lon, max_lon]
            # Count pharmacy amenities in bounding box
            term = query.lower()
            amenity = "pharmacy" if "pharmac" in term else ("hospital" if "hospital" in term else "shop")
            overpass = f'[out:json][timeout:10];node["amenity"="{amenity}"]({bbox[0]},{bbox[2]},{bbox[1]},{bbox[3]});out count;'
            overpass_url = f"https://overpass-api.de/api/interpreter?data={urllib.parse.quote(overpass)}"
            req2 = urllib.request.Request(overpass_url, headers={"User-Agent": "newsconseen-copilot/1.0"})
            with urllib.request.urlopen(req2, timeout=10) as resp2:
                count_data = _json.loads(resp2.read().decode())
            count = count_data.get("elements", [{}])[0].get("tags", {}).get("total", "unknown")
            return {
                "dataset":  "osm_count",
                "location": location or query,
                "amenity":  amenity,
                "count":    count,
                "bbox":     bbox,
                "note":     "Source: OpenStreetMap via Overpass API",
            }
        except Exception as e:
            logger.warning("search_public_data osm_count failed: %s", e)
            return {"dataset": "osm_count", "error": str(e), "data": []}

    return {"error": f"Unknown dataset: {dataset}. Use: us_census, bls, world_bank, open_fda, osm_count"}


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
    {
        "name": "web_search",
        "description": (
            "Search the web for market intelligence, industry news, competitor information, "
            "regulations, or any public knowledge. Use this when the user asks about: "
            "industry trends, market conditions, specific companies, public statistics, "
            "regulations, best practices, or any topic beyond the organisation's own data. "
            "Returns snippets from DuckDuckGo and Wikipedia."
        ),
        "input_schema": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query. Be specific — e.g. 'pharmacy market size Maine 2024' not just 'pharmacy'.",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Max results to return. Default 5.",
                },
            },
        },
    },
    {
        "name": "search_public_data",
        "description": (
            "Query structured public datasets for market research. "
            "Use this for: US demographics and income data (us_census), "
            "FDA drug and pharmacy data (open_fda), "
            "World Bank economic indicators like health spending and GDP (world_bank), "
            "OpenStreetMap business counts in a location (osm_count). "
            "Always pair with web_search for context around the numbers."
        ),
        "input_schema": {
            "type": "object",
            "required": ["dataset", "query"],
            "properties": {
                "dataset": {
                    "type": "string",
                    "enum": ["us_census", "open_fda", "world_bank", "osm_count"],
                    "description": "Which dataset to query.",
                },
                "query": {
                    "type": "string",
                    "description": "What to search for within the dataset (e.g. 'pharmacy', 'health spending', 'gdp').",
                },
                "location": {
                    "type": "string",
                    "description": "Location filter — city, state, or country (e.g. 'Maine', 'US', 'Portland Maine').",
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
        # Web-grounded tools — company_id injected but not used (public data)
        "web_search":              web_search,
        "search_public_data":      search_public_data,
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
