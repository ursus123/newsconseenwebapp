# ==============================================================
# Newsconseen Phase 3B — Alert Rule Engine
# ==============================================================
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
from collections import defaultdict

logger = logging.getLogger(__name__)


@dataclass
class Alert:
    alert_type:       str
    severity:         str
    title:            str
    message:          str
    company_id:       str
    enterprise_id:    Optional[str] = None
    enterprise_name:  Optional[str] = None
    data:             dict = field(default_factory=dict)
    suggested_action: str = ""
    triggered_at:     str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self):
        return {k: v for k, v in self.__dict__.items()}

    @property
    def emoji(self):
        return {"critical": "🔴", "warning": "🟡", "info": "🔵"}.get(self.severity, "⚪")

    @property
    def short_message(self):
        full = f"[Newsconseen] {self.title}. {self.suggested_action}"
        return full[:155] + "..." if len(full) > 160 else full


class AlertRuleEngine:
    def __init__(self, company_id: str):
        self.company_id = company_id

    def evaluate_all(self, analytics: dict, config: dict) -> list:
        alerts  = []
        enabled = config.get("enabled_types", ["all"])

        def ok(t): return "all" in enabled or t in enabled

        products     = analytics.get("product_summary", [])
        people       = analytics.get("people_summary", [])
        tasks        = analytics.get("task_summary", [])
        transactions = analytics.get("transaction_summary", [])
        connector_runs      = analytics.get("connector_runs", [])
        connector_schedules = analytics.get("connector_schedules", [])

        if ok("expiry_critical"): alerts += self._expiry(products, config.get("expiry_critical_days", 7), "critical")
        if ok("expiry_warning"):  alerts += self._expiry(products, config.get("expiry_warning_days", 30), "warning")
        if ok("out_of_stock"):    alerts += self._out_of_stock(products)
        if ok("low_stock"):       alerts += self._low_stock(products)
        if ok("retention_drop"):  alerts += self._retention_drop(people, config.get("retention_drop_pct", 10))
        if ok("staff_shortage"):  alerts += self._staff_shortage(people, config.get("min_staff_count", 1))
        if ok("completion_low"):  alerts += self._completion_low(tasks, config.get("completion_rate_min", 70))
        if ok("overdue_spike"):   alerts += self._overdue_spike(tasks, config.get("overdue_spike_threshold", 5))
        if ok("negative_cashflow"):alerts += self._negative_cashflow(transactions)
        if ok("revenue_drop"):    alerts += self._revenue_drop(transactions, config.get("revenue_drop_pct", 20))
        if ok("connector_sync_failed"): alerts += self._connector_sync_failed(connector_runs, connector_schedules)

        logger.info("AlertRuleEngine: %d alerts for %s", len(alerts), self.company_id)
        return alerts

    def _a(self, **kw) -> Alert:
        return Alert(company_id=self.company_id, **kw)

    def _expiry(self, products, days, severity):
        alerts = []
        for r in products:
            count = r.get("expiring_7d_count" if days <= 7 else "expiring_30d_count", 0)
            if count <= 0: continue
            label = f"{r.get('item_subtype','')} {r.get('item_type','items')}".strip()
            ename = r.get("enterprise_name", r.get("enterprise_id", ""))
            alerts.append(self._a(
                alert_type="expiry_critical" if severity == "critical" else "expiry_warning",
                severity=severity,
                title=f"{count} {label} expiring within {days} days",
                message=f"{count} {label} at {ename} will expire within {days} days.",
                enterprise_id=r.get("enterprise_id"),
                enterprise_name=ename,
                data={"count": count, "item_type": r.get("item_type"), "days": days},
                suggested_action=f"Review {label} and arrange disposal or urgent use.",
            ))
        return alerts

    def _out_of_stock(self, products):
        alerts = []
        for r in products:
            count = r.get("out_of_stock_count", 0)
            if count <= 0: continue
            ename = r.get("enterprise_name", r.get("enterprise_id", ""))
            label = f"{r.get('item_type','items')}"
            alerts.append(self._a(
                alert_type="out_of_stock", severity="critical",
                title=f"{count} {label} out of stock",
                message=f"{count} {label} categories are out of stock at {ename}.",
                enterprise_id=r.get("enterprise_id"), enterprise_name=ename,
                data={"out_of_stock_count": count, "item_type": r.get("item_type")},
                suggested_action="Place an emergency reorder immediately.",
            ))
        return alerts

    def _low_stock(self, products):
        alerts = []
        for r in products:
            count = r.get("low_stock_count", 0) - r.get("out_of_stock_count", 0)
            if count <= 0: continue
            ename = r.get("enterprise_name", r.get("enterprise_id", ""))
            alerts.append(self._a(
                alert_type="low_stock", severity="warning",
                title=f"{count} {r.get('item_type','items')} below reorder level",
                message=f"{count} item categories running low at {ename}.",
                enterprise_id=r.get("enterprise_id"), enterprise_name=ename,
                data={"low_stock_count": count},
                suggested_action="Place reorder to avoid stockout.",
            ))
        return alerts

    def _retention_drop(self, people, drop_pct):
        alerts = []
        for r in people:
            rate = r.get("retention_rate_pct", 100)
            if rate > (100 - drop_pct): continue
            ename = r.get("enterprise_name", r.get("enterprise_id", ""))
            pt    = r.get("person_type", "people")
            alerts.append(self._a(
                alert_type="retention_drop", severity="warning",
                title=f"{pt.title()} retention at {rate}%",
                message=f"{pt.title()} retention at {ename} has dropped to {rate}%. {r.get('inactive_count',0)} inactive.",
                enterprise_id=r.get("enterprise_id"), enterprise_name=ename,
                data={"retention_rate_pct": rate, "person_type": pt},
                suggested_action=f"Review inactive {pt} records and follow up.",
            ))
        return alerts

    def _staff_shortage(self, people, min_staff):
        alerts = []
        ent = defaultdict(lambda: {"active": 0, "name": ""})
        for r in people:
            if not r.get("is_staff"): continue
            eid = r.get("enterprise_id", "all")
            ent[eid]["active"] += r.get("active_count", 0)
            ent[eid]["name"]    = r.get("enterprise_name", eid)
        for eid, s in ent.items():
            if s["active"] >= min_staff: continue
            alerts.append(self._a(
                alert_type="staff_shortage",
                severity="critical" if s["active"] == 0 else "warning",
                title=f"Only {s['active']} active staff at {s['name']}",
                message=f"{s['name']} has only {s['active']} active staff. Minimum: {min_staff}.",
                enterprise_id=eid, enterprise_name=s["name"],
                data={"active_staff": s["active"], "minimum": min_staff},
                suggested_action="Assign additional staff immediately.",
            ))
        return alerts

    def _completion_low(self, tasks, min_rate):
        alerts = []
        for r in tasks:
            rate  = r.get("completion_rate_pct", 100)
            total = r.get("total_tasks", 0)
            if rate >= min_rate or total < 5: continue
            ename = r.get("enterprise_name", r.get("enterprise_id", ""))
            tt    = r.get("task_type", "tasks")
            alerts.append(self._a(
                alert_type="completion_low", severity="warning",
                title=f"{tt.title()} completion at {rate}%",
                message=f"{tt.title()} completion at {ename} is {rate}% ({r.get('overdue_tasks',0)} overdue).",
                enterprise_id=r.get("enterprise_id"), enterprise_name=ename,
                data={"completion_rate_pct": rate, "task_type": tt},
                suggested_action="Review overdue tasks and reassign if needed.",
            ))
        return alerts

    def _overdue_spike(self, tasks, threshold):
        alerts = []
        for r in tasks:
            overdue = r.get("overdue_tasks", 0)
            if overdue < threshold: continue
            ename = r.get("enterprise_name", r.get("enterprise_id", ""))
            tt    = r.get("task_type", "tasks")
            alerts.append(self._a(
                alert_type="overdue_spike",
                severity="critical" if overdue >= threshold * 2 else "warning",
                title=f"{overdue} overdue {tt}",
                message=f"{overdue} {tt} are overdue at {ename}.",
                enterprise_id=r.get("enterprise_id"), enterprise_name=ename,
                data={"overdue_tasks": overdue, "task_type": tt},
                suggested_action=f"Resolve overdue {tt} immediately.",
            ))
        return alerts

    def _negative_cashflow(self, transactions):
        alerts = []
        ent = defaultdict(lambda: {"revenue": 0, "expense": 0, "name": ""})
        for r in transactions:
            eid = r.get("enterprise_id", "all")
            ent[eid]["name"] = r.get("enterprise_name", eid)
            if r.get("is_revenue"): ent[eid]["revenue"] += r.get("revenue_last_30d", 0)
            if r.get("is_expense"): ent[eid]["expense"] += r.get("expense_last_30d", 0)
        for eid, f in ent.items():
            net = f["revenue"] - f["expense"]
            if net >= 0: continue
            alerts.append(self._a(
                alert_type="negative_cashflow", severity="warning",
                title=f"Negative cash flow: {net:,.0f} this month",
                message=f"Cash flow negative at {f['name']}. Revenue: {f['revenue']:,.0f} · Expenses: {f['expense']:,.0f} · Net: {net:,.0f}.",
                enterprise_id=eid, enterprise_name=f["name"],
                data={"revenue_30d": f["revenue"], "expense_30d": f["expense"], "net": net},
                suggested_action="Review expenses and chase outstanding revenue.",
            ))
        return alerts

    def _revenue_drop(self, transactions, drop_pct):
        alerts = []
        for r in transactions:
            if not r.get("is_revenue"): continue
            last_7d  = r.get("revenue_last_7d", 0)
            last_30d = r.get("revenue_last_30d", 0)
            if last_30d == 0: continue
            expected = last_30d / 4
            if expected == 0: continue
            drop = 100 - (last_7d / expected * 100)
            if drop < drop_pct: continue
            ename = r.get("enterprise_name", r.get("enterprise_id", ""))
            alerts.append(self._a(
                alert_type="revenue_drop", severity="warning",
                title=f"Revenue down {drop:.0f}% this week",
                message=f"Revenue at {ename} down {drop:.0f}% vs monthly average. This week: {last_7d:,.0f} · Expected: {expected:,.0f}.",
                enterprise_id=r.get("enterprise_id"), enterprise_name=ename,
                data={"revenue_7d": last_7d, "expected_weekly": round(expected, 2), "drop_pct": round(drop, 1)},
                suggested_action="Check for missing transactions or reduced sales activity.",
            ))
        return alerts

    # ── Frequency (hours) used to detect a stale/dead connector ──────────────
    _FREQUENCY_HOURS = {"hourly": 1, "daily": 24, "weekly": 24 * 7, "monthly": 24 * 30}

    def _connector_sync_failed(self, connector_runs, connector_schedules):
        """
        critical — the most recent run for an active scheduled connector failed.
        warning  — an active scheduled connector hasn't run in > 2x its own
                   interval (next_run_at is well overdue — likely dead/broken).
        """
        alerts = []

        # Most recent run per connector_id (connector_runs is already
        # ordered DESC by started_at from GET /connectors/runs).
        latest_run_by_connector = {}
        for run in connector_runs:
            cid = run.get("connector_id")
            if cid and cid not in latest_run_by_connector:
                latest_run_by_connector[cid] = run

        now = datetime.now(timezone.utc)

        for sched in connector_schedules:
            if not sched.get("is_active") or sched.get("frequency") == "manual":
                continue
            connector_id = sched.get("connector_id")
            label        = sched.get("connector_name") or connector_id

            latest = latest_run_by_connector.get(connector_id)
            if latest and latest.get("status") == "failed":
                alerts.append(self._a(
                    alert_type="connector_sync_failed", severity="critical",
                    title=f"{label} sync failed",
                    message=f"The last sync for {label} failed: {(latest.get('error') or 'no error detail')[:200]}",
                    data={"connector_id": connector_id, "error": latest.get("error")},
                    suggested_action="Check the connector's credentials and retry the sync.",
                ))
                continue  # don't also fire the stale check for a connector that just failed

            next_run_at = sched.get("next_run_at")
            interval_h  = self._FREQUENCY_HOURS.get(sched.get("frequency"), 24)
            if not next_run_at:
                continue
            try:
                next_dt = datetime.fromisoformat(next_run_at)
                if next_dt.tzinfo is None:
                    next_dt = next_dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            overdue_hours = (now - next_dt).total_seconds() / 3600
            if overdue_hours > interval_h * 2:
                alerts.append(self._a(
                    alert_type="connector_sync_failed", severity="warning",
                    title=f"{label} hasn't synced in a while",
                    message=f"{label} was due to sync {int(overdue_hours)}h ago and hasn't run — it may be broken.",
                    data={"connector_id": connector_id, "overdue_hours": int(overdue_hours)},
                    suggested_action="Check the connector schedule and Railway cron logs.",
                ))

        return alerts
