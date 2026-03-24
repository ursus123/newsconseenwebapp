import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_json_to_df
from config import settings

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Item type classification
# Livestock is tracked as Products (not People) per the
# universal data model decision: heartbeat + no agency = Product.
# Livestock uses head count, not unit quantities or prices.
# ----------------------------------------------------------
LIVESTOCK_TYPES = {"livestock", "cattle", "poultry", "swine", "sheep", "goat"}

MEDICATION_TYPES = {"medication", "medicine", "drug", "supplement", "vaccine"}

PERISHABLE_TYPES = MEDICATION_TYPES | {"food", "produce", "dairy", "perishable"}

# ----------------------------------------------------------
# Low stock threshold fallback
# Used when a product has no reorder_level configured.
# ----------------------------------------------------------
DEFAULT_REORDER_LEVEL = 10

REQUIRED_COLUMNS = {"id", "status"}

GROUP_COLUMNS = [
    "enterprise_id",
    "company_id",
    "item_type",
    "status",
]


def extract_products() -> pd.DataFrame:
    """
    Extract all product records from Base44.
    Returns raw DataFrame — no transformation applied here.
    """
    return fetch_json_to_df(settings.base44_products_url)


def transform_products(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform raw product records into a summary suitable for
    appending to analytics.product_summary.

    Produces per-group metrics:
        total_products          — count of distinct products in this group
        total_stock             — sum of stock_quantity across group
        avg_price               — mean unit_price within group
        total_inventory_value   — total_stock * avg unit_price (capital tied up)
        avg_cost_price          — mean cost_price within group
        avg_gross_margin_pct    — mean (price - cost) / price * 100
        low_stock_count         — products at or below reorder_level
        out_of_stock_count      — products with stock_quantity = 0
        expiring_30d_count      — products expiring within 30 days
        expiring_7d_count       — products expiring within 7 days
        is_medication           — True if item_type is a medication type
        is_livestock            — True if item_type is a livestock type
        new_last_30d            — products added in the last 30 days

    Groups by: enterprise_id, company_id, item_type, status
    """
    if df.empty:
        logger.warning("transform_products: received empty DataFrame")
        return _empty_summary()

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        logger.error(
            "transform_products: missing required columns %s — returning empty",
            missing,
        )
        return _empty_summary()

    df = df.copy()

    # ----------------------------------------------------------
    # Parse and clean numeric fields
    # Use errors="coerce" so non-numeric livestock fields
    # become NaN rather than crashing the transform
    # ----------------------------------------------------------
    df["stock_quantity"] = pd.to_numeric(
        df.get("stock_quantity"), errors="coerce"
    ).fillna(0)

    df["unit_price"] = pd.to_numeric(
        df.get("unit_price"), errors="coerce"
    ).fillna(0)

    df["cost_price"] = pd.to_numeric(
        df.get("cost_price"), errors="coerce"
    ).fillna(0)

    df["reorder_level"] = pd.to_numeric(
        df.get("reorder_level"), errors="coerce"
    ).fillna(DEFAULT_REORDER_LEVEL)

    # ----------------------------------------------------------
    # Parse dates
    # ----------------------------------------------------------
    now = datetime.now(timezone.utc)

    df["expiry_date"] = pd.to_datetime(
        df.get("expiry_date"), errors="coerce", utc=True
    )

    df["created_date"] = pd.to_datetime(
        df.get("created_date"), errors="coerce", utc=True
    )

    # ----------------------------------------------------------
    # Item type classification
    # ----------------------------------------------------------
    item_type = df.get("item_type", pd.Series("", index=df.index))

    df["is_livestock"] = item_type.isin(LIVESTOCK_TYPES)
    df["is_medication"] = item_type.isin(MEDICATION_TYPES)
    df["is_perishable"] = item_type.isin(PERISHABLE_TYPES)

    # ----------------------------------------------------------
    # Inventory value per product row
    # Livestock: head count has no unit_price — value is 0
    # Everything else: stock_quantity * unit_price
    # ----------------------------------------------------------
    df["inventory_value"] = (
        (df["stock_quantity"] * df["unit_price"])
        .where(~df["is_livestock"], 0)
    )

    # ----------------------------------------------------------
    # Gross margin per product row
    # Only meaningful when unit_price > 0
    # Livestock and donated goods have unit_price = 0 — margin = NaN
    # ----------------------------------------------------------
    df["gross_margin_pct"] = (
        ((df["unit_price"] - df["cost_price"]) / df["unit_price"].replace(0, pd.NA))
        * 100
    ).round(1)

    # ----------------------------------------------------------
    # Stock alert flags
    # ----------------------------------------------------------
    df["is_low_stock"] = (
        (df["stock_quantity"] > 0)
        & (df["stock_quantity"] <= df["reorder_level"])
    )

    df["is_out_of_stock"] = df["stock_quantity"] == 0

    # ----------------------------------------------------------
    # Expiry flags — clinical safety for BrightStar medications
    # ----------------------------------------------------------
    df["expiring_7d"] = (
        df["expiry_date"].notna()
        & (df["expiry_date"] >= now)
        & (df["expiry_date"] <= now + pd.Timedelta(days=7))
    )

    df["expiring_30d"] = (
        df["expiry_date"].notna()
        & (df["expiry_date"] >= now)
        & (df["expiry_date"] <= now + pd.Timedelta(days=30))
    )

    # ----------------------------------------------------------
    # New products
    # ----------------------------------------------------------
    df["new_last_30d"] = (
        df["created_date"].notna()
        & (df["created_date"] >= now - pd.Timedelta(days=30))
    )

    # ----------------------------------------------------------
    # Safe groupBy
    # ----------------------------------------------------------
    group_cols = [c for c in GROUP_COLUMNS if c in df.columns]

    summary = (
        df.groupby(group_cols, dropna=False)
        .agg(
            total_products=("id", "count"),
            total_stock=("stock_quantity", "sum"),
            avg_price=("unit_price", "mean"),
            avg_cost_price=("cost_price", "mean"),
            total_inventory_value=("inventory_value", "sum"),
            avg_gross_margin_pct=("gross_margin_pct", "mean"),
            low_stock_count=("is_low_stock", "sum"),
            out_of_stock_count=("is_out_of_stock", "sum"),
            expiring_7d_count=("expiring_7d", "sum"),
            expiring_30d_count=("expiring_30d", "sum"),
            new_last_30d=("new_last_30d", "sum"),
        )
        .reset_index()
    )

    # ----------------------------------------------------------
    # Re-derive classification flags on summary rows
    # ----------------------------------------------------------
    if "item_type" in summary.columns:
        summary["is_medication"] = summary["item_type"].isin(MEDICATION_TYPES)
        summary["is_livestock"] = summary["item_type"].isin(LIVESTOCK_TYPES)
    else:
        summary["is_medication"] = False
        summary["is_livestock"] = False

    # ----------------------------------------------------------
    # Round monetary columns
    # ----------------------------------------------------------
    for col in ["avg_price", "avg_cost_price", "total_inventory_value",
                "avg_gross_margin_pct"]:
        summary[col] = summary[col].round(2).fillna(0.0)

    # Cast integer columns
    for col in ["total_products", "total_stock", "low_stock_count",
                "out_of_stock_count", "expiring_7d_count",
                "expiring_30d_count", "new_last_30d"]:
        summary[col] = summary[col].fillna(0).astype(int)

    logger.info(
        "transform_products: produced %d summary rows from %d raw records",
        len(summary), len(df),
    )

    return summary


def _empty_summary() -> pd.DataFrame:
    """
    Typed empty DataFrame matching the transform output schema.
    load_dataframe() skips writing this — no false zero snapshots.
    """
    return pd.DataFrame(columns=[
        "enterprise_id",
        "company_id",
        "item_type",
        "status",
        "total_products",
        "total_stock",
        "avg_price",
        "avg_cost_price",
        "total_inventory_value",
        "avg_gross_margin_pct",
        "low_stock_count",
        "out_of_stock_count",
        "expiring_7d_count",
        "expiring_30d_count",
        "is_medication",
        "is_livestock",
        "new_last_30d",
    ])
