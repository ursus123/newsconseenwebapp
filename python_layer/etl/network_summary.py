"""
etl/network_summary.py
----------------------
analytics.network_summary — one row per (company_id, enterprise_name).

Powers the Network Intelligence Agent, cross-branch dashboard, and the
copilot get_network_overview tool with real KPI data per branch.

Columns produced:
    company_id
    enterprise_name
    enterprise_type
    enterprise_tier
    operating_status
    city / region / country

    -- People --
    staff_count
    client_count
    total_people

    -- Transactions (30d) --
    revenue_30d
    expense_30d
    net_profit_30d
    transaction_count_30d
    overdue_invoice_count

    -- Tasks --
    open_tasks
    overdue_tasks
    completion_rate_pct

    -- Products --
    low_stock_count
    out_of_stock_count

    -- Ranking (per company) --
    revenue_rank         rank by revenue_30d (1 = highest)
    completion_rank      rank by completion_rate_pct (1 = highest)
    performance_score    composite 0–100 score for cross-branch comparison
    performance_tier     top / above_average / average / below_average / bottom
"""

import logging

import pandas as pd

logger = logging.getLogger(__name__)

REVENUE_TYPES = {
    "service_fee", "tuition", "membership_fee", "donation",
    "tithe", "event_income", "grant", "sponsorship",
    "livestock_sale", "crop_sale", "product_sale",
    "rental_income", "interest_income", "refund_received",
}
EXPENSE_TYPES = {
    "payroll", "contractor_payment", "rent_expense",
    "utility_expense", "supply_purchase", "equipment_purchase",
    "feed_purchase", "vet_expense", "medication_purchase",
    "insurance_expense", "tax_payment", "refund_issued",
    "ministry_expense", "travel_expense", "marketing_expense",
    "other_expense",
}
_STAFF_TYPES  = {"staff","employee","contractor","freelancer","driver","teacher","nurse","agent"}
_CLIENT_TYPES = {"client","patient","student","member","beneficiary","enrollee","participant",
                 "subscriber","attendee","learner","trainee","resident","customer","applicant"}


def transform_network_summary(
    enterprises_df: pd.DataFrame,
    people_df: pd.DataFrame,
    transactions_df: pd.DataFrame,
    tasks_df: pd.DataFrame,
    products_df: pd.DataFrame,
    relationships_df: pd.DataFrame,
) -> pd.DataFrame:
    """Build analytics.network_summary — one row per enterprise per company."""
    now_ts = pd.Timestamp.now(tz="UTC")

    if enterprises_df.empty:
        logger.warning("transform_network_summary: empty enterprises_df — returning empty")
        return pd.DataFrame()

    ents = enterprises_df.copy()
    rows = []

    # ── Pre-index people, tasks, products by enterprise_name ─────────────────
    def _index_by_ent(df: pd.DataFrame, col: str) -> dict:
        if df.empty or col not in df.columns:
            return {}
        out = {}
        for ename, grp in df.groupby(col, dropna=True):
            out[str(ename).strip()] = grp
        return out

    ppl_by_ent = _index_by_ent(people_df,   "enterprise")
    tsk_by_ent = _index_by_ent(tasks_df,    "enterprise")
    prd_by_ent = _index_by_ent(products_df, "enterprise")

    # Relationships: enterprise_address or person_enterprise links
    # Also index transactions by enterprise string field
    tx_by_ent: dict = {}
    if not transactions_df.empty:
        tx = transactions_df.copy()
        tx["amount"] = pd.to_numeric(tx.get("amount", 0), errors="coerce").fillna(0)
        tx["_st"]    = tx.get("status", pd.Series("", index=tx.index)).fillna("").str.lower().str.strip()
        tx["_tt"]    = tx.get("transaction_type", pd.Series("", index=tx.index)).fillna("").str.lower()
        tx["_date"]  = pd.to_datetime(
            tx.get("transaction_date", tx.get("created_date")), errors="coerce", utc=True
        )
        posted = tx[tx["_st"] == "posted"]
        ent_col = next((c for c in ["enterprise", "enterprise_name", "branch"] if c in posted.columns), None)
        if ent_col:
            for ename, grp in posted.groupby(ent_col, dropna=True):
                tx_by_ent[str(ename).strip()] = grp

    for _, ent in ents.iterrows():
        cid     = str(ent.get("company_id", "") or "")
        ename   = str(ent.get("enterprise_name", "") or "").strip()

        row: dict = {
            "company_id":      cid,
            "enterprise_name": ename,
            "enterprise_type": str(ent.get("enterprise_type", "") or ""),
            "enterprise_tier": str(ent.get("enterprise_tier", "") or ""),
            "operating_status":str(ent.get("operating_status", "") or ""),
            "city":            str(ent.get("city", "") or ""),
            "region":          str(ent.get("region", "") or ""),
            "country":         str(ent.get("country", "") or ""),
        }

        # People
        ppl = ppl_by_ent.get(ename, pd.DataFrame())
        if not ppl.empty and "company_id" in ppl.columns:
            ppl = ppl[ppl["company_id"] == cid]
        if not ppl.empty:
            pt = ppl.get("person_type", pd.Series("", index=ppl.index)).fillna("").str.lower().str.strip()
            row["staff_count"]  = int(pt.isin(_STAFF_TYPES).sum())
            row["client_count"] = int(pt.isin(_CLIENT_TYPES).sum())
            row["total_people"] = len(ppl)
        else:
            row.update({"staff_count": 0, "client_count": 0, "total_people": 0})

        # Transactions
        ptx = tx_by_ent.get(ename, pd.DataFrame())
        if not ptx.empty and "company_id" in ptx.columns:
            ptx = ptx[ptx["company_id"] == cid]
        if not ptx.empty:
            cutoff_30d = now_ts - pd.Timedelta(days=30)
            in_30d = ptx["_date"].notna() & (ptx["_date"] >= cutoff_30d)
            t30 = ptx[in_30d]
            row["revenue_30d"]         = round(float(t30.loc[t30["_tt"].isin(REVENUE_TYPES), "amount"].sum()), 2)
            row["expense_30d"]         = round(float(t30.loc[t30["_tt"].isin(EXPENSE_TYPES), "amount"].sum()), 2)
            row["net_profit_30d"]      = round(row["revenue_30d"] - row["expense_30d"], 2)
            row["transaction_count_30d"] = len(t30)

            if "due_date" in ptx.columns:
                ptx["_due"] = pd.to_datetime(ptx["due_date"], errors="coerce", utc=True)
                ov_mask = (
                    ptx["_tt"].isin(REVENUE_TYPES)
                    & ptx["_due"].notna()
                    & (ptx["_due"] < now_ts)
                    & (ptx.get("payment_status", pd.Series("", index=ptx.index)).fillna("").str.lower() != "paid")
                )
                row["overdue_invoice_count"] = int(ov_mask.sum())
            else:
                row["overdue_invoice_count"] = 0
        else:
            row.update({"revenue_30d": 0.0, "expense_30d": 0.0, "net_profit_30d": 0.0,
                        "transaction_count_30d": 0, "overdue_invoice_count": 0})

        # Tasks
        tsk = tsk_by_ent.get(ename, pd.DataFrame())
        if not tsk.empty and "company_id" in tsk.columns:
            tsk = tsk[tsk["company_id"] == cid]
        if not tsk.empty:
            tst = tsk.get("status", pd.Series("", index=tsk.index)).fillna("").str.lower().str.strip()
            due = pd.to_datetime(tsk.get("due_date"), errors="coerce", utc=True)
            row["open_tasks"]        = int(tst.isin({"open", "in_progress"}).sum())
            row["overdue_tasks"]     = int((due.notna() & (due < now_ts) & ~tst.isin({"completed","cancelled"})).sum())
            total = len(tsk)
            comp  = int((tst == "completed").sum())
            row["completion_rate_pct"] = round(comp / total * 100, 1) if total > 0 else 0.0
        else:
            row.update({"open_tasks": 0, "overdue_tasks": 0, "completion_rate_pct": 0.0})

        # Products
        prd = prd_by_ent.get(ename, pd.DataFrame())
        if not prd.empty and "company_id" in prd.columns:
            prd = prd[prd["company_id"] == cid]
        if not prd.empty:
            qty = pd.to_numeric(prd.get("stock_quantity", prd.get("quantity", 0)), errors="coerce").fillna(0)
            rl  = pd.to_numeric(prd.get("reorder_level", 0), errors="coerce").fillna(0)
            row["low_stock_count"]    = int(((qty > 0) & (rl > 0) & (qty <= rl)).sum())
            row["out_of_stock_count"] = int((qty <= 0).sum())
        else:
            row.update({"low_stock_count": 0, "out_of_stock_count": 0})

        rows.append(row)

    if not rows:
        return pd.DataFrame()

    df_out = pd.DataFrame(rows)

    # ── Per-company ranking + performance score ───────────────────────────────
    result_parts = []
    for cid, grp in df_out.groupby("company_id", dropna=True):
        grp = grp.copy()
        n = len(grp)
        if n > 1:
            grp["revenue_rank"]     = grp["revenue_30d"].rank(ascending=False, method="min").astype(int)
            grp["completion_rank"]  = grp["completion_rate_pct"].rank(ascending=False, method="min").astype(int)
        else:
            grp["revenue_rank"]    = 1
            grp["completion_rank"] = 1

        # Performance score: normalized revenue (50%) + completion rate (30%) + no overdue penalty (20%)
        rev_max = grp["revenue_30d"].max() or 1
        grp["_rev_score"]  = (grp["revenue_30d"] / rev_max * 50).clip(0, 50)
        grp["_comp_score"] = (grp["completion_rate_pct"] / 100 * 30).clip(0, 30)
        grp["_ov_penalty"] = (grp["overdue_invoice_count"].clip(0, 5) / 5 * 20)
        grp["performance_score"] = (
            grp["_rev_score"] + grp["_comp_score"] + (20 - grp["_ov_penalty"])
        ).round(1).clip(0, 100)
        grp.drop(columns=["_rev_score","_comp_score","_ov_penalty"], inplace=True)

        # Performance tier
        def _tier(score):
            if score >= 80: return "top"
            if score >= 60: return "above_average"
            if score >= 40: return "average"
            if score >= 20: return "below_average"
            return "bottom"
        grp["performance_tier"] = grp["performance_score"].apply(_tier)

        result_parts.append(grp)

    df_out = pd.concat(result_parts, ignore_index=True) if result_parts else df_out

    logger.info(
        "transform_network_summary: %d enterprise rows across %d companies",
        len(df_out), df_out["company_id"].nunique(),
    )
    return df_out
