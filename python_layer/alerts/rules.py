# ==============================================================
# Newsconseen Proactive Intelligence — Alert Rules
# ==============================================================
# Every alert rule is a function that:
#   1. Takes analytics data as input
#   2. Evaluates a condition
#   3. Returns an Alert if the condition is met, else None
#
# Rules are taxonomy-aware — they know the ontology.
# No vertical-specific hardcoding. A medication expiry rule
# works for a pharmacy, a clinic, and a hospital without change.
#
# Adding a new rule:
#   1. Define it in RULE_CATALOG
#   2. Implement it as a function below
#   3. Register it in RULE_FUNCTIONS map at the bottom
#
# Rules are evaluated by AlertEvaluator in evaluator.py
# ==============================================================

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


@dataclass
class Alert:
    """
    A fired alert ready for delivery.

    rule_id:        which rule fired
    level:          critical | warning | info
    title:          short summary (used as notification title)
    message:        full message (used as notification body)
    enterprise_id:  which enterprise this alert is for
    company_id:     tenant
    data:           supporting data dict (counts, values, names)
    route_to_roles: which person_subtypes should receive this alert
    channels:       which channels to use (whatsapp | email | sms)
    fired_at:       when the alert fired
    """
    rule_id:         str
    level:           str         # "critical" | "warning" | "info"
    title:           str
    message:         str
    enterprise_id:   str
    company_id:      str
    data:            dict = field(default_factory=dict)
    route_to_roles:  list[str] = field(default_factory=list)
    channels:        list[str] = field(default_factory=lambda: ["whatsapp", "email"])
    fired_at:        str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ----------------------------------------------------------
# Rule catalog — metadata for all rules
# Operators use this to configure thresholds and channels
# ----------------------------------------------------------
RULE_CATALOG = {

    # ── Inventory rules ───────────────────────────────────────

    "medication_expiry_critical": {
        "id":          "medication_expiry_critical",
        "name":        "Medication expiry — critical",
        "category":    "inventory",
        "level":       "critical",
        "description": "Medications expiring within 7 days",
        "default_threshold": 7,
        "route_to_roles":    ["Pharmacist", "Store Manager", "Nurse", "Doctor"],
        "channels":          ["whatsapp", "email"],
    },
    "medication_expiry_warning": {
        "id":          "medication_expiry_warning",
        "name":        "Medication expiry — warning",
        "category":    "inventory",
        "level":       "warning",
        "description": "Medications expiring within 30 days",
        "default_threshold": 30,
        "route_to_roles":    ["Pharmacist", "Store Manager"],
        "channels":          ["email"],
    },
    "item_out_of_stock": {
        "id":          "item_out_of_stock",
        "name":        "Item out of stock",
        "category":    "inventory",
        "level":       "critical",
        "description": "Any item category at zero stock",
        "route_to_roles":    ["Store Manager", "Pharmacist", "Operations Staff"],
        "channels":          ["whatsapp", "email"],
    },
    "item_low_stock": {
        "id":          "item_low_stock",
        "name":        "Item low stock",
        "category":    "inventory",
        "level":       "warning",
        "description": "Items at or below reorder level",
        "route_to_roles":    ["Store Manager", "Operations Staff"],
        "channels":          ["email"],
    },
    "livestock_count_drop": {
        "id":          "livestock_count_drop",
        "name":        "Livestock count drop",
        "category":    "inventory",
        "level":       "warning",
        "description": "Living inventory headcount dropped unexpectedly",
        "default_threshold": 5,   # percent drop threshold
        "route_to_roles":    ["Farmer", "Veterinarian", "Operations Staff"],
        "channels":          ["whatsapp", "sms"],
    },

    # ── People rules ──────────────────────────────────────────

    "staff_availability_critical": {
        "id":          "staff_availability_critical",
        "name":        "Staff availability critical",
        "category":    "people",
        "level":       "critical",
        "description": "More than 30% of staff unavailable simultaneously",
        "default_threshold": 30,  # percent
        "route_to_roles":    ["Manager", "Director", "Supervisor"],
        "channels":          ["whatsapp", "email"],
    },
    "client_retention_drop": {
        "id":          "client_retention_drop",
        "name":        "Client retention drop",
        "category":    "people",
        "level":       "warning",
        "description": "Retention rate dropped more than 10% week-over-week",
        "default_threshold": 10,  # percent drop
        "route_to_roles":    ["Manager", "Director"],
        "channels":          ["email"],
    },
    "certification_expiry": {
        "id":          "certification_expiry",
        "name":        "Staff certification expiring",
        "category":    "people",
        "level":       "warning",
        "description": "Staff certification expiring within 30 days",
        "default_threshold": 30,
        "route_to_roles":    ["Human Resources Personnel", "Manager"],
        "channels":          ["email"],
    },
    "no_active_staff": {
        "id":          "no_active_staff",
        "name":        "No active staff",
        "category":    "people",
        "level":       "critical",
        "description": "Enterprise has zero active staff recorded",
        "route_to_roles":    ["Manager", "Director"],
        "channels":          ["whatsapp", "email", "sms"],
    },
    "new_clients_spike": {
        "id":          "new_clients_spike",
        "name":        "New client spike",
        "category":    "people",
        "level":       "info",
        "description": "New clients this week exceed 2x the weekly average",
        "default_threshold": 2,   # multiplier
        "route_to_roles":    ["Manager", "Director"],
        "channels":          ["email"],
    },

    # ── Task / Operations rules ───────────────────────────────

    "attendance_rate_low": {
        "id":          "attendance_rate_low",
        "name":        "Low attendance rate",
        "category":    "tasks",
        "level":       "warning",
        "description": "Task/attendance completion rate below 70%",
        "default_threshold": 70,  # percent
        "route_to_roles":    ["Teacher", "Manager", "Supervisor", "Director"],
        "channels":          ["whatsapp", "email"],
    },
    "task_overdue_spike": {
        "id":          "task_overdue_spike",
        "name":        "Overdue task spike",
        "category":    "tasks",
        "level":       "warning",
        "description": "Overdue tasks exceed 20% of total tasks",
        "default_threshold": 20,  # percent
        "route_to_roles":    ["Manager", "Supervisor"],
        "channels":          ["email"],
    },
    "no_tasks_recorded": {
        "id":          "no_tasks_recorded",
        "name":        "No tasks recorded",
        "category":    "tasks",
        "level":       "warning",
        "description": "No tasks recorded in the last 48 hours",
        "default_threshold": 48,  # hours
        "route_to_roles":    ["Manager", "Supervisor", "Director"],
        "channels":          ["whatsapp"],
    },

    # ── Financial rules ───────────────────────────────────────

    "revenue_drop": {
        "id":          "revenue_drop",
        "name":        "Revenue drop",
        "category":    "financial",
        "level":       "warning",
        "description": "Revenue this week below 50% of 4-week average",
        "default_threshold": 50,  # percent of average
        "route_to_roles":    ["Manager", "Director", "Finance Accounting Staff"],
        "channels":          ["email"],
    },
    "expense_spike": {
        "id":          "expense_spike",
        "name":        "Expense spike",
        "category":    "financial",
        "level":       "warning",
        "description": "Expenses this week exceed 2x the weekly average",
        "default_threshold": 2,   # multiplier
        "route_to_roles":    ["Manager", "Finance Accounting Staff"],
        "channels":          ["email"],
    },
    "negative_cashflow": {
        "id":          "negative_cashflow",
        "name":        "Negative cash flow",
        "category":    "financial",
        "level":       "critical",
        "description": "Net cash flow is negative",
        "route_to_roles":    ["Manager", "Director", "Finance Accounting Staff"],
        "channels":          ["whatsapp", "email"],
    },
    "outstanding_overdue": {
        "id":          "outstanding_overdue",
        "name":        "Outstanding payments overdue",
        "category":    "financial",
        "level":       "warning",
        "description": "Outstanding amount exceeds threshold",
        "default_threshold": 10000,  # amount
        "route_to_roles":    ["Finance Accounting Staff", "Manager"],
        "channels":          ["email"],
    },

    # ── System rules ──────────────────────────────────────────

    "no_etl_sync": {
        "id":          "no_etl_sync",
        "name":        "Data sync overdue",
        "category":    "system",
        "level":       "warning",
        "description": "No ETL sync completed in 48+ hours — data may be stale",
        "default_threshold": 48,  # hours
        "route_to_roles":    ["Manager", "Director"],
        "channels":          ["email"],
    },
    "connector_sync_failed": {
        "id":          "connector_sync_failed",
        "name":        "Connector sync failed",
        "category":    "system",
        "level":       "warning",
        "description": "A data connector failed to sync in the last 24 hours",
        "route_to_roles":    ["Manager"],
        "channels":          ["email"],
    },
}


# ----------------------------------------------------------
# Rule evaluation functions
# Each takes (enterprise_id, company_id, analytics_data, config)
# Returns Alert | None
# ----------------------------------------------------------

def eval_medication_expiry_critical(
    enterprise_id: str, company_id: str,
    analytics: dict, config: dict
) -> Optional[Alert]:
    """Medications expiring within threshold days."""
    threshold = config.get("threshold", 7)
    col = "expiring_7d_count" if threshold <= 7 else "expiring_30d_count"

    products = analytics.get("products", [])
    meds = [
        p for p in products
        if p.get("is_medication") and p.get(col, 0) > 0
        and p.get("enterprise_id") == enterprise_id
    ]

    if not meds:
        return None

    total_expiring = sum(p.get(col, 0) for p in meds)
    subtypes = list({p.get("item_subtype", "Medication") for p in meds})

    return Alert(
        rule_id="medication_expiry_critical",
        level="critical",
        title=f"🔴 {total_expiring} medication{'s' if total_expiring > 1 else ''} expiring within {threshold} days",
        message=(
            f"{total_expiring} medication item{'s' if total_expiring > 1 else ''} "
            f"{'are' if total_expiring > 1 else 'is'} expiring within {threshold} days.\n"
            f"Types: {', '.join(subtypes)}.\n"
            f"Check your inventory and arrange replacements immediately."
        ),
        enterprise_id=enterprise_id,
        company_id=company_id,
        data={"expiring_count": total_expiring, "subtypes": subtypes, "threshold_days": threshold},
        route_to_roles=RULE_CATALOG["medication_expiry_critical"]["route_to_roles"],
        channels=config.get("channels", ["whatsapp", "email"]),
    )


def eval_medication_expiry_warning(
    enterprise_id: str, company_id: str,
    analytics: dict, config: dict
) -> Optional[Alert]:
    threshold = config.get("threshold", 30)
    products = analytics.get("products", [])
    meds = [
        p for p in products
        if p.get("is_medication") and p.get("expiring_30d_count", 0) > 0
        and p.get("enterprise_id") == enterprise_id
    ]
    if not meds:
        return None
    total = sum(p.get("expiring_30d_count", 0) for p in meds)
    subtypes = list({p.get("item_subtype", "Medication") for p in meds})
    return Alert(
        rule_id="medication_expiry_warning",
        level="warning",
        title=f"🟡 {total} medication{'s' if total > 1 else ''} expiring within {threshold} days",
        message=f"{total} medications expiring within {threshold} days: {', '.join(subtypes)}. Plan replacements.",
        enterprise_id=enterprise_id, company_id=company_id,
        data={"expiring_count": total, "subtypes": subtypes},
        route_to_roles=RULE_CATALOG["medication_expiry_warning"]["route_to_roles"],
        channels=config.get("channels", ["email"]),
    )


def eval_item_out_of_stock(
    enterprise_id: str, company_id: str,
    analytics: dict, config: dict
) -> Optional[Alert]:
    products = analytics.get("products", [])
    out = [
        p for p in products
        if p.get("out_of_stock_count", 0) > 0
        and p.get("enterprise_id") == enterprise_id
    ]
    if not out:
        return None
    total = sum(p.get("out_of_stock_count", 0) for p in out)
    types = list({f"{p.get('item_subtype', p.get('item_type', 'item'))}" for p in out})
    return Alert(
        rule_id="item_out_of_stock",
        level="critical",
        title=f"🔴 {total} item categor{'ies' if total > 1 else 'y'} out of stock",
        message=f"{total} item categories are completely out of stock: {', '.join(types[:5])}. Reorder immediately.",
        enterprise_id=enterprise_id, company_id=company_id,
        data={"out_of_stock_count": total, "types": types},
        route_to_roles=RULE_CATALOG["item_out_of_stock"]["route_to_roles"],
        channels=config.get("channels", ["whatsapp", "email"]),
    )


def eval_item_low_stock(
    enterprise_id: str, company_id: str,
    analytics: dict, config: dict
) -> Optional[Alert]:
    products = analytics.get("products", [])
    low = [
        p for p in products
        if p.get("low_stock_count", 0) > 0
        and p.get("enterprise_id") == enterprise_id
    ]
    if not low:
        return None
    total = sum(p.get("low_stock_count", 0) for p in low)
    types = list({p.get("item_subtype", p.get("item_type", "item")) for p in low})
    return Alert(
        rule_id="item_low_stock",
        level="warning",
        title=f"🟡 {total} item{'s' if total > 1 else ''} below reorder level",
        message=f"{total} items are at or below their reorder level: {', '.join(types[:5])}.",
        enterprise_id=enterprise_id, company_id=company_id,
        data={"low_stock_count": total, "types": types},
        route_to_roles=RULE_CATALOG["item_low_stock"]["route_to_roles"],
        channels=config.get("channels", ["email"]),
    )


def eval_livestock_count_drop(
    enterprise_id: str, company_id: str,
    analytics: dict, config: dict
) -> Optional[Alert]:
    products = analytics.get("products", [])
    threshold_pct = config.get("threshold", 5)
    livestock = [
        p for p in products
        if p.get("is_livestock") and p.get("enterprise_id") == enterprise_id
    ]
    if not livestock:
        return None
    # Compare current vs previous snapshot
    current = sum(p.get("total_stock", 0) for p in livestock)
    previous = analytics.get("_previous_livestock_count", {}).get(enterprise_id, current)
    if previous == 0:
        return None
    drop_pct = (previous - current) / previous * 100
    if drop_pct < threshold_pct:
        return None
    return Alert(
        rule_id="livestock_count_drop",
        level="warning",
        title=f"🟡 Livestock count dropped {drop_pct:.1f}%",
        message=f"Livestock headcount dropped from {previous:.0f} to {current:.0f} ({drop_pct:.1f}% decrease). Check on your animals.",
        enterprise_id=enterprise_id, company_id=company_id,
        data={"previous": previous, "current": current, "drop_pct": round(drop_pct, 1)},
        route_to_roles=RULE_CATALOG["livestock_count_drop"]["route_to_roles"],
        channels=config.get("channels", ["whatsapp", "sms"]),
    )


def eval_staff_availability_critical(
    enterprise_id: str, company_id: str,
    analytics: dict, config: dict
) -> Optional[Alert]:
    threshold = config.get("threshold", 30)
    people = analytics.get("people", [])
    staff = [
        p for p in people
        if p.get("is_staff") and p.get("enterprise_id") == enterprise_id
    ]
    if not staff:
        return None
    total = sum(p.get("people_count", 0) for p in staff)
    active = sum(p.get("active_count", 0) for p in staff)
    if total == 0:
        return None
    unavailable_pct = (total - active) / total * 100
    if unavailable_pct < threshold:
        return None
    return Alert(
        rule_id="staff_availability_critical",
        level="critical",
        title=f"🔴 {unavailable_pct:.0f}% of staff unavailable",
        message=f"{total - active} of {total} staff members are unavailable ({unavailable_pct:.0f}%). This may impact operations.",
        enterprise_id=enterprise_id, company_id=company_id,
        data={"total": total, "active": active, "unavailable_pct": round(unavailable_pct, 1)},
        route_to_roles=RULE_CATALOG["staff_availability_critical"]["route_to_roles"],
        channels=config.get("channels", ["whatsapp", "email"]),
    )


def eval_client_retention_drop(
    enterprise_id: str, company_id: str,
    analytics: dict, config: dict
) -> Optional[Alert]:
    threshold = config.get("threshold", 10)
    people = analytics.get("people", [])
    clients = [
        p for p in people
        if p.get("is_participant") and p.get("enterprise_id") == enterprise_id
    ]
    if not clients:
        return None
    current_retention = sum(p.get("retention_rate_pct", 0) * p.get("people_count", 0) for p in clients)
    total_clients = sum(p.get("people_count", 0) for p in clients)
    if total_clients == 0:
        return None
    avg_retention = current_retention / total_clients
    prev_retention = analytics.get("_previous_retention", {}).get(enterprise_id, avg_retention)
    drop = prev_retention - avg_retention
    if drop < threshold:
        return None
    return Alert(
        rule_id="client_retention_drop",
        level="warning",
        title=f"🟡 Client retention dropped {drop:.1f}%",
        message=f"Client retention rate dropped from {prev_retention:.1f}% to {avg_retention:.1f}% (−{drop:.1f}%). Review recent client activity.",
        enterprise_id=enterprise_id, company_id=company_id,
        data={"current": round(avg_retention, 1), "previous": round(prev_retention, 1), "drop": round(drop, 1)},
        route_to_roles=RULE_CATALOG["client_retention_drop"]["route_to_roles"],
        channels=config.get("channels", ["email"]),
    )


def eval_no_active_staff(
    enterprise_id: str, company_id: str,
    analytics: dict, config: dict
) -> Optional[Alert]:
    people = analytics.get("people", [])
    staff = [
        p for p in people
        if p.get("is_staff") and p.get("enterprise_id") == enterprise_id
    ]
    total_active = sum(p.get("active_count", 0) for p in staff)
    if total_active > 0:
        return None
    return Alert(
        rule_id="no_active_staff",
        level="critical",
        title="🔴 No active staff recorded",
        message="This enterprise has no active staff members recorded. Check whether staff records are up to date.",
        enterprise_id=enterprise_id, company_id=company_id,
        data={"active_staff": 0},
        route_to_roles=RULE_CATALOG["no_active_staff"]["route_to_roles"],
        channels=config.get("channels", ["whatsapp", "email", "sms"]),
    )


def eval_attendance_rate_low(
    enterprise_id: str, company_id: str,
    analytics: dict, config: dict
) -> Optional[Alert]:
    threshold = config.get("threshold", 70)
    tasks = analytics.get("tasks", [])
    ent_tasks = [
        t for t in tasks
        if t.get("enterprise_id") == enterprise_id
    ]
    if not ent_tasks:
        return None
    total = sum(t.get("total_tasks", 0) for t in ent_tasks)
    completed = sum(t.get("completed_tasks", 0) for t in ent_tasks)
    if total == 0:
        return None
    rate = completed / total * 100
    if rate >= threshold:
        return None
    return Alert(
        rule_id="attendance_rate_low",
        level="warning",
        title=f"🟡 Task completion rate at {rate:.0f}%",
        message=f"Only {rate:.0f}% of tasks are completed ({completed} of {total}). This is below the {threshold}% threshold.",
        enterprise_id=enterprise_id, company_id=company_id,
        data={"rate": round(rate, 1), "completed": completed, "total": total, "threshold": threshold},
        route_to_roles=RULE_CATALOG["attendance_rate_low"]["route_to_roles"],
        channels=config.get("channels", ["whatsapp", "email"]),
    )


def eval_task_overdue_spike(
    enterprise_id: str, company_id: str,
    analytics: dict, config: dict
) -> Optional[Alert]:
    threshold = config.get("threshold", 20)
    tasks = analytics.get("tasks", [])
    ent_tasks = [t for t in tasks if t.get("enterprise_id") == enterprise_id]
    if not ent_tasks:
        return None
    total = sum(t.get("total_tasks", 0) for t in ent_tasks)
    overdue = sum(t.get("overdue_tasks", 0) for t in ent_tasks)
    if total == 0:
        return None
    overdue_pct = overdue / total * 100
    if overdue_pct < threshold:
        return None
    return Alert(
        rule_id="task_overdue_spike",
        level="warning",
        title=f"🟡 {overdue} overdue tasks ({overdue_pct:.0f}%)",
        message=f"{overdue} tasks are overdue — {overdue_pct:.0f}% of total. Review and reassign as needed.",
        enterprise_id=enterprise_id, company_id=company_id,
        data={"overdue": overdue, "total": total, "overdue_pct": round(overdue_pct, 1)},
        route_to_roles=RULE_CATALOG["task_overdue_spike"]["route_to_roles"],
        channels=config.get("channels", ["email"]),
    )


def eval_negative_cashflow(
    enterprise_id: str, company_id: str,
    analytics: dict, config: dict
) -> Optional[Alert]:
    transactions = analytics.get("transactions", [])
    ent_tx = [t for t in transactions if t.get("enterprise_id") == enterprise_id]
    revenue  = sum(t.get("total_amount", 0) for t in ent_tx if t.get("is_revenue"))
    expenses = sum(t.get("total_amount", 0) for t in ent_tx if t.get("is_expense"))
    net      = revenue - expenses
    if net >= 0:
        return None
    return Alert(
        rule_id="negative_cashflow",
        level="critical",
        title=f"🔴 Negative cash flow: {net:,.0f}",
        message=f"Cash flow is negative: Revenue {revenue:,.0f} vs Expenses {expenses:,.0f} = {net:,.0f}. Review expenses urgently.",
        enterprise_id=enterprise_id, company_id=company_id,
        data={"revenue": round(revenue, 2), "expenses": round(expenses, 2), "net": round(net, 2)},
        route_to_roles=RULE_CATALOG["negative_cashflow"]["route_to_roles"],
        channels=config.get("channels", ["whatsapp", "email"]),
    )


def eval_revenue_drop(
    enterprise_id: str, company_id: str,
    analytics: dict, config: dict
) -> Optional[Alert]:
    threshold_pct = config.get("threshold", 50)
    transactions = analytics.get("transactions", [])
    ent_tx = [t for t in transactions if t.get("enterprise_id") == enterprise_id and t.get("is_revenue")]
    if not ent_tx:
        return None
    current_7d   = sum(t.get("revenue_last_7d", 0) for t in ent_tx)
    current_30d  = sum(t.get("revenue_last_30d", 0) for t in ent_tx)
    weekly_avg   = current_30d / 4 if current_30d else 0
    if weekly_avg == 0:
        return None
    pct_of_avg = current_7d / weekly_avg * 100
    if pct_of_avg >= threshold_pct:
        return None
    return Alert(
        rule_id="revenue_drop",
        level="warning",
        title=f"🟡 Revenue this week at {pct_of_avg:.0f}% of average",
        message=f"This week's revenue ({current_7d:,.0f}) is only {pct_of_avg:.0f}% of the weekly average ({weekly_avg:,.0f}).",
        enterprise_id=enterprise_id, company_id=company_id,
        data={"current_7d": round(current_7d, 2), "weekly_avg": round(weekly_avg, 2), "pct_of_avg": round(pct_of_avg, 1)},
        route_to_roles=RULE_CATALOG["revenue_drop"]["route_to_roles"],
        channels=config.get("channels", ["email"]),
    )


def eval_no_etl_sync(
    enterprise_id: str, company_id: str,
    analytics: dict, config: dict
) -> Optional[Alert]:
    threshold_hours = config.get("threshold", 48)
    last_sync = analytics.get("_last_sync_at")
    if not last_sync:
        return None
    try:
        from datetime import datetime, timezone
        last_sync_dt = datetime.fromisoformat(last_sync)
        if last_sync_dt.tzinfo is None:
            last_sync_dt = last_sync_dt.replace(tzinfo=timezone.utc)
        hours_since = (datetime.now(timezone.utc) - last_sync_dt).total_seconds() / 3600
        if hours_since < threshold_hours:
            return None
        return Alert(
            rule_id="no_etl_sync",
            level="warning",
            title=f"🟡 Data sync overdue — {hours_since:.0f} hours since last sync",
            message=f"No ETL sync has completed in {hours_since:.0f} hours. Your analytics data may be stale. Trigger a sync from the Pipelines page.",
            enterprise_id=enterprise_id, company_id=company_id,
            data={"hours_since_sync": round(hours_since, 1), "threshold_hours": threshold_hours},
            route_to_roles=RULE_CATALOG["no_etl_sync"]["route_to_roles"],
            channels=config.get("channels", ["email"]),
        )
    except Exception:
        return None


# ----------------------------------------------------------
# Rule function registry — maps rule_id to eval function
# ----------------------------------------------------------
RULE_FUNCTIONS: dict[str, callable] = {
    "medication_expiry_critical":    eval_medication_expiry_critical,
    "medication_expiry_warning":     eval_medication_expiry_warning,
    "item_out_of_stock":             eval_item_out_of_stock,
    "item_low_stock":                eval_item_low_stock,
    "livestock_count_drop":          eval_livestock_count_drop,
    "staff_availability_critical":   eval_staff_availability_critical,
    "client_retention_drop":         eval_client_retention_drop,
    "no_active_staff":               eval_no_active_staff,
    "attendance_rate_low":           eval_attendance_rate_low,
    "task_overdue_spike":            eval_task_overdue_spike,
    "negative_cashflow":             eval_negative_cashflow,
    "revenue_drop":                  eval_revenue_drop,
    "no_etl_sync":                   eval_no_etl_sync,
}
