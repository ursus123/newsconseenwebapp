"""
etl/product_velocity.py
-----------------------
analytics.product_velocity — one row per (company_id, product_id).

Powers the Inventory Agent, copilot get_inventory_health tool, and the
stock velocity dashboard.

Columns produced:
    company_id
    product_id
    product_name
    item_type            physical / living / digital / service_package / financial_instrument
    item_class           perishable / non_perishable / consumable / etc.
    item_subtype
    unit_of_measure

    -- Stock levels --
    stock_quantity       current quantity on hand
    reorder_level
    out_of_stock         True if stock_quantity <= 0
    below_reorder        True if 0 < stock_quantity <= reorder_level

    -- Velocity (from transactions) --
    units_sold_30d       quantity sold in last 30 days (from transaction records)
    units_sold_90d       quantity sold in last 90 days
    revenue_30d          revenue from this product last 30 days
    revenue_90d          revenue from this product last 90 days
    transaction_count_30d  number of sale transactions in 30 days
    last_sale_date       most recent sale transaction date
    days_since_last_sale
    dead_stock           True if no sale in last 90 days

    -- Derived --
    avg_daily_sales_30d  units_sold_30d / 30
    stock_coverage_days  stock_quantity / avg_daily_sales_30d (null if no sales)
    reorder_urgency      critical / high / medium / low / none
"""

import logging

import pandas as pd

logger = logging.getLogger(__name__)

SALE_TYPES = {
    "product_sale", "livestock_sale", "crop_sale",
    "service_fee", "membership_fee",
}


def transform_product_velocity(
    products_df: pd.DataFrame,
    transactions_df: pd.DataFrame,
) -> pd.DataFrame:
    """Build analytics.product_velocity — one row per product per company."""
    now_ts = pd.Timestamp.now(tz="UTC")

    if products_df.empty:
        logger.warning("transform_product_velocity: empty products_df — returning empty")
        return pd.DataFrame()

    prod = products_df.copy()

    # Normalise product name column (Base44 uses item_name or product_name)
    name_col = next((c for c in ["item_name", "product_name", "name"] if c in prod.columns), None)
    if name_col:
        prod["_product_name"] = prod[name_col].fillna("").str.strip()
    else:
        prod["_product_name"] = ""

    # ── Build transaction velocity by (company_id, product_name) ─────────────
    tx_lookup: dict = {}  # (company_id, product_name_lower) -> DataFrame
    if not transactions_df.empty:
        tx = transactions_df.copy()
        tx["amount"] = pd.to_numeric(tx.get("amount", 0), errors="coerce").fillna(0)
        tx_st = tx.get("status", pd.Series("", index=tx.index)).fillna("").str.lower().str.strip()
        tx_tt = tx.get("transaction_type", pd.Series("", index=tx.index)).fillna("").str.lower()
        posted = tx[(tx_st == "posted") & tx_tt.isin(SALE_TYPES)].copy()

        if not posted.empty:
            posted["_date"] = pd.to_datetime(
                posted.get("transaction_date", posted.get("created_date")),
                errors="coerce", utc=True,
            )
            pname_col = next(
                (c for c in ["product_name", "item_name", "description"] if c in posted.columns),
                None,
            )
            if pname_col:
                for (cid, pname), grp in posted.groupby(
                    ["company_id", pname_col], dropna=True
                ):
                    tx_lookup[(str(cid), str(pname).lower().strip())] = grp

    # ── Build one row per product ─────────────────────────────────────────────
    rows = []
    for _, p in prod.iterrows():
        cid      = str(p.get("company_id", "") or "")
        pid      = str(p.get("id", "") or "")
        pname    = str(p.get("_product_name", "") or "")
        qty      = float(pd.to_numeric(
            p.get("stock_quantity", p.get("quantity", 0)), errors="coerce") or 0
        )
        rl       = float(pd.to_numeric(p.get("reorder_level", 0), errors="coerce") or 0)

        row: dict = {
            "company_id":     cid,
            "product_id":     pid,
            "product_name":   pname,
            "item_type":      str(p.get("item_type", "") or ""),
            "item_class":     str(p.get("item_class", "") or ""),
            "item_subtype":   str(p.get("item_subtype", p.get("product_subtype", "")) or ""),
            "unit_of_measure":str(p.get("unit_of_measure", p.get("uom", "")) or ""),
            "stock_quantity": qty,
            "reorder_level":  rl,
            "out_of_stock":   qty <= 0,
            "below_reorder":  (qty > 0) and (rl > 0) and (qty <= rl),
        }

        # Velocity from transactions
        ptx = tx_lookup.get((cid, pname.lower().strip()), pd.DataFrame())

        if not ptx.empty and "_date" in ptx.columns:
            valid = ptx[ptx["_date"].notna()]
            cutoff_30d = now_ts - pd.Timedelta(days=30)
            cutoff_90d = now_ts - pd.Timedelta(days=90)

            tx_30d = valid[valid["_date"] >= cutoff_30d]
            tx_90d = valid[valid["_date"] >= cutoff_90d]

            # Units sold: use quantity field if present, else count transactions
            qty_col = next((c for c in ["quantity", "quantity_sold", "units"] if c in valid.columns), None)
            if qty_col:
                sold_30d = float(pd.to_numeric(tx_30d.get(qty_col, 0), errors="coerce").fillna(0).sum())
                sold_90d = float(pd.to_numeric(tx_90d.get(qty_col, 0), errors="coerce").fillna(0).sum())
            else:
                sold_30d = float(len(tx_30d))
                sold_90d = float(len(tx_90d))

            rev_30d = float(tx_30d["amount"].sum())
            rev_90d = float(tx_90d["amount"].sum())
            last_sale = valid["_date"].max()

            row["units_sold_30d"]          = round(sold_30d, 2)
            row["units_sold_90d"]          = round(sold_90d, 2)
            row["revenue_30d"]             = round(rev_30d, 2)
            row["revenue_90d"]             = round(rev_90d, 2)
            row["transaction_count_30d"]   = len(tx_30d)
            row["last_sale_date"]          = str(last_sale.date()) if pd.notna(last_sale) else None
            row["days_since_last_sale"]    = (
                int((now_ts - last_sale).days) if pd.notna(last_sale) else None
            )
            row["dead_stock"] = (
                row["days_since_last_sale"] is not None and row["days_since_last_sale"] > 90
            ) or (row["days_since_last_sale"] is None)

            # Coverage
            avg_daily = sold_30d / 30 if sold_30d > 0 else 0
            row["avg_daily_sales_30d"]  = round(avg_daily, 4)
            row["stock_coverage_days"]  = (
                round(qty / avg_daily, 1) if avg_daily > 0 else None
            )
        else:
            row.update({
                "units_sold_30d": 0.0, "units_sold_90d": 0.0,
                "revenue_30d": 0.0, "revenue_90d": 0.0,
                "transaction_count_30d": 0,
                "last_sale_date": None, "days_since_last_sale": None,
                "dead_stock": True,
                "avg_daily_sales_30d": 0.0, "stock_coverage_days": None,
            })

        # Reorder urgency
        row["reorder_urgency"] = _urgency(
            row["out_of_stock"], row["below_reorder"],
            row.get("stock_coverage_days"), row["dead_stock"]
        )

        rows.append(row)

    if not rows:
        return pd.DataFrame()

    df_out = pd.DataFrame(rows)
    logger.info(
        "transform_product_velocity: %d products across %d companies",
        len(df_out), df_out["company_id"].nunique(),
    )
    return df_out


def _urgency(out_of_stock: bool, below_reorder: bool, coverage_days, dead_stock: bool) -> str:
    if out_of_stock:
        return "critical"
    if below_reorder:
        if coverage_days is not None and coverage_days <= 7:
            return "critical"
        return "high"
    if coverage_days is not None and coverage_days <= 14:
        return "medium"
    if dead_stock:
        return "low"
    return "none"
