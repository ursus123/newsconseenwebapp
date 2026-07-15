"""
Idjwi native chart and report language.

This layer chooses an output form (table, chart, risk card, graph view, report,
or dashboard widget) and returns a renderable spec. It is read-only unless the
caller explicitly asks to submit the spec for approval/pinning later.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

import pandas as pd


OUTPUT_TYPES = {
    "auto",
    "table",
    "bar_chart",
    "line_chart",
    "area_chart",
    "pie_chart",
    "risk_card",
    "graph_view",
    "downloadable_report",
    "dashboard_widget",
}


def _norm(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.lower() in {"nan", "none", "null", "nat"} else text


def _num(series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _date(series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce", utc=True)


def _first_col(df: pd.DataFrame, names: list[str]) -> Optional[str]:
    return next((name for name in names if name in df.columns), None)


def _clean_records(df: pd.DataFrame, limit: int = 50) -> list[dict]:
    if df is None or df.empty:
        return []
    try:
        from database import _clean_df

        return _clean_df(df.head(limit)).to_dict(orient="records")
    except Exception:
        return df.head(limit).where(df.head(limit).notna(), None).to_dict(orient="records")


def _load(company_id: str, entity_type: str) -> tuple[str, pd.DataFrame, str]:
    from .queries import _ontology_entity_df

    canonical, df, source = _ontology_entity_df(company_id, entity_type)
    if df is None:
        df = pd.DataFrame()
    return canonical, df.copy(), source


def _entity_from_question(question: str) -> str:
    q = question.lower()
    aliases = {
        "invoice": "transaction",
        "invoices": "transaction",
        "payment": "transaction",
        "payments": "transaction",
        "transaction": "transaction",
        "transactions": "transaction",
        "task": "task",
        "tasks": "task",
        "people": "person",
        "person": "person",
        "clients": "person",
        "customers": "person",
        "staff": "person",
        "enterprise": "enterprise",
        "enterprises": "enterprise",
        "branch": "enterprise",
        "branches": "enterprise",
        "products": "product",
        "inventory": "product",
        "items": "product",
        "relationships": "relationship",
        "graph": "relationship",
        "addresses": "address",
    }
    for key, value in aliases.items():
        if key in q:
            return value
    return "transaction" if any(term in q for term in ("unpaid", "revenue", "ar", "aging")) else "task"


def _requested_output(question: str, output_type: str) -> str:
    requested = (output_type or "auto").strip().lower().replace("-", "_")
    if requested in OUTPUT_TYPES and requested != "auto":
        return requested
    q = question.lower()
    if any(term in q for term in ("download", "pdf", "export", "report")):
        return "downloadable_report"
    if any(term in q for term in ("dashboard", "widget", "pin")):
        return "dashboard_widget"
    if any(term in q for term in ("graph view", "network", "relationship graph", "entity graph")):
        return "graph_view"
    if any(term in q for term in ("risk card", "risk summary", "at risk")):
        return "risk_card"
    if any(term in q for term in ("table", "list", "records")):
        return "table"
    if any(term in q for term in ("time series", "trend", "over time", "by month", "monthly")):
        return "line_chart"
    if any(term in q for term in ("share", "percentage", "mix", "breakdown")):
        return "pie_chart"
    if any(term in q for term in ("chart", "bar", "by enterprise", "by branch", "by person", "by product", "compare")):
        return "bar_chart"
    return "bar_chart"


def _group_field(question: str, entity_type: str, df: pd.DataFrame) -> Optional[str]:
    q = question.lower()
    options = []
    if "by enterprise" in q or "by branch" in q or "by company" in q:
        options = ["enterprise_name", "enterprise_id", "counterparty_name"]
    elif "by person" in q or "by client" in q or "by customer" in q:
        options = ["counterparty_name", "person_name", "full_name", "assigned_to", "assignee_name"]
    elif "by product" in q or "by item" in q:
        options = ["product_name", "item_name", "name", "sku"]
    elif "by status" in q:
        options = ["payment_status", "status", "operating_status"]
    elif "by assignee" in q or "by staff" in q:
        options = ["assigned_to", "assignee_name", "assigned_user_id"]
    elif "by city" in q or "by location" in q:
        options = ["city", "country", "enterprise_name"]
    else:
        defaults = {
            "transaction": ["enterprise_name", "counterparty_name", "payment_status", "status"],
            "task": ["assigned_to", "assignee_name", "enterprise_name", "status"],
            "product": ["enterprise_name", "item_type", "status", "name"],
            "person": ["enterprise_name", "person_type", "status"],
            "enterprise": ["enterprise_type", "city", "status", "operating_status"],
            "relationship": ["relationship_type", "from_entity_type", "to_entity_type"],
            "address": ["city", "country", "enterprise_name"],
        }
        options = defaults.get(entity_type, ["status", "name"])
    return _first_col(df, options)


def _metric_field(question: str, entity_type: str, df: pd.DataFrame) -> tuple[Optional[str], str]:
    q = question.lower()
    if any(term in q for term in ("count", "how many", "number of")):
        return None, "count"
    preferred = []
    if any(term in q for term in ("amount", "revenue", "sales", "invoice", "unpaid", "owed", "ar")):
        preferred = ["amount", "total", "balance", "value"]
    elif any(term in q for term in ("stock", "inventory", "quantity")):
        preferred = ["stock_quantity", "quantity", "on_hand"]
    elif any(term in q for term in ("risk", "score")):
        preferred = ["risk_score", "score", "amount"]
    else:
        preferred = {
            "transaction": ["amount", "total", "value"],
            "product": ["stock_quantity", "unit_price", "reorder_level"],
            "task": [],
        }.get(entity_type, [])
    field = _first_col(df, preferred)
    return field, field or "count"


def _apply_filters(question: str, entity_type: str, df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    if df.empty:
        return df, []
    q = question.lower()
    out = df.copy()
    filters = []
    status_col = _first_col(out, ["payment_status", "status"])
    if any(term in q for term in ("unpaid", "outstanding", "owed")) and status_col:
        mask = ~out[status_col].astype(str).str.lower().isin(["paid", "settled", "complete", "completed", "closed"])
        out = out[mask]
        filters.append("unpaid/outstanding only")
    if "overdue" in q:
        due_col = _first_col(out, ["due_date"])
        if due_col:
            due = _date(out[due_col])
            out = out[due.notna() & (due < pd.Timestamp(datetime.now(timezone.utc)))]
            filters.append("overdue only")
    if any(term in q for term in ("low stock", "reorder")):
        stock_col = _first_col(out, ["stock_quantity", "quantity", "on_hand"])
        reorder_col = _first_col(out, ["reorder_level", "minimum_stock"])
        if stock_col and reorder_col:
            out = out[_num(out[stock_col]) <= _num(out[reorder_col])]
            filters.append("at/below reorder level")
    return out, filters


def _chart_type(output_type: str) -> str:
    return {
        "bar_chart": "bar",
        "line_chart": "line",
        "area_chart": "area",
        "pie_chart": "pie",
        "dashboard_widget": "bar",
    }.get(output_type, "bar")


def _title(question: str, entity_type: str, output_type: str, group_by: Optional[str], metric_label: str) -> str:
    if question and len(question.strip()) <= 90:
        clean = question.strip().rstrip("?")
        return clean[0].upper() + clean[1:]
    view = output_type.replace("_", " ")
    if group_by:
        return f"{metric_label.replace('_', ' ').title()} by {group_by.replace('_', ' ').title()}"
    return f"{entity_type.title()} {view.title()}"


def _aggregate(df: pd.DataFrame, group_by: Optional[str], metric_field: Optional[str], limit: int) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["name", "value"])
    if group_by and group_by in df.columns:
        work = df.copy()
        work["_name"] = work[group_by].fillna("Unspecified").astype(str).replace("", "Unspecified")
        if metric_field and metric_field in work.columns:
            work["_value"] = _num(work[metric_field]).fillna(0)
            grouped = work.groupby("_name")["_value"].sum().reset_index()
        else:
            grouped = work.groupby("_name").size().reset_index(name="_value")
        grouped = grouped.rename(columns={"_name": "name", "_value": "value"}).sort_values("value", ascending=False)
        return grouped.head(limit)
    return pd.DataFrame([{"name": "Records", "value": int(len(df))}])


def _time_series(df: pd.DataFrame, metric_field: Optional[str], limit: int) -> pd.DataFrame:
    date_col = _first_col(df, ["transaction_date", "date", "due_date", "created_at", "created_date", "completed_at", "completed_date"])
    if df.empty or not date_col:
        return pd.DataFrame(columns=["name", "value"])
    work = df.copy()
    work["_date"] = _date(work[date_col])
    work = work.dropna(subset=["_date"])
    if work.empty:
        return pd.DataFrame(columns=["name", "value"])
    if metric_field and metric_field in work.columns:
        work["_value"] = _num(work[metric_field]).fillna(0)
        series = work.groupby(work["_date"].dt.to_period("M"))["_value"].sum()
    else:
        series = work.groupby(work["_date"].dt.to_period("M")).size()
    rows = [{"name": str(idx), "value": float(val)} for idx, val in series.tail(limit).items()]
    return pd.DataFrame(rows)


def _table_spec(title: str, df: pd.DataFrame, entity_type: str, limit: int) -> dict:
    records = _clean_records(df, limit)
    columns = list(records[0].keys())[:12] if records else []
    rows = [[record.get(col) for col in columns] for record in records]
    return {
        "type": "table",
        "title": title,
        "entity_type": entity_type,
        "columns": columns,
        "rows": rows,
        "record_count": int(len(df)),
    }


def _risk_card_spec(title: str, df: pd.DataFrame, metric_field: Optional[str]) -> dict:
    value = int(len(df))
    if metric_field and metric_field in df.columns:
        value = float(_num(df[metric_field]).fillna(0).sum())
    severity = "critical" if value > 10 else "warning" if value > 0 else "positive"
    return {
        "type": "risk_card",
        "title": title,
        "severity": severity,
        "value": value,
        "supporting_records": _clean_records(df, 8),
    }


def _graph_spec(title: str, df: pd.DataFrame, limit: int) -> dict:
    from_col = _first_col(df, ["from_entity_id", "person_id", "enterprise_id"])
    to_col = _first_col(df, ["to_entity_id", "entity_id", "item_id"])
    if not from_col or not to_col:
        return {"type": "graph_view", "title": title, "nodes": [], "edges": [], "note": "No relationship edge columns found."}
    edges_df = df[[from_col, to_col]].dropna().head(limit)
    node_ids = sorted(set(edges_df[from_col].astype(str)) | set(edges_df[to_col].astype(str)))
    return {
        "type": "graph_view",
        "title": title,
        "nodes": [{"id": node_id, "label": node_id} for node_id in node_ids],
        "edges": [{"source": str(row[from_col]), "target": str(row[to_col])} for _, row in edges_df.iterrows()],
    }


def plan_visual_output(
    company_id: str,
    question: str,
    output_type: str = "auto",
    entity_type: Optional[str] = None,
    group_by: Optional[str] = None,
    metric: Optional[str] = None,
    limit: int = 20,
) -> dict:
    max_rows = max(1, min(int(limit or 20), 100))
    entity = entity_type or _entity_from_question(question or "")
    canonical, df, source = _load(company_id, entity)
    entity = canonical
    filtered, filters = _apply_filters(question or "", entity, df)
    selected_output = _requested_output(question or "", output_type)
    group = group_by if group_by in filtered.columns else _group_field(question or "", entity, filtered)
    metric_field, metric_label = _metric_field(question or "", entity, filtered)
    if metric and metric in filtered.columns:
        metric_field, metric_label = metric, metric
    title = _title(question or "", entity, selected_output, group, metric_label)

    visualization = {
        "output_type": selected_output,
        "title": title,
        "entity_type": entity,
        "filters": filters,
        "data_source": source,
        "reason": "",
    }
    charts: list[dict] = []
    table = _table_spec(title, filtered, entity, max_rows)
    report_spec = None

    if selected_output == "table":
        visualization["reason"] = "A table is best because the request asks for records/details or the rows need inspection."
    elif selected_output == "risk_card":
        visualization["reason"] = "A risk card is best because the request is about attention, exposure, or risk."
        visualization["risk_card"] = _risk_card_spec(title, filtered, metric_field)
    elif selected_output == "graph_view":
        visualization["reason"] = "A graph view is best because the request is relationship/network-oriented."
        visualization["graph"] = _graph_spec(title, filtered, max_rows)
    elif selected_output == "downloadable_report":
        visualization["reason"] = "A downloadable report is best because the request asks for a durable/reportable artifact."
        summary = _aggregate(filtered, group, metric_field, max_rows)
        chart = {
            "type": "bar",
            "title": title,
            "data": _clean_records(summary, max_rows),
            "keys": [{"key": "value", "color": "#10b981"}],
            "unit": "$" if metric_field and metric_field in {"amount", "total", "balance", "value"} else "",
        }
        charts.append(chart)
        report_spec = {
            "title": title,
            "format": "report",
            "sections": [
                {"title": "Summary", "content": f"{len(filtered)} {entity} records matched the request."},
                {"title": "Visual", "chart": chart},
                {"title": "Rows", "table": table},
            ],
        }
    else:
        if selected_output == "line_chart":
            chart_df = _time_series(filtered, metric_field, max_rows)
            chart_type = "line"
            visualization["reason"] = "A time-series chart is best because the request is temporal or trend-oriented."
        else:
            chart_df = _aggregate(filtered, group, metric_field, max_rows)
            chart_type = _chart_type(selected_output)
            visualization["reason"] = "A bar chart is best because the request compares categories."
            if selected_output == "pie_chart":
                visualization["reason"] = "A pie chart is best because the request asks for mix/share/breakdown."
            if selected_output == "dashboard_widget":
                visualization["reason"] = "A dashboard widget is best because the request asks for a reusable monitoring view."
        charts.append({
            "type": chart_type,
            "title": title,
            "data": _clean_records(chart_df, max_rows),
            "keys": [{"key": "value", "color": "#10b981"}],
            "unit": "$" if metric_field and metric_field in {"amount", "total", "balance", "value"} else "",
        })

    visual_language = {
        "allowed_outputs": sorted(OUTPUT_TYPES - {"auto"}),
        "selected_output": selected_output,
        "selection_rule": visualization["reason"],
        "chart_contract": "charts[] use {type,title,data:[{name,value}],keys,unit}; tables use {columns,rows}; graph views use {nodes,edges}.",
    }

    return {
        "visualization": visualization,
        "charts": charts,
        "table": table,
        "report_spec": report_spec,
        "visual_language": visual_language,
        "record_count": int(len(filtered)),
        "data_source": source,
        "note": "Idjwi selected the visual output and prepared a renderable spec. No records were changed.",
    }
