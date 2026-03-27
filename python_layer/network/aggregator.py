# ==============================================================
# Newsconseen Phase 3C — Network Aggregator
# ==============================================================
# Fetches analytics from each child company and aggregates
# into a unified network-level view.
#
# Design principles:
#   - Fetch children in parallel (ThreadPoolExecutor)
#   - Graceful degradation: if one child fails, others proceed
#   - Each child's data is preserved individually AND rolled up
#   - Aggregation is additive for counts, averaged for rates
#
# Output shape mirrors the single-tenant analytics shape so
# the same dashboard components can render both views.
# ==============================================================

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Optional

import requests

logger = logging.getLogger(__name__)

RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app"

# Analytics endpoints to fetch per child company
ANALYTICS_ENDPOINTS = {
    "people_summary":      "/people-summary",
    "product_summary":     "/product-summary",
    "task_summary":        "/task-summary",
    "transaction_summary": "/transaction-summary",
    "enterprise_summary":  "/enterprise-summary",
    "address_summary":     "/address-summary",
}


class NetworkAggregator:
    """
    Aggregates analytics across all child companies in a network.

    Usage:
        agg = NetworkAggregator(network_id="net_abc123", members=[...])
        overview = agg.aggregate_overview()
        members  = agg.aggregate_members()
    """

    def __init__(
        self,
        network_id:  str,
        members:     list[dict],
        railway_url: str = RAILWAY_URL,
        max_workers: int = 10,
    ):
        self.network_id  = network_id
        self.members     = members
        self.railway_url = railway_url
        self.max_workers = max_workers

    def aggregate_overview(self) -> dict:
        """
        Fetch and aggregate analytics across all member companies.
        Returns a single rolled-up summary with per-member breakdown.
        """
        member_data = self._fetch_all_members()

        if not member_data:
            return {
                "network_id":   self.network_id,
                "member_count": len(self.members),
                "data_available": False,
                "error":        "No analytics data available from member companies",
            }

        # Roll up each analytics table
        people      = self._rollup_people(member_data)
        products    = self._rollup_products(member_data)
        tasks       = self._rollup_tasks(member_data)
        financials  = self._rollup_transactions(member_data)
        locations   = self._extract_locations(member_data)
        alerts      = self._network_alerts(people, products, tasks, financials)

        return {
            "network_id":     self.network_id,
            "member_count":   len(self.members),
            "active_members": sum(1 for m in member_data.values() if not m.get("error")),
            "fetched_at":     datetime.now(timezone.utc).isoformat(),
            "data_available": True,
            "people":         people,
            "products":       products,
            "tasks":          tasks,
            "financials":     financials,
            "locations":      locations,
            "alerts":         alerts,
            "alert_count":    len(alerts),
            "critical_count": sum(1 for a in alerts if a["level"] == "critical"),
        }

    def aggregate_members(self) -> list[dict]:
        """
        Return per-member summaries for the network member list view.
        Each member gets a health score and key metrics.
        """
        member_data = self._fetch_all_members()
        summaries   = []

        for member in self.members:
            cid  = member["company_id"]
            data = member_data.get(cid, {})

            if data.get("error"):
                summaries.append({
                    **member,
                    "health_score":  None,
                    "status":        "unavailable",
                    "error":         data["error"],
                })
                continue

            health = self._compute_health_score(data)
            summaries.append({
                **member,
                "health_score":     health["score"],
                "health_grade":     health["grade"],
                "health_signals":   health["signals"],
                "people_active":    self._sum_field(data.get("people_summary", []), "active_count"),
                "products_total":   self._sum_field(data.get("product_summary", []), "total_products"),
                "low_stock":        self._sum_field(data.get("product_summary", []), "low_stock_count"),
                "expiring_7d":      self._sum_field(data.get("product_summary", []), "expiring_7d_count"),
                "task_completion":  self._avg_field(data.get("task_summary", []), "completion_rate_pct"),
                "overdue_tasks":    self._sum_field(data.get("task_summary", []), "overdue_tasks"),
                "revenue_30d":      self._sum_revenue(data.get("transaction_summary", [])),
                "expense_30d":      self._sum_expenses(data.get("transaction_summary", [])),
                "status":           "active",
            })

        # Sort by health score descending (best performers first)
        summaries.sort(
            key=lambda x: x.get("health_score") or 0,
            reverse=True,
        )
        return summaries

    def rank_members(self, metric: str) -> list[dict]:
        """
        Rank member companies by a specific metric.

        Supported metrics:
          revenue       — revenue_last_30d descending
          completion    — task completion rate descending
          retention     — people retention rate descending
          health        — composite health score descending
          expiry        — expiring items ascending (most urgent first)
          low_stock     — low stock count descending
        """
        members = self.aggregate_members()

        metric_map = {
            "revenue":    ("revenue_30d",       True),
            "completion": ("task_completion",   True),
            "retention":  ("retention_rate",    True),
            "health":     ("health_score",      True),
            "expiry":     ("expiring_7d",        False),  # ascending — most urgent first
            "low_stock":  ("low_stock",          False),
        }

        field, descending = metric_map.get(metric, ("health_score", True))

        ranked = sorted(
            [m for m in members if m.get(field) is not None],
            key=lambda x: x.get(field) or 0,
            reverse=descending,
        )

        for i, member in enumerate(ranked):
            member["rank"]       = i + 1
            member["rank_metric"]= metric

        return ranked

    def network_alerts(self) -> list[dict]:
        """
        Collect and deduplicate alerts across all member companies.
        Returns network-wide alert list sorted by severity.
        """
        from alerts.rules import AlertRuleEngine
        from alerts.router import NotificationRouter

        all_alerts = []
        member_data = self._fetch_all_members()

        for member in self.members:
            cid  = member["company_id"]
            data = member_data.get(cid, {})

            if data.get("error"):
                continue

            config = NotificationRouter.load_config(cid)
            engine = AlertRuleEngine(company_id=cid)

            try:
                alerts = engine.evaluate_all(data, config)
                for alert in alerts:
                    alert_dict = alert.to_dict()
                    alert_dict["member_name"] = member.get("name", cid)
                    all_alerts.append(alert_dict)
            except Exception as e:
                logger.warning(
                    "NetworkAggregator: alert evaluation failed for %s — %s", cid, e
                )

        # Sort: critical first, then warning, then info
        severity_order = {"critical": 0, "warning": 1, "info": 2}
        all_alerts.sort(key=lambda a: severity_order.get(a.get("severity", "info"), 3))

        return all_alerts

    # ----------------------------------------------------------
    # Data fetching
    # ----------------------------------------------------------

    def _fetch_all_members(self) -> dict:
        """
        Fetch analytics from all member companies in parallel.
        Returns dict of company_id → analytics dict.
        Gracefully handles individual failures.
        """
        results = {}

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_cid = {
                executor.submit(self._fetch_member, m["company_id"]): m["company_id"]
                for m in self.members
            }
            for future in as_completed(future_to_cid):
                cid = future_to_cid[future]
                try:
                    results[cid] = future.result()
                except Exception as e:
                    logger.warning(
                        "NetworkAggregator: fetch failed for %s — %s", cid, e
                    )
                    results[cid] = {"error": str(e)}

        logger.info(
            "NetworkAggregator: fetched %d/%d members",
            sum(1 for v in results.values() if not v.get("error")),
            len(self.members),
        )
        return results

    def _fetch_member(self, company_id: str) -> dict:
        """Fetch all analytics tables for a single member company."""
        data = {}
        for table, endpoint in ANALYTICS_ENDPOINTS.items():
            try:
                resp = requests.get(
                    f"{self.railway_url}{endpoint}",
                    params={"company_id": company_id},
                    timeout=15,
                )
                resp.raise_for_status()
                raw = resp.json()
                data[table] = raw if isinstance(raw, list) else raw.get("data", [])
            except Exception as e:
                logger.debug(
                    "NetworkAggregator: %s failed for %s — %s", table, company_id, e
                )
                data[table] = []
        return data

    # ----------------------------------------------------------
    # Rollup helpers
    # ----------------------------------------------------------

    def _rollup_people(self, member_data: dict) -> dict:
        """Aggregate people_summary across all members."""
        all_rows = []
        for data in member_data.values():
            if not data.get("error"):
                all_rows.extend(data.get("people_summary", []))

        return {
            "total_people":    self._sum_field(all_rows, "people_count"),
            "active_people":   self._sum_field(all_rows, "active_count"),
            "total_staff":     self._sum_field(
                [r for r in all_rows if r.get("is_staff")], "people_count"
            ),
            "total_clients":   self._sum_field(
                [r for r in all_rows if r.get("is_participant")], "people_count"
            ),
            "new_last_7d":     self._sum_field(all_rows, "new_last_7d"),
            "new_last_30d":    self._sum_field(all_rows, "new_last_30d"),
            "avg_retention":   self._avg_field(all_rows, "retention_rate_pct"),
            "min_retention":   self._min_field(all_rows, "retention_rate_pct"),
        }

    def _rollup_products(self, member_data: dict) -> dict:
        """Aggregate product_summary across all members."""
        all_rows = []
        for data in member_data.values():
            if not data.get("error"):
                all_rows.extend(data.get("product_summary", []))

        return {
            "total_products":      self._sum_field(all_rows, "total_products"),
            "total_stock":         self._sum_field(all_rows, "total_stock"),
            "low_stock_count":     self._sum_field(all_rows, "low_stock_count"),
            "out_of_stock_count":  self._sum_field(all_rows, "out_of_stock_count"),
            "expiring_7d_count":   self._sum_field(all_rows, "expiring_7d_count"),
            "expiring_30d_count":  self._sum_field(all_rows, "expiring_30d_count"),
            "total_inventory_value":self._sum_field(all_rows, "total_inventory_value"),
        }

    def _rollup_tasks(self, member_data: dict) -> dict:
        """Aggregate task_summary across all members."""
        all_rows = []
        for data in member_data.values():
            if not data.get("error"):
                all_rows.extend(data.get("task_summary", []))

        total     = self._sum_field(all_rows, "total_tasks")
        completed = self._sum_field(all_rows, "completed_tasks")

        return {
            "total_tasks":       total,
            "completed_tasks":   completed,
            "overdue_tasks":     self._sum_field(all_rows, "overdue_tasks"),
            "completion_rate":   round(completed / max(total, 1) * 100, 1),
            "tasks_last_7d":     self._sum_field(all_rows, "tasks_last_7d"),
            "avg_completion_rate":self._avg_field(all_rows, "completion_rate_pct"),
            "min_completion_rate":self._min_field(all_rows, "completion_rate_pct"),
        }

    def _rollup_transactions(self, member_data: dict) -> dict:
        """Aggregate transaction_summary across all members."""
        all_rows = []
        for data in member_data.values():
            if not data.get("error"):
                all_rows.extend(data.get("transaction_summary", []))

        revenue_rows  = [r for r in all_rows if r.get("is_revenue")]
        expense_rows  = [r for r in all_rows if r.get("is_expense")]

        total_revenue  = self._sum_field(revenue_rows, "revenue_last_30d")
        total_expenses = self._sum_field(expense_rows, "expense_last_30d")

        return {
            "total_revenue_30d":  total_revenue,
            "total_expenses_30d": total_expenses,
            "net_cashflow_30d":   round(total_revenue - total_expenses, 2),
            "revenue_last_7d":    self._sum_field(revenue_rows, "revenue_last_7d"),
            "total_transactions": self._sum_field(all_rows, "total_transactions"),
            "outstanding_amount": self._sum_field(all_rows, "outstanding_amount"),
        }

    def _extract_locations(self, member_data: dict) -> list[dict]:
        """Extract all geographic locations for map display."""
        locations = []
        for cid, data in member_data.items():
            if data.get("error"):
                continue
            for addr in data.get("address_summary", []):
                if addr.get("has_coordinates"):
                    member = next(
                        (m for m in self.members if m["company_id"] == cid), {}
                    )
                    locations.append({
                        "company_id":   cid,
                        "member_name":  member.get("name", cid),
                        "label":        addr.get("label"),
                        "city":         addr.get("city"),
                        "country":      addr.get("country"),
                        "latitude":     addr.get("latitude"),
                        "longitude":    addr.get("longitude"),
                        "enterprise_id":addr.get("enterprise_id"),
                    })
        return locations

    def _network_alerts(self, people, products, tasks, financials) -> list[dict]:
        """Generate network-level alerts from aggregated data."""
        alerts = []

        if products.get("expiring_7d_count", 0) > 0:
            alerts.append({
                "level":   "critical",
                "type":    "network_expiry",
                "message": f"{products['expiring_7d_count']} items expiring in next 7 days across the network",
            })
        if products.get("out_of_stock_count", 0) > 0:
            alerts.append({
                "level":   "critical",
                "type":    "network_out_of_stock",
                "message": f"{products['out_of_stock_count']} item categories out of stock across the network",
            })
        if products.get("low_stock_count", 0) > 0:
            alerts.append({
                "level":   "warning",
                "type":    "network_low_stock",
                "message": f"{products['low_stock_count']} item categories below reorder level across the network",
            })
        if tasks.get("overdue_tasks", 0) > 0:
            alerts.append({
                "level":   "warning",
                "type":    "network_overdue",
                "message": f"{tasks['overdue_tasks']} overdue tasks across the network",
            })
        min_ret = people.get("min_retention")
        if min_ret is not None and min_ret < 70:
            alerts.append({
                "level":   "warning",
                "type":    "network_retention",
                "message": f"One or more members have retention below 70% (lowest: {min_ret}%)",
            })
        if financials.get("net_cashflow_30d", 0) < 0:
            alerts.append({
                "level":   "warning",
                "type":    "network_cashflow",
                "message": f"Network net cash flow is negative this month: {financials['net_cashflow_30d']:,.0f}",
            })

        return alerts

    # ----------------------------------------------------------
    # Health score — composite member ranking
    # ----------------------------------------------------------

    def _compute_health_score(self, data: dict) -> dict:
        """
        Compute a 0–100 health score for a member company.

        Components (equally weighted):
          Stock health     — no critical expiry or out-of-stock
          Task health      — completion rate above threshold
          People health    — retention rate above threshold
          Financial health — positive cash flow
        """
        signals = []
        score   = 100

        # Stock health
        products = data.get("product_summary", [])
        expiring_critical = sum(r.get("expiring_7d_count", 0) for r in products)
        out_of_stock      = sum(r.get("out_of_stock_count", 0) for r in products)
        low_stock         = sum(r.get("low_stock_count", 0) for r in products)

        if expiring_critical > 0:
            score -= 25
            signals.append({"type": "critical", "message": f"{expiring_critical} items expiring in 7 days"})
        elif out_of_stock > 0:
            score -= 20
            signals.append({"type": "critical", "message": f"{out_of_stock} item categories out of stock"})
        elif low_stock > 0:
            score -= 10
            signals.append({"type": "warning", "message": f"{low_stock} items below reorder level"})

        # Task health
        tasks = data.get("task_summary", [])
        completion = self._avg_field(tasks, "completion_rate_pct")
        if completion is not None:
            if completion < 50:
                score -= 25
                signals.append({"type": "critical", "message": f"Task completion at {completion:.0f}%"})
            elif completion < 70:
                score -= 15
                signals.append({"type": "warning", "message": f"Task completion at {completion:.0f}%"})

        # People health
        people = data.get("people_summary", [])
        retention = self._avg_field(people, "retention_rate_pct")
        if retention is not None:
            if retention < 60:
                score -= 25
                signals.append({"type": "critical", "message": f"Retention at {retention:.0f}%"})
            elif retention < 80:
                score -= 10
                signals.append({"type": "warning", "message": f"Retention at {retention:.0f}%"})

        # Financial health
        transactions = data.get("transaction_summary", [])
        revenue  = self._sum_revenue(transactions)
        expenses = self._sum_expenses(transactions)
        if revenue > 0 or expenses > 0:
            if expenses > revenue:
                score -= 25
                signals.append({"type": "warning", "message": "Negative cash flow this month"})

        score = max(0, min(100, score))
        grade = "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 50 else "D"

        return {"score": score, "grade": grade, "signals": signals}

    # ----------------------------------------------------------
    # Math helpers
    # ----------------------------------------------------------

    def _sum_field(self, rows: list, field: str) -> float:
        return sum(r.get(field) or 0 for r in rows)

    def _avg_field(self, rows: list, field: str) -> Optional[float]:
        vals = [r.get(field) for r in rows if r.get(field) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    def _min_field(self, rows: list, field: str) -> Optional[float]:
        vals = [r.get(field) for r in rows if r.get(field) is not None]
        return round(min(vals), 1) if vals else None

    def _sum_revenue(self, rows: list) -> float:
        return sum(r.get("revenue_last_30d") or 0 for r in rows if r.get("is_revenue"))

    def _sum_expenses(self, rows: list) -> float:
        return sum(r.get("expense_last_30d") or 0 for r in rows if r.get("is_expense"))
