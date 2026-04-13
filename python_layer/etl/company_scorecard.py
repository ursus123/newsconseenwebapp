import logging
from datetime import datetime, timezone

import pandas as pd

from config.taxonomy import (
    PERSON_TYPE_SETS,
    ACTIVE_STATUSES   as PERSON_ACTIVE_STATUSES,
    INACTIVE_STATUSES as PERSON_INACTIVE_STATUSES,
    ITEM_ACTIVE_STATUSES   as ITEM_ACTIVE,
)

logger = logging.getLogger(__name__)

STAFF_TYPES   = PERSON_TYPE_SETS["staff"]
CLIENT_TYPES  = PERSON_TYPE_SETS["client"]
CONTACT_TYPES = PERSON_TYPE_SETS["contact"]

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

DEFAULT_REORDER_LEVEL = 10


def transform_company_scorecard(
    people_df:       pd.DataFrame,
    enterprises_df:  pd.DataFrame,
    transactions_df: pd.DataFrame,
    tasks_df:        pd.DataFrame,
    products_df:     pd.DataFrame,
) -> pd.DataFrame:
    """
    Build analytics.company_scorecard — one row per company_id.

    This is the single-read operational health summary used by the copilot's
    overview query and the dashboard 'how are we doing' question. It joins
    people + enterprises + transactions + tasks + products into a flat row,
    eliminating the need for 5 separate tool calls.

    Columns produced:
        company_id
        snapshot_date

        -- People
        total_people            — all person records
        active_people           — active status
        active_clients          — active participant/client type
        active_staff            — active staff type
        total_contacts          — contact type (any status)
        new_people_30d          — created in last 30 days
        churn_risk_count        — became inactive in last 30 days

        -- Enterprises
        total_enterprises
        active_enterprises

        -- Finance (last 30 days, posted only)
        revenue_30d
        expense_30d
        net_30d
        outstanding_amount      — all posted revenue not reconciled
        total_transactions_30d

        -- Tasks (last 30 days)
        tasks_created_30d
        tasks_completed_30d
        task_completion_rate_pct
        overdue_tasks           — past due, not completed, any age

        -- Inventory
        total_products
        low_stock_count
        out_of_stock_count
        expiring_7d_count
        total_inventory_value
    """
    now = pd.Timestamp.now(tz="UTC")
    cutoff_30 = now - pd.Timedelta(days=30)
    cutoff_7  = now - pd.Timedelta(days=7)

    # ── Discover all company_ids ──────────────────────────────────────────────
    all_companies: set = set()
    for df in [people_df, enterprises_df, transactions_df, tasks_df, products_df]:
        if not df.empty and "company_id" in df.columns:
            all_companies.update(df["company_id"].dropna().unique())

    if not all_companies:
        logger.warning("transform_company_scorecard: no company_ids found")
        return pd.DataFrame()

    rows = []
    for cid in sorted(all_companies):

        def _company(df):
            if df.empty or "company_id" not in df.columns:
                return df
            return df[df["company_id"] == cid].copy()

        ppl   = _company(people_df)
        ents  = _company(enterprises_df)
        txs   = _company(transactions_df)
        tsks  = _company(tasks_df)
        prods = _company(products_df)

        row = {"company_id": cid, "snapshot_date": now.date()}

        # ── People ────────────────────────────────────────────────────────────
        if not ppl.empty:
            ppl["_created"] = pd.to_datetime(ppl.get("created_date"), errors="coerce", utc=True)
            ppl["_status"]  = ppl.get("status", pd.Series("", index=ppl.index)).fillna("").str.lower().str.strip()
            ppl["_type"]    = ppl.get("person_type", pd.Series("", index=ppl.index)).fillna("").str.lower().str.strip()

            row["total_people"]      = len(ppl)
            row["active_people"]     = int(ppl["_status"].isin(PERSON_ACTIVE_STATUSES).sum())
            row["active_clients"]    = int(
                (ppl["_status"].isin(PERSON_ACTIVE_STATUSES) & ppl["_type"].isin(CLIENT_TYPES)).sum()
            )
            row["active_staff"]      = int(
                (ppl["_status"].isin(PERSON_ACTIVE_STATUSES) & ppl["_type"].isin(STAFF_TYPES)).sum()
            )
            row["total_contacts"]    = int(ppl["_type"].isin(CONTACT_TYPES).sum())
            row["new_people_30d"]    = int((ppl["_created"] >= cutoff_30).sum())
            row["churn_risk_count"]  = int(
                (ppl["_status"].isin(PERSON_INACTIVE_STATUSES) & (ppl["_created"] >= cutoff_30)).sum()
            )
        else:
            for k in ["total_people", "active_people", "active_clients",
                      "active_staff", "total_contacts", "new_people_30d", "churn_risk_count"]:
                row[k] = 0

        # ── Enterprises ───────────────────────────────────────────────────────
        if not ents.empty:
            e_status = ents.get("operating_status", ents.get("status", pd.Series("", index=ents.index)))
            e_status = e_status.fillna("").str.lower().str.strip()
            row["total_enterprises"]  = len(ents)
            row["active_enterprises"] = int(e_status.isin({"open", "active"}).sum())
        else:
            row["total_enterprises"]  = 0
            row["active_enterprises"] = 0

        # ── Transactions ──────────────────────────────────────────────────────
        if not txs.empty and "amount" in txs.columns:
            txs["_amount"] = pd.to_numeric(txs.get("amount", 0), errors="coerce").fillna(0)
            txs["_status"] = txs.get("status", pd.Series("", index=txs.index)).fillna("").str.lower().str.strip()
            txs["_type"]   = txs.get("transaction_type", pd.Series("", index=txs.index)).fillna("").str.lower()
            txs["_date"]   = pd.to_datetime(
                txs.get("transaction_date", txs.get("created_date")), errors="coerce", utc=True
            )
            posted = txs[txs["_status"] == "posted"]

            recent = posted[posted["_date"].notna() & (posted["_date"] >= cutoff_30)]
            row["revenue_30d"]          = float((recent["_amount"].where(recent["_type"].isin(REVENUE_TYPES), 0)).sum().round(2))
            row["expense_30d"]          = float((recent["_amount"].where(recent["_type"].isin(EXPENSE_TYPES), 0)).sum().round(2))
            row["net_30d"]              = round(row["revenue_30d"] - row["expense_30d"], 2)
            row["total_transactions_30d"] = len(recent)
            row["outstanding_amount"]   = float(
                posted["_amount"].where(posted["_type"].isin(REVENUE_TYPES), 0).sum().round(2)
            )
        else:
            for k in ["revenue_30d", "expense_30d", "net_30d",
                      "total_transactions_30d", "outstanding_amount"]:
                row[k] = 0.0

        # ── Tasks ─────────────────────────────────────────────────────────────
        if not tsks.empty:
            tsks["_created"] = pd.to_datetime(tsks.get("created_date"), errors="coerce", utc=True)
            tsks["_due"]     = pd.to_datetime(tsks.get("due_date"), errors="coerce", utc=True)
            tsks["_status"]  = tsks.get("status", pd.Series("", index=tsks.index)).fillna("").str.lower()

            recent_tasks = tsks[tsks["_created"].notna() & (tsks["_created"] >= cutoff_30)]
            completed_30 = int((recent_tasks["_status"] == "completed").sum())
            created_30   = len(recent_tasks)

            row["tasks_created_30d"]     = created_30
            row["tasks_completed_30d"]   = completed_30
            row["task_completion_rate_pct"] = round(
                (completed_30 / created_30 * 100) if created_30 > 0 else 0.0, 1
            )
            row["overdue_tasks"] = int(
                (
                    tsks["_due"].notna()
                    & (tsks["_due"] < now)
                    & (tsks["_status"] != "completed")
                ).sum()
            )
        else:
            for k in ["tasks_created_30d", "tasks_completed_30d",
                      "task_completion_rate_pct", "overdue_tasks"]:
                row[k] = 0

        # ── Inventory ─────────────────────────────────────────────────────────
        if not prods.empty:
            prods["_stock"]    = pd.to_numeric(prods.get("stock_quantity", 0), errors="coerce").fillna(0)
            prods["_price"]    = pd.to_numeric(prods.get("unit_price",     0), errors="coerce").fillna(0)
            prods["_reorder"]  = pd.to_numeric(
                prods.get("reorder_level", DEFAULT_REORDER_LEVEL),
                errors="coerce",
            ).fillna(DEFAULT_REORDER_LEVEL)
            prods["_expiry"]   = pd.to_datetime(prods.get("expiry_date"), errors="coerce", utc=True)
            prods["_status"]   = prods.get("status", pd.Series("", index=prods.index)).fillna("").str.lower()
            prods["_is_live"]  = prods.get("item_type", pd.Series("", index=prods.index)).fillna("").str.lower().isin(
                {"livestock", "animal", "cattle", "poultry", "goat", "sheep", "pig"}
            )

            active_prods = prods[prods["_status"].isin(ITEM_ACTIVE)]
            row["total_products"]     = len(active_prods)
            row["low_stock_count"]    = int(
                ((active_prods["_stock"] > 0) & (active_prods["_stock"] <= active_prods["_reorder"])).sum()
            )
            row["out_of_stock_count"] = int((active_prods["_stock"] == 0).sum())
            row["expiring_7d_count"]  = int(
                (
                    active_prods["_expiry"].notna()
                    & (active_prods["_expiry"] >= now)
                    & (active_prods["_expiry"] <= now + pd.Timedelta(days=7))
                ).sum()
            )
            row["total_inventory_value"] = float(
                (active_prods["_stock"] * active_prods["_price"])
                .where(~active_prods["_is_live"], 0)
                .sum()
                .round(2)
            )
        else:
            for k in ["total_products", "low_stock_count", "out_of_stock_count",
                      "expiring_7d_count", "total_inventory_value"]:
                row[k] = 0

        rows.append(row)

    result = pd.DataFrame(rows).reset_index(drop=True)

    logger.info(
        "transform_company_scorecard: %d companies — "
        "total active_people=%d, revenue_30d=%.2f, overdue_tasks=%d",
        len(result),
        int(result["active_people"].sum()),
        float(result["revenue_30d"].sum()),
        int(result["overdue_tasks"].sum()),
    )

    return result
