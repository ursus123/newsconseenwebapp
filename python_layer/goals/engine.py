# ==============================================================
# Newsconseen — KPI Goal Tracking Engine
# ==============================================================
# Evaluates each company's defined goals against live analytics.
#
# Goals are stored per-company in goals.routes._GOALS.
# Each goal defines:
#   metric     — what to measure (revenue_monthly, task_completion, etc.)
#   target     — the desired value
#   period     — monthly | weekly | annual | rolling_30d
#   direction  — higher_is_better | lower_is_better
#
# After each ETL run, evaluate_goals() reads from PostgreSQL analytics
# tables (with three-tier fallback) and calculates:
#   actual         — current measured value
#   progress_pct   — how far towards the target (0–100+)
#   status         — on_track | at_risk | behind | exceeded
#   pace_needed    — what daily rate is required to hit the target
#   days_remaining — days left in the current period
# ==============================================================

import logging
from datetime import datetime, timezone, date
from calendar import monthrange
from typing import Optional

import pandas as pd

from config import settings, HEADERS
from etl.base import fetch_json_to_df
from database import get_engine_safe

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _days_left_in_month() -> int:
    today = date.today()
    _, last = monthrange(today.year, today.month)
    return last - today.day


def _days_left_in_week() -> int:
    return 6 - date.today().weekday()


def _days_left_in_year() -> int:
    today = date.today()
    return (date(today.year, 12, 31) - today).days


def _days_elapsed_in_month() -> int:
    return date.today().day - 1


def _days_in_month() -> int:
    today = date.today()
    _, last = monthrange(today.year, today.month)
    return last


# ── Metric fetchers ─────────────────────────────────────────────
# Each fetcher returns a single float (the current value) or None.

def _fetch_revenue_monthly(company_id: str) -> Optional[float]:
    """Total posted revenue for the current calendar month."""
    engine = get_engine_safe()
    if engine:
        try:
            from sqlalchemy import text
            today = date.today()
            with engine.connect() as conn:
                row = conn.execute(text("""
                    SELECT COALESCE(SUM(total_amount), 0)
                    FROM analytics.transaction_summary
                    WHERE company_id = :cid
                      AND is_revenue = TRUE
                """), {"cid": company_id}).fetchone()
                if row:
                    return float(row[0] or 0)
        except Exception as e:
            logger.debug("goals: revenue_monthly DB — %s", e)

    # Base44 fallback
    url = getattr(settings, "base44_transactions_url", None)
    if url:
        try:
            df = fetch_json_to_df(url)
            if df.empty: return None
            today = date.today()
            if "company_id" in df.columns:
                df = df[df["company_id"] == company_id]
            if "status" in df.columns:
                df = df[df["status"] == "posted"]
            # Filter to current month
            if "transaction_date" in df.columns:
                df["_d"] = pd.to_datetime(df["transaction_date"], errors="coerce")
                df = df[
                    (df["_d"].dt.year == today.year) &
                    (df["_d"].dt.month == today.month)
                ]
            if "amount" in df.columns:
                return float(pd.to_numeric(df["amount"], errors="coerce").sum())
        except Exception as e:
            logger.debug("goals: revenue_monthly fallback — %s", e)
    return None


def _fetch_task_completion(company_id: str) -> Optional[float]:
    """Task completion rate as a percentage (0–100)."""
    engine = get_engine_safe()
    if engine:
        try:
            from sqlalchemy import text
            with engine.connect() as conn:
                row = conn.execute(text("""
                    SELECT
                        COUNT(*) FILTER (WHERE status = 'completed')::float /
                        NULLIF(COUNT(*), 0) * 100
                    FROM raw.tasks
                    WHERE company_id = :cid
                """), {"cid": company_id}).fetchone()
                if row and row[0] is not None:
                    return float(row[0])
        except Exception as e:
            logger.debug("goals: task_completion DB — %s", e)

    url = getattr(settings, "base44_tasks_url", None)
    if url:
        try:
            df = fetch_json_to_df(url)
            if df.empty: return None
            if "company_id" in df.columns:
                df = df[df["company_id"] == company_id]
            total = len(df)
            if total == 0: return None
            done = len(df[df.get("status", pd.Series()) == "completed"]) if "status" in df.columns else 0
            return round(done / total * 100, 1)
        except Exception as e:
            logger.debug("goals: task_completion fallback — %s", e)
    return None


def _fetch_active_clients(company_id: str) -> Optional[float]:
    """Count of active clients (person_type='client', status='active')."""
    engine = get_engine_safe()
    if engine:
        try:
            from sqlalchemy import text
            with engine.connect() as conn:
                row = conn.execute(text("""
                    SELECT COUNT(*)
                    FROM raw.people
                    WHERE company_id = :cid
                      AND status = 'active'
                      AND person_type IN ('client','patient','student','member','beneficiary')
                """), {"cid": company_id}).fetchone()
                if row:
                    return float(row[0] or 0)
        except Exception as e:
            logger.debug("goals: active_clients DB — %s", e)

    url = getattr(settings, "base44_people_url", None)
    if url:
        try:
            df = fetch_json_to_df(url)
            if df.empty: return None
            if "company_id" in df.columns:
                df = df[df["company_id"] == company_id]
            client_types = {"client", "patient", "student", "member", "beneficiary"}
            if "person_type" in df.columns:
                df = df[df["person_type"].isin(client_types)]
            if "status" in df.columns:
                df = df[df["status"] == "active"]
            return float(len(df))
        except Exception as e:
            logger.debug("goals: active_clients fallback — %s", e)
    return None


def _fetch_active_staff(company_id: str) -> Optional[float]:
    """Count of active staff members."""
    engine = get_engine_safe()
    if engine:
        try:
            from sqlalchemy import text
            with engine.connect() as conn:
                row = conn.execute(text("""
                    SELECT COUNT(*)
                    FROM raw.people
                    WHERE company_id = :cid
                      AND status = 'active'
                      AND person_type = 'staff'
                """), {"cid": company_id}).fetchone()
                if row:
                    return float(row[0] or 0)
        except Exception as e:
            logger.debug("goals: active_staff DB — %s", e)

    url = getattr(settings, "base44_people_url", None)
    if url:
        try:
            df = fetch_json_to_df(url)
            if df.empty: return None
            if "company_id" in df.columns:
                df = df[df["company_id"] == company_id]
            if "person_type" in df.columns:
                df = df[df["person_type"] == "staff"]
            if "status" in df.columns:
                df = df[df["status"] == "active"]
            return float(len(df))
        except Exception as e:
            logger.debug("goals: active_staff fallback — %s", e)
    return None


def _fetch_transactions_monthly(company_id: str) -> Optional[float]:
    """Count of posted transactions in the current calendar month."""
    engine = get_engine_safe()
    if engine:
        try:
            from sqlalchemy import text
            with engine.connect() as conn:
                row = conn.execute(text("""
                    SELECT COUNT(*)
                    FROM analytics.transaction_summary
                    WHERE company_id = :cid
                """), {"cid": company_id}).fetchone()
                if row:
                    return float(row[0] or 0)
        except Exception as e:
            logger.debug("goals: transactions_monthly DB — %s", e)
    return None


# Registry: metric_key → (fetch_fn, label, unit, default_direction)
METRIC_REGISTRY = {
    "revenue_monthly":       (_fetch_revenue_monthly,       "Monthly Revenue",      "$",  "higher_is_better"),
    "task_completion":       (_fetch_task_completion,       "Task Completion",      "%",  "higher_is_better"),
    "active_clients":        (_fetch_active_clients,        "Active Clients",       "",   "higher_is_better"),
    "active_staff":          (_fetch_active_staff,          "Active Staff",         "",   "higher_is_better"),
    "transactions_monthly":  (_fetch_transactions_monthly,  "Monthly Transactions", "",   "higher_is_better"),
}


def _period_days_left(period: str) -> int:
    if period == "monthly":   return _days_left_in_month()
    if period == "weekly":    return _days_left_in_week()
    if period == "annual":    return _days_left_in_year()
    return 30  # rolling_30d default


def _period_days_elapsed(period: str) -> int:
    if period == "monthly":   return _days_elapsed_in_month()
    if period == "weekly":    return date.today().weekday()
    if period == "annual":
        today = date.today()
        return (today - date(today.year, 1, 1)).days
    return 15  # rolling_30d midpoint estimate


def _evaluate_single(goal: dict, company_id: str) -> dict:
    """Evaluate one goal against live data and return enriched result."""
    metric    = goal.get("metric", "")
    target    = float(goal.get("target", 0))
    period    = goal.get("period", "monthly")
    direction = goal.get("direction", "higher_is_better")
    label     = goal.get("label") or METRIC_REGISTRY.get(metric, (None, metric, "", ""))[1]
    unit      = goal.get("unit")  or METRIC_REGISTRY.get(metric, (None, "", "",  ""))[2]

    fetch_fn = METRIC_REGISTRY.get(metric, (None,))[0]
    actual = None
    if fetch_fn:
        try:
            actual = fetch_fn(company_id)
        except Exception as e:
            logger.debug("goals: fetch failed for %s — %s", metric, e)

    if actual is None:
        return {**goal, "actual": None, "progress_pct": None, "status": "unknown",
                "label": label, "unit": unit}

    # Progress toward target
    if target == 0:
        progress_pct = 100.0 if actual >= 0 else 0.0
    elif direction == "higher_is_better":
        progress_pct = round(actual / target * 100, 1)
    else:
        # lower_is_better: 0 actual = 100% progress, target actual = 0%
        progress_pct = round(max(0, (target - actual) / target * 100), 1) if target > 0 else 0.0

    # Status determination — uses days-elapsed pace check
    days_left    = _period_days_left(period)
    days_elapsed = _period_days_elapsed(period)
    total_days   = days_left + days_elapsed

    if direction == "higher_is_better":
        if actual >= target:
            status = "exceeded"
        else:
            # Expected progress at this point in the period
            expected_pct = (days_elapsed / max(total_days, 1)) * 100
            if progress_pct >= expected_pct * 0.90:
                status = "on_track"
            elif progress_pct >= expected_pct * 0.70:
                status = "at_risk"
            else:
                status = "behind"
    else:
        # lower_is_better: if actual <= target already → exceeded
        if actual <= target:
            status = "exceeded"
        else:
            remaining = actual - target
            if days_left > 0:
                daily_reduction_needed = remaining / days_left
                status = "on_track" if daily_reduction_needed < actual * 0.05 else "at_risk"
            else:
                status = "behind"

    # Pace needed to hit target
    pace_needed = None
    if status != "exceeded" and days_left > 0 and direction == "higher_is_better":
        remaining = target - actual
        pace_needed = round(remaining / days_left, 2) if remaining > 0 else 0

    return {
        **goal,
        "label":          label,
        "unit":           unit,
        "actual":         round(actual, 2),
        "target":         round(target, 2),
        "progress_pct":   min(progress_pct, 150.0),  # cap display at 150%
        "status":         status,
        "pace_needed":    pace_needed,
        "days_remaining": days_left,
        "evaluated_at":   _now().isoformat(),
    }


def evaluate_goals(company_id: str, goals: list) -> list:
    """Evaluate all goals for a company. Returns enriched goal list."""
    results = []
    for goal in goals:
        try:
            results.append(_evaluate_single(goal, company_id))
        except Exception as e:
            logger.warning("goals: goal evaluation failed — %s", e)
            results.append({**goal, "status": "error", "error": str(e)})
    return results
