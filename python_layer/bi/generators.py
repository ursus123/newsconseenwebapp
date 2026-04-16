"""
bi/generators.py
----------------
Fetches data for each exportable report.

Three-tier fallback: analytics.* → raw.* → empty DataFrame.
(Base44 live is not called here — exports are analytics/datamart-only.
 Operators always have the dashboard for live data; exports serve the BI use case.)

Each generator returns a dict:
  {
    "title":       str          — human label for the report
    "description": str          — one-line description
    "sheets":      list[dict]   — one per sheet: {"name": str, "df": DataFrame}
    "primary":     str          — name of the main/primary sheet
  }
"""

from __future__ import annotations

import logging
from datetime import date

import pandas as pd

logger = logging.getLogger(__name__)


# ── DB helpers ────────────────────────────────────────────────────────────────

def _query(sql: str, params: dict, engine) -> pd.DataFrame:
    try:
        with engine.connect() as conn:
            from sqlalchemy import text
            return pd.read_sql(text(sql), conn, params=params)
    except Exception as exc:
        logger.debug("bi/generators query failed: %s", exc)
        return pd.DataFrame()


def _fetch(table: str, company_id: str, engine) -> pd.DataFrame:
    """Read a table from analytics.* with company_id filter."""
    for schema in ("analytics", "raw"):
        df = _query(
            f"SELECT * FROM {schema}.{table} WHERE company_id = :cid",
            {"cid": company_id},
            engine,
        )
        if not df.empty:
            return df
    return pd.DataFrame()


def _clean(df: pd.DataFrame) -> pd.DataFrame:
    """Drop internal columns, convert dates to strings for Excel compat."""
    drop = [c for c in df.columns if c.startswith("_")]
    df = df.drop(columns=drop, errors="ignore")
    for col in df.select_dtypes(include=["datetimetz", "datetime64[ns, UTC]"]).columns:
        df[col] = df[col].astype(str)
    return df


# ── Report generators ─────────────────────────────────────────────────────────

def generate_people(company_id: str, engine) -> dict:
    summary  = _clean(_fetch("people_summary",    company_id, engine))
    enriched = _clean(_fetch("person_enrichment", company_id, engine))

    sheets = [{"name": "People Summary", "df": summary}]
    if not enriched.empty:
        sheets.append({"name": "Enrichment", "df": enriched})

    # Merge for a combined "Full Data" sheet if both exist
    if not summary.empty and not enriched.empty and "person_id" in summary.columns and "person_id" in enriched.columns:
        enrich_cols = [c for c in enriched.columns if c not in summary.columns or c == "person_id"]
        merged = summary.merge(enriched[enrich_cols], on="person_id", how="left")
        sheets.insert(0, {"name": "Full Data", "df": merged})

    return {
        "title":       "People Report",
        "description": f"Headcount, engagement, churn risk and CLV — exported {date.today()}",
        "sheets":      sheets,
        "primary":     "Full Data" if len(sheets) > 2 else "People Summary",
    }


def generate_transactions(company_id: str, engine) -> dict:
    summary = _clean(_fetch("transaction_summary",    company_id, engine))
    enriched = _clean(_fetch("transaction_enrichment", company_id, engine))

    sheets = [{"name": "Transactions", "df": summary}]
    if not enriched.empty:
        sheets.append({"name": "Enrichment", "df": enriched})

    if not summary.empty and not enriched.empty and "transaction_id" in summary.columns and "transaction_id" in enriched.columns:
        enrich_cols = [c for c in enriched.columns if c not in summary.columns or c == "transaction_id"]
        merged = summary.merge(enriched[enrich_cols], on="transaction_id", how="left")
        sheets.insert(0, {"name": "Full Data", "df": merged})

    return {
        "title":       "Transactions Report",
        "description": f"Revenue, invoices, payment behaviour — exported {date.today()}",
        "sheets":      sheets,
        "primary":     "Full Data" if len(sheets) > 2 else "Transactions",
    }


def generate_products(company_id: str, engine) -> dict:
    summary  = _clean(_fetch("product_summary",    company_id, engine))
    enriched = _clean(_fetch("product_enrichment", company_id, engine))

    sheets = [{"name": "Products", "df": summary}]
    if not enriched.empty:
        sheets.append({"name": "Enrichment", "df": enriched})

    if not summary.empty and not enriched.empty and "product_id" in summary.columns and "product_id" in enriched.columns:
        enrich_cols = [c for c in enriched.columns if c not in summary.columns or c == "product_id"]
        merged = summary.merge(enriched[enrich_cols], on="product_id", how="left")
        sheets.insert(0, {"name": "Full Data", "df": merged})

    return {
        "title":       "Products Report",
        "description": f"Stock, demand trend, stockout risk, demand forecast — exported {date.today()}",
        "sheets":      sheets,
        "primary":     "Full Data" if len(sheets) > 2 else "Products",
    }


def generate_tasks(company_id: str, engine) -> dict:
    summary  = _clean(_fetch("task_summary",    company_id, engine))
    enriched = _clean(_fetch("task_enrichment", company_id, engine))

    sheets = [{"name": "Tasks", "df": summary}]
    if not enriched.empty:
        sheets.append({"name": "Enrichment", "df": enriched})

    return {
        "title":       "Tasks Report",
        "description": f"Task completion, SLA risk, overdue analysis — exported {date.today()}",
        "sheets":      sheets,
        "primary":     "Tasks",
    }


def generate_enterprises(company_id: str, engine) -> dict:
    summary  = _clean(_fetch("enterprise_summary",    company_id, engine))
    enriched = _clean(_fetch("enterprise_enrichment", company_id, engine))

    sheets = [{"name": "Enterprises", "df": summary}]
    if not enriched.empty:
        sheets.append({"name": "Enrichment", "df": enriched})

    if not summary.empty and not enriched.empty and "enterprise_id" in summary.columns and "enterprise_id" in enriched.columns:
        enrich_cols = [c for c in enriched.columns if c not in summary.columns or c == "enterprise_id"]
        merged = summary.merge(enriched[enrich_cols], on="enterprise_id", how="left")
        sheets.insert(0, {"name": "Full Data", "df": merged})

    return {
        "title":       "Enterprises Report",
        "description": f"Enterprise overview, revenue trend, payment behaviour — exported {date.today()}",
        "sheets":      sheets,
        "primary":     "Full Data" if len(sheets) > 2 else "Enterprises",
    }


def generate_scores(company_id: str, engine) -> dict:
    scores = _clean(_fetch("entity_scores", company_id, engine))

    # Split by entity_type for separate sheets if the column exists
    sheets = []
    if not scores.empty and "entity_type" in scores.columns:
        for etype in scores["entity_type"].unique():
            sub = scores[scores["entity_type"] == etype].copy()
            sheets.append({"name": etype.capitalize(), "df": sub})

    if not sheets:
        sheets = [{"name": "Entity Scores", "df": scores}]

    return {
        "title":       "Entity Risk Scores",
        "description": f"Composite risk, quality, and intelligence scores per entity — exported {date.today()}",
        "sheets":      sheets,
        "primary":     sheets[0]["name"],
    }


# ── Registry ──────────────────────────────────────────────────────────────────

REPORT_GENERATORS = {
    "people":       generate_people,
    "transactions": generate_transactions,
    "products":     generate_products,
    "tasks":        generate_tasks,
    "enterprises":  generate_enterprises,
    "scores":       generate_scores,
}
