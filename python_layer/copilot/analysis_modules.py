"""
Idjwi built-in analysis modules.

These modules turn tenant records into decision-oriented findings. They do not
mutate data and they do not require an LLM to reason over basic operating
patterns such as trends, anomalies, bottlenecks, inventory health, AR aging,
relationship centrality, and missing-data impact.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

import pandas as pd


ANALYSIS_TYPES = {
    "all",
    "descriptive",
    "trend",
    "anomaly",
    "churn_risk",
    "cohort",
    "inventory",
    "ar_aging",
    "task_bottleneck",
    "centrality",
    "enterprise_performance",
    "missing_data_impact",
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


def _records(df: pd.DataFrame, limit: int = 20) -> list[dict]:
    if df is None or df.empty:
        return []
    try:
        from database import _clean_df

        return _clean_df(df.head(limit)).to_dict(orient="records")
    except Exception:
        return df.head(limit).where(df.head(limit).notna(), None).to_dict(orient="records")


def _load(company_id: str, entity_type: str) -> tuple[pd.DataFrame, str]:
    from .queries import _ontology_entity_df

    _canonical, df, source = _ontology_entity_df(company_id, entity_type)
    if df is None:
        df = pd.DataFrame()
    return df.copy(), source


def _finding(module: str, severity: str, title: str, evidence: list[str], recommendation: str, records: Optional[list[dict]] = None) -> dict:
    return {
        "module": module,
        "severity": severity,
        "title": title,
        "evidence": evidence[:6],
        "recommendation": recommendation,
        "records": records or [],
    }


def _descriptive(data: dict[str, pd.DataFrame]) -> list[dict]:
    counts = {name: int(len(df)) for name, df in data.items()}
    findings = [
        _finding(
            "descriptive_statistics",
            "info",
            "Tenant data footprint",
            [", ".join(f"{name}: {count}" for name, count in counts.items())],
            "Use this as the baseline before deeper analysis; empty entities should be onboarded before expecting full reasoning.",
        )
    ]
    for entity, df in data.items():
        if df.empty:
            continue
        numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c]) or pd.to_numeric(df[c], errors="coerce").notna().any()]
        stats = []
        for col in numeric_cols[:5]:
            values = _num(df[col]).dropna()
            if len(values) >= 2:
                stats.append(f"{entity}.{col}: avg {values.mean():.2f}, min {values.min():.2f}, max {values.max():.2f}")
        if stats:
            findings.append(
                _finding(
                    "descriptive_statistics",
                    "info",
                    f"Numeric profile for {entity}",
                    stats,
                    "Use numeric spread to spot outliers, thresholds, and reporting defaults.",
                )
            )
    return findings


def _trend(transactions: pd.DataFrame, tasks: pd.DataFrame) -> list[dict]:
    findings: list[dict] = []
    if not transactions.empty:
        date_col = _first_col(transactions, ["transaction_date", "date", "created_at", "created_date"])
        amount_col = _first_col(transactions, ["amount", "total", "value"])
        if date_col and amount_col:
            df = transactions.copy()
            df["_date"] = _date(df[date_col])
            df["_amount"] = _num(df[amount_col]).fillna(0)
            monthly = df.dropna(subset=["_date"]).groupby(df["_date"].dt.to_period("M"))["_amount"].sum().tail(6)
            if len(monthly) >= 2:
                delta = float(monthly.iloc[-1] - monthly.iloc[-2])
                pct = (delta / float(monthly.iloc[-2]) * 100) if float(monthly.iloc[-2]) else None
                sev = "positive" if delta > 0 else "warning" if delta < 0 else "info"
                evidence = [f"{idx}: {val:.2f}" for idx, val in monthly.items()]
                if pct is not None:
                    evidence.append(f"Latest month changed by {pct:.1f}% vs previous month.")
                findings.append(_finding("trend_analysis", sev, "Revenue trend", evidence, "Investigate the drivers of the latest monthly movement and compare by enterprise/client."))
    if not tasks.empty:
        date_col = _first_col(tasks, ["completed_at", "completed_date", "due_date", "created_at", "created_date"])
        if date_col and "status" in tasks.columns:
            df = tasks.copy()
            df["_date"] = _date(df[date_col])
            complete = df["status"].astype(str).str.lower().isin(["completed", "done", "closed"])
            monthly = df.dropna(subset=["_date"]).assign(_complete=complete).groupby(df["_date"].dt.to_period("M")).agg(total=("id", "count"), completed=("_complete", "sum")).tail(6)
            if not monthly.empty:
                monthly["completion_rate_pct"] = (monthly["completed"] / monthly["total"].replace(0, pd.NA) * 100).round(1)
                latest = monthly.iloc[-1]["completion_rate_pct"]
                sev = "warning" if latest < 70 else "positive" if latest >= 90 else "info"
                findings.append(_finding("trend_analysis", sev, "Task completion trend", [f"{idx}: {row.completion_rate_pct}% complete ({int(row.completed)}/{int(row.total)})" for idx, row in monthly.iterrows()], "If completion is falling, check overdue work by assignee and enterprise."))
    return findings


def _anomalies(data: dict[str, pd.DataFrame]) -> list[dict]:
    findings: list[dict] = []
    for entity, df in data.items():
        if df.empty:
            continue
        for col in df.columns:
            values = _num(df[col])
            valid = values.dropna()
            if len(valid) < 8 or valid.std() == 0:
                continue
            z = ((values - valid.mean()) / valid.std()).abs()
            outliers = df[z >= 2.5].copy()
            if not outliers.empty:
                findings.append(_finding("anomaly_detection", "warning", f"Outliers in {entity}.{col}", [f"{len(outliers)} record(s) are more than 2.5 standard deviations from normal."], "Review these records before using them in forecasts, risk scores, or KPI decisions.", _records(outliers, 5)))
                break
    return findings


def _churn_risk(people: pd.DataFrame, transactions: pd.DataFrame, tasks: pd.DataFrame) -> list[dict]:
    if people.empty:
        return []
    df = people.copy()
    stale_ids: set[str] = set()
    today = pd.Timestamp(datetime.now(timezone.utc))
    for activity_df, id_cols, date_cols in [
        (transactions, ["person_id", "counterparty_id"], ["transaction_date", "date", "created_at"]),
        (tasks, ["person_id", "assigned_user_id"], ["completed_at", "completed_date", "created_at", "due_date"]),
    ]:
        id_col = _first_col(activity_df, id_cols) if not activity_df.empty else None
        date_col = _first_col(activity_df, date_cols) if not activity_df.empty else None
        if id_col and date_col:
            act = activity_df[[id_col, date_col]].copy()
            act["_date"] = _date(act[date_col])
            recent = act.dropna(subset=["_date"]).groupby(id_col)["_date"].max()
            stale_ids |= {str(idx) for idx, dt in recent.items() if (today - dt).days > 90}
    status_col = _first_col(df, ["status", "operating_status"])
    inactive = df[df[status_col].astype(str).str.lower().isin(["inactive", "ended", "archived", "lost"])] if status_col else pd.DataFrame()
    id_col = _first_col(df, ["id"])
    stale = df[df[id_col].astype(str).isin(stale_ids)] if id_col and stale_ids else pd.DataFrame()
    risk = pd.concat([inactive, stale]).drop_duplicates() if not inactive.empty or not stale.empty else pd.DataFrame()
    if risk.empty:
        return [_finding("churn_risk_scoring", "positive", "No obvious churn risk found", ["No inactive/lost people or 90-day stale activity matches were found."], "Keep monitoring activity cadence and relationship strength.")]
    return [_finding("churn_risk_scoring", "warning", f"{len(risk)} people show churn/retention risk", ["Inactive/lost status or no recent activity for more than 90 days."], "Ask Idjwi to list these people, then create follow-up tasks for the highest-value records.", _records(risk, 10))]


def _cohort(people: pd.DataFrame, transactions: pd.DataFrame) -> list[dict]:
    findings: list[dict] = []
    if not people.empty:
        created = _first_col(people, ["created_at", "created_date"])
        if created:
            df = people.copy()
            df["_month"] = _date(df[created]).dt.to_period("M")
            cohort = df.dropna(subset=["_month"]).groupby("_month").size().tail(6)
            if not cohort.empty:
                findings.append(_finding("cohort_analysis", "info", "Recent people cohorts", [f"{idx}: {count} people" for idx, count in cohort.items()], "Compare cohort size with revenue, task load, or churn risk to find growth quality."))
    if not transactions.empty:
        ent_col = _first_col(transactions, ["enterprise_name", "enterprise_id", "counterparty_name"])
        amt_col = _first_col(transactions, ["amount", "total", "value"])
        if ent_col and amt_col:
            df = transactions.copy()
            df["_amount"] = _num(df[amt_col]).fillna(0)
            cohort = df.groupby(ent_col)["_amount"].sum().sort_values(ascending=False).head(5)
            if not cohort.empty:
                findings.append(_finding("cohort_analysis", "info", "Top revenue cohorts", [f"{idx}: {val:.2f}" for idx, val in cohort.items()], "Use this as a cohort lens; compare high-revenue groups against churn, overdue work, and AR aging."))
    return findings


def _inventory(products: pd.DataFrame) -> list[dict]:
    if products.empty:
        return []
    df = products.copy()
    stock_col = _first_col(df, ["stock_quantity", "quantity", "on_hand"])
    reorder_col = _first_col(df, ["reorder_level", "minimum_stock"])
    expiry_col = _first_col(df, ["expiry_date", "expires_at"])
    findings: list[dict] = []
    if stock_col and reorder_col:
        df["_stock"] = _num(df[stock_col])
        df["_reorder"] = _num(df[reorder_col])
        low = df[df["_stock"].notna() & df["_reorder"].notna() & (df["_stock"] <= df["_reorder"])]
        if not low.empty:
            findings.append(_finding("inventory_health", "warning", f"{len(low)} products are at/below reorder level", ["Stock quantity is less than or equal to reorder level."], "Prioritize reorders by sales velocity, criticality, and supplier lead time.", _records(low, 10)))
    if expiry_col:
        expiry = _date(df[expiry_col])
        soon = df[expiry.notna() & ((expiry - pd.Timestamp(datetime.now(timezone.utc))).dt.days <= 30)]
        if not soon.empty:
            findings.append(_finding("inventory_health", "warning", f"{len(soon)} products expire within 30 days", ["Expiry date is within the next 30 days or already passed."], "Discount, transfer, consume, or quarantine these items based on product type.", _records(soon, 10)))
    return findings


def _ar_aging(transactions: pd.DataFrame) -> list[dict]:
    if transactions.empty:
        return []
    amount_col = _first_col(transactions, ["amount", "balance", "total"])
    due_col = _first_col(transactions, ["due_date", "transaction_date", "date"])
    status_col = _first_col(transactions, ["payment_status", "status"])
    if not amount_col or not due_col:
        return []
    df = transactions.copy()
    df["_amount"] = _num(df[amount_col]).fillna(0)
    df["_due"] = _date(df[due_col])
    if status_col:
        unpaid = ~df[status_col].astype(str).str.lower().isin(["paid", "settled", "complete", "completed", "closed"])
        df = df[unpaid]
    days = (pd.Timestamp(datetime.now(timezone.utc)) - df["_due"]).dt.days
    overdue = df[df["_due"].notna() & (days > 0) & (df["_amount"] > 0)].copy()
    if overdue.empty:
        return [_finding("ar_aging", "positive", "No overdue receivables detected", ["No unpaid positive-value transactions with past due dates were found."], "Keep payment status and due dates populated so AR aging stays reliable.")]
    severe = overdue[days.loc[overdue.index] > 60]
    total = float(overdue["_amount"].sum())
    severity = "critical" if not severe.empty else "warning"
    return [_finding("ar_aging", severity, f"{len(overdue)} overdue receivable(s), total {total:.2f}", [f"{len(severe)} are more than 60 days overdue."], "Prioritize collection by age, amount, and relationship importance.", _records(overdue.sort_values("_amount", ascending=False), 10))]


def _task_bottlenecks(tasks: pd.DataFrame) -> list[dict]:
    if tasks.empty:
        return []
    status_col = _first_col(tasks, ["status"])
    due_col = _first_col(tasks, ["due_date"])
    assignee_col = _first_col(tasks, ["assigned_to", "assignee_name", "assigned_user_id"])
    findings: list[dict] = []
    if status_col and due_col:
        df = tasks.copy()
        df["_due"] = _date(df[due_col])
        open_mask = ~df[status_col].astype(str).str.lower().isin(["completed", "done", "closed", "cancelled"])
        overdue = df[open_mask & df["_due"].notna() & (df["_due"] < pd.Timestamp(datetime.now(timezone.utc)))]
        if not overdue.empty:
            findings.append(_finding("task_bottlenecks", "warning", f"{len(overdue)} open tasks are overdue", ["Open/non-completed tasks have due dates in the past."], "Reassign, close, or escalate overdue work; look for repeated assignee or enterprise patterns.", _records(overdue, 10)))
    if assignee_col:
        load = tasks[tasks[assignee_col].notna() & (tasks[assignee_col].astype(str).str.strip() != "")].groupby(assignee_col).size().sort_values(ascending=False)
        if len(load) >= 2 and load.iloc[0] >= max(5, load.mean() * 2):
            findings.append(_finding("task_bottlenecks", "warning", f"{load.index[0]} has concentrated task load", [f"{int(load.iloc[0])} tasks assigned; average is {load.mean():.1f}."], "Balance assignments or inspect whether this person is a true bottleneck."))
    return findings


def _centrality(relationships: pd.DataFrame) -> list[dict]:
    if relationships.empty:
        return []
    from_col = _first_col(relationships, ["from_entity_id", "person_id", "enterprise_id"])
    to_col = _first_col(relationships, ["to_entity_id", "entity_id", "item_id"])
    if not from_col or not to_col:
        return []
    edges = relationships[[from_col, to_col]].dropna()
    if edges.empty:
        return []
    degree = pd.concat([edges[from_col].astype(str), edges[to_col].astype(str)]).value_counts()
    if degree.empty:
        return []
    top = degree.head(10)
    severity = "warning" if int(top.iloc[0]) >= max(5, degree.mean() * 2) else "info"
    return [_finding("relationship_centrality", severity, "Most central graph nodes", [f"{idx}: {int(val)} relationship links" for idx, val in top.items()], "Central nodes are leverage points and dependency risks; inspect whether any should have backup relationships.")]


def _enterprise_performance(enterprises: pd.DataFrame, transactions: pd.DataFrame, tasks: pd.DataFrame) -> list[dict]:
    if enterprises.empty:
        return []
    rows = enterprises.copy()
    name_col = _first_col(rows, ["name", "enterprise_name", "short_name", "id"])
    if not name_col:
        return []
    score = pd.DataFrame({name_col: rows[name_col].astype(str)})
    if not transactions.empty:
        ent_col = _first_col(transactions, ["enterprise_name", "enterprise_id"])
        amt_col = _first_col(transactions, ["amount", "total", "value"])
        if ent_col and amt_col:
            revenue = transactions.assign(_amount=_num(transactions[amt_col]).fillna(0)).groupby(ent_col)["_amount"].sum()
            score["revenue"] = score[name_col].map(revenue).fillna(0)
    if not tasks.empty:
        ent_col = _first_col(tasks, ["enterprise_name", "enterprise_id", "assigned_enterprise_id"])
        status_col = _first_col(tasks, ["status"])
        if ent_col and status_col:
            t = tasks.copy()
            t["_complete"] = t[status_col].astype(str).str.lower().isin(["completed", "done", "closed"])
            task_rate = t.groupby(ent_col)["_complete"].mean() * 100
            score["completion_rate_pct"] = score[name_col].map(task_rate)
    if "revenue" not in score.columns and "completion_rate_pct" not in score.columns:
        return []
    score["_score"] = 0
    if "revenue" in score.columns and score["revenue"].max() > 0:
        score["_score"] += score["revenue"] / score["revenue"].max() * 60
    if "completion_rate_pct" in score.columns:
        score["_score"] += score["completion_rate_pct"].fillna(0) * 0.4
    ranked = score.sort_values("_score", ascending=False)
    return [_finding("enterprise_performance_comparison", "info", "Enterprise performance ranking", [f"{row[name_col]}: score {row['_score']:.1f}" for _, row in ranked.head(5).iterrows()], "Compare top and bottom enterprises to find transferable operating patterns.", _records(ranked, 10))]


def _missing_data_impact(data: dict[str, pd.DataFrame]) -> list[dict]:
    findings: list[dict] = []
    important = {
        "person": ["id", "full_name", "name", "email", "enterprise_id", "enterprise_name"],
        "enterprise": ["id", "name", "enterprise_name", "city", "country"],
        "product": ["id", "name", "sku", "stock_quantity", "reorder_level", "enterprise_id"],
        "task": ["id", "title", "status", "assigned_to", "assignee_name", "due_date", "enterprise_id"],
        "transaction": ["id", "amount", "transaction_date", "due_date", "counterparty_name", "enterprise_id", "product_id"],
        "relationship": ["id", "from_entity_id", "to_entity_id", "relationship_type"],
        "address": ["id", "street", "city", "country", "entity_id", "enterprise_id"],
    }
    for entity, columns in important.items():
        df = data.get(entity, pd.DataFrame())
        if df.empty:
            findings.append(_finding("missing_data_impact", "warning", f"No {entity} records", [f"{entity} is empty."], f"Add {entity} data before expecting analysis that depends on it."))
            continue
        impacts = []
        for col in columns:
            if col in df.columns:
                missing_pct = float((df[col].isna() | (df[col].astype(str).str.strip() == "")).mean() * 100)
                if missing_pct >= 40:
                    impacts.append(f"{col}: {missing_pct:.0f}% missing")
        if impacts:
            findings.append(_finding("missing_data_impact", "warning", f"{entity} has analysis-limiting missing fields", impacts, "Repair these fields first; they directly limit graph links, risk scoring, BI filters, and recommendations."))
    return findings


def run_analysis_modules(
    company_id: str,
    analysis_type: str = "all",
    entity_type: Optional[str] = None,
    limit: int = 20,
) -> dict:
    requested = (analysis_type or "all").strip().lower().replace("-", "_")
    if requested not in ANALYSIS_TYPES:
        requested = "all"
    data_sources: dict[str, str] = {}
    data: dict[str, pd.DataFrame] = {}
    for entity in ("person", "enterprise", "product", "task", "transaction", "relationship", "address"):
        df, source = _load(company_id, entity)
        data[entity] = df
        data_sources[entity] = source

    modules: list[dict] = []
    selected = {requested} if requested != "all" else ANALYSIS_TYPES - {"all"}
    if "descriptive" in selected:
        modules.extend(_descriptive(data))
    if "trend" in selected:
        modules.extend(_trend(data["transaction"], data["task"]))
    if "anomaly" in selected:
        modules.extend(_anomalies(data))
    if "churn_risk" in selected:
        modules.extend(_churn_risk(data["person"], data["transaction"], data["task"]))
    if "cohort" in selected:
        modules.extend(_cohort(data["person"], data["transaction"]))
    if "inventory" in selected:
        modules.extend(_inventory(data["product"]))
    if "ar_aging" in selected:
        modules.extend(_ar_aging(data["transaction"]))
    if "task_bottleneck" in selected:
        modules.extend(_task_bottlenecks(data["task"]))
    if "centrality" in selected:
        modules.extend(_centrality(data["relationship"]))
    if "enterprise_performance" in selected:
        modules.extend(_enterprise_performance(data["enterprise"], data["transaction"], data["task"]))
    if "missing_data_impact" in selected:
        modules.extend(_missing_data_impact(data))

    if entity_type and entity_type != "all":
        entity = entity_type.strip().lower()
        modules = [
            finding for finding in modules
            if entity in str(finding.get("title", "")).lower()
            or entity in str(finding.get("recommendation", "")).lower()
            or any(entity in str(e).lower() for e in finding.get("evidence", []))
        ] or modules

    severity_rank = {"critical": 0, "warning": 1, "positive": 2, "info": 3}
    modules = sorted(modules, key=lambda f: severity_rank.get(f.get("severity"), 9))[: max(1, min(int(limit or 20), 100))]

    decisions = []
    for finding in modules[:8]:
        decisions.append({
            "decision_area": finding["module"],
            "question_answered": finding["title"],
            "recommended_next_action": finding["recommendation"],
            "severity": finding["severity"],
        })

    return {
        "analysis_type": requested,
        "finding_count": len(modules),
        "findings": modules,
        "decisions": decisions,
        "data_sources": data_sources,
        "available_modules": sorted(ANALYSIS_TYPES - {"all"}),
        "note": "Built-in Idjwi analysis modules convert company data into decision-ready findings. No records were changed.",
    }
