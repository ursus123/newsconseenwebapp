# ==============================================================
# Newsconseen — Auto-Remediation Engine
# ==============================================================
# Closes the autonomy loop: Detect → Alert → ACT.
#
# After every ETL + data quality cycle, this engine:
#   1. Reads the cached data quality report
#   2. Reads latest analytics (transactions, tasks, products, people)
#   3. Applies rule definitions to identify actionable issues
#   4. Creates tasks in Base44 for each unresolved issue
#   5. Respects per-rule cooldown windows (no duplicate spam)
#
# Tasks are created via direct POST to Base44 tasks endpoint.
# The same API key used for ETL reads is used for writes.
# ==============================================================

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlparse, urlunparse

import requests

from config import settings, HEADERS

logger = logging.getLogger(__name__)


def _tasks_create_url() -> str:
    """
    Derive the Base44 task CREATE URL from the list URL.
    List URL:   https://app.base44.com/api/apps/{APP_ID}/entities/Task?limit=500
    Create URL: https://app.base44.com/api/apps/{APP_ID}/entities/Task
    """
    raw = settings.base44_tasks_url or ""
    parsed = urlparse(raw)
    # Strip query string — POST to the bare path
    return urlunparse(parsed._replace(query="", fragment=""))


def _create_task(title: str, description: str, task_type: str,
                 company_id: str, assignee_id: Optional[str] = None,
                 priority: str = "high") -> Optional[dict]:
    """
    Create a single task in Base44.
    Returns the created task dict on success, None on failure.
    """
    url = _tasks_create_url()
    if not url:
        logger.warning("autotask: base44_tasks_url not configured")
        return None

    now = datetime.now(timezone.utc)
    due = (now + timedelta(days=1)).strftime("%Y-%m-%d")

    payload = {
        "title":       title,
        "description": description,
        "task_type":   task_type,
        "status":      "pending",
        "priority":    priority,
        "company_id":  company_id,
        "due_date":    due,
        "created_by":  "newsconseen_autotask",
        "source":      "auto_remediation",
    }
    if assignee_id:
        payload["assignee_id"] = assignee_id

    try:
        resp = requests.post(url, json=payload, headers=HEADERS, timeout=15)
        if resp.status_code in (200, 201):
            logger.info("autotask: created task '%s' for company=%s", title, company_id)
            return resp.json()
        logger.warning(
            "autotask: Base44 returned %s for task creation — %s",
            resp.status_code, resp.text[:200],
        )
        return None
    except Exception as e:
        logger.error("autotask: task creation failed — %s", e)
        return None


# ── Rule definitions ──────────────────────────────────────────
# Each rule is a function:
#   rule(analytics, dq_report, config) → list of task specs
# A task spec is: {title, description, task_type, priority, dedup_key}
# dedup_key prevents re-creating the same task within the cooldown window.

def _rule_data_quality_critical(analytics: dict, dq: dict, cfg: dict) -> list:
    """Create a task for each entity with critical data quality issues."""
    tasks = []
    for issue in (dq.get("issues") or []):
        if issue.get("severity") != "critical":
            continue
        entity  = issue.get("entity_type", "data")
        message = issue.get("message", "Unspecified issue")
        tasks.append({
            "title":       f"Fix data: {message[:80]}",
            "description": (
                f"Automated data quality check detected a critical issue in {entity}.\n\n"
                f"Issue: {message}\n"
                f"Type: {issue.get('issue_type','')}\n"
                f"Entity: {entity}\n\n"
                "Please review and correct the affected records to improve data health."
            ),
            "task_type":  "data_quality",
            "priority":   "high",
            "dedup_key":  f"dq_critical_{entity}_{issue.get('issue_type','')}",
        })
    return tasks[:3]  # cap at 3 critical tasks per cycle


def _rule_overdue_invoices(analytics: dict, dq: dict, cfg: dict) -> list:
    """Create a task when overdue invoices exceed configured threshold."""
    tx   = analytics.get("transaction_summary") or {}
    cnt  = tx.get("overdue_count") or tx.get("unpaid_count") or 0
    try: cnt = int(cnt)
    except Exception: cnt = 0

    threshold = cfg.get("overdue_invoice_threshold", 1)
    if cnt < threshold:
        return []

    amount = tx.get("overdue_amount")
    amt_str = f" (${float(amount):,.2f})" if amount else ""

    return [{
        "title":       f"Chase overdue invoices: {cnt} unpaid{amt_str}",
        "description": (
            f"There are {cnt} overdue invoice(s){amt_str} that require follow-up.\n\n"
            "Review the Transactions page, contact clients, and update payment status."
        ),
        "task_type":  "follow_up",
        "priority":   "high" if cnt >= 3 else "medium",
        "dedup_key":  "overdue_invoices",
    }]


def _rule_churn_risk(analytics: dict, dq: dict, cfg: dict) -> list:
    """Create a task when clients at churn risk exceed threshold."""
    ppl  = analytics.get("people_summary") or {}
    cnt  = ppl.get("churn_risk_count") or ppl.get("high_risk_count") or 0
    try: cnt = int(cnt)
    except Exception: cnt = 0

    threshold = cfg.get("churn_risk_threshold", 1)
    if cnt < threshold:
        return []

    return [{
        "title":       f"Retention outreach: {cnt} client(s) at churn risk",
        "description": (
            f"{cnt} client(s) have been flagged as at risk of disengagement.\n\n"
            "Review the People page (filter by churn risk), reach out proactively, "
            "and update their status or schedule a follow-up."
        ),
        "task_type":  "retention",
        "priority":   "high",
        "dedup_key":  "churn_risk",
    }]


def _rule_overdue_tasks(analytics: dict, dq: dict, cfg: dict) -> list:
    """Create a task when a backlog of overdue tasks accumulates."""
    t_sum = analytics.get("task_summary") or {}
    cnt   = t_sum.get("overdue_tasks") or t_sum.get("overdue") or 0
    try: cnt = int(cnt)
    except Exception: cnt = 0

    threshold = cfg.get("overdue_task_threshold", 5)
    if cnt < threshold:
        return []

    return [{
        "title":       f"Clear task backlog: {cnt} overdue tasks",
        "description": (
            f"There are {cnt} overdue task(s) past their due date.\n\n"
            "Review the Tasks page, reassign or reschedule as needed, "
            "and update status to clear the backlog."
        ),
        "task_type":  "operations",
        "priority":   "medium",
        "dedup_key":  "overdue_tasks_backlog",
    }]


def _rule_low_stock(analytics: dict, dq: dict, cfg: dict) -> list:
    """Create a task when products fall below reorder threshold."""
    prods = analytics.get("product_summary") or {}
    cnt   = prods.get("low_stock_count") or prods.get("below_reorder") or 0
    try: cnt = int(cnt)
    except Exception: cnt = 0

    threshold = cfg.get("low_stock_threshold", 1)
    if cnt < threshold:
        return []

    return [{
        "title":       f"Reorder stock: {cnt} product(s) below reorder point",
        "description": (
            f"{cnt} product(s) are below their minimum reorder level.\n\n"
            "Review the Products page, identify which items need restocking, "
            "and place purchase orders with suppliers."
        ),
        "task_type":  "inventory",
        "priority":   "high" if cnt >= 3 else "medium",
        "dedup_key":  "low_stock",
    }]


# ── Rule registry ─────────────────────────────────────────────
RULES = {
    "data_quality_critical": _rule_data_quality_critical,
    "overdue_invoices":      _rule_overdue_invoices,
    "churn_risk":            _rule_churn_risk,
    "overdue_tasks":         _rule_overdue_tasks,
    "low_stock":             _rule_low_stock,
}

# Default rule config — all rules enabled with sensible thresholds
DEFAULT_RULE_CONFIG = {
    "overdue_invoice_threshold": 1,
    "churn_risk_threshold":      1,
    "overdue_task_threshold":    5,
    "low_stock_threshold":       1,
}


def run_rules(
    company_id:   str,
    analytics:    dict,
    dq_report:    dict,
    rule_config:  dict,
    cooldown_map: dict,      # dedup_key → last_created_at ISO string
    enabled_rules: list,
    assignee_id:  Optional[str] = None,
) -> list:
    """
    Apply all enabled rules and create tasks for triggered ones.
    Returns list of created task records.

    cooldown_map is mutated in place when a task is created.
    """
    created = []
    now = datetime.now(timezone.utc)
    cooldown_hours = rule_config.get("cooldown_hours", 24)

    for rule_name, rule_fn in RULES.items():
        if enabled_rules and rule_name not in enabled_rules:
            continue

        try:
            specs = rule_fn(analytics, dq_report, rule_config)
        except Exception as e:
            logger.warning("autotask: rule %s failed — %s", rule_name, e)
            continue

        for spec in specs:
            dedup_key = f"{company_id}:{spec['dedup_key']}"

            # Check cooldown
            last = cooldown_map.get(dedup_key)
            if last:
                try:
                    last_dt = datetime.fromisoformat(last)
                    if last_dt.tzinfo is None:
                        last_dt = last_dt.replace(tzinfo=timezone.utc)
                    if (now - last_dt).total_seconds() < cooldown_hours * 3600:
                        logger.debug(
                            "autotask: skipping '%s' — still within %dh cooldown",
                            spec["title"], cooldown_hours,
                        )
                        continue
                except Exception:
                    pass

            # Create the task
            task = _create_task(
                title=spec["title"],
                description=spec["description"],
                task_type=spec["task_type"],
                company_id=company_id,
                assignee_id=assignee_id,
                priority=spec.get("priority", "medium"),
            )
            if task:
                cooldown_map[dedup_key] = now.isoformat()
                created.append({
                    "rule":      rule_name,
                    "dedup_key": spec["dedup_key"],
                    "title":     spec["title"],
                    "task_id":   task.get("id"),
                    "created_at": now.isoformat(),
                })

    return created
