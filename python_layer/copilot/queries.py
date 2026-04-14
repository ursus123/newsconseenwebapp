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

# ── Staleness threshold ───────────────────────────────────────────────────────
# If the most recent analytics snapshot is older than this, the copilot falls
# through to Base44 live data instead of serving stale cached rows.
# Mutation triggers keep tables fresh within ~30s of any save; this threshold
# is a safety net for the case where a trigger failed or ETL was delayed.
STALE_THRESHOLD_HOURS: float = float(
    __import__("os").getenv("COPILOT_STALE_HOURS", "2")
)

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


def _read_raw_table(table: str, company_id: str) -> "_pd.DataFrame":
    """
    Tier 2 fallback: read from raw.{table} in PostgreSQL.

    raw.* tables are populated by the airbyte integration and contain
    full normalised records — more recent than analytics.* (no aggregation
    delay) but not as fast for grouped queries.

    Returns an empty DataFrame if the table doesn't exist, is empty,
    or PostgreSQL is unavailable.
    """
    engine = get_engine_safe()
    if not engine:
        return _pd.DataFrame()
    try:
        import sqlalchemy as sa
        with engine.connect() as conn:
            # Check table exists before querying
            exists = conn.execute(
                text(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema = 'raw' AND table_name = :t LIMIT 1"
                ),
                {"t": table},
            ).fetchone()
            if not exists:
                return _pd.DataFrame()
            result = conn.execute(
                text(f"SELECT * FROM raw.{table} WHERE company_id = :cid LIMIT 2000"),
                {"cid": company_id},
            )
            rows = result.fetchall()
            if not rows:
                return _pd.DataFrame()
            cols = result.keys()
            return _pd.DataFrame([dict(zip(cols, r)) for r in rows])
    except Exception as e:
        logger.debug("_read_raw_table(%s): %s", table, e)
        return _pd.DataFrame()


# ── Staleness helpers ─────────────────────────────────────────────────────────

def _analytics_freshness(table: str, company_id: str) -> tuple[bool, str]:
    """
    Return (is_stale, data_as_of_str) for an analytics table + company.

    Strategy:
      1. Try MAX(loaded_at) — full timestamp, set by load_dataframe().
      2. Fall back to MAX(snapshot_date) — date only, set by all ETL paths.
      3. No rows → stale.

    data_as_of_str examples: "just now", "4 min ago", "1h 22m ago",
                              "today (cached)", "Base44 live"
    """
    from datetime import datetime, date as _date, timezone

    def _age_str(secs: float) -> str:
        mins = int(secs / 60)
        if mins < 2:
            return "just now"
        if mins < 60:
            return f"{mins} min ago"
        return f"{mins // 60}h {mins % 60}m ago"

    # ── Tier 1: loaded_at (timestamp) ─────────────────────────────────────────
    try:
        rows = _run(
            f"SELECT MAX(loaded_at) AS ts FROM analytics.{table} WHERE company_id = :cid",
            {"cid": company_id},
        )
        if rows and rows[0].get("ts") is not None:
            ts = rows[0]["ts"]
            now = datetime.now(timezone.utc)
            if hasattr(ts, "tzinfo") and ts.tzinfo:
                age_secs = (now - ts).total_seconds()
            else:
                age_secs = (now.replace(tzinfo=None) - ts).total_seconds()
            is_stale = age_secs / 3600 > STALE_THRESHOLD_HOURS
            return is_stale, ("Base44 live" if is_stale else _age_str(age_secs))
    except Exception:
        pass  # column may not exist on load_dataframe_replace tables

    # ── Tier 2: snapshot_date (date) ──────────────────────────────────────────
    try:
        rows = _run(
            f"SELECT MAX(snapshot_date) AS sd FROM analytics.{table} WHERE company_id = :cid",
            {"cid": company_id},
        )
        if rows and rows[0].get("sd") is not None:
            sd = rows[0]["sd"]
            if hasattr(sd, "date"):
                sd = sd.date()
            today = _date.today()
            is_stale = sd < today
            return is_stale, ("Base44 live" if is_stale else "today (cached)")
    except Exception:
        pass

    # No data at all
    return True, "Base44 live"


def _query_analytics(
    table: str,
    sql: str,
    params: dict,
    company_id: str,
) -> tuple[list[dict], str, str]:
    """
    Run an analytics query only if the snapshot is fresh enough.
    Returns (rows, data_as_of, source).

    When stale or unavailable, returns ([], "Base44 live", "base44_live")
    so the caller falls through to its existing Base44 fallback unchanged.
    """
    is_stale, data_as_of = _analytics_freshness(table, company_id)
    if is_stale:
        logger.info(
            "Copilot: analytics.%s stale → Base44 live (company_id=%s)",
            table, company_id,
        )
        return [], "Base44 live", "base44_live"
    rows = _run(sql, params)
    if rows:
        return rows, data_as_of, "analytics"
    return [], "Base44 live", "base44_live"


# ── Base44 live-data helpers (fallback when analytics tables are empty) ───────
#
# Each _b44_* function calls the same extract_*() used by the ETL pipeline.
# extract_*() fetches from Base44 live — so this is always current data.
# Tenant isolation: filter DataFrame by company_id after fetch.

import pandas as _pd


def _filter_by_company(df: "_pd.DataFrame", company_id: str) -> "_pd.DataFrame":
    """
    Filter a DataFrame to rows matching company_id.

    Handles two common situations in new deployments:
      1. Records created before onboarding completed → company_id is null/empty.
         These are included alongside exact matches so the operator can see
         their data immediately without needing an ETL run.
      2. company_id is falsy (unauthenticated/test) → return all rows.

    For true multi-tenant isolation, ETL should be run so queries hit
    analytics tables instead of this fallback.
    """
    if not company_id or "company_id" not in df.columns:
        return df.copy()

    exact = df[df["company_id"] == company_id]

    if not exact.empty:
        return exact.copy()

    # No exact matches — include records with null/empty company_id.
    # These are "unclaimed" records created before company_id was assigned
    # (e.g. records added before onboarding was completed).
    unassigned = df[df["company_id"].isna() | (df["company_id"] == "")]
    if not unassigned.empty:
        logger.warning(
            "_filter_by_company: 0 rows matched company_id=%s; "
            "returning %d unassigned records (company_id is null). "
            "Run POST /cron/etl-all and ensure records are saved with company_id set.",
            company_id, len(unassigned),
        )
        return unassigned.copy()

    # No records at all for this company
    logger.warning(
        "_filter_by_company: 0 rows matched company_id=%s and no unassigned rows either. "
        "Total rows in fetched df: %d. "
        "Ensure BASE44_API_KEY is valid and records are saved with company_id=%s.",
        company_id, len(df), company_id,
    )
    return _pd.DataFrame(columns=df.columns)


def _b44_people(company_id: str):
    # Tier 2: raw PostgreSQL table
    raw = _read_raw_table("people", company_id)
    if not raw.empty:
        logger.info("_b44_people: using raw.people (%d rows)", len(raw))
        return raw
    # Tier 3: Base44 live API
    try:
        from etl.people import extract_people
        df = extract_people()
        return _filter_by_company(df, company_id)
    except Exception as e:
        logger.warning("_b44_people fallback failed: %s", e)
        return _pd.DataFrame()


def _b44_enterprises(company_id: str):
    raw = _read_raw_table("enterprises", company_id)
    if not raw.empty:
        logger.info("_b44_enterprises: using raw.enterprises (%d rows)", len(raw))
        return raw
    try:
        from etl.enterprises import extract_enterprises
        df = extract_enterprises()
        return _filter_by_company(df, company_id)
    except Exception as e:
        logger.warning("_b44_enterprises fallback failed: %s", e)
        return _pd.DataFrame()


def _b44_transactions(company_id: str):
    raw = _read_raw_table("transactions", company_id)
    if not raw.empty:
        logger.info("_b44_transactions: using raw.transactions (%d rows)", len(raw))
        return raw
    try:
        from etl.transactions import extract_transactions
        df = extract_transactions()
        return _filter_by_company(df, company_id)
    except Exception as e:
        logger.warning("_b44_transactions fallback failed: %s", e)
        return _pd.DataFrame()


def _b44_tasks(company_id: str):
    raw = _read_raw_table("tasks", company_id)
    if not raw.empty:
        logger.info("_b44_tasks: using raw.tasks (%d rows)", len(raw))
        return raw
    try:
        from etl.tasks import extract_tasks
        df = extract_tasks()
        return _filter_by_company(df, company_id)
    except Exception as e:
        logger.warning("_b44_tasks fallback failed: %s", e)
        return _pd.DataFrame()


def _b44_products(company_id: str):
    raw = _read_raw_table("products", company_id)
    if not raw.empty:
        logger.info("_b44_products: using raw.products (%d rows)", len(raw))
        return raw
    try:
        from etl.products import extract_products
        df = extract_products()
        return _filter_by_company(df, company_id)
    except Exception as e:
        logger.warning("_b44_products fallback failed: %s", e)
        return _pd.DataFrame()


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
    rows, _dao, _src = _query_analytics(
        "people_summary", sql, {"company_id": company_id, "person_type": person_type}, company_id
    )

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
        "data_as_of":   _dao,
        "data_source":  _src,
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
    rows, _dao, _src = _query_analytics(
        "people_summary", sql, {"company_id": company_id, "top_n": top_n}, company_id
    )

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
        "data_as_of":     _dao,
        "data_source":    _src,
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
    rows, _dao, _src = _query_analytics(
        "people_summary", sql, {"company_id": company_id}, company_id
    )

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
        "data_as_of":      _dao,
        "data_source":     _src,
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
    rows, _dao, _src = _query_analytics(
        "transaction_summary",
        sql,
        {"company_id": company_id, "months_back": months_back, "transaction_type": transaction_type},
        company_id,
    )

    if not rows:
        df = _b44_transactions(company_id)
        if not df.empty:
            if transaction_type and "transaction_type" in df.columns:
                df = df[df["transaction_type"] == transaction_type]
            from etl.transactions import REVENUE_TYPES, EXPENSE_TYPES
            revenue_types = REVENUE_TYPES
            expense_types = EXPENSE_TYPES
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
        "data_as_of":        _dao,
        "data_source":       _src,
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
    rows, _dao, _src = _query_analytics(
        "transaction_summary", sql, {"company_id": company_id, "top_n": top_n}, company_id
    )

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
        "data_as_of":        _dao,
        "data_source":       _src,
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
    rows, _dao, _src = _query_analytics(
        "task_summary",
        sql,
        {"company_id": company_id, "task_type": task_type, "days_back": days_back},
        company_id,
    )

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
        "data_as_of":      _dao,
        "data_source":     _src,
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
    rows, _dao, _src = _query_analytics(
        "task_summary",
        sql,
        {"company_id": company_id, "task_type": task_type, "days_back": days_back},
        company_id,
    )

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
        "data_as_of":      _dao,
        "data_source":     _src,
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
    rows, _dao, _src = _query_analytics(
        "product_summary", sql, {"company_id": company_id, "item_type": item_type}, company_id
    )

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
        "data_as_of":  _dao,
        "data_source": _src,
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
            days_since_created,
            naics_code,
            naics_title,
            sic_code,
            sic_description
        FROM analytics.enterprise_summary
        WHERE company_id = :company_id
          AND snapshot_date = (
              SELECT MAX(snapshot_date)
              FROM analytics.enterprise_summary
              WHERE company_id = :company_id
          )
        ORDER BY is_root DESC, name
    """
    rows, _dao, _src = _query_analytics(
        "enterprise_summary", sql, {"company_id": company_id}, company_id
    )

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
                "naics_code", "naics_title", "sic_code", "sic_description",
            ) if c in df.columns]].rename(columns={"enterprise_name": "name"}).to_dict(orient="records")
            logger.info("get_enterprise_overview: using Base44 fallback (%d enterprises)", len(df))

    active_count = sum(1 for r in rows if r.get("is_active"))
    root_ents    = [r for r in rows if r.get("is_root")]
    branches     = [r for r in rows if not r.get("is_root")]

    # Group by NAICS code — enables industry-level context in copilot responses
    by_naics: dict = {}
    for r in rows:
        code = r.get("naics_code")
        if code:
            by_naics.setdefault(code, {"naics_title": r.get("naics_title"), "enterprises": []})
            by_naics[code]["enterprises"].append(r.get("name"))

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
        "by_naics":        by_naics,
        "data_as_of":      _dao,
        "data_source":     _src,
    }


def get_network_overview(company_id: str) -> dict:
    """
    Returns a cross-enterprise summary for the tenant network.
    Pulls from each pre-aggregated summary table using the latest snapshot.
    Used for: "how is the network doing", "network overview", "compare branches"
    """
    # Single freshness check covers all four analytics tables in this query
    _net_stale, _dao = _analytics_freshness("enterprise_summary", company_id)
    _src = "base44_live" if _net_stale else "analytics"

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
    enterprises = [] if _net_stale else _run(ent_sql, {"company_id": company_id})
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
    people = [] if _net_stale else _run(people_sql, {"company_id": company_id})
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
    tasks = [] if _net_stale else _run(task_sql, {"company_id": company_id})
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
    transactions = [] if _net_stale else _run(tx_sql, {"company_id": company_id})
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
        "data_as_of":  _dao,
        "data_source": _src,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ENHANCED ANALYTICS — monthly_kpis · entity_index · company_scorecard
# ═══════════════════════════════════════════════════════════════════════════════

def get_monthly_kpis(company_id: str, months: int = 12) -> dict:
    """
    Returns month-by-month revenue, expense, net income, new people, and task
    metrics for the last N months. Use for trend questions, time-series charts,
    period comparisons, and forecasting context.

    Used for: "how has revenue trended", "show me growth over the year",
              "revenue by month", "headcount growth", "monthly performance".
    """
    months = max(1, min(months, 24))
    sql = """
        SELECT year_month, revenue, expense, net,
               transaction_count,
               new_people, new_clients, new_staff,
               tasks_created, tasks_completed, task_completion_rate_pct
        FROM analytics.monthly_kpis
        WHERE company_id = :company_id
          AND year_month >= to_char(
                NOW() - INTERVAL '1 month' * :months, 'YYYY-MM'
              )
        ORDER BY year_month ASC
    """
    rows, _dao, _src = _query_analytics(
        "monthly_kpis", sql, {"company_id": company_id, "months": months}, company_id
    )

    if not rows:
        # Tier 2: raw PostgreSQL; Tier 3: Base44 live
        try:
            import pandas as _pd
            from etl.monthly_kpis import transform_monthly_kpis
            from etl.people import extract_people
            from etl.transactions import extract_transactions
            from etl.tasks import extract_tasks

            ppl = _read_raw_table("people", company_id)
            txs = _read_raw_table("transactions", company_id)
            tsk = _read_raw_table("tasks", company_id)

            if ppl.empty: ppl = _filter_by_company(extract_people(), company_id)
            if txs.empty: txs = _filter_by_company(extract_transactions(), company_id)
            if tsk.empty: tsk = _filter_by_company(extract_tasks(), company_id)

            kpi_df = transform_monthly_kpis(ppl, txs, tsk, lookback_months=months)
            kpi_df = _filter_by_company(kpi_df, company_id)
            rows = kpi_df.to_dict(orient="records") if not kpi_df.empty else []
            logger.info("get_monthly_kpis: using live fallback (%d months)", len(rows))
        except Exception as e:
            logger.warning("get_monthly_kpis live fallback failed: %s", e)

    if not rows:
        return {"months": [], "count": 0, "data_as_of": _dao, "data_source": _src,
                "note": "No monthly KPI data yet — run ETL to populate."}

    # Compute totals for the period
    total_revenue = sum(r.get("revenue", 0) or 0 for r in rows)
    total_expense = sum(r.get("expense", 0) or 0 for r in rows)
    total_new_ppl = sum(r.get("new_people", 0) or 0 for r in rows)

    return {
        "months":            rows,
        "count":             len(rows),
        "period_revenue":    round(total_revenue, 2),
        "period_expense":    round(total_expense, 2),
        "period_net":        round(total_revenue - total_expense, 2),
        "period_new_people": total_new_ppl,
        "note":              None,
        "data_as_of":        _dao,
        "data_source":       _src,
    }


def get_entity_list(
    company_id: str,
    entity_type: Optional[str] = None,
    status:      Optional[str] = None,
    top_n:       int           = 20,
) -> dict:
    """
    Returns a named list of individual people — not grouped counts.
    Use when the user asks 'who', 'which person', 'list the clients',
    'show me inactive staff', 'who has been here the longest', etc.

    Used for: "who are our active clients", "list all inactive staff",
              "which new people joined this month", "longest-tenured staff",
              "who became inactive recently", "name the high-risk clients".
    """
    top_n = max(1, min(top_n, 100))

    filters = ["company_id = :company_id"]
    params: dict = {"company_id": company_id, "top_n": top_n}

    if entity_type:
        filters.append("entity_type = :entity_type")
        params["entity_type"] = entity_type.lower()
    if status:
        filters.append("status = :status")
        params["status"] = status.lower()

    sql = f"""
        SELECT entity_id, entity_name, entity_type, entity_subtype,
               status, tenure_days, is_staff, is_participant, is_contact,
               new_last_30d, became_inactive_30d, enterprise_id
        FROM analytics.entity_index
        WHERE {' AND '.join(filters)}
        ORDER BY tenure_days DESC
        LIMIT :top_n
    """
    rows, _dao, _src = _query_analytics("entity_index", sql, params, company_id)

    if not rows:
        # Tier 2: raw PostgreSQL entity_index, then Tier 3: Base44 live
        try:
            import pandas as _pd
            from etl.entity_index import transform_entity_index
            from etl.people import extract_people

            ppl = _read_raw_table("people", company_id)
            if ppl.empty:
                ppl = _filter_by_company(extract_people(), company_id)

            idx_df = transform_entity_index(ppl)
            if entity_type and "entity_type" in idx_df.columns:
                idx_df = idx_df[idx_df["entity_type"] == entity_type.lower()]
            if status and "status" in idx_df.columns:
                idx_df = idx_df[idx_df["status"] == status.lower()]
            idx_df = idx_df.sort_values("tenure_days", ascending=False).head(top_n)
            rows = idx_df.to_dict(orient="records") if not idx_df.empty else []
            logger.info("get_entity_list: using live fallback (%d entities)", len(rows))
        except Exception as e:
            logger.warning("get_entity_list live fallback failed: %s", e)

    # Coerce bool types (PostgreSQL returns them as True/False, pandas as 1/0)
    bool_cols = {"is_staff", "is_participant", "is_contact",
                 "new_last_30d", "became_inactive_30d"}
    for r in rows:
        for bc in bool_cols:
            if bc in r:
                r[bc] = bool(r[bc])

    return {
        "entities":    rows,
        "count":       len(rows),
        "entity_type": entity_type,
        "status":      status,
        "note":        None if rows else "No matching entities found.",
        "data_as_of":  _dao,
        "data_source": _src,
    }


def get_company_scorecard(company_id: str) -> dict:
    """
    Returns a single-row operational health summary for this company.
    Covers people, enterprises, finance, tasks, and inventory in one call.
    Use as the primary source for 'how are we doing', 'give me an overview',
    or any question needing a cross-entity health check.

    Used for: "how are we doing today", "give me an overview",
              "operational health", "key metrics", "business summary",
              "what needs attention", "everything in one view".
    """
    sql = """
        SELECT *
        FROM analytics.company_scorecard
        WHERE company_id = :company_id
        ORDER BY snapshot_date DESC
        LIMIT 1
    """
    rows, _dao, _src = _query_analytics(
        "company_scorecard", sql, {"company_id": company_id}, company_id
    )

    if not rows:
        # Tier 2: raw PostgreSQL; Tier 3: Base44 live
        try:
            import pandas as _pd
            from etl.company_scorecard import transform_company_scorecard
            from etl.people import extract_people
            from etl.enterprises import extract_enterprises
            from etl.transactions import extract_transactions
            from etl.tasks import extract_tasks
            from etl.products import extract_products

            def _fetch_filtered(raw_table: str, extract_fn):
                df = _read_raw_table(raw_table, company_id)
                if df.empty:
                    df = _filter_by_company(extract_fn(), company_id)
                return df

            sc_df = transform_company_scorecard(
                _fetch_filtered("people",       extract_people),
                _fetch_filtered("enterprises",  extract_enterprises),
                _fetch_filtered("transactions", extract_transactions),
                _fetch_filtered("tasks",        extract_tasks),
                _fetch_filtered("products",     extract_products),
            )
            sc_df = _filter_by_company(sc_df, company_id)
            rows = sc_df.to_dict(orient="records") if not sc_df.empty else []
            logger.info("get_company_scorecard: using live fallback")
        except Exception as e:
            logger.warning("get_company_scorecard live fallback failed: %s", e)

    if not rows:
        return {"scorecard": None, "data_as_of": _dao, "data_source": _src,
                "note": "No scorecard data yet — run ETL to populate."}

    sc = rows[0]
    # Coerce snapshot_date to string for JSON serialisation
    if "snapshot_date" in sc and sc["snapshot_date"] is not None:
        sc["snapshot_date"] = str(sc["snapshot_date"])

    return {"scorecard": sc, "note": None, "data_as_of": _dao, "data_source": _src}


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
# GAP TOOLS — Relationship, Address, Service (previously missing from copilot)
# ═══════════════════════════════════════════════════════════════════════════════

def get_relationship_summary(
    company_id:        str,
    relationship_type: Optional[str] = None,
) -> dict:
    """
    Returns counts and breakdown of all Relationship records for this tenant.
    Used for: "who is connected to Enterprise X", "how many assignments",
              "active relationships", "relationship overview", "connections".

    Reads analytics.relationship_summary; falls back to Base44 live.
    """
    sql = """
        SELECT
            relationship_type,
            status,
            COUNT(*)              AS count,
            COUNT(DISTINCT person_name)     AS unique_people,
            COUNT(DISTINCT enterprise_name) AS unique_enterprises
        FROM analytics.relationship_summary
        WHERE company_id = :company_id
          AND (:rel_type IS NULL OR relationship_type = :rel_type)
        GROUP BY relationship_type, status
        ORDER BY count DESC
    """
    rows = _run(sql, {"company_id": company_id, "rel_type": relationship_type})

    if not rows:
        # Tier 2: raw PostgreSQL, then Tier 3: Base44 live
        try:
            from etl.relationships import extract_relationships
            df = _read_raw_table("relationships", company_id)
            if df.empty:
                df = _filter_by_company(extract_relationships(), company_id)
            if relationship_type and "relationship_type" in df.columns:
                df = df[df["relationship_type"] == relationship_type]
            if not df.empty:
                grp = df.groupby(["relationship_type", "status"]).size().reset_index(name="count")
                rows = grp.to_dict(orient="records")
                logger.info("get_relationship_summary: live fallback — %d relationship records", len(df))
        except Exception as e:
            logger.warning("get_relationship_summary fallback failed: %s", e)

    total        = sum(r.get("count", 0) or 0 for r in rows)
    active_count = sum(r.get("count", 0) or 0 for r in rows if r.get("status") == "active")
    ended_count  = sum(r.get("count", 0) or 0 for r in rows if r.get("status") == "ended")

    by_type: dict = {}
    for r in rows:
        rt = r.get("relationship_type", "unknown")
        by_type.setdefault(rt, {"active": 0, "ended": 0, "archived": 0})
        st = r.get("status") or "active"
        by_type[rt][st] = by_type[rt].get(st, 0) + (r.get("count") or 0)

    return {
        "total_relationships": total,
        "active":              active_count,
        "ended":               ended_count,
        "by_type":             by_type,
        "detail_rows":         rows[:30],
    }


def get_address_overview(company_id: str) -> dict:
    """
    Returns a count and geographic breakdown of all Address records.
    Used for: "how many addresses", "where are our locations",
              "address coverage", "geographic spread", "locations".

    Reads analytics.address_summary; falls back to Base44 live.
    """
    sql = """
        SELECT
            address_type,
            city,
            state_province,
            country,
            COUNT(*) AS count
        FROM analytics.address_summary
        WHERE company_id = :company_id
        GROUP BY address_type, city, state_province, country
        ORDER BY count DESC
        LIMIT 50
    """
    rows = _run(sql, {"company_id": company_id})

    if not rows:
        try:
            from etl.addresses import extract_addresses
            df = _read_raw_table("addresses", company_id)
            if df.empty:
                df = _filter_by_company(extract_addresses(), company_id)
            if not df.empty:
                grp_cols = [c for c in ["address_type", "city", "state_province", "country"] if c in df.columns]
                if grp_cols:
                    grp = df.groupby(grp_cols).size().reset_index(name="count")
                    rows = grp.sort_values("count", ascending=False).head(50).to_dict(orient="records")
                else:
                    rows = [{"count": len(df), "note": "address fields not available"}]
                logger.info("get_address_overview: Base44 fallback — %d addresses", len(df))
        except Exception as e:
            logger.warning("get_address_overview fallback failed: %s", e)

    total = sum(r.get("count", 0) or 0 for r in rows)
    countries  = list({r.get("country", "") for r in rows if r.get("country")})
    states     = list({r.get("state_province", "") for r in rows if r.get("state_province")})
    cities     = list({r.get("city", "") for r in rows if r.get("city")})

    return {
        "total_addresses": total,
        "countries":       countries[:10],
        "states":          states[:15],
        "top_cities":      cities[:10],
        "breakdown":       rows[:20],
    }


def get_service_overview(company_id: str) -> dict:
    """
    Returns a summary of all Service records — types, status, pricing.
    Used for: "what services do we offer", "service catalogue",
              "how many services", "service pricing", "active services".

    Reads analytics.service_summary; falls back to Base44 live.
    """
    sql = """
        SELECT
            service_type,
            status,
            COUNT(*)              AS count,
            ROUND(AVG(price), 2)  AS avg_price,
            MIN(price)            AS min_price,
            MAX(price)            AS max_price
        FROM analytics.service_summary
        WHERE company_id = :company_id
        GROUP BY service_type, status
        ORDER BY count DESC
    """
    rows = _run(sql, {"company_id": company_id})

    if not rows:
        try:
            from etl.services import extract_services
            df = _read_raw_table("services", company_id)
            if df.empty:
                df = _filter_by_company(extract_services(), company_id)
            if not df.empty:
                grp_cols = [c for c in ["service_type", "status"] if c in df.columns]
                agg: dict = {"id": "count"}
                if "price" in df.columns:
                    agg["price"] = "mean"
                grp = df.groupby(grp_cols).agg(agg).reset_index()
                grp.rename(columns={"id": "count", "price": "avg_price"}, inplace=True)
                rows = grp.sort_values("count", ascending=False).to_dict(orient="records")
                logger.info("get_service_overview: Base44 fallback — %d services", len(df))
        except Exception as e:
            logger.warning("get_service_overview fallback failed: %s", e)

    total        = sum(r.get("count", 0) or 0 for r in rows)
    active_count = sum(r.get("count", 0) or 0 for r in rows if r.get("status") == "active")
    all_prices   = [r.get("avg_price") for r in rows if r.get("avg_price") is not None]

    return {
        "total_services": total,
        "active_services": active_count,
        "avg_price_across_all": round(sum(all_prices) / len(all_prices), 2) if all_prices else None,
        "by_type": rows,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# NEW OPERATIONAL INTELLIGENCE TOOLS
# ═══════════════════════════════════════════════════════════════════════════════

def get_product_at_risk(
    company_id: str,
    days_to_expiry: int = 30,
    top_n: int = 20,
) -> dict:
    """
    Returns specific product names + quantities that are at risk:
    (a) stock at or below reorder level / out of stock,
    (b) expiry within `days_to_expiry` days.
    Used for: "what's about to expire?", "which items are low stock?",
              "stock alerts", "what should we reorder?", "expiring products".

    Reads analytics.product_summary; falls back to raw.products then Base44.
    """
    sql = """
        SELECT
            name,
            item_type,
            status,
            stock_quantity,
            reorder_level,
            unit_of_measure,
            expiry_date,
            unit_price,
            CASE
                WHEN stock_quantity IS NOT NULL
                     AND reorder_level IS NOT NULL
                     AND stock_quantity <= reorder_level THEN 'low_stock'
                WHEN stock_quantity = 0 THEN 'out_of_stock'
                ELSE 'ok'
            END AS stock_status,
            CASE
                WHEN expiry_date IS NOT NULL
                     AND expiry_date >= CURRENT_DATE
                     AND expiry_date <= CURRENT_DATE + INTERVAL '1 day' * :days
                THEN true
                ELSE false
            END AS expiring_soon
        FROM analytics.product_summary
        WHERE company_id = :company_id
          AND snapshot_date = (
              SELECT MAX(snapshot_date)
              FROM analytics.product_summary
              WHERE company_id = :company_id
          )
          AND (
              (stock_quantity IS NOT NULL AND reorder_level IS NOT NULL
               AND stock_quantity <= reorder_level)
              OR stock_quantity = 0
              OR (expiry_date IS NOT NULL
                  AND expiry_date >= CURRENT_DATE
                  AND expiry_date <= CURRENT_DATE + INTERVAL '1 day' * :days)
          )
        ORDER BY
            CASE WHEN stock_quantity = 0 THEN 0
                 WHEN stock_quantity IS NOT NULL AND reorder_level IS NOT NULL
                      AND stock_quantity <= reorder_level THEN 1
                 ELSE 2 END,
            expiry_date NULLS LAST
        LIMIT :top_n
    """
    rows, _dao, _src = _query_analytics(
        "product_summary", sql,
        {"company_id": company_id, "days": days_to_expiry, "top_n": top_n},
        company_id,
    )

    if not rows:
        df = _b44_products(company_id)
        if not df.empty:
            import pandas as _pd2
            from datetime import date, timedelta

            cutoff = date.today() + timedelta(days=days_to_expiry)
            for col in ("stock_quantity", "reorder_level"):
                if col not in df.columns:
                    df[col] = None
            if "expiry_date" not in df.columns:
                df["expiry_date"] = None

            df["_exp_dt"] = _pd2.to_datetime(df["expiry_date"], errors="coerce").dt.date
            mask_low  = (
                df["stock_quantity"].notna() & df["reorder_level"].notna() &
                (df["stock_quantity"].astype(float) <= df["reorder_level"].astype(float))
            )
            mask_out  = df["stock_quantity"].astype(float, errors="ignore") == 0
            mask_exp  = df["_exp_dt"].apply(
                lambda d: d is not None and date.today() <= d <= cutoff
            )
            at_risk = df[mask_low | mask_out | mask_exp].copy()
            if not at_risk.empty:
                for col in ("name", "item_type", "status", "unit_of_measure", "unit_price"):
                    if col not in at_risk.columns:
                        at_risk[col] = None
                rows = at_risk[
                    ["name", "item_type", "status", "stock_quantity", "reorder_level",
                     "unit_of_measure", "expiry_date", "unit_price"]
                ].head(top_n).to_dict(orient="records")
            _dao, _src = None, "base44_live"
            logger.info("get_product_at_risk: Base44 fallback — %d at-risk items", len(rows))

    low_stock_items  = [r for r in rows if r.get("stock_status") == "low_stock"
                        or (r.get("stock_quantity") is not None
                            and r.get("reorder_level") is not None
                            and float(r.get("stock_quantity") or 0) <= float(r.get("reorder_level") or 0))]
    out_of_stock     = [r for r in rows if (r.get("stock_quantity") or 1) == 0]
    expiring         = [r for r in rows if r.get("expiring_soon") or r.get("expiry_date")]

    return {
        "at_risk_count":    len(rows),
        "low_stock_count":  len(low_stock_items),
        "out_of_stock_count": len(out_of_stock),
        "expiring_soon_count": len(expiring),
        "days_to_expiry_window": days_to_expiry,
        "items":           rows,
        "data_as_of":      _dao,
        "data_source":     _src,
    }


def get_operational_trends(
    company_id: str,
    months: int = 6,
) -> dict:
    """
    Returns month-by-month cross-entity operational trends:
    task completion rate %, new people added, people who left, and headcount snapshot.
    Used for: "how are we trending?", "completion rate over time",
              "staff changes by month", "headcount trend", "operations last 6 months".

    Reads analytics.task_summary + analytics.people_summary time series.
    Falls back to Base44 live data.
    """
    task_sql = """
        SELECT
            TO_CHAR(snapshot_date, 'YYYY-MM') AS year_month,
            SUM(total_tasks)                  AS total_tasks,
            SUM(completed_tasks)              AS completed_tasks,
            SUM(overdue_tasks)                AS overdue_tasks
        FROM analytics.task_summary
        WHERE company_id = :company_id
          AND snapshot_date >= CURRENT_DATE - INTERVAL '1 month' * :months
        GROUP BY year_month
        ORDER BY year_month
    """
    people_sql = """
        SELECT
            TO_CHAR(snapshot_date, 'YYYY-MM') AS year_month,
            SUM(total_people)                  AS headcount
        FROM analytics.people_summary
        WHERE company_id = :company_id
          AND snapshot_date >= CURRENT_DATE - INTERVAL '1 month' * :months
        GROUP BY year_month
        ORDER BY year_month
    """

    task_rows  = _run(task_sql,   {"company_id": company_id, "months": months})
    people_rows = _run(people_sql, {"company_id": company_id, "months": months})

    # Merge by year_month
    people_map = {r["year_month"]: int(r.get("headcount") or 0) for r in people_rows}

    trend_months = []
    prev_headcount = None
    for r in task_rows:
        ym         = r["year_month"]
        total      = int(r.get("total_tasks") or 0)
        completed  = int(r.get("completed_tasks") or 0)
        overdue    = int(r.get("overdue_tasks") or 0)
        headcount  = people_map.get(ym, 0)
        rate       = round(completed / total * 100, 1) if total > 0 else None
        delta      = (headcount - prev_headcount) if prev_headcount is not None else None
        prev_headcount = headcount
        trend_months.append({
            "month":                 ym,
            "total_tasks":           total,
            "completed_tasks":       completed,
            "overdue_tasks":         overdue,
            "task_completion_rate":  rate,
            "headcount":             headcount,
            "headcount_change":      delta,
        })

    # Base44 fallback — derive from raw tasks and people
    if not trend_months:
        import pandas as _pd2
        from datetime import date

        df_tasks   = _b44_tasks(company_id)
        df_people  = _b44_people(company_id)

        if not df_tasks.empty:
            if "created_date" in df_tasks.columns:
                df_tasks["_ym"] = _pd2.to_datetime(
                    df_tasks["created_date"], errors="coerce"
                ).dt.strftime("%Y-%m")
                for col in ("status", "due_date"):
                    if col not in df_tasks.columns:
                        df_tasks[col] = None
                df_tasks["_completed"] = df_tasks["status"].str.lower().isin(
                    ["completed", "done", "closed"]
                )
                df_tasks["_overdue"] = (
                    _pd2.to_datetime(df_tasks["due_date"], errors="coerce").dt.date
                    .apply(lambda d: d is not None and d < date.today())
                ) & ~df_tasks["_completed"]

                grp = df_tasks.groupby("_ym").agg(
                    total_tasks=("id", "count"),
                    completed_tasks=("_completed", "sum"),
                    overdue_tasks=("_overdue", "sum"),
                ).reset_index()

                people_hc = {}
                if not df_people.empty and "created_date" in df_people.columns:
                    df_people["_ym"] = _pd2.to_datetime(
                        df_people["created_date"], errors="coerce"
                    ).dt.strftime("%Y-%m")
                    people_hc = df_people.groupby("_ym").size().to_dict()

                prev_hc = None
                for _, row in grp.tail(months).iterrows():
                    ym  = row["_ym"]
                    tot = int(row["total_tasks"])
                    cmp = int(row["completed_tasks"])
                    ovd = int(row["overdue_tasks"])
                    hc  = people_hc.get(ym, 0)
                    rate = round(cmp / tot * 100, 1) if tot > 0 else None
                    delta = (hc - prev_hc) if prev_hc is not None else None
                    prev_hc = hc
                    trend_months.append({
                        "month": ym, "total_tasks": tot,
                        "completed_tasks": cmp, "overdue_tasks": ovd,
                        "task_completion_rate": rate,
                        "headcount": hc, "headcount_change": delta,
                    })
        logger.info("get_operational_trends: Base44 fallback — %d months", len(trend_months))

    avg_completion_rate = None
    rates = [m["task_completion_rate"] for m in trend_months if m["task_completion_rate"] is not None]
    if rates:
        avg_completion_rate = round(sum(rates) / len(rates), 1)

    return {
        "months_requested":      months,
        "months_returned":       len(trend_months),
        "avg_completion_rate":   avg_completion_rate,
        "trend":                 trend_months,
    }


def get_top_debtors(
    company_id: str,
    top_n: int = 10,
) -> dict:
    """
    Returns individual counterparty names with their outstanding amounts —
    sum of unpaid / partially-paid invoices/transactions.
    Used for: "who owes us money?", "top debtors", "outstanding balances",
              "who hasn't paid?", "largest unpaid invoices", "collections".

    Reads analytics.transaction_summary; falls back to raw.transactions then Base44.
    """
    sql = """
        SELECT
            counterparty_name,
            COUNT(*)                              AS invoice_count,
            SUM(amount)                           AS total_outstanding,
            MIN(due_date)                         AS oldest_due_date,
            MAX(amount)                           AS largest_single_amount,
            MIN(transaction_date)                 AS earliest_transaction
        FROM analytics.transaction_summary
        WHERE company_id       = :company_id
          AND payment_status   IN ('unpaid', 'partial', 'overdue', 'pending')
          AND transaction_type IN ('invoice', 'receivable', 'sale', 'credit_note')
        GROUP BY counterparty_name
        ORDER BY total_outstanding DESC NULLS LAST
        LIMIT :top_n
    """
    rows, _dao, _src = _query_analytics(
        "transaction_summary", sql,
        {"company_id": company_id, "top_n": top_n},
        company_id,
    )

    if not rows:
        df = _b44_transactions(company_id)
        if not df.empty:
            import pandas as _pd2

            unpaid_statuses = {"unpaid", "partial", "overdue", "pending"}
            receivable_types = {"invoice", "receivable", "sale", "credit_note"}

            for col in ("payment_status", "transaction_type", "amount",
                        "due_date", "counterparty_name", "transaction_date"):
                if col not in df.columns:
                    df[col] = None

            mask = (
                df["payment_status"].str.lower().isin(unpaid_statuses) &
                df["transaction_type"].str.lower().isin(receivable_types)
            )
            unpaid = df[mask].copy()

            if unpaid.empty:
                # Broader fallback: any status if type matches
                unpaid = df[df["transaction_type"].str.lower().isin(receivable_types)].copy()

            if not unpaid.empty:
                unpaid["amount"] = _pd2.to_numeric(unpaid["amount"], errors="coerce").fillna(0)
                grp = (
                    unpaid.groupby("counterparty_name")
                    .agg(
                        invoice_count=("id", "count"),
                        total_outstanding=("amount", "sum"),
                        oldest_due_date=("due_date", "min"),
                        largest_single_amount=("amount", "max"),
                        earliest_transaction=("transaction_date", "min"),
                    )
                    .reset_index()
                    .sort_values("total_outstanding", ascending=False)
                    .head(top_n)
                )
                rows = grp.to_dict(orient="records")
            _dao, _src = None, "base44_live"
            logger.info("get_top_debtors: Base44 fallback — %d debtors", len(rows))

    total_outstanding = sum(float(r.get("total_outstanding") or 0) for r in rows)

    return {
        "top_n_requested":   top_n,
        "debtor_count":      len(rows),
        "total_outstanding": round(total_outstanding, 2),
        "debtors":           rows,
        "data_as_of":        _dao,
        "data_source":       _src,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# RAW TABLE TOOLS — individual record lookup from raw.* (not aggregated)
# These tools query raw.* directly, bypassing analytics.* aggregation.
# They answer "show me the actual records" questions, not "how many" questions.
# All queries are company-scoped, parameterised, and capped with LIMIT.
# ═══════════════════════════════════════════════════════════════════════════════

def _raw_query(
    table: str,
    company_id: str,
    where_clauses: list,
    params: dict,
    select_cols: str = "*",
    order_by: str = "id",
    limit: int = 20,
) -> list:
    """
    Execute a parameterised SELECT against a raw.* table.
    Always injects company_id filter. Returns list of dicts or [].
    """
    engine = get_engine_safe()
    if not engine:
        return []
    try:
        with engine.connect() as conn:
            exists = conn.execute(
                text(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema = 'raw' AND table_name = :t LIMIT 1"
                ),
                {"t": table},
            ).fetchone()
            if not exists:
                return []
            where = " AND ".join(["company_id = :company_id"] + where_clauses) if where_clauses else "company_id = :company_id"
            sql = f"SELECT {select_cols} FROM raw.{table} WHERE {where} ORDER BY {order_by} LIMIT :_limit"
            params["company_id"] = company_id
            params["_limit"] = limit
            result = conn.execute(text(sql), params)
            rows = result.fetchall()
            cols = list(result.keys())
            return [dict(zip(cols, r)) for r in rows]
    except Exception as e:
        logger.warning("_raw_query(%s): %s", table, e)
        return []


def _b44_people_records(company_id: str, name_fragment: str = None,
                         person_type: str = None, status: str = None,
                         enterprise_name: str = None, limit: int = 20) -> list:
    """Base44 live fallback for find_people_records."""
    try:
        df = _b44_people(company_id)
        if df.empty:
            return []
        if name_fragment:
            mask = df.apply(
                lambda r: name_fragment.lower() in str(r.get("full_name", "") or r.get("name", "")).lower(),
                axis=1,
            )
            df = df[mask]
        for col, val in [("person_type", person_type), ("status", status)]:
            if val and col in df.columns:
                df = df[df[col].str.lower() == val.lower()]
        if enterprise_name and "enterprise_name" in df.columns:
            df = df[df["enterprise_name"].str.lower().str.contains(enterprise_name.lower(), na=False)]
        keep = [c for c in ("id", "full_name", "name", "person_type", "person_subtype",
                             "status", "phone", "email", "enterprise_name",
                             "engagement_model", "created_date", "end_date") if c in df.columns]
        return df[keep].head(limit).to_dict(orient="records")
    except Exception as e:
        logger.warning("_b44_people_records fallback: %s", e)
        return []


def find_people_records(
    company_id: str,
    name: Optional[str] = None,
    person_type: Optional[str] = None,
    status: Optional[str] = None,
    enterprise_name: Optional[str] = None,
    limit: int = 20,
) -> dict:
    """
    Search for individual people records by name, type, status, or enterprise.
    Returns actual rows — names, contact details, type, status, linked enterprise.
    Used for: "find John Doe", "show me all active nurses",
              "which students are inactive?", "staff at Branch X".

    Queries raw.people directly; falls back to Base44 live.
    """
    where, params = [], {}
    if name:
        where.append("(full_name ILIKE :name OR name ILIKE :name)")
        params["name"] = f"%{name}%"
    if person_type:
        where.append("person_type ILIKE :person_type")
        params["person_type"] = person_type
    if status:
        where.append("status ILIKE :status")
        params["status"] = status
    if enterprise_name:
        where.append("enterprise_name ILIKE :enterprise_name")
        params["enterprise_name"] = f"%{enterprise_name}%"

    rows = _raw_query(
        "people", company_id, where, params,
        select_cols=(
            "id, full_name, name, person_type, person_subtype, status, "
            "phone, email, enterprise_name, engagement_model, "
            "availability_status, created_date, end_date"
        ),
        order_by="full_name NULLS LAST",
        limit=limit,
    )

    if not rows:
        rows = _b44_people_records(company_id, name, person_type, status, enterprise_name, limit)
        source = "base44_live"
    else:
        source = "raw"

    logger.info("find_people_records: %d records (source=%s)", len(rows), source)
    return {
        "count":       len(rows),
        "records":     rows,
        "filters":     {"name": name, "person_type": person_type, "status": status, "enterprise_name": enterprise_name},
        "data_source": source,
    }


def find_task_records(
    company_id: str,
    assignee_name: Optional[str] = None,
    task_type: Optional[str] = None,
    status: Optional[str] = None,
    overdue_only: bool = False,
    days_back: Optional[int] = None,
    limit: int = 20,
) -> dict:
    """
    Search for individual task records by assignee, type, status, or overdue state.
    Returns actual rows — titles, assignees, due dates, outcomes.
    Used for: "show me overdue tasks", "what tasks are assigned to Mary?",
              "pending visits this week", "which tasks did we miss?".

    Queries raw.tasks directly; falls back to Base44 live.
    """
    where, params = [], {}
    if assignee_name:
        where.append("(assigned_to ILIKE :assignee OR assignee_name ILIKE :assignee)")
        params["assignee"] = f"%{assignee_name}%"
    if task_type:
        where.append("task_type ILIKE :task_type")
        params["task_type"] = f"%{task_type}%"
    if status:
        where.append("status ILIKE :status")
        params["status"] = status
    if overdue_only:
        where.append("due_date < CURRENT_DATE AND status NOT IN ('completed', 'done', 'closed', 'cancelled')")
    if days_back:
        where.append("created_date >= CURRENT_DATE - INTERVAL '1 day' * :days_back")
        params["days_back"] = days_back

    rows = _raw_query(
        "tasks", company_id, where, params,
        select_cols=(
            "id, title, task_type, status, assigned_to, assignee_name, "
            "due_date, created_date, completed_date, outcome, priority, "
            "enterprise_name, enterprise_id, notes"
        ),
        order_by="due_date NULLS LAST",
        limit=limit,
    )

    if not rows:
        try:
            df = _b44_tasks(company_id)
            if not df.empty:
                import pandas as _pd2
                from datetime import date as _date
                if assignee_name:
                    for col in ("assigned_to", "assignee_name"):
                        if col in df.columns:
                            df = df[df[col].str.lower().str.contains(assignee_name.lower(), na=False)]
                if task_type and "task_type" in df.columns:
                    df = df[df["task_type"].str.lower().str.contains(task_type.lower(), na=False)]
                if status and "status" in df.columns:
                    df = df[df["status"].str.lower() == status.lower()]
                if overdue_only:
                    if "due_date" in df.columns and "status" in df.columns:
                        due = _pd2.to_datetime(df["due_date"], errors="coerce").dt.date
                        df = df[
                            due.apply(lambda d: d is not None and d < _date.today()) &
                            ~df["status"].str.lower().isin(["completed", "done", "closed", "cancelled"])
                        ]
                if days_back and "created_date" in df.columns:
                    from datetime import timedelta
                    cutoff = _date.today() - timedelta(days=days_back)
                    created = _pd2.to_datetime(df["created_date"], errors="coerce").dt.date
                    df = df[created.apply(lambda d: d is not None and d >= cutoff)]
                keep = [c for c in ("id", "title", "task_type", "status", "assigned_to",
                                     "assignee_name", "due_date", "created_date",
                                     "completed_date", "outcome", "priority",
                                     "enterprise_name", "notes") if c in df.columns]
                rows = df[keep].head(limit).to_dict(orient="records")
        except Exception as e:
            logger.warning("find_task_records Base44 fallback: %s", e)
        source = "base44_live"
    else:
        source = "raw"

    logger.info("find_task_records: %d records (source=%s)", len(rows), source)
    return {
        "count":       len(rows),
        "records":     rows,
        "filters": {
            "assignee_name": assignee_name, "task_type": task_type,
            "status": status, "overdue_only": overdue_only, "days_back": days_back,
        },
        "data_source": source,
    }


def find_transaction_records(
    company_id: str,
    counterparty_name: Optional[str] = None,
    transaction_type: Optional[str] = None,
    payment_status: Optional[str] = None,
    min_amount: Optional[float] = None,
    days_back: Optional[int] = None,
    limit: int = 20,
) -> dict:
    """
    Search for individual transaction records by counterparty, type, status, or amount.
    Returns actual rows — amounts, dates, counterparties, payment status.
    Note: raw.transactions includes ALL statuses (draft, voided, posted).
    Used for: "show me invoices for Client X", "unpaid transactions above $1000",
              "recent payments from ABC Corp", "all draft invoices".

    Queries raw.transactions directly; falls back to Base44 live.
    """
    where, params = [], {}
    if counterparty_name:
        where.append("counterparty_name ILIKE :counterparty")
        params["counterparty"] = f"%{counterparty_name}%"
    if transaction_type:
        where.append("transaction_type ILIKE :txn_type")
        params["txn_type"] = f"%{transaction_type}%"
    if payment_status:
        where.append("payment_status ILIKE :pmt_status")
        params["pmt_status"] = payment_status
    if min_amount is not None:
        where.append("amount >= :min_amount")
        params["min_amount"] = min_amount
    if days_back:
        where.append("transaction_date >= CURRENT_DATE - INTERVAL '1 day' * :days_back")
        params["days_back"] = days_back

    rows = _raw_query(
        "transactions", company_id, where, params,
        select_cols=(
            "id, transaction_type, status, payment_status, amount, currency, "
            "transaction_date, due_date, counterparty_name, counterparty_id, "
            "description, reference_number, enterprise_name, created_date"
        ),
        order_by="transaction_date DESC NULLS LAST",
        limit=limit,
    )

    if not rows:
        try:
            df = _b44_transactions(company_id)
            if not df.empty:
                import pandas as _pd2
                if counterparty_name and "counterparty_name" in df.columns:
                    df = df[df["counterparty_name"].str.lower().str.contains(counterparty_name.lower(), na=False)]
                if transaction_type and "transaction_type" in df.columns:
                    df = df[df["transaction_type"].str.lower().str.contains(transaction_type.lower(), na=False)]
                if payment_status and "payment_status" in df.columns:
                    df = df[df["payment_status"].str.lower() == payment_status.lower()]
                if min_amount is not None and "amount" in df.columns:
                    df = df[_pd2.to_numeric(df["amount"], errors="coerce").fillna(0) >= min_amount]
                if days_back and "transaction_date" in df.columns:
                    from datetime import date as _date, timedelta
                    cutoff = _date.today() - timedelta(days=days_back)
                    txn_dt = _pd2.to_datetime(df["transaction_date"], errors="coerce").dt.date
                    df = df[txn_dt.apply(lambda d: d is not None and d >= cutoff)]
                keep = [c for c in ("id", "transaction_type", "status", "payment_status",
                                     "amount", "currency", "transaction_date", "due_date",
                                     "counterparty_name", "description", "reference_number",
                                     "enterprise_name", "created_date") if c in df.columns]
                rows = df[keep].head(limit).to_dict(orient="records")
        except Exception as e:
            logger.warning("find_transaction_records Base44 fallback: %s", e)
        source = "base44_live"
    else:
        source = "raw"

    logger.info("find_transaction_records: %d records (source=%s)", len(rows), source)
    return {
        "count":       len(rows),
        "records":     rows,
        "filters": {
            "counterparty_name": counterparty_name, "transaction_type": transaction_type,
            "payment_status": payment_status, "min_amount": min_amount, "days_back": days_back,
        },
        "data_source": source,
    }


def inspect_raw_record(
    company_id: str,
    entity: str,
    record_id: str,
) -> dict:
    """
    Fetch a single record from any raw.* table by its ID.
    Used as a drill-down after another tool returns an ID —
    e.g. "tell me more about task ID abc123", "show full record for person xyz".
    Returns all columns for that record.
    """
    VALID_ENTITIES = {
        "people", "enterprises", "products", "tasks",
        "transactions", "relationships", "addresses",
    }
    if entity not in VALID_ENTITIES:
        return {"error": f"Unknown entity '{entity}'. Valid: {sorted(VALID_ENTITIES)}"}

    rows = _raw_query(
        entity, company_id,
        where_clauses=["id = :record_id"],
        params={"record_id": record_id},
        select_cols="*",
        order_by="id",
        limit=1,
    )

    if not rows:
        # Base44 fallback — use the appropriate _b44_* helper and filter by id
        try:
            b44_fns = {
                "people":        _b44_people,
                "enterprises":   _b44_enterprises,
                "products":      _b44_products,
                "tasks":         _b44_tasks,
                "transactions":  _b44_transactions,
                "relationships": lambda cid: _read_raw_table("relationships", cid) or _pd.DataFrame(),
                "addresses":     lambda cid: _read_raw_table("addresses", cid) or _pd.DataFrame(),
            }
            df = b44_fns[entity](company_id)
            if not df.empty and "id" in df.columns:
                match = df[df["id"].astype(str) == str(record_id)]
                if not match.empty:
                    return {
                        "found":       True,
                        "entity":      entity,
                        "record_id":   record_id,
                        "record":      match.iloc[0].to_dict(),
                        "data_source": "base44_live",
                    }
        except Exception as e:
            logger.warning("inspect_raw_record Base44 fallback: %s", e)
        return {
            "found":     False,
            "entity":    entity,
            "record_id": record_id,
            "record":    None,
        }

    return {
        "found":       True,
        "entity":      entity,
        "record_id":   record_id,
        "record":      rows[0],
        "data_source": "raw",
    }


def find_relationship_records(
    company_id: str,
    person_name: Optional[str] = None,
    enterprise_name: Optional[str] = None,
    relationship_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
) -> dict:
    """
    Search for individual relationship records — who is connected to whom.
    Returns actual rows with person names, enterprise names, roles, and dates.
    Used for: "who works at Branch X?", "what relationships does John have?",
              "show all active employment relationships", "item custody for Product Y",
              "which staff are assigned to Enterprise Z?".

    Queries raw.relationships directly; falls back to Base44 live.
    """
    where, params = [], {}
    if person_name:
        where.append("person_name ILIKE :person_name")
        params["person_name"] = f"%{person_name}%"
    if enterprise_name:
        where.append("enterprise_name ILIKE :enterprise_name")
        params["enterprise_name"] = f"%{enterprise_name}%"
    if relationship_type:
        where.append("relationship_type ILIKE :rel_type")
        params["rel_type"] = f"%{relationship_type}%"
    if status:
        where.append("status ILIKE :status")
        params["status"] = status

    rows = _raw_query(
        "relationships", company_id, where, params,
        select_cols=(
            "id, relationship_type, status, person_name, person_id, "
            "enterprise_name, enterprise_id, item_name, item_id, "
            "role, start_date, end_date, notes, created_date"
        ),
        order_by="person_name NULLS LAST",
        limit=limit,
    )

    if not rows:
        try:
            from etl.relationships import extract_relationships
            df = _read_raw_table("relationships", company_id)
            if df.empty:
                df = _filter_by_company(extract_relationships(), company_id)
            if not df.empty:
                if person_name and "person_name" in df.columns:
                    df = df[df["person_name"].str.lower().str.contains(person_name.lower(), na=False)]
                if enterprise_name and "enterprise_name" in df.columns:
                    df = df[df["enterprise_name"].str.lower().str.contains(enterprise_name.lower(), na=False)]
                if relationship_type and "relationship_type" in df.columns:
                    df = df[df["relationship_type"].str.lower().str.contains(relationship_type.lower(), na=False)]
                if status and "status" in df.columns:
                    df = df[df["status"].str.lower() == status.lower()]
                keep = [c for c in ("id", "relationship_type", "status", "person_name",
                                     "person_id", "enterprise_name", "enterprise_id",
                                     "item_name", "item_id", "role",
                                     "start_date", "end_date", "notes") if c in df.columns]
                rows = df[keep].head(limit).to_dict(orient="records")
        except Exception as e:
            logger.warning("find_relationship_records Base44 fallback: %s", e)
        source = "base44_live"
    else:
        source = "raw"

    logger.info("find_relationship_records: %d records (source=%s)", len(rows), source)
    return {
        "count":       len(rows),
        "records":     rows,
        "filters": {
            "person_name": person_name, "enterprise_name": enterprise_name,
            "relationship_type": relationship_type, "status": status,
        },
        "data_source": source,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ADDITIONAL RAW RECORD TOOLS — Products and Addresses
# ═══════════════════════════════════════════════════════════════════════════════

def find_product_records(
    company_id: str,
    name: Optional[str] = None,
    item_type: Optional[str] = None,
    status: Optional[str] = None,
    low_stock_only: bool = False,
    limit: int = 20,
) -> dict:
    """
    Search for individual product/item records by name, type, or status.
    Returns actual rows — names, stock levels, prices, expiry dates, unit of measure.
    Used for: "find paracetamol", "show me all medications", "list active products",
              "which livestock are we tracking?", "browse our service catalogue".

    Queries raw.products directly; falls back to Base44 live.
    """
    where, params = [], {}
    if name:
        where.append("(name ILIKE :name OR item_subtype ILIKE :name)")
        params["name"] = f"%{name}%"
    if item_type:
        where.append("item_type ILIKE :item_type")
        params["item_type"] = f"%{item_type}%"
    if status:
        where.append("status ILIKE :status")
        params["status"] = status
    if low_stock_only:
        where.append(
            "(stock_quantity IS NOT NULL AND reorder_level IS NOT NULL "
            " AND stock_quantity <= reorder_level) OR stock_quantity = 0"
        )

    rows = _raw_query(
        "products", company_id, where, params,
        select_cols=(
            "id, name, item_type, item_subtype, item_class, status, "
            "stock_quantity, reorder_level, unit_of_measure, unit_price, "
            "expiry_date, batch_number, enterprise_name, created_date"
        ),
        order_by="name NULLS LAST",
        limit=limit,
    )

    if not rows:
        try:
            df = _b44_products(company_id)
            if not df.empty:
                if name:
                    for col in ("name", "item_subtype"):
                        if col in df.columns:
                            df = df[df[col].str.lower().str.contains(name.lower(), na=False)]
                if item_type and "item_type" in df.columns:
                    df = df[df["item_type"].str.lower().str.contains(item_type.lower(), na=False)]
                if status and "status" in df.columns:
                    df = df[df["status"].str.lower() == status.lower()]
                if low_stock_only:
                    import pandas as _pd2
                    df["_sq"] = _pd2.to_numeric(df.get("stock_quantity"), errors="coerce")
                    df["_rl"] = _pd2.to_numeric(df.get("reorder_level"),  errors="coerce")
                    df = df[(df["_sq"] <= df["_rl"]) | (df["_sq"] == 0)]
                keep = [c for c in ("id", "name", "item_type", "item_subtype", "item_class",
                                     "status", "stock_quantity", "reorder_level",
                                     "unit_of_measure", "unit_price", "expiry_date",
                                     "batch_number", "enterprise_name") if c in df.columns]
                rows = df[keep].head(limit).to_dict(orient="records")
        except Exception as e:
            logger.warning("find_product_records Base44 fallback: %s", e)
        source = "base44_live"
    else:
        source = "raw"

    logger.info("find_product_records: %d records (source=%s)", len(rows), source)
    return {
        "count":       len(rows),
        "records":     rows,
        "filters":     {"name": name, "item_type": item_type, "status": status, "low_stock_only": low_stock_only},
        "data_source": source,
    }


def find_address_records(
    company_id: str,
    city: Optional[str] = None,
    address_type: Optional[str] = None,
    entity_name: Optional[str] = None,
    limit: int = 20,
) -> dict:
    """
    Search for individual address records by city, type, or linked entity.
    Returns actual rows — street, city, country, GPS coordinates, linked entity.
    Used for: "where is Branch X located?", "show all addresses in Nairobi",
              "list delivery addresses", "what's the address for Enterprise Y?".

    Queries raw.addresses directly; falls back to Base44 live.
    """
    where, params = [], {}
    if city:
        where.append("city ILIKE :city")
        params["city"] = f"%{city}%"
    if address_type:
        where.append("address_type ILIKE :address_type")
        params["address_type"] = f"%{address_type}%"
    if entity_name:
        where.append("(enterprise_name ILIKE :entity_name OR person_name ILIKE :entity_name OR label ILIKE :entity_name)")
        params["entity_name"] = f"%{entity_name}%"

    rows = _raw_query(
        "addresses", company_id, where, params,
        select_cols=(
            "id, address_type, label, street_address, city, state_province, "
            "country, postal_code, latitude, longitude, "
            "enterprise_name, enterprise_id, person_name, person_id, "
            "is_primary, created_date"
        ),
        order_by="city NULLS LAST, label NULLS LAST",
        limit=limit,
    )

    if not rows:
        try:
            df = _read_raw_table("addresses", company_id)
            if df.empty:
                from etl.addresses import extract_addresses
                df = _filter_by_company(extract_addresses(), company_id)
            if not df.empty:
                if city and "city" in df.columns:
                    df = df[df["city"].str.lower().str.contains(city.lower(), na=False)]
                if address_type and "address_type" in df.columns:
                    df = df[df["address_type"].str.lower().str.contains(address_type.lower(), na=False)]
                if entity_name:
                    mask = False
                    for col in ("enterprise_name", "person_name", "label"):
                        if col in df.columns:
                            mask = mask | df[col].str.lower().str.contains(entity_name.lower(), na=False)
                    df = df[mask]
                keep = [c for c in ("id", "address_type", "label", "street_address",
                                     "city", "state_province", "country", "postal_code",
                                     "latitude", "longitude", "enterprise_name",
                                     "person_name", "is_primary") if c in df.columns]
                rows = df[keep].head(limit).to_dict(orient="records")
        except Exception as e:
            logger.warning("find_address_records Base44 fallback: %s", e)
        source = "base44_live"
    else:
        source = "raw"

    logger.info("find_address_records: %d records (source=%s)", len(rows), source)
    return {
        "count":       len(rows),
        "records":     rows,
        "filters":     {"city": city, "address_type": address_type, "entity_name": entity_name},
        "data_source": source,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# CROSS-ENTITY JOIN TOOL — merge two raw tables in Python
# ═══════════════════════════════════════════════════════════════════════════════

# Supported join pairs and their join keys.
# Left side is primary_entity, right side is secondary_entity.
_JOIN_CONFIGS = {
    ("people", "tasks"): {
        "left_key":  "full_name",       # or "name" fallback
        "right_key": "assigned_to",     # or "assignee_name" fallback
        "alt_right": "assignee_name",
    },
    ("people", "transactions"): {
        "left_key":  "full_name",
        "right_key": "counterparty_name",
        "alt_right": None,
    },
    ("people", "relationships"): {
        "left_key":  "full_name",
        "right_key": "person_name",
        "alt_right": None,
    },
    ("enterprises", "people"): {
        "left_key":  "name",
        "right_key": "enterprise_name",
        "alt_right": None,
    },
    ("enterprises", "tasks"): {
        "left_key":  "name",
        "right_key": "enterprise_name",
        "alt_right": None,
    },
    ("enterprises", "transactions"): {
        "left_key":  "name",
        "right_key": "enterprise_name",
        "alt_right": "counterparty_name",
    },
}


def get_entity_join(
    company_id: str,
    primary_entity: str,
    secondary_entity: str,
    primary_filter: Optional[str] = None,
    secondary_status_filter: Optional[str] = None,
    secondary_overdue_only: bool = False,
    limit: int = 30,
) -> dict:
    """
    Cross-entity join — fetch records from two entities and merge them.
    Used for: "show people at Branch X with their overdue tasks",
              "which staff have open transactions?",
              "list all relationships for people at Enterprise Y".

    Supported pairs: people+tasks, people+transactions, people+relationships,
                     enterprises+people, enterprises+tasks, enterprises+transactions.

    primary_filter: filter value applied to the primary entity's name/filter column.
    secondary_status_filter: status filter on the secondary entity.
    secondary_overdue_only: for tasks, filter to overdue only.

    Queries raw.* directly; falls back to Base44 live per entity.
    """
    import pandas as _pd2

    key = (primary_entity, secondary_entity)
    cfg = _JOIN_CONFIGS.get(key)
    if not cfg:
        return {
            "error": (
                f"Unsupported join: {primary_entity} + {secondary_entity}. "
                f"Supported pairs: {', '.join(f'{a}+{b}' for a,b in _JOIN_CONFIGS)}"
            )
        }

    # ── Fetch primary entity rows ─────────────────────────────────────────────
    pri_where, pri_params = [], {}
    if primary_filter:
        if primary_entity == "people":
            pri_where.append("(full_name ILIKE :pf OR name ILIKE :pf)")
        else:  # enterprises
            pri_where.append("name ILIKE :pf")
        pri_params["pf"] = f"%{primary_filter}%"

    primary_rows = _raw_query(
        primary_entity, company_id, pri_where, pri_params,
        select_cols="*", order_by="id", limit=200,
    )
    if not primary_rows:
        # Base44 fallback
        try:
            fn_map = {"people": _b44_people, "enterprises": _b44_enterprises}
            df = fn_map[primary_entity](company_id)
            if not df.empty:
                if primary_filter:
                    name_col = "full_name" if "full_name" in df.columns else "name"
                    if name_col in df.columns:
                        df = df[df[name_col].str.lower().str.contains(primary_filter.lower(), na=False)]
                primary_rows = df.to_dict(orient="records")
        except Exception as e:
            logger.warning("get_entity_join primary fallback: %s", e)

    if not primary_rows:
        return {"count": 0, "records": [], "note": f"No {primary_entity} found matching filter."}

    # ── Fetch secondary entity rows ───────────────────────────────────────────
    sec_where, sec_params = [], {}
    if secondary_status_filter:
        sec_where.append("status ILIKE :sec_status")
        sec_params["sec_status"] = secondary_status_filter
    if secondary_overdue_only and secondary_entity == "tasks":
        sec_where.append("due_date < CURRENT_DATE AND status NOT IN ('completed','done','closed','cancelled')")

    secondary_rows = _raw_query(
        secondary_entity, company_id, sec_where, sec_params,
        select_cols="*", order_by="id", limit=500,
    )
    if not secondary_rows:
        try:
            fn_map = {
                "tasks":         _b44_tasks,
                "transactions":  _b44_transactions,
                "people":        _b44_people,
                "relationships": lambda cid: _pd2.DataFrame(_read_raw_table("relationships", cid)),
            }
            fn = fn_map.get(secondary_entity)
            if fn:
                df = fn(company_id)
                if not df.empty:
                    if secondary_status_filter and "status" in df.columns:
                        df = df[df["status"].str.lower() == secondary_status_filter.lower()]
                    secondary_rows = df.to_dict(orient="records")
        except Exception as e:
            logger.warning("get_entity_join secondary fallback: %s", e)

    if not secondary_rows:
        return {"count": 0, "records": [], "note": f"No {secondary_entity} found."}

    # ── Merge in Python ───────────────────────────────────────────────────────
    left_key  = cfg["left_key"]
    right_key = cfg["right_key"]
    alt_right = cfg.get("alt_right")

    df_left  = _pd2.DataFrame(primary_rows)
    df_right = _pd2.DataFrame(secondary_rows)

    # Resolve actual column names (some entities use full_name, some name)
    if left_key not in df_left.columns and "name" in df_left.columns:
        left_key = "name"
    if right_key not in df_right.columns and alt_right and alt_right in df_right.columns:
        right_key = alt_right

    if left_key not in df_left.columns or right_key not in df_right.columns:
        return {
            "error": (
                f"Join key mismatch: '{left_key}' not in {list(df_left.columns[:8])} "
                f"or '{right_key}' not in {list(df_right.columns[:8])}"
            )
        }

    # Normalise join keys to lowercase for case-insensitive match
    df_left["_jk"]  = df_left[left_key].astype(str).str.lower().str.strip()
    df_right["_jk"] = df_right[right_key].astype(str).str.lower().str.strip()

    # Suffix secondary columns to avoid collision
    merged = df_left.merge(
        df_right, on="_jk", how="inner",
        suffixes=("", f"_{secondary_entity[:-1]}")
    ).drop(columns=["_jk"])

    records = merged.head(limit).to_dict(orient="records")

    logger.info(
        "get_entity_join: %s+%s → %d merged records",
        primary_entity, secondary_entity, len(records),
    )
    return {
        "count":            len(records),
        "primary_entity":   primary_entity,
        "secondary_entity": secondary_entity,
        "join_key":         f"{primary_entity}.{left_key} = {secondary_entity}.{right_key}",
        "records":          records,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# WRITE-BACK TOOL — copilot requests an action through the approval gate
# ═══════════════════════════════════════════════════════════════════════════════

def request_action(
    company_id: str,
    action_type: str,
    entity: str,
    label: str,
    changes: Optional[dict] = None,
    record_id: Optional[str] = None,
    reasoning: Optional[str] = None,
) -> dict:
    """
    Submit an action request through the approval gate.
    Low-risk actions execute immediately (create_task, flag_record).
    Higher-risk actions (update_record, create_transaction, send message) go to
    the pending approvals queue for the operator to review in the Agents panel.

    Used for: "create a follow-up task for John", "flag this record",
              "mark this task as completed", "create an invoice for ABC Corp",
              "send a reminder to this client".

    Returns the status (executed/pending/notify) and an approval_id if queued.
    """
    from database import get_engine_safe as _get_engine

    VALID_ACTIONS = {
        "create_task", "create_follow_up", "update_task_status",
        "flag_record", "update_record", "reassign_task",
        "create_transaction", "send_client_message", "send_email",
        "internal_alert",
    }
    if action_type not in VALID_ACTIONS:
        return {
            "error":  f"Unknown action_type '{action_type}'.",
            "valid":  sorted(VALID_ACTIONS),
        }

    payload = {
        "entity":    entity,
        "record_id": record_id,
        "changes":   changes or {},
        "label":     label,
        "source":    "copilot",
    }

    engine = _get_engine()
    if not engine:
        return {
            "status":  "unavailable",
            "message": "Database unavailable — action cannot be queued.",
        }

    try:
        from agents.approval_gate import submit_action, get_risk_level
        result = submit_action(
            engine=engine,
            company_id=company_id,
            agent_name="copilot",
            action_type=action_type,
            action_label=label,
            action_payload=payload,
            reasoning=reasoning or f"Requested via copilot for {entity}",
        )
        risk = get_risk_level(action_type).value

        status_msg = {
            "executed": f"Action executed immediately (low risk: {risk}).",
            "notified": f"Action executed and operator notified (risk: {risk}).",
            "pending":  f"Action queued for approval in the Agents panel (risk: {risk}).",
            "error":    "Action could not be submitted.",
        }.get(result.get("status", ""), "Unknown status.")

        return {
            "status":      result.get("status"),
            "approval_id": result.get("approval_id"),
            "risk_level":  risk,
            "action_type": action_type,
            "label":       label,
            "message":     status_msg,
        }
    except Exception as e:
        logger.warning("request_action failed: %s", e)
        return {"status": "error", "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# COPILOT PERSISTENT MEMORY — per-company key-value store (analytics.copilot_memory)
# ═══════════════════════════════════════════════════════════════════════════════

_COPILOT_MEMORY_DDL = """
CREATE TABLE IF NOT EXISTS analytics.copilot_memory (
    id          SERIAL PRIMARY KEY,
    company_id  TEXT NOT NULL,
    memory_type TEXT NOT NULL DEFAULT 'note',
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, key)
);
CREATE INDEX IF NOT EXISTS idx_copilot_memory_company
    ON analytics.copilot_memory (company_id);
"""


def _ensure_copilot_memory_table() -> bool:
    """Create the table if it doesn't exist. Returns True on success."""
    engine = get_engine_safe()
    if not engine:
        return False
    try:
        with engine.connect() as conn:
            conn.execute(text(_COPILOT_MEMORY_DDL))
            conn.commit()
        return True
    except Exception as e:
        logger.warning("copilot_memory: could not ensure table: %s", e)
        return False


def load_copilot_memory(company_id: str) -> list[dict]:
    """
    Load all persistent memory entries for this company.
    Called automatically at the start of every ask() — not exposed as a tool.
    Returns list of {key, value, memory_type, updated_at}.
    """
    engine = get_engine_safe()
    if not engine:
        return []
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT key, value, memory_type, updated_at
                FROM analytics.copilot_memory
                WHERE company_id = :cid
                ORDER BY updated_at DESC
                LIMIT 50
            """), {"cid": company_id}).fetchall()
            return [
                {"key": r[0], "value": r[1], "memory_type": r[2], "updated_at": str(r[3])}
                for r in rows
            ]
    except Exception as e:
        logger.debug("load_copilot_memory: %s", e)
        return []


def save_copilot_memory(
    company_id: str,
    key: str,
    value: str,
    memory_type: str = "note",
) -> dict:
    """
    Persist a memory entry for this company — survives across all future sessions.
    Call this when the operator states a preference, names, context, or instruction
    that will be useful in future conversations.

    memory_type:
      preference  — operator preference ("always show amounts in KES")
      context     — background fact ("this is a school, not a hospital")
      instruction — standing instruction ("always include headcount in summaries")
      note        — general note

    Used for: "remember that we call our clients 'patients'",
              "always show costs in USD", "our fiscal year starts in July".
    """
    _ensure_copilot_memory_table()
    engine = get_engine_safe()
    if not engine:
        return {"saved": False, "reason": "database unavailable"}
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO analytics.copilot_memory
                    (company_id, memory_type, key, value, updated_at)
                VALUES (:cid, :mtype, :key, :value, NOW())
                ON CONFLICT (company_id, key)
                DO UPDATE SET
                    value      = EXCLUDED.value,
                    memory_type= EXCLUDED.memory_type,
                    updated_at = NOW()
            """), {"cid": company_id, "mtype": memory_type, "key": key, "value": value})
            conn.commit()
        logger.info("save_copilot_memory: saved '%s' for company %s", key, company_id)
        return {
            "saved":       True,
            "key":         key,
            "memory_type": memory_type,
            "message":     f"I'll remember this for all future conversations: {key} = {value}",
        }
    except Exception as e:
        logger.warning("save_copilot_memory: %s", e)
        return {"saved": False, "reason": str(e)}


# ═══════════════════════════════════════════════════════════════════════════════
# WEB-GROUNDED TOOLS — public data sources, no API key required
# ═══════════════════════════════════════════════════════════════════════════════

def web_search(query: str, company_id: str, max_results: int = 5) -> dict:
    """
    Multi-tier web search for market intelligence, industry news, or public data.

    Fallback chain (always returns something):
      Tier 1 — Brave Search API        (if BRAVE_SEARCH_API_KEY is set)
      Tier 2 — DuckDuckGo HTML scrape  (no key; parses actual result snippets)
      Tier 3 — DuckDuckGo Instant Answer (no key; encyclopaedic summary)
      Tier 4 — Wikipedia REST API       (no key; factual/encyclopaedic fallback)
      Tier 5 — Synthesised answer       (always present; tells Claude what it knows)
    """
    import urllib.request
    import urllib.parse
    import json as _json
    import os
    import re

    results   = []
    tiers_tried = []

    # ── Tier 1: Brave Search API ──────────────────────────────────────────
    brave_key = os.getenv("BRAVE_SEARCH_API_KEY", "")
    if brave_key and len(results) < max_results:
        try:
            brave_url = (
                f"https://api.search.brave.com/res/v1/web/search"
                f"?q={urllib.parse.quote(query)}&count={max_results}&text_decorations=0"
            )
            req = urllib.request.Request(
                brave_url,
                headers={
                    "Accept":            "application/json",
                    "Accept-Encoding":   "gzip",
                    "X-Subscription-Token": brave_key,
                    "User-Agent":        "newsconseen-copilot/1.0",
                },
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                raw = _json.loads(resp.read().decode())
            for item in (raw.get("web", {}).get("results") or [])[:max_results]:
                results.append({
                    "source":  "Brave Search",
                    "title":   item.get("title", ""),
                    "snippet": item.get("description", "")[:600],
                    "url":     item.get("url", ""),
                })
            tiers_tried.append("brave")
            logger.info("web_search Brave: %d results", len(results))
        except Exception as e:
            logger.warning("web_search Brave failed: %s", e)

    # ── Tier 2: DuckDuckGo HTML scrape (real results, no API key) ────────
    if len(results) < 2:
        try:
            ddg_html_url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
            req = urllib.request.Request(
                ddg_html_url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; newsconseen-copilot/1.0)"},
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                html = resp.read().decode("utf-8", errors="ignore")

            # Extract result snippets — DDG HTML uses class="result__snippet"
            snippets = re.findall(
                r'class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)</a>.*?'
                r'class="result__snippet"[^>]*>([^<]+)</span>',
                html, re.DOTALL
            )
            for url, title, snippet in snippets[:max_results - len(results)]:
                clean_url = urllib.parse.unquote(url.split("uddg=")[-1]) if "uddg=" in url else url
                results.append({
                    "source":  "DuckDuckGo",
                    "title":   title.strip()[:120],
                    "snippet": snippet.strip()[:500],
                    "url":     clean_url,
                })
            tiers_tried.append("ddg_html")
            logger.info("web_search DDG HTML scrape: %d results", len(snippets))
        except Exception as e:
            logger.warning("web_search DDG HTML failed: %s", e)

    # ── Tier 3: DuckDuckGo Instant Answer ────────────────────────────────
    if len(results) < 2:
        try:
            ddg_url = (
                f"https://api.duckduckgo.com/?q={urllib.parse.quote(query)}"
                f"&format=json&no_redirect=1&no_html=1&skip_disambig=1"
            )
            req = urllib.request.Request(ddg_url, headers={"User-Agent": "newsconseen-copilot/1.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = _json.loads(resp.read().decode())

            if data.get("Abstract"):
                results.insert(0, {
                    "source":  data.get("AbstractSource", "DuckDuckGo"),
                    "title":   data.get("Heading", query),
                    "snippet": data["Abstract"][:600],
                    "url":     data.get("AbstractURL", ""),
                })
            for topic in data.get("RelatedTopics", [])[:max_results - len(results)]:
                text = topic.get("Text", "")
                if text:
                    results.append({
                        "source":  "DuckDuckGo",
                        "title":   text[:80],
                        "snippet": text[:400],
                        "url":     topic.get("FirstURL", ""),
                    })
            tiers_tried.append("ddg_instant")
        except Exception as e:
            logger.warning("web_search DDG Instant failed: %s", e)

    # ── Tier 4: Wikipedia REST API ────────────────────────────────────────
    if len(results) < 1:
        try:
            # Try exact title first, then search endpoint
            for attempt_query in [query, query.split()[0]]:
                wiki_url = (
                    f"https://en.wikipedia.org/api/rest_v1/page/summary/"
                    f"{urllib.parse.quote(attempt_query.replace(' ', '_'))}"
                )
                req = urllib.request.Request(wiki_url, headers={"User-Agent": "newsconseen-copilot/1.0"})
                try:
                    with urllib.request.urlopen(req, timeout=6) as resp:
                        wiki = _json.loads(resp.read().decode())
                    if wiki.get("extract"):
                        results.insert(0, {
                            "source":  "Wikipedia",
                            "title":   wiki.get("title", query),
                            "snippet": wiki["extract"][:800],
                            "url":     wiki.get("content_urls", {}).get("desktop", {}).get("page", ""),
                        })
                        break
                except Exception:
                    continue
            tiers_tried.append("wikipedia")
        except Exception as e:
            logger.warning("web_search Wikipedia failed: %s", e)

    # ── Tier 5: Always-present synthesised fallback ───────────────────────
    if not results:
        results.append({
            "source":  "fallback",
            "title":   f"No live web results for: {query}",
            "snippet": (
                f"Web search could not retrieve live results for '{query}'. "
                "This may be a network issue on the server. "
                "Please answer using your training knowledge, clearly noting "
                "that this is from your training data and not a live source."
            ),
            "url": "",
        })

    logger.info("web_search: %d results for '%s' (tiers: %s)", len(results), query[:60], tiers_tried)
    return {
        "query":       query,
        "results":     results[:max_results],
        "count":       len(results[:max_results]),
        "tiers_tried": tiers_tried,
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

    # ── World Bank indicators (expanded — global coverage) ───────────────
    elif dataset == "world_bank":
        try:
            INDICATORS = {
                # Economy
                "gdp":                        "NY.GDP.MKTP.CD",
                "gdp per capita":             "NY.GDP.PCAP.CD",
                "gdp growth":                 "NY.GDP.MKTP.KD.ZG",
                "gni":                        "NY.GNP.MKTP.CD",
                "income":                     "NY.GNP.PCAP.CD",
                "inflation":                  "FP.CPI.TOTL.ZG",
                "poverty":                    "SI.POV.DDAY",
                "unemployment":               "SL.UEM.TOTL.ZS",
                "trade":                      "NE.TRD.GNFS.ZS",
                "foreign investment":         "BX.KLT.DINV.WD.GD.ZS",
                # Health
                "health spending":            "SH.XPD.CHEX.PC.CD",
                "health expenditure":         "SH.XPD.CHEX.GD.ZS",
                "hospital beds":              "SH.MED.BEDS.ZS",
                "physicians":                 "SH.MED.PHYS.ZS",
                "pharmacists":                "SH.MED.PHYS.ZS",
                "life expectancy":            "SP.DYN.LE00.IN",
                "infant mortality":           "SP.DYN.IMRT.IN",
                "maternal mortality":         "SH.STA.MMRT",
                "hiv":                        "SH.DYN.AIDS.ZS",
                "malaria":                    "SH.MLR.INCD.P3",
                # Education
                "education spending":         "SE.XPD.TOTL.GD.ZS",
                "literacy":                   "SE.ADT.LITR.ZS",
                "school enrollment":          "SE.PRM.ENRR",
                "secondary enrollment":       "SE.SEC.ENRR",
                "tertiary enrollment":        "SE.TER.ENRR",
                # Population & demographics
                "population":                 "SP.POP.TOTL",
                "population growth":          "SP.POP.GROW",
                "urban population":           "SP.URB.TOTL.IN.ZS",
                "rural population":           "SP.RUR.TOTL.ZS",
                "youth unemployment":         "SL.UEM.1524.ZS",
                # Agriculture
                "agriculture":                "NV.AGR.TOTL.ZS",
                "food security":              "SN.ITK.DEFC.ZS",
                "arable land":                "AG.LND.ARBL.ZS",
                # Infrastructure
                "electricity access":         "EG.ELC.ACCS.ZS",
                "internet users":             "IT.NET.USER.ZS",
                "mobile subscriptions":       "IT.CEL.SETS.P2",
                "roads":                      "IS.ROD.PAVE.ZS",
                # Environment
                "co2 emissions":              "EN.ATM.CO2E.PC",
                "forest area":                "AG.LND.FRST.ZS",
                "renewable energy":           "EG.FEC.RNEW.ZS",
            }
            q_lower  = query.lower()
            indicator = next((v for k, v in INDICATORS.items() if k in q_lower), "NY.GDP.MKTP.CD")
            indicator_name = next((k for k, v in INDICATORS.items() if v == indicator), indicator)

            # Resolve country code — accept full name ("Rwanda") or ISO2 ("RW")
            country = "WLD"   # default: world aggregate
            if location:
                loc = location.strip()
                if len(loc) == 2:
                    country = loc.upper()
                elif len(loc) == 3:
                    country = loc.upper()
                else:
                    # Try World Bank country search
                    try:
                        search_url = f"https://api.worldbank.org/v2/country?format=json&per_page=300"
                        req = urllib.request.Request(search_url, headers={"User-Agent": "newsconseen-copilot/1.0"})
                        with urllib.request.urlopen(req, timeout=6) as r:
                            cdata = _json.loads(r.read().decode())
                        loc_lower = loc.lower()
                        match = next(
                            (c["id"] for c in (cdata[1] or []) if loc_lower in c.get("name", "").lower()),
                            None
                        )
                        if match:
                            country = match
                    except Exception:
                        country = loc[:2].upper()

            url = (
                f"https://api.worldbank.org/v2/country/{country}"
                f"/indicator/{indicator}?format=json&mrv=5&per_page=5"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "newsconseen-copilot/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw = _json.loads(resp.read().decode())
            data = [
                {"year": r["date"], "value": r["value"], "country": r["country"]["value"]}
                for r in (raw[1] or []) if r.get("value") is not None
            ]
            return {
                "dataset":        "world_bank",
                "indicator":      indicator,
                "indicator_name": indicator_name,
                "query":          query,
                "country":        country,
                "data":           data[:5],
                "note":           "Source: World Bank Open Data (api.worldbank.org)",
            }
        except Exception as e:
            logger.warning("search_public_data world_bank failed: %s", e)
            return {"dataset": "world_bank", "error": str(e), "data": [], "note": "World Bank API unavailable — try again later"}

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

    # ── CMS pharmacy providers ────────────────────────────────────────────
    elif dataset == "cms_pharmacy":
        try:
            from connectors.public_data.cms_medicare import CMSMedicareConnector
            state = (location or query or "")[:2].upper() or "ME"
            conn  = CMSMedicareConnector()
            df    = conn.get_pharmacy_providers(state=state, limit=100)
            if df.empty:
                return {"dataset": "cms_pharmacy", "state": state, "data": [], "note": "No CMS pharmacy data found for this state"}
            return {
                "dataset": "cms_pharmacy",
                "state":   state,
                "count":   len(df),
                "data":    df.head(20).to_dict(orient="records"),
                "note":    "Source: CMS Provider of Services — certified pharmacy locations",
            }
        except Exception as e:
            logger.warning("search_public_data cms_pharmacy failed: %s", e)
            return {"dataset": "cms_pharmacy", "error": str(e), "data": []}

    # ── State pharmacy license data ───────────────────────────────────────
    elif dataset == "state_pharmacy":
        try:
            from connectors.public_data.state_pharmacy import StatePharmacyConnector
            state = (location or query or "")[:2].upper() or "ME"
            conn  = StatePharmacyConnector()
            summary = conn.get_license_summary(state=state)
            return {
                "dataset": "state_pharmacy",
                "state":   state,
                "summary": summary,
                "note":    "Source: State Pharmacy Board / NABP / CMS NPPES",
            }
        except Exception as e:
            logger.warning("search_public_data state_pharmacy failed: %s", e)
            return {"dataset": "state_pharmacy", "error": str(e), "data": []}

    # ── DEA/NPPES pharmacy count ──────────────────────────────────────────
    elif dataset == "dea_pharmacy":
        try:
            from connectors.public_data.dea_registrant import DEARegistrantConnector
            state = (location or query or "")[:2].upper() or "ME"
            conn  = DEARegistrantConnector()
            df    = conn.get_pharmacy_count_by_city(state=state)
            return {
                "dataset": "dea_pharmacy",
                "state":   state,
                "count":   len(df),
                "data":    df.head(20).to_dict(orient="records"),
                "note":    "Source: DEA/NPPES NPI Registry — pharmacy count by city",
            }
        except Exception as e:
            logger.warning("search_public_data dea_pharmacy failed: %s", e)
            return {"dataset": "dea_pharmacy", "error": str(e), "data": []}

    # ── FX rates — Open Exchange Rates / fallback to European Central Bank ──
    elif dataset == "fx_rates":
        import os as _os
        try:
            base_currency = (query or "USD").upper()[:3]
            oxr_key = _os.getenv("OPEN_EXCHANGE_RATES_KEY", "")
            if oxr_key:
                url = f"https://openexchangerates.org/api/latest.json?app_id={oxr_key}&base={base_currency}"
                req = urllib.request.Request(url, headers={"User-Agent": "newsconseen-copilot/1.0"})
                with urllib.request.urlopen(req, timeout=8) as resp:
                    raw = _json.loads(resp.read().decode())
                rates = raw.get("rates", {})
                # Filter to commonly-used currencies for SMEs
                target = ["USD","EUR","GBP","KES","NGN","GHS","RWF","UGX",
                          "TZS","ZAR","INR","CAD","AUD","JPY","CNY","MXN",
                          "BRL","PKR","BDT","PHP","MMK","ETB","XOF","XAF"]
                filtered = {k: rates[k] for k in target if k in rates}
                return {
                    "dataset":         "fx_rates",
                    "base":            base_currency,
                    "rates":           filtered,
                    "timestamp":       raw.get("timestamp"),
                    "note":            "Source: Open Exchange Rates (live)",
                }
            else:
                # ECB free fallback — always EUR base
                ecb_url = "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?format=jsondata&lastNObservations=1"
                req = urllib.request.Request(ecb_url, headers={"User-Agent": "newsconseen-copilot/1.0"})
                with urllib.request.urlopen(req, timeout=8) as resp:
                    raw = _json.loads(resp.read().decode())
                series = raw.get("dataSets", [{}])[0].get("series", {})
                structure = raw.get("structure", {}).get("dimensions", {}).get("series", [])
                currency_dim = next((d for d in structure if d.get("id") == "CURRENCY"), None)
                currencies = [v.get("id") for v in (currency_dim or {}).get("values", [])]
                rates = {}
                for i, (key, val) in enumerate(series.items()):
                    obs = val.get("observations", {})
                    if obs:
                        rate_val = list(obs.values())[0][0]
                        if i < len(currencies) and rate_val:
                            rates[currencies[i]] = round(rate_val, 6)
                return {
                    "dataset": "fx_rates",
                    "base":    "EUR",
                    "rates":   rates,
                    "note":    "Source: European Central Bank (ECB) — base currency EUR. Set OPEN_EXCHANGE_RATES_KEY for any base currency.",
                }
        except Exception as e:
            logger.warning("search_public_data fx_rates failed: %s", e)
            return {
                "dataset": "fx_rates",
                "error":   str(e),
                "note":    "FX rate API unavailable. Set OPEN_EXCHANGE_RATES_KEY in Railway env vars for reliable rates.",
                "data":    [],
            }

    # ── UN Data — development indicators (global, no key required) ────────
    elif dataset == "un_data":
        try:
            # UN Data REST API — returns CSV-like JSON
            # Indicator IDs: 49 = GDP, 530 = Life Expectancy, 568 = Literacy rate
            UN_INDICATORS = {
                "gdp":              "49",
                "life expectancy":  "530",
                "literacy":         "568",
                "hdi":              "137506",
                "population":       "45",
                "fertility":        "54",
                "infant mortality": "22",
                "education":        "568",
            }
            q_lower   = query.lower()
            indicator_id = next((v for k, v in UN_INDICATORS.items() if k in q_lower), "49")
            country_filter = (location or "").strip()
            url = (
                f"https://data.un.org/ws/rest/data/DF_UNData_WDI,{indicator_id}/"
                f"?format=jsondata&startPeriod=2019&endPeriod=2023"
            )
            req = urllib.request.Request(url, headers={"User-Agent": "newsconseen-copilot/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw = _json.loads(resp.read().decode())

            datasets = raw.get("dataSets", [{}])[0].get("series", {})
            structure = raw.get("structure", {})
            obs_list = []
            for key, val in list(datasets.items())[:20]:
                for period, obs in val.get("observations", {}).items():
                    obs_list.append({"series_key": key, "period": period, "value": obs[0] if obs else None})

            return {
                "dataset":      "un_data",
                "indicator_id": indicator_id,
                "query":        query,
                "location":     country_filter or "global",
                "data":         obs_list[:10],
                "note":         "Source: UN Data REST API (data.un.org)",
            }
        except Exception as e:
            logger.warning("search_public_data un_data failed: %s", e)
            # Graceful fallback — return world_bank instead
            logger.info("search_public_data un_data: falling back to world_bank")
            return search_public_data(
                dataset="world_bank", query=query,
                company_id=company_id, location=location
            )

    return {"error": f"Unknown dataset: {dataset}. Use: us_census, world_bank, open_fda, osm_count, fx_rates, un_data, cms_pharmacy, state_pharmacy, dea_pharmacy"}


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
        "name": "get_monthly_kpis",
        "description": "Get month-by-month revenue, expense, net income, new people joined, and task metrics for a time period. Use for trend questions, time-series charts, period comparisons. Use for 'revenue trend', 'monthly performance', 'how has income changed', 'headcount growth', 'show me the last 6 months'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "months": {
                    "type": "integer",
                    "description": "Number of months to return (1–24). Default 12.",
                },
            },
        },
    },
    {
        "name": "get_entity_list",
        "description": "Get a named list of individual people — not aggregate counts. Use when the question asks 'who', 'which person', or wants to name specific individuals. Use for 'list our active clients', 'who are the longest-tenured staff', 'which people joined this month', 'who became inactive recently', 'name the high-risk clients'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "entity_type": {
                    "type": "string",
                    "enum": ["staff", "client", "contact", "volunteer"],
                    "description": "Filter by canonical person type. Leave null for all types.",
                },
                "status": {
                    "type": "string",
                    "description": "Filter by status — e.g. 'active', 'inactive'. Leave null for all.",
                },
                "top_n": {
                    "type": "integer",
                    "description": "Maximum number of people to return (1–100). Default 20.",
                },
            },
        },
    },
    {
        "name": "get_company_scorecard",
        "description": "Get a single-row operational health summary covering people, enterprises, finance (last 30 days), tasks, and inventory in one call. Use as the first tool for overview questions. Use for 'how are we doing', 'give me an overview', 'operational health', 'key metrics', 'business summary', 'what needs attention'.",
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
        "name": "get_relationship_summary",
        "description": "Get a count and breakdown of all Relationship records — how many assignments exist, by type (person→enterprise, item→person, etc.) and status (active/ended). Use for 'who is connected to X', 'how many relationships', 'active assignments', 'network connections'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "relationship_type": {
                    "type": "string",
                    "enum": ["person_enterprise", "person_person", "enterprise_enterprise",
                             "item_enterprise", "item_person", "person_service",
                             "enterprise_service", "person_address", "enterprise_address"],
                    "description": "Filter to a specific relationship type. Leave null for all types.",
                },
            },
        },
    },
    {
        "name": "get_address_overview",
        "description": "Get a geographic breakdown of all Address records — total count, countries, states, top cities. Use for 'how many addresses', 'where are our locations', 'geographic spread', 'address coverage'.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_service_overview",
        "description": "Get a summary of the service catalogue — types, active count, pricing range. Use for 'what services do we offer', 'service catalogue', 'how many services', 'service pricing'.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "web_search",
        "description": (
            "Multi-tier web search for market intelligence, industry news, competitor information, "
            "regulations, or any public knowledge. Use this when the user asks about: "
            "industry trends, market conditions, specific companies, public statistics, "
            "regulations, best practices, or any topic beyond the organisation's own data. "
            "Uses Brave Search (if configured) → DuckDuckGo HTML → DuckDuckGo Instant → Wikipedia. "
            "Always returns something — never empty."
        ),
        "input_schema": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Be specific — e.g. 'home healthcare market size Kenya 2024' not just 'healthcare'.",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Max results to return. Default 5.",
                },
            },
        },
    },
    {
        "name": "search_records_semantically",
        "description": (
            "Semantic similarity search across all indexed entity records. "
            "Use this for: finding people/enterprises/products similar to a description, "
            "detecting potential duplicates, or answering questions like "
            "'find all clients similar to John Smith' or 'show me records about expired medications'. "
            "Returns records ranked by semantic similarity — understands synonyms and context, "
            "not just keyword matches. Only works if pgvector is set up and records are indexed."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language description of what to find. E.g. 'nurse at Kigali branch', 'overdue school fee payment', 'expired antibiotic'.",
                },
                "entity_type": {
                    "type": "string",
                    "enum": ["people", "enterprises", "products", "transactions", "tasks"],
                    "description": "Which entity type to search within.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 10).",
                },
                "min_similarity": {
                    "type": "number",
                    "description": "Minimum similarity threshold 0–1 (default 0.65). Higher = stricter.",
                },
            },
            "required": ["query", "entity_type"],
        },
    },
    {
        "name": "find_nearby_locations",
        "description": (
            "Spatial proximity search — find branches, clients, staff, or any entity "
            "within a given radius of a point, or find the N nearest to a location. "
            "Use this for questions like: "
            "'Which branches are closest to Nairobi CBD?', "
            "'Find all branches within 5km of this client's address',"
            "'What is the nearest pharmacy to coordinates -1.286, 36.817?', "
            "'Which of our branches cover the Northern region?'. "
            "Requires PostGIS to be set up (POST /postgis/setup) and "
            "geospatial ETL to have run (POST /load/geospatial-summary)."
        ),
        "input_schema": {
            "type": "object",
            "required": ["lat", "lng"],
            "properties": {
                "lat": {
                    "type": "number",
                    "description": "Latitude of the reference point (e.g. -1.286 for Nairobi).",
                },
                "lng": {
                    "type": "number",
                    "description": "Longitude of the reference point (e.g. 36.817 for Nairobi).",
                },
                "radius_meters": {
                    "type": "number",
                    "description": "Search radius in metres (default 5000 = 5km). Use 1000 for city block, 50000 for district.",
                },
                "entity_type": {
                    "type": "string",
                    "description": "Filter by enterprise_type — e.g. 'General Hospital', 'Elementary School', 'Pharmacy Drug Store'. Leave blank for all types.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum results to return (default 10).",
                },
                "nearest_only": {
                    "type": "boolean",
                    "description": "If true, return only the N nearest records regardless of radius (uses KNN). Default false.",
                },
            },
        },
    },
    {
        "name": "search_public_data",
        "description": (
            "Query structured public datasets for market research. Datasets available:\n"
            "- world_bank: Global economic/health/education indicators (GDP, poverty, literacy, life expectancy, etc.) "
            "  for any country. Use location='Rwanda' or location='RW'. Works for ALL countries.\n"
            "- us_census: US state-level demographics and income data.\n"
            "- open_fda: FDA drug/pharmacy data (US healthcare).\n"
            "- osm_count: Count business types in any city/location via OpenStreetMap.\n"
            "- fx_rates: Live currency exchange rates. Use query='USD' for USD base rates. "
            "  Returns KES, NGN, GHS, RWF, ZAR, EUR, GBP, INR and more.\n"
            "- un_data: UN development indicators (HDI, fertility, infant mortality, education).\n"
            "- cms_pharmacy / state_pharmacy / dea_pharmacy: US pharmacy licensing data.\n"
            "For global SME market research always try world_bank first."
        ),
        "input_schema": {
            "type": "object",
            "required": ["dataset", "query"],
            "properties": {
                "dataset": {
                    "type": "string",
                    "enum": ["us_census", "open_fda", "world_bank", "osm_count", "fx_rates", "un_data", "cms_pharmacy", "state_pharmacy", "dea_pharmacy"],
                    "description": "Which dataset to query.",
                },
                "query": {
                    "type": "string",
                    "description": "What to search for — e.g. 'health spending', 'gdp', 'USD', 'literacy rate'.",
                },
                "location": {
                    "type": "string",
                    "description": "Country, state, or city filter. For world_bank/un_data use full country name or ISO code — e.g. 'Rwanda', 'Kenya', 'RW', 'NG', 'US'.",
                },
            },
        },
    },
    {
        "name": "get_workflow_summary",
        "description": (
            "Get an overview of this organisation's workflow automation: how many workflows are active, "
            "how many times they've run recently, success vs error rates, and which workflows run most often. "
            "Use for questions like 'how many automations do we have?', 'what workflows are running?', "
            "'is our automation working?', 'what has the system done automatically?'"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days_back": {
                    "type": "integer",
                    "description": "How many days back to count runs. Default 30.",
                },
            },
        },
    },
    {
        "name": "get_audit_summary",
        "description": (
            "Get a summary of recent data changes (audit trail): who created, updated, or deleted records "
            "and when. Use for questions like 'what changed recently?', 'who deleted X?', 'show me activity "
            "for people records', 'what did the team do this week?'"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days_back": {
                    "type": "integer",
                    "description": "How many days back to look. Default 7.",
                },
                "entity_type": {
                    "type": "string",
                    "enum": ["person", "enterprise", "product", "task", "transaction", "relationship", "address"],
                    "description": "Filter to a specific entity type. Leave blank for all.",
                },
            },
        },
    },
    {
        "name": "get_automation_roi",
        "description": (
            "Calculate the automation ROI — how many tasks were auto-created by workflows, how many alerts were "
            "sent automatically, fields updated, and an estimate of time saved. Use for questions like "
            "'how much time has automation saved us?', 'what has the system done for us?', 'show me automation value'."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    # ── Raw record lookup tools ──────────────────────────────────────────────
    {
        "name": "find_product_records",
        "description": (
            "Search for individual product or item records by name, type, or status. "
            "Returns actual rows — names, stock levels, prices, expiry dates, unit of measure. "
            "Use this for questions like: "
            "'Find paracetamol', 'Show me all medications', 'List active products', "
            "'Which livestock are we tracking?', 'Browse the service catalogue', "
            "'What do we sell?', 'Show physical inventory'. "
            "Use get_product_summary for aggregate stock counts; use this to browse actual items."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Partial or full product name to search (case-insensitive).",
                },
                "item_type": {
                    "type": "string",
                    "enum": ["physical", "living", "digital", "service_package", "financial_instrument"],
                    "description": "Filter by item type.",
                },
                "status": {
                    "type": "string",
                    "description": "Filter by status (e.g. 'active', 'inactive', 'discontinued').",
                },
                "low_stock_only": {
                    "type": "boolean",
                    "description": "If true, return only items at or below reorder level. Default false.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max records to return. Default 20.",
                },
            },
        },
    },
    {
        "name": "find_address_records",
        "description": (
            "Search for individual address records by city, type, or linked entity. "
            "Returns actual rows — street, city, country, GPS coordinates, linked entity name. "
            "Use this for questions like: "
            "'Where is Branch X located?', 'Show all addresses in Nairobi', "
            "'List our delivery addresses', 'What is the address for Enterprise Y?', "
            "'Which branches are in Lagos?', 'Find the postal address for Person Z'. "
            "Use get_address_overview for geographic counts; use this for actual addresses."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "city": {
                    "type": "string",
                    "description": "City to filter by (partial match).",
                },
                "address_type": {
                    "type": "string",
                    "description": "Filter by address type (e.g. 'physical', 'postal', 'delivery', 'billing').",
                },
                "entity_name": {
                    "type": "string",
                    "description": "Filter by linked enterprise, person, or label name (partial match).",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max records to return. Default 20.",
                },
            },
        },
    },
    {
        "name": "get_entity_join",
        "description": (
            "Fetch records from two entities and join them — answering cross-entity questions "
            "in a single call instead of requiring multiple lookups. "
            "Use this for questions like: "
            "'Show me all people at Branch X with their overdue tasks', "
            "'Which staff have open transactions?', "
            "'List all relationships for people at Enterprise Y', "
            "'Show clients at this branch with unpaid invoices', "
            "'Which enterprises have pending tasks this week?'. "
            "Supported pairs: people+tasks, people+transactions, people+relationships, "
            "enterprises+people, enterprises+tasks, enterprises+transactions."
        ),
        "input_schema": {
            "type": "object",
            "required": ["primary_entity", "secondary_entity"],
            "properties": {
                "primary_entity": {
                    "type": "string",
                    "enum": ["people", "enterprises"],
                    "description": "The primary (left-side) entity to join from.",
                },
                "secondary_entity": {
                    "type": "string",
                    "enum": ["tasks", "transactions", "people", "relationships"],
                    "description": "The secondary (right-side) entity to join to.",
                },
                "primary_filter": {
                    "type": "string",
                    "description": "Filter the primary entity by name (e.g. enterprise name 'Branch X', person name 'John'). Partial match.",
                },
                "secondary_status_filter": {
                    "type": "string",
                    "description": "Filter the secondary entity by status (e.g. 'pending', 'unpaid', 'active').",
                },
                "secondary_overdue_only": {
                    "type": "boolean",
                    "description": "For tasks: only include overdue tasks. Default false.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max merged records to return. Default 30.",
                },
            },
        },
    },
    {
        "name": "request_action",
        "description": (
            "Request that the system take an action — create a task, update a record, "
            "flag something, send a message, or create a transaction. "
            "Low-risk actions (create_task, flag_record, update_task_status) execute immediately. "
            "Higher-risk actions (update_record, create_transaction, send_client_message) "
            "go to the pending approvals queue for the operator to review in the Agents panel. "
            "Use this when the operator says: "
            "'Create a follow-up task for John', 'Flag this client as high-risk', "
            "'Mark task X as completed', 'Create an invoice for ABC Corp for $500', "
            "'Send a reminder to this client', 'Update this record'. "
            "Always tell the operator what action you are requesting and what its risk level is."
        ),
        "input_schema": {
            "type": "object",
            "required": ["action_type", "entity", "label"],
            "properties": {
                "action_type": {
                    "type": "string",
                    "enum": [
                        "create_task", "create_follow_up", "update_task_status",
                        "flag_record", "update_record", "reassign_task",
                        "create_transaction", "send_client_message",
                        "send_email", "internal_alert",
                    ],
                    "description": "The type of action to perform.",
                },
                "entity": {
                    "type": "string",
                    "enum": ["people", "enterprises", "products", "tasks", "transactions", "relationships", "addresses"],
                    "description": "Which entity type this action affects.",
                },
                "label": {
                    "type": "string",
                    "description": "Human-readable description of the action, e.g. 'Create follow-up visit for John Mwangi'.",
                },
                "record_id": {
                    "type": "string",
                    "description": "ID of the specific record to act on (required for update/flag/status-change actions).",
                },
                "changes": {
                    "type": "object",
                    "description": "Fields to set on the record, e.g. {\"status\": \"completed\"} or {\"title\": \"Follow-up visit\", \"due_date\": \"2026-04-20\"}.",
                },
                "reasoning": {
                    "type": "string",
                    "description": "Why this action is being requested — shown to operator in the approval panel.",
                },
            },
        },
    },
    {
        "name": "save_copilot_memory",
        "description": (
            "Persist a memory entry that will be available in ALL future conversations with this operator. "
            "Use this when the operator states a preference, standing instruction, background context, "
            "or important fact about their organisation that you should always remember. "
            "Use for things like: "
            "'Remember that we call our clients patients', "
            "'Always show amounts in KES not USD', "
            "'Our fiscal year starts in July', "
            "'The main branch is Westlands, not Headquarters', "
            "'This is a school — students are our clients'. "
            "Do NOT save transient facts (today's numbers, one-off answers). "
            "Only save things the operator explicitly asks you to remember, "
            "or that are clearly durable preferences they will want applied every time."
        ),
        "input_schema": {
            "type": "object",
            "required": ["key", "value"],
            "properties": {
                "key": {
                    "type": "string",
                    "description": "Short identifier for this memory, e.g. 'client_terminology', 'currency_preference', 'fiscal_year_start'.",
                },
                "value": {
                    "type": "string",
                    "description": "The memory content to store.",
                },
                "memory_type": {
                    "type": "string",
                    "enum": ["preference", "context", "instruction", "note"],
                    "description": "Category: preference (display/format), context (background fact), instruction (standing rule), note (general).",
                },
            },
        },
    },
    {
        "name": "find_people_records",
        "description": (
            "Search for individual people records by name, type, status, or linked enterprise. "
            "Returns actual rows with names, contact details, type, status, and enterprise. "
            "Use this for questions like: "
            "'Find John Doe', 'Is Mary still active?', 'Show me all active nurses', "
            "'Which students are inactive?', 'Staff at Branch X', "
            "'List all volunteers', 'Who are our contractors?'. "
            "Use get_people_summary for aggregate counts; use this tool for actual names and records."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Partial or full name to search (case-insensitive). Leave blank to return all.",
                },
                "person_type": {
                    "type": "string",
                    "enum": ["staff", "client", "contact", "volunteer"],
                    "description": "Filter by person type.",
                },
                "status": {
                    "type": "string",
                    "enum": ["active", "inactive", "on_leave"],
                    "description": "Filter by status.",
                },
                "enterprise_name": {
                    "type": "string",
                    "description": "Filter to people linked to this enterprise (partial match).",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max records to return. Default 20.",
                },
            },
        },
    },
    {
        "name": "find_task_records",
        "description": (
            "Search for individual task records by assignee, type, status, or overdue state. "
            "Returns actual rows with titles, assignees, due dates, and outcomes. "
            "Use this for questions like: "
            "'What tasks are assigned to Mary?', 'Show me overdue tasks', "
            "'Which visits were missed this week?', 'Pending tasks for Branch X', "
            "'What did we complete yesterday?', 'Show all high-priority tasks'. "
            "Use get_task_summary for aggregate counts; use this tool for actual task details."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "assignee_name": {
                    "type": "string",
                    "description": "Filter to tasks assigned to this person (partial match).",
                },
                "task_type": {
                    "type": "string",
                    "description": "Filter by task type (partial match, e.g. 'visit', 'delivery', 'inspection').",
                },
                "status": {
                    "type": "string",
                    "description": "Filter by status (e.g. 'pending', 'in_progress', 'completed', 'overdue').",
                },
                "overdue_only": {
                    "type": "boolean",
                    "description": "If true, return only tasks past their due date and not completed. Default false.",
                },
                "days_back": {
                    "type": "integer",
                    "description": "Limit to tasks created within this many days. Default: no limit.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max records to return. Default 20.",
                },
            },
        },
    },
    {
        "name": "find_transaction_records",
        "description": (
            "Search for individual transaction records by counterparty, type, payment status, or amount. "
            "Returns actual rows — amounts, dates, counterparties, payment status. "
            "Note: raw transactions include ALL statuses (draft, posted, voided). "
            "Use this for questions like: "
            "'Show me invoices for ABC Corp', 'Unpaid transactions over $500', "
            "'Recent payments from John', 'All draft invoices', "
            "'What has Client X paid?', 'Show me the largest transactions this month'. "
            "Use get_transaction_summary for aggregate revenue; use this tool for actual invoice/payment details."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "counterparty_name": {
                    "type": "string",
                    "description": "Filter by counterparty/client/vendor name (partial match).",
                },
                "transaction_type": {
                    "type": "string",
                    "description": "Filter by transaction type (e.g. 'invoice', 'payment', 'expense', 'payroll').",
                },
                "payment_status": {
                    "type": "string",
                    "description": "Filter by payment status (e.g. 'unpaid', 'paid', 'partial', 'overdue').",
                },
                "min_amount": {
                    "type": "number",
                    "description": "Only return transactions at or above this amount.",
                },
                "days_back": {
                    "type": "integer",
                    "description": "Limit to transactions in the last N days.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max records to return. Default 20.",
                },
            },
        },
    },
    {
        "name": "inspect_raw_record",
        "description": (
            "Fetch the complete record for a single entity by its ID. "
            "Use this as a drill-down after another tool returns a record ID — "
            "e.g. after find_task_records returns a list, call this to get the full detail for one task. "
            "Use for questions like: "
            "'Tell me more about task abc123', 'Show full details for person xyz', "
            "'What does that transaction record contain?', 'Get the full product record for id 456'."
        ),
        "input_schema": {
            "type": "object",
            "required": ["entity", "record_id"],
            "properties": {
                "entity": {
                    "type": "string",
                    "enum": ["people", "enterprises", "products", "tasks", "transactions", "relationships", "addresses"],
                    "description": "Which entity table to look up.",
                },
                "record_id": {
                    "type": "string",
                    "description": "The ID of the record to fetch.",
                },
            },
        },
    },
    {
        "name": "find_relationship_records",
        "description": (
            "Search for individual relationship records — who is connected to whom. "
            "Returns actual rows with person names, enterprise names, roles, and dates. "
            "Use this for questions like: "
            "'Who works at Branch X?', 'What relationships does John have?', "
            "'Show all employment relationships', 'Which staff are assigned to Enterprise Z?', "
            "'What items does Person Y hold?', 'Who manages this location?', "
            "'Show me active enrollments at School A'. "
            "Use get_relationship_summary for aggregate counts; use this tool for actual assignments."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "person_name": {
                    "type": "string",
                    "description": "Filter by person name (partial match).",
                },
                "enterprise_name": {
                    "type": "string",
                    "description": "Filter by enterprise/organisation name (partial match).",
                },
                "relationship_type": {
                    "type": "string",
                    "description": "Filter by relationship type (e.g. 'employment', 'enrollment', 'person_enterprise', 'item_custody').",
                },
                "status": {
                    "type": "string",
                    "enum": ["active", "ended", "archived"],
                    "description": "Filter by relationship status.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max records to return. Default 20.",
                },
            },
        },
    },
    {
        "name": "get_product_at_risk",
        "description": (
            "Returns specific product names and quantities that are at risk: "
            "stock at or below reorder level, out of stock, or expiring soon. "
            "Use this for questions like: "
            "'What items are low stock?', 'What's about to expire?', "
            "'Which products should we reorder?', 'Show me stock alerts', "
            "'What inventory is at risk?', 'Products expiring this month'. "
            "Returns individual item names, quantities, reorder levels, and expiry dates — "
            "not just aggregate counts."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days_to_expiry": {
                    "type": "integer",
                    "description": "Expiry window in days. Items expiring within this many days are flagged. Default 30.",
                },
                "top_n": {
                    "type": "integer",
                    "description": "Maximum number of at-risk items to return. Default 20.",
                },
            },
        },
    },
    {
        "name": "get_operational_trends",
        "description": (
            "Returns month-by-month operational trends across tasks and people: "
            "task completion rate %, headcount, and headcount changes. "
            "Use this for questions like: "
            "'How are we trending over the last 6 months?', "
            "'Show me task completion rate by month', "
            "'How has headcount changed?', "
            "'Are we improving?', 'Operational performance over time', "
            "'How many people did we add last quarter?'"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "months": {
                    "type": "integer",
                    "description": "How many months of history to return. Default 6, max 24.",
                },
            },
        },
    },
    {
        "name": "get_top_debtors",
        "description": (
            "Returns the names of counterparties with the highest outstanding amounts — "
            "unpaid or partially paid invoices and receivables. "
            "Use this for questions like: "
            "'Who owes us money?', 'Top debtors', 'Outstanding balances', "
            "'Who hasn't paid?', 'Largest unpaid invoices', "
            "'Collections priority list', 'Accounts receivable breakdown'. "
            "Returns individual names, total outstanding, invoice count, and oldest due date."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "top_n": {
                    "type": "integer",
                    "description": "How many debtors to return, ranked by outstanding amount. Default 10.",
                },
            },
        },
    },
]


# ── PostGIS spatial search tool ──────────────────────────────────────────────

def _find_nearby_locations(
    lat: float,
    lng: float,
    company_id: str,
    radius_meters: float = 5000,
    entity_type: Optional[str] = None,
    limit: int = 10,
    nearest_only: bool = False,
) -> dict:
    """
    Copilot-callable wrapper for PostGIS proximity queries.
    Returns results in the same structure as other copilot tools.
    """
    try:
        from database import get_engine_safe
        engine = get_engine_safe()
        if not engine:
            return {"error": "No database connection — PostGIS unavailable"}

        if nearest_only:
            from postgis.queries import find_nearest
            results = find_nearest(
                engine=engine,
                lat=lat,
                lng=lng,
                company_id=company_id,
                entity_type=entity_type,
                limit=limit,
            )
            note = f"Nearest {limit} records to ({lat}, {lng})."
        else:
            from postgis.queries import find_nearby
            results = find_nearby(
                engine=engine,
                lat=lat,
                lng=lng,
                radius_meters=radius_meters,
                company_id=company_id,
                entity_type=entity_type,
                limit=limit,
            )
            note = f"{len(results)} records within {radius_meters}m of ({lat}, {lng})."

        if not results:
            return {
                "lat": lat, "lng": lng,
                "radius_meters": radius_meters,
                "data": [],
                "note": (
                    "No records found in this area. "
                    "PostGIS may not be set up yet (run POST /postgis/setup), "
                    "or the geospatial ETL has not run (POST /load/geospatial-summary)."
                ),
            }

        return {
            "lat": lat, "lng": lng,
            "radius_meters": radius_meters,
            "entity_type": entity_type or "all",
            "count": len(results),
            "data":  results,
            "note":  note,
        }
    except Exception as e:
        return {
            "error": f"Spatial search unavailable: {e}",
            "note":  "PostGIS may not be set up. Run POST /postgis/setup.",
        }


# ── pgvector semantic search tool ────────────────────────────────────────────

def _search_records_semantically(
    query: str,
    entity_type: str,
    company_id: str,
    limit: int = 10,
    min_similarity: float = 0.65,
) -> dict:
    """
    Copilot-callable wrapper for pgvector semantic search.
    Returns results in the same structure as other copilot tools.
    """
    try:
        from pgvector_ext.searcher import search_similar
        results = search_similar(
            query=query,
            company_id=company_id,
            entity_type=entity_type,
            limit=limit,
            min_similarity=min_similarity,
        )
        if not results:
            return {
                "query":       query,
                "entity_type": entity_type,
                "data":        [],
                "note":        (
                    "No semantically similar records found. "
                    "This may mean pgvector is not set up yet "
                    "(run POST /pgvector/setup then POST /pgvector/index/all), "
                    "or no records match the query at this similarity threshold."
                ),
            }
        return {
            "query":       query,
            "entity_type": entity_type,
            "count":       len(results),
            "data":        results,
        }
    except Exception as e:
        return {
            "error": f"Semantic search unavailable: {e}",
            "note":  "pgvector may not be set up. Run POST /pgvector/setup.",
        }


# ── Automation-aware tools ────────────────────────────────────────────────────

def get_workflow_summary(company_id: str, days_back: int = 30) -> dict:
    """
    Return active workflows, recent run counts, and top-performing workflows.
    Falls back to in-memory store if called directly.
    """
    try:
        from workflows.routes import _WORKFLOWS, _RUN_LOG
        from datetime import datetime, timezone, timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)
        wfs    = [w for w in _WORKFLOWS.values() if w.get("company_id") == company_id]
        recent_runs = [
            r for r in _RUN_LOG
            if r.get("company_id") == company_id
            and r.get("started_at", "") >= cutoff.isoformat()
        ]

        total_active = sum(1 for w in wfs if w.get("is_active"))
        by_trigger   = {}
        for w in wfs:
            t = w.get("trigger", {}).get("type", "unknown")
            by_trigger[t] = by_trigger.get(t, 0) + 1

        # Per-workflow run counts
        run_counts: dict = {}
        for r in recent_runs:
            wid = r.get("workflow_id", "?")
            run_counts[wid] = run_counts.get(wid, 0) + 1

        top_workflows = sorted(
            [{"id": w["id"], "name": w["name"], "runs": run_counts.get(w["id"], 0),
              "is_active": w.get("is_active"), "trigger": w.get("trigger", {}).get("type")}
             for w in wfs],
            key=lambda x: x["runs"], reverse=True
        )[:5]

        completed = sum(1 for r in recent_runs if r.get("status") in ("completed", "completed_with_errors"))
        errors    = sum(1 for r in recent_runs if r.get("status") == "error")

        return {
            "total_workflows":  len(wfs),
            "active_workflows": total_active,
            "by_trigger_type":  by_trigger,
            "total_runs":       len(recent_runs),
            "completed_runs":   completed,
            "error_runs":       errors,
            "top_workflows":    top_workflows,
            "period_days":      days_back,
        }
    except Exception as e:
        return {"error": str(e), "total_workflows": 0, "total_runs": 0}


def get_audit_summary(company_id: str, days_back: int = 7, entity_type: Optional[str] = None) -> dict:
    """
    Return recent audit log entries — who changed what and when.
    Falls back to the in-memory audit log.
    """
    try:
        from audit.routes import _AUDIT_LOG
        from datetime import datetime, timezone, timedelta

        cutoff  = datetime.now(timezone.utc) - timedelta(days=days_back)
        entries = [
            e for e in _AUDIT_LOG
            if e.get("company_id") == company_id
            and e.get("timestamp", "") >= cutoff.isoformat()
            and (not entity_type or e.get("entity_type") == entity_type)
        ]

        by_action: dict = {}
        by_entity: dict = {}
        by_user:   dict = {}
        for e in entries:
            by_action[e.get("action", "?")] = by_action.get(e.get("action", "?"), 0) + 1
            by_entity[e.get("entity_type", "?")] = by_entity.get(e.get("entity_type", "?"), 0) + 1
            u = (e.get("changed_by") or "unknown").split("@")[0]
            by_user[u] = by_user.get(u, 0) + 1

        recent = sorted(entries, key=lambda x: x.get("timestamp", ""), reverse=True)[:10]

        return {
            "total_changes":  len(entries),
            "period_days":    days_back,
            "by_action":      by_action,
            "by_entity_type": by_entity,
            "by_user":        by_user,
            "recent_entries": [
                {
                    "entity": e.get("entity_name") or e.get("entity_id"),
                    "type":   e.get("entity_type"),
                    "action": e.get("action"),
                    "by":     (e.get("changed_by") or "").split("@")[0],
                    "when":   e.get("timestamp", "")[:16],
                }
                for e in recent
            ],
        }
    except Exception as e:
        return {"error": str(e), "total_changes": 0}


def get_automation_roi(company_id: str) -> dict:
    """
    Estimate automation ROI: tasks auto-created, alerts sent, time saved.
    Combines workflow run data with step-level outcome counts.
    """
    try:
        from workflows.routes import _WORKFLOWS, _RUN_LOG

        wf_runs = [r for r in _RUN_LOG if r.get("company_id") == company_id]

        tasks_created  = 0
        alerts_sent    = 0
        fields_updated = 0
        notes_logged   = 0

        for run in wf_runs:
            for step in (run.get("step_results") or []):
                if step.get("status") not in ("ok", "completed"):
                    continue
                t = step.get("type", "")
                if t == "create_task":   tasks_created  += 1
                if t == "send_alert":    alerts_sent    += 1
                if t == "update_field":  fields_updated += 1
                if t == "log_note":      notes_logged   += 1

        # Estimate: task creation = 5 min saved; alert = 2 min; field update = 1 min
        time_saved_min = tasks_created * 5 + alerts_sent * 2 + fields_updated * 1 + notes_logged * 1

        active_wfs = sum(1 for w in _WORKFLOWS.values()
                         if w.get("company_id") == company_id and w.get("is_active"))

        return {
            "active_workflows":   active_wfs,
            "total_runs":         len(wf_runs),
            "tasks_auto_created": tasks_created,
            "alerts_auto_sent":   alerts_sent,
            "fields_auto_updated":fields_updated,
            "notes_auto_logged":  notes_logged,
            "estimated_time_saved_minutes": time_saved_min,
            "estimated_time_saved_hours":   round(time_saved_min / 60, 1),
            "note": "Time estimates: task creation=5min, alert=2min, field update=1min, note=1min.",
        }
    except Exception as e:
        return {"error": str(e)}


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
        "get_monthly_kpis":          get_monthly_kpis,
        "get_entity_list":           get_entity_list,
        "get_company_scorecard":     get_company_scorecard,
        "get_ml_predictions":        get_ml_predictions,
        "get_relationship_summary":  get_relationship_summary,
        "get_address_overview":      get_address_overview,
        "get_service_overview":      get_service_overview,
        # Semantic search — pgvector powered
        "search_records_semantically": _search_records_semantically,
        # Spatial search — PostGIS powered
        "find_nearby_locations":       _find_nearby_locations,
        # Web-grounded tools — company_id injected but not used (public data)
        "web_search":              web_search,
        "search_public_data":      search_public_data,
        # Automation-aware tools — reads in-memory workflow/audit stores
        "get_workflow_summary":    get_workflow_summary,
        "get_audit_summary":       get_audit_summary,
        "get_automation_roi":      get_automation_roi,
        # Operational intelligence tools
        "get_product_at_risk":     get_product_at_risk,
        "get_operational_trends":  get_operational_trends,
        "get_top_debtors":         get_top_debtors,
        # Raw record lookup tools
        "find_people_records":          find_people_records,
        "find_task_records":            find_task_records,
        "find_transaction_records":     find_transaction_records,
        "inspect_raw_record":           inspect_raw_record,
        "find_relationship_records":    find_relationship_records,
        "find_product_records":         find_product_records,
        "find_address_records":         find_address_records,
        # Cross-entity join
        "get_entity_join":              get_entity_join,
        # Write-back through approval gate
        "request_action":               request_action,
        # Persistent memory
        "save_copilot_memory":          save_copilot_memory,
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

    def query_relationship_summary(self, relationship_type: str = None) -> dict:
        return get_relationship_summary(self.company_id, relationship_type)

    def query_address_overview(self) -> dict:
        return get_address_overview(self.company_id)

    def query_service_overview(self) -> dict:
        return get_service_overview(self.company_id)
