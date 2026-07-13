# ==============================================================
# Canonical Metric Registry
# ==============================================================
# Answers "which metrics are canonical?" and "which endpoint powers
# each KPI?" — the two data-contract questions with no prior single
# source of truth (MetricDefinition, a Supabase entity, was registered
# CRUD scaffolding but never actually read or written anywhere).
#
# One entry per canonical KPI shown on a stat card, dashboard, or
# report. Frontend and DataModels.jsx's API Catalogue both read this
# via GET /config/metric-registry instead of hardcoding descriptions
# independently. Same pattern already proven by
# network/benchmarks.py's BENCHMARK_METRICS dict.
# ==============================================================

METRIC_REGISTRY = {
    "revenue_30d": {
        "label":              "Revenue (30d)",
        "analytics_endpoint": "/kpi-summary",
        "raw_entity":         "Transaction",
        "definition":         "Sum of posted revenue-type transactions in the last 30 days",
        "unit":               "currency",
    },
    "expense_30d": {
        "label":              "Expenses (30d)",
        "analytics_endpoint": "/kpi-summary",
        "raw_entity":         "Transaction",
        "definition":         "Sum of posted expense-type transactions in the last 30 days",
        "unit":               "currency",
    },
    "net_profit_30d": {
        "label":              "Net profit (30d)",
        "analytics_endpoint": "/kpi-summary",
        "raw_entity":         "Transaction",
        "definition":         "revenue_30d minus expense_30d",
        "unit":               "currency",
    },
    "active_staff": {
        "label":              "Active staff",
        "analytics_endpoint": "/people-summary",
        "raw_entity":         "Person",
        "definition":         "People with person_type in the canonical staff set (config/taxonomy.py PERSON_TYPE_SETS) and status=active",
        "unit":               "count",
    },
    "active_clients": {
        "label":              "Active clients",
        "analytics_endpoint": "/people-summary",
        "raw_entity":         "Person",
        "definition":         "People with person_type in the canonical client set (config/taxonomy.py PERSON_TYPE_SETS) and status=active",
        "unit":               "count",
    },
    "task_completion_rate_pct": {
        "label":              "Task completion rate",
        "analytics_endpoint": "/kpi-summary",
        "raw_entity":         "Task",
        "definition":         "Completed tasks / total tasks * 100",
        "unit":               "percent",
    },
    "overdue_tasks": {
        "label":              "Overdue tasks",
        "analytics_endpoint": "/kpi-summary",
        "raw_entity":         "Task",
        "definition":         "Tasks past due_date with status not completed",
        "unit":               "count",
    },
    "overdue_invoice_total": {
        "label":              "Overdue invoices (total)",
        "analytics_endpoint": "/kpi-summary",
        "raw_entity":         "Transaction",
        "definition":         "Sum of posted, unpaid revenue transactions past due_date",
        "unit":               "currency",
    },
    "low_stock_count": {
        "label":              "Low stock items",
        "analytics_endpoint": "/product-summary",
        "raw_entity":         "Product",
        "definition":         "Products with stock_quantity at or below reorder_level",
        "unit":               "count",
    },
    "out_of_stock_count": {
        "label":              "Out of stock items",
        "analytics_endpoint": "/product-summary",
        "raw_entity":         "Product",
        "definition":         "Products with stock_quantity <= 0",
        "unit":               "count",
    },
    "churn_risk_count": {
        "label":              "Clients at churn risk",
        "analytics_endpoint": "/kpi-summary",
        "raw_entity":         "Person",
        "definition":         "Clients with no posted transaction in 60+ days",
        "unit":               "count",
    },
}
