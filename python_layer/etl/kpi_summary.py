"""
etl/kpi_summary.py
------------------
analytics.kpi_summary — one row per company_id, refreshed on every ETL run.

This is the single most important table in the analytics layer. It is the
operator's business health snapshot — a cross-entity join of all 7 canonical
entities into one row. Every autonomous agent, every copilot tool, and every
dashboard stat card should read from this table first.

Columns produced:
    company_id
    snapshot_date / loaded_at         (added by load_dataframe)

    -- People --
    total_people              total headcount
    active_staff              active staff count
    active_clients            active client count
    inactive_people           inactive / on_leave count
    client_staff_ratio        active_clients / active_staff (null if staff=0)

    -- Transactions (30d window) --
    revenue_30d               posted revenue sum last 30 days
    expense_30d               posted expense sum last 30 days
    net_profit_30d            revenue_30d - expense_30d
    revenue_prev_30d          posted revenue sum 30–60 days ago
    mom_revenue_growth_pct    MoM % change in revenue (null if prev=0)
    revenue_90d               posted revenue sum last 90 days
    overdue_invoice_total     sum of posted unpaid revenue invoices past due_date
    overdue_invoice_count     count of overdue invoices
    avg_days_to_pay           mean days from invoice to payment

    -- Tasks --
    open_tasks                tasks with status open/in_progress
    overdue_tasks             tasks past due_date not completed
    task_completion_rate_pct  completed / total * 100
    avg_task_completion_days  mean days from created to completed

    -- Products --
    total_products            total product records
    low_stock_count           products below reorder_level
    dead_stock_count          products with no transaction in 90 days
    out_of_stock_count        products with stock_quantity <= 0

    -- Enterprises --
    total_enterprises         total enterprise records
    active_enterprises        enterprises with operating_status=open

    -- Relationships --
    total_relationships       total active relationship records

    -- Churn / retention signals --
    churn_risk_count          clients with no transaction in 60+ days
    new_clients_30d           clients created in last 30 days
"""

import logging
from datetime import datetime, timezone

import pandas as pd

from config.taxonomy import PERSON_TYPE_SETS
from etl.transactions import REVENUE_TYPES, EXPENSE_TYPES

logger = logging.getLogger(__name__)

# Canonical staff/client classification — single source of truth is
# config/taxonomy.py's PERSON_TYPE_SETS (also used by etl/people.py).
_STAFF_TYPES = PERSON_TYPE_SETS["staff"]
_CLIENT_TYPES = PERSON_TYPE_SETS["client"]


def transform_kpi_summary(
    people_df: pd.DataFrame,
    transactions_df: pd.DataFrame,
    tasks_df: pd.DataFrame,
    products_df: pd.DataFrame,
    enterprises_df: pd.DataFrame,
    relationships_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Build analytics.kpi_summary — one row per company_id.

    All six DataFrames are the raw extracts from Base44 (no pre-aggregation).
    ETL multi-tenancy rule: extract ALL companies, derive company_ids from the data.
    """
    now = datetime.now(timezone.utc)
    now_ts = pd.Timestamp.now(tz="UTC")

    # ── Discover all company_ids ─────────────────────────────────────────────
    all_companies: set = set()
    for df in [people_df, transactions_df, tasks_df, products_df, enterprises_df]:
        if not df.empty and "company_id" in df.columns:
            all_companies.update(df["company_id"].dropna().unique())

    if not all_companies:
        logger.warning("transform_kpi_summary: no company_ids found — returning empty")
        return pd.DataFrame()

    rows = []

    for cid in sorted(all_companies):

        row: dict = {"company_id": cid}

        # ── People ────────────────────────────────────────────────────────────
        ppl = _company_rows(people_df, cid)
        if not ppl.empty:
            pt = ppl.get("person_type", pd.Series("", index=ppl.index)).fillna("").str.lower().str.strip()
            st = ppl.get("status", pd.Series("", index=ppl.index)).fillna("").str.lower().str.strip()
            row["total_people"]   = len(ppl)
            row["active_staff"]   = int(((pt.isin(_STAFF_TYPES))  & (st == "active")).sum())
            row["active_clients"] = int(((pt.isin(_CLIENT_TYPES)) & (st == "active")).sum())
            row["inactive_people"]= int((st.isin({"inactive", "on_leave"})).sum())
            row["client_staff_ratio"] = (
                round(row["active_clients"] / row["active_staff"], 2)
                if row["active_staff"] > 0 else None
            )

            # New clients in last 30 days
            created = pd.to_datetime(ppl.get("created_date"), errors="coerce", utc=True)
            row["new_clients_30d"] = int((
                pt.isin(_CLIENT_TYPES)
                & created.notna()
                & (created >= now_ts - pd.Timedelta(days=30))
            ).sum())
        else:
            row.update({"total_people": 0, "active_staff": 0, "active_clients": 0,
                        "inactive_people": 0, "client_staff_ratio": None, "new_clients_30d": 0})

        # ── Transactions ──────────────────────────────────────────────────────
        tx = _company_rows(transactions_df, cid)
        if not tx.empty:
            tx = tx.copy()
            tx["amount"] = pd.to_numeric(tx.get("amount", 0), errors="coerce").fillna(0)
            tx["status_clean"] = tx.get("status", pd.Series("", index=tx.index)).fillna("").str.lower().str.strip()
            posted = tx[tx["status_clean"] == "posted"].copy()

            if not posted.empty:
                posted["_date"] = pd.to_datetime(
                    posted.get("transaction_date", posted.get("created_date")),
                    errors="coerce", utc=True,
                )
                tt = posted.get("transaction_type", pd.Series("", index=posted.index)).fillna("").str.lower()
                posted["_is_rev"] = tt.isin(REVENUE_TYPES)
                posted["_is_exp"] = tt.isin(EXPENSE_TYPES)

                in_30d = posted["_date"].notna() & (posted["_date"] >= now_ts - pd.Timedelta(days=30))
                in_90d = posted["_date"].notna() & (posted["_date"] >= now_ts - pd.Timedelta(days=90))
                prev   = (
                    posted["_date"].notna()
                    & (posted["_date"] >= now_ts - pd.Timedelta(days=60))
                    & (posted["_date"] <  now_ts - pd.Timedelta(days=30))
                )

                rev_30d  = float(posted.loc[posted["_is_rev"] & in_30d,  "amount"].sum())
                exp_30d  = float(posted.loc[posted["_is_exp"] & in_30d,  "amount"].sum())
                rev_prev = float(posted.loc[posted["_is_rev"] & prev,    "amount"].sum())
                rev_90d  = float(posted.loc[posted["_is_rev"] & in_90d,  "amount"].sum())

                row["revenue_30d"]      = round(rev_30d, 2)
                row["expense_30d"]      = round(exp_30d, 2)
                row["net_profit_30d"]   = round(rev_30d - exp_30d, 2)
                row["revenue_prev_30d"] = round(rev_prev, 2)
                row["revenue_90d"]      = round(rev_90d, 2)
                row["mom_revenue_growth_pct"] = (
                    round((rev_30d - rev_prev) / rev_prev * 100, 1)
                    if rev_prev > 0 else None
                )

                # Overdue invoices: posted revenue, past due_date, not reconciled
                if "due_date" in posted.columns:
                    posted["_due"] = pd.to_datetime(posted["due_date"], errors="coerce", utc=True)
                    overdue_mask = (
                        posted["_is_rev"]
                        & posted["_due"].notna()
                        & (posted["_due"] < now_ts)
                        & (posted.get("payment_status", pd.Series("", index=posted.index))
                            .fillna("").str.lower() != "paid")
                    )
                    row["overdue_invoice_total"] = round(float(posted.loc[overdue_mask, "amount"].sum()), 2)
                    row["overdue_invoice_count"] = int(overdue_mask.sum())
                else:
                    row["overdue_invoice_total"] = 0.0
                    row["overdue_invoice_count"] = 0

                # Avg days to pay
                if "payment_date" in posted.columns:
                    posted["_pdate"] = pd.to_datetime(posted["payment_date"], errors="coerce", utc=True)
                    days = (
                        (posted["_pdate"] - posted["_date"])
                        .dt.total_seconds()
                        .div(86400)
                        .where(posted["_pdate"].notna() & posted["_date"].notna() & posted["_is_rev"])
                    )
                    row["avg_days_to_pay"] = round(float(days.mean()), 1) if days.notna().any() else None
                else:
                    row["avg_days_to_pay"] = None
            else:
                row.update({"revenue_30d": 0.0, "expense_30d": 0.0, "net_profit_30d": 0.0,
                            "revenue_prev_30d": 0.0, "revenue_90d": 0.0,
                            "mom_revenue_growth_pct": None, "overdue_invoice_total": 0.0,
                            "overdue_invoice_count": 0, "avg_days_to_pay": None})

            # Churn risk: clients with NO posted transaction in 60+ days
            if not ppl.empty and not posted.empty:
                clients = ppl[
                    ppl.get("person_type", pd.Series("", index=ppl.index))
                    .fillna("").str.lower().str.strip().isin(_CLIENT_TYPES)
                ]
                if not clients.empty and "person_name" in posted.columns:
                    recent_cutoff = now_ts - pd.Timedelta(days=60)
                    recent_clients = set(
                        posted.loc[
                            posted["_date"].notna() & (posted["_date"] >= recent_cutoff),
                            "person_name"
                        ].dropna().unique()
                    )
                    client_names = set(
                        (clients.get("full_name", pd.Series("", index=clients.index))
                         .fillna("") + " " +
                         clients.get("first_name", pd.Series("", index=clients.index))
                         .fillna("")).str.strip().unique()
                    )
                    row["churn_risk_count"] = int(sum(
                        1 for n in client_names if n and n not in recent_clients
                    ))
                else:
                    row["churn_risk_count"] = 0
            else:
                row["churn_risk_count"] = 0
        else:
            row.update({"revenue_30d": 0.0, "expense_30d": 0.0, "net_profit_30d": 0.0,
                        "revenue_prev_30d": 0.0, "revenue_90d": 0.0,
                        "mom_revenue_growth_pct": None, "overdue_invoice_total": 0.0,
                        "overdue_invoice_count": 0, "avg_days_to_pay": None,
                        "churn_risk_count": 0})

        # ── Tasks ─────────────────────────────────────────────────────────────
        tsk = _company_rows(tasks_df, cid)
        if not tsk.empty:
            tsk = tsk.copy()
            st2 = tsk.get("status", pd.Series("", index=tsk.index)).fillna("").str.lower().str.strip()
            row["open_tasks"]  = int(st2.isin({"open", "in_progress"}).sum())
            row["total_tasks"] = len(tsk)

            if "due_date" in tsk.columns:
                due = pd.to_datetime(tsk["due_date"], errors="coerce", utc=True)
                row["overdue_tasks"] = int(
                    (due.notna() & (due < now_ts) & ~st2.isin({"completed", "cancelled"})).sum()
                )
            else:
                row["overdue_tasks"] = 0

            completed = tsk[st2 == "completed"]
            row["task_completion_rate_pct"] = (
                round(len(completed) / len(tsk) * 100, 1) if len(tsk) > 0 else 0.0
            )

            # Avg days to complete
            if not completed.empty and "created_date" in tsk.columns and "updated_date" in tsk.columns:
                c_created = pd.to_datetime(completed["created_date"], errors="coerce", utc=True)
                c_updated = pd.to_datetime(completed["updated_date"], errors="coerce", utc=True)
                days_comp  = (c_updated - c_created).dt.total_seconds().div(86400)
                row["avg_task_completion_days"] = round(float(days_comp.mean()), 1) if days_comp.notna().any() else None
            else:
                row["avg_task_completion_days"] = None
        else:
            row.update({"open_tasks": 0, "total_tasks": 0, "overdue_tasks": 0,
                        "task_completion_rate_pct": 0.0, "avg_task_completion_days": None})

        # ── Products ──────────────────────────────────────────────────────────
        prod = _company_rows(products_df, cid)
        if not prod.empty:
            prod = prod.copy()
            row["total_products"] = len(prod)

            qty = pd.to_numeric(prod.get("stock_quantity", prod.get("quantity", pd.Series(0, index=prod.index))),
                                errors="coerce").fillna(0)
            rl  = pd.to_numeric(prod.get("reorder_level", pd.Series(0, index=prod.index)),
                                errors="coerce").fillna(0)

            row["out_of_stock_count"] = int((qty <= 0).sum())
            row["low_stock_count"]    = int(((qty > 0) & (qty <= rl)).sum())

            # Dead stock: products with no sale transaction in 90 days
            if not transactions_df.empty and "product_name" in transactions_df.columns:
                tx_cid = _company_rows(transactions_df, cid)
                if not tx_cid.empty:
                    tx_cid = tx_cid.copy()
                    tx_cid["_date"] = pd.to_datetime(
                        tx_cid.get("transaction_date", tx_cid.get("created_date")),
                        errors="coerce", utc=True,
                    )
                    sold_90d = set(
                        tx_cid.loc[
                            tx_cid["_date"].notna()
                            & (tx_cid["_date"] >= now_ts - pd.Timedelta(days=90)),
                            "product_name"
                        ].dropna().unique()
                    )
                    prod_names = prod.get(
                        "item_name", prod.get("product_name", pd.Series("", index=prod.index))
                    ).fillna("")
                    row["dead_stock_count"] = int((~prod_names.isin(sold_90d)).sum())
                else:
                    row["dead_stock_count"] = 0
            else:
                row["dead_stock_count"] = 0
        else:
            row.update({"total_products": 0, "low_stock_count": 0,
                        "dead_stock_count": 0, "out_of_stock_count": 0})

        # ── Enterprises ───────────────────────────────────────────────────────
        ent = _company_rows(enterprises_df, cid)
        if not ent.empty:
            op_st = ent.get("operating_status", pd.Series("", index=ent.index)).fillna("").str.lower().str.strip()
            row["total_enterprises"]  = len(ent)
            row["active_enterprises"] = int((op_st == "open").sum())
        else:
            row.update({"total_enterprises": 0, "active_enterprises": 0})

        # ── Relationships ─────────────────────────────────────────────────────
        rel = _company_rows(relationships_df, cid)
        if not rel.empty:
            rel_st = rel.get("status", pd.Series("", index=rel.index)).fillna("").str.lower()
            row["total_relationships"] = int((rel_st != "archived").sum())
        else:
            row["total_relationships"] = 0

        rows.append(row)

    if not rows:
        return pd.DataFrame()

    df_out = pd.DataFrame(rows)

    # Ensure consistent column order
    COLS = [
        "company_id",
        "total_people", "active_staff", "active_clients", "inactive_people",
        "client_staff_ratio", "new_clients_30d",
        "revenue_30d", "expense_30d", "net_profit_30d",
        "revenue_prev_30d", "mom_revenue_growth_pct", "revenue_90d",
        "overdue_invoice_total", "overdue_invoice_count", "avg_days_to_pay",
        "open_tasks", "total_tasks", "overdue_tasks",
        "task_completion_rate_pct", "avg_task_completion_days",
        "total_products", "low_stock_count", "dead_stock_count", "out_of_stock_count",
        "total_enterprises", "active_enterprises",
        "total_relationships",
        "churn_risk_count",
    ]
    for c in COLS:
        if c not in df_out.columns:
            df_out[c] = None

    logger.info(
        "transform_kpi_summary: produced %d rows (one per company)", len(df_out)
    )
    return df_out[COLS]


def _company_rows(df: pd.DataFrame, company_id: str) -> pd.DataFrame:
    """Filter a DataFrame to a single company. Returns empty DataFrame if not applicable."""
    if df.empty:
        return df
    if "company_id" not in df.columns:
        return df
    return df[df["company_id"] == company_id].copy()
