# ==============================================================
# Newsconseen Operational Copilot — Query Engine
# ==============================================================
# Translates structured intent + filters into python_layer
# analytics API calls. Returns typed data the LLM uses to
# ground its answers.
#
# Every query function:
#   1. Calls the appropriate analytics endpoint
#   2. Filters by company_id (tenant isolation)
#   3. Applies any additional filters from the intent
#   4. Returns structured data with metadata
#
# The LLM never hits the database directly.
# All data flows through these functions.
# ==============================================================

import logging
from datetime import datetime, timezone
from typing import Any, Optional

import requests

from config.settings import settings

logger = logging.getLogger(__name__)

RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app"


class QueryEngine:
    """
    Executes structured queries against python_layer analytics endpoints.

    Instantiated per copilot request with the company's scope.
    All methods return dicts with:
        data:     list of records
        count:    number of records
        metadata: query context (filters applied, endpoint called)
        error:    error message if query failed
    """

    def __init__(self, company_id: str, base_url: str = RAILWAY_URL):
        self.company_id = company_id
        self.base_url   = base_url

    # ----------------------------------------------------------
    # People queries
    # ----------------------------------------------------------

    def query_people(
        self,
        person_type:    Optional[str] = None,
        person_subtype: Optional[str] = None,
        status:         Optional[str] = None,
        enterprise_id:  Optional[str] = None,
        is_staff:       Optional[bool] = None,
        is_participant: Optional[bool] = None,
    ) -> dict:
        """
        Query people_summary analytics.

        Examples:
            query_people(person_type="staff")
            query_people(person_type="client", person_subtype="Student Customer")
            query_people(is_staff=True, status="active")
        """
        data = self._fetch("/people-summary")
        if data.get("error"):
            return data

        records = data["data"]

        # Apply filters
        if person_type:
            from config.taxonomy import PERSON_TYPE_SETS, normalize_person_type
            canonical = normalize_person_type(person_type)
            allowed   = PERSON_TYPE_SETS.get(canonical, {canonical})
            records = [r for r in records if r.get("person_type", "").lower() in allowed]

        if person_subtype:
            records = [
                r for r in records
                if person_subtype.lower() in (r.get("person_subtype") or "").lower()
            ]

        if status:
            records = [r for r in records if r.get("status", "").lower() == status.lower()]

        if enterprise_id:
            records = [r for r in records if r.get("enterprise_id") == enterprise_id]

        if is_staff is not None:
            records = [r for r in records if r.get("is_staff") == is_staff]

        if is_participant is not None:
            records = [r for r in records if r.get("is_participant") == is_participant]

        return self._result(records, {
            "person_type": person_type, "person_subtype": person_subtype,
            "status": status, "enterprise_id": enterprise_id,
        })

    def query_people_summary(self) -> dict:
        """High-level people summary across all types."""
        data = self._fetch("/people-summary")
        if data.get("error"):
            return data

        records = data["data"]
        total_active   = sum(r.get("active_count", 0) for r in records)
        total_people   = sum(r.get("people_count", 0) for r in records)
        total_staff    = sum(r.get("people_count", 0) for r in records if r.get("is_staff"))
        total_clients  = sum(r.get("people_count", 0) for r in records if r.get("is_participant"))
        new_last_7d    = sum(r.get("new_last_7d", 0) for r in records)
        new_last_30d   = sum(r.get("new_last_30d", 0) for r in records)

        return self._result(records, {}, summary={
            "total_people":   total_people,
            "active":         total_active,
            "staff":          total_staff,
            "clients":        total_clients,
            "new_last_7d":    new_last_7d,
            "new_last_30d":   new_last_30d,
            "retention_avg":  round(
                sum(r.get("retention_rate_pct", 0) for r in records) / max(len(records), 1), 1
            ),
        })

    # ----------------------------------------------------------
    # Product / inventory queries
    # ----------------------------------------------------------

    def query_products(
        self,
        item_type:    Optional[str] = None,
        item_subtype: Optional[str] = None,
        enterprise_id:Optional[str] = None,
        low_stock:    bool = False,
        expiring:     bool = False,
        expiry_days:  int  = 30,
    ) -> dict:
        """
        Query product_summary analytics.

        Examples:
            query_products(item_type="physical", item_subtype="Medication")
            query_products(low_stock=True)
            query_products(expiring=True, expiry_days=7)
        """
        data = self._fetch("/product-summary")
        if data.get("error"):
            return data

        records = data["data"]

        if item_type:
            from config.taxonomy import ITEM_TYPE_SETS, normalize_item_type
            canonical = normalize_item_type(item_type)
            allowed   = ITEM_TYPE_SETS.get(canonical, {canonical})
            records = [r for r in records if r.get("item_type", "").lower() in allowed]

        if item_subtype:
            records = [
                r for r in records
                if item_subtype.lower() in (r.get("item_subtype") or "").lower()
            ]

        if enterprise_id:
            records = [r for r in records if r.get("enterprise_id") == enterprise_id]

        if low_stock:
            records = [r for r in records if r.get("low_stock_count", 0) > 0]

        if expiring:
            col = "expiring_7d_count" if expiry_days <= 7 else "expiring_30d_count"
            records = [r for r in records if r.get(col, 0) > 0]

        # Compute summary
        total_low_stock = sum(r.get("low_stock_count", 0) for r in records)
        total_expiring  = sum(r.get("expiring_30d_count", 0) for r in records)
        total_critical  = sum(r.get("expiring_7d_count", 0) for r in records)
        out_of_stock    = sum(r.get("out_of_stock_count", 0) for r in records)

        return self._result(records, {
            "item_type": item_type, "item_subtype": item_subtype,
            "low_stock": low_stock, "expiring": expiring,
        }, summary={
            "low_stock_items":     total_low_stock,
            "expiring_30d":        total_expiring,
            "expiring_7d":         total_critical,
            "out_of_stock":        out_of_stock,
            "total_inventory_value": sum(r.get("total_inventory_value", 0) for r in records),
        })

    def query_expiring_medications(self, days: int = 30) -> dict:
        """Convenience: medications expiring within N days."""
        return self.query_products(
            item_type="physical",
            item_subtype="Medication",
            expiring=True,
            expiry_days=days,
        )

    def query_low_stock(self, item_type: Optional[str] = None) -> dict:
        """Convenience: all items at or below reorder level."""
        return self.query_products(item_type=item_type, low_stock=True)

    # ----------------------------------------------------------
    # Task queries
    # ----------------------------------------------------------

    def query_tasks(
        self,
        task_type:    Optional[str] = None,
        enterprise_id:Optional[str] = None,
        overdue_only: bool = False,
    ) -> dict:
        """
        Query task_summary analytics.

        Examples:
            query_tasks(task_type="attendance")
            query_tasks(overdue_only=True)
        """
        data = self._fetch("/task-summary")
        if data.get("error"):
            return data

        records = data["data"]

        if task_type:
            records = [
                r for r in records
                if task_type.lower() in (r.get("task_type") or "").lower()
            ]

        if enterprise_id:
            records = [r for r in records if r.get("enterprise_id") == enterprise_id]

        if overdue_only:
            records = [r for r in records if r.get("overdue_tasks", 0) > 0]

        total_tasks     = sum(r.get("total_tasks", 0) for r in records)
        completed       = sum(r.get("completed_tasks", 0) for r in records)
        overdue         = sum(r.get("overdue_tasks", 0) for r in records)
        completion_rate = round(completed / max(total_tasks, 1) * 100, 1)

        return self._result(records, {
            "task_type": task_type, "overdue_only": overdue_only,
        }, summary={
            "total_tasks":      total_tasks,
            "completed":        completed,
            "overdue":          overdue,
            "completion_rate":  completion_rate,
            "tasks_last_7d":    sum(r.get("tasks_last_7d", 0) for r in records),
        })

    # ----------------------------------------------------------
    # Transaction queries
    # ----------------------------------------------------------

    def query_transactions(
        self,
        revenue_only:  bool = False,
        expense_only:  bool = False,
        enterprise_id: Optional[str] = None,
        period:        str = "all",  # "7d", "30d", "all"
    ) -> dict:
        """
        Query transaction_summary analytics.

        Examples:
            query_transactions(revenue_only=True)
            query_transactions(expense_only=True, period="30d")
        """
        data = self._fetch("/transaction-summary")
        if data.get("error"):
            return data

        records = data["data"]

        if revenue_only:
            records = [r for r in records if r.get("is_revenue")]

        if expense_only:
            records = [r for r in records if r.get("is_expense")]

        if enterprise_id:
            records = [r for r in records if r.get("enterprise_id") == enterprise_id]

        # Compute period-specific totals
        if period == "7d":
            total_revenue = sum(r.get("revenue_last_7d", 0) for r in records if r.get("is_revenue"))
        elif period == "30d":
            total_revenue  = sum(r.get("revenue_last_30d", 0) for r in records if r.get("is_revenue"))
            total_expenses = sum(r.get("expense_last_30d", 0) for r in records if r.get("is_expense"))
        else:
            total_revenue  = sum(r.get("total_amount", 0) for r in records if r.get("is_revenue"))
            total_expenses = sum(r.get("total_amount", 0) for r in records if r.get("is_expense"))

        net_flow = total_revenue - (total_expenses if period != "7d" else 0)

        return self._result(records, {
            "revenue_only": revenue_only,
            "expense_only": expense_only,
            "period": period,
        }, summary={
            "total_revenue":       round(total_revenue, 2),
            "total_expenses":      round(total_expenses if period != "7d" else 0, 2),
            "net_cashflow":        round(net_flow, 2),
            "transaction_count":   sum(r.get("total_transactions", 0) for r in records),
            "outstanding_amount":  round(sum(r.get("outstanding_amount", 0) for r in records), 2),
        })

    # ----------------------------------------------------------
    # Relationship queries
    # ----------------------------------------------------------

    def query_relationships(
        self,
        category:      Optional[str] = None,
        enterprise_name:Optional[str] = None,
        person_name:   Optional[str] = None,
        active_only:   bool = True,
    ) -> dict:
        """Query relationship_summary analytics."""
        params = {}
        if category:
            params["category"] = category
        if active_only:
            params["active_only"] = "true"

        data = self._fetch("/relationship-summary", params)
        if data.get("error"):
            return data

        records = data["data"]

        if enterprise_name:
            records = [
                r for r in records
                if enterprise_name.lower() in (r.get("enterprise_name") or "").lower()
            ]

        if person_name:
            records = [
                r for r in records
                if person_name.lower() in (r.get("person_name") or "").lower()
            ]

        return self._result(records, {
            "category": category,
            "enterprise_name": enterprise_name,
            "person_name": person_name,
        })

    # ----------------------------------------------------------
    # Enterprise queries
    # ----------------------------------------------------------

    def query_enterprises(
        self,
        enterprise_type: Optional[str] = None,
        active_only:     bool = True,
        is_root:         Optional[bool] = None,
    ) -> dict:
        """Query enterprise_summary analytics."""
        data = self._fetch("/enterprise-summary")
        if data.get("error"):
            return data

        records = data["data"]

        if enterprise_type:
            from config.taxonomy import normalize_enterprise_type
            canonical = normalize_enterprise_type(enterprise_type)
            records = [r for r in records if r.get("enterprise_type", "").lower() == canonical]

        if active_only:
            records = [r for r in records if r.get("is_active")]

        if is_root is not None:
            records = [r for r in records if r.get("is_root") == is_root]

        return self._result(records, {
            "enterprise_type": enterprise_type, "active_only": active_only,
        }, summary={
            "total":  len(records),
            "active": sum(1 for r in records if r.get("is_active")),
            "cities": list({r.get("city") for r in records if r.get("city")}),
        })

    # ----------------------------------------------------------
    # Network overview — cross-entity summary
    # ----------------------------------------------------------

    def query_network_overview(self) -> dict:
        """
        Fetch a high-level cross-entity summary.
        Used for "how are we doing overall" type questions.
        """
        people_data  = self.query_people_summary()
        product_data = self.query_products()
        task_data    = self.query_tasks()
        tx_data      = self.query_transactions(period="30d")
        ent_data     = self.query_enterprises()

        alerts = []

        # Stock alerts
        prod_summary = product_data.get("summary", {})
        if prod_summary.get("expiring_7d", 0) > 0:
            alerts.append({
                "level":   "critical",
                "type":    "stock_expiry",
                "message": f"{prod_summary['expiring_7d']} items expiring within 7 days",
            })
        if prod_summary.get("out_of_stock", 0) > 0:
            alerts.append({
                "level":   "critical",
                "type":    "out_of_stock",
                "message": f"{prod_summary['out_of_stock']} item categories out of stock",
            })
        if prod_summary.get("low_stock_items", 0) > 0:
            alerts.append({
                "level":   "warning",
                "type":    "low_stock",
                "message": f"{prod_summary['low_stock_items']} item categories below reorder level",
            })

        # Task alerts
        task_summary = task_data.get("summary", {})
        if task_summary.get("overdue", 0) > 0:
            alerts.append({
                "level":   "warning",
                "type":    "overdue_tasks",
                "message": f"{task_summary['overdue']} overdue tasks",
            })
        if task_summary.get("completion_rate", 100) < 70:
            alerts.append({
                "level":   "warning",
                "type":    "low_completion",
                "message": f"Task completion rate is {task_summary['completion_rate']}%",
            })

        # Financial alerts
        tx_summary = tx_data.get("summary", {})
        if tx_summary.get("net_cashflow", 0) < 0:
            alerts.append({
                "level":   "warning",
                "type":    "negative_cashflow",
                "message": f"Negative cash flow: {tx_summary['net_cashflow']:,.0f} this month",
            })

        return {
            "data": [],
            "count": 0,
            "metadata": {"query": "network_overview"},
            "summary": {
                "people":       people_data.get("summary", {}),
                "inventory":    prod_summary,
                "tasks":        task_summary,
                "financials":   tx_summary,
                "enterprises":  ent_data.get("summary", {}),
                "alerts":       alerts,
                "alert_count":  len(alerts),
                "critical_count": sum(1 for a in alerts if a["level"] == "critical"),
            },
        }

    # ----------------------------------------------------------
    # Internal helpers
    # ----------------------------------------------------------

    def _fetch(self, endpoint: str, params: dict = None) -> dict:
        """Fetch data from a python_layer analytics endpoint."""
        try:
            p = {"company_id": self.company_id}
            if params:
                p.update(params)

            resp = requests.get(
                f"{self.base_url}{endpoint}",
                params=p,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            records = data if isinstance(data, list) else data.get("data", data)

            logger.debug(
                "QueryEngine._fetch: %s → %d records", endpoint, len(records)
            )
            return {"data": records, "error": None}

        except requests.exceptions.ConnectionError:
            logger.error("QueryEngine: python_layer unreachable at %s", self.base_url)
            return {
                "data": [], "error": "Analytics service unavailable. "
                "Please check that python_layer is running.",
            }
        except requests.exceptions.HTTPError as e:
            logger.error("QueryEngine._fetch: HTTP %s for %s", e.response.status_code, endpoint)
            return {"data": [], "error": f"Analytics query failed: {e.response.status_code}"}
        except Exception as e:
            logger.error("QueryEngine._fetch: %s — %s", endpoint, e)
            return {"data": [], "error": str(e)}

    def _result(
        self,
        records: list,
        filters: dict,
        summary: dict = None,
    ) -> dict:
        """Package query results with metadata."""
        return {
            "data":     records,
            "count":    len(records),
            "metadata": {
                "filters":    {k: v for k, v in filters.items() if v is not None},
                "company_id": self.company_id,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            },
            "summary":  summary or {},
            "error":    None,
        }
