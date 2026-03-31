import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_json_to_df
from config import settings
from config.taxonomy import (
    ITEM_TYPE_SETS,
    ITEM_ACTIVE_STATUSES as ACTIVE_STATUSES,
    ITEM_INACTIVE_STATUSES as INACTIVE_STATUSES,
)

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Item type classification
# Living and digital buckets imported from config.taxonomy.
# Medication/food/equipment/supply remain local because
# taxonomy classifies these as subtypes of "physical" — there
# are no dedicated taxonomy sets at the item_type level yet.
# ----------------------------------------------------------
LIVESTOCK_TYPES = ITEM_TYPE_SETS["living"]
DIGITAL_TYPES   = ITEM_TYPE_SETS["digital"]

MEDICATION_TYPES = {
    "medication", "medicine", "drug", "pharmaceutical",
    "supplement", "vitamin", "vaccine", "controlled_substance",
}

FOOD_TYPES = {
    "food", "produce", "dairy", "beverage", "grain",
    "perishable", "ingredient", "frozen",
}

# Perishable = anything with an expiry date that matters
PERISHABLE_TYPES = MEDICATION_TYPES | FOOD_TYPES

# Equipment and fixed assets — stock tracked but no expiry
EQUIPMENT_TYPES = {
    "equipment", "machinery", "vehicle", "furniture",
    "tool", "fixture", "asset", "hardware",
}

# Consumable supplies — physical, no expiry, reorder-tracked
SUPPLY_TYPES = {
    "supply", "consumable", "stationery", "uniform",
    "packaging", "raw_material", "component", "part",
}

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
    Extract all product/item records from Base44.
    Returns raw DataFrame — no transformation applied here.
    """
    return fetch_json_to_df(settings.base44_products_url)


def transform_products(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform raw product records into a summary suitable for
    appending to analytics.product_summary.

    Produces per-group metrics:
        total_products          — count of distinct items in this group
        total_stock             — sum of stock_quantity across group
        avg_price               — mean unit_price within group
        avg_cost_price          — mean cost_price within group
        total_inventory_value   — sum of (stock_quantity * unit_price)
        avg_gross_margin_pct    — mean (price - cost) / price * 100
        low_stock_count         — items at or below reorder_level
        out_of_stock_count      — items with stock_quantity = 0
        expiring_7d_count       — perishables expiring within 7 days
        expiring_30d_count      — perishables expiring within 30 days
        is_medication           — True if item_type is a medication type
        is_livestock            — True if item_type is a livestock type
        is_perishable           — True if item_type is a perishable type
        is_digital              — True if item_type is a digital type
        is_equipment            — True if item_type is an equipment type
        new_last_30d            — items added in the last 30 days

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
    # Normalise status to lowercase for consistent matching
    # ----------------------------------------------------------
    df["status"] = (
        df["status"].fillna("unknown").str.lower().str.strip()
    )

    # ----------------------------------------------------------
    # Parse and clean numeric fields
    # errors="coerce" so bad values become NaN rather than crash
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
    # Normalise to lowercase so "Medication" == "medication"
    # ----------------------------------------------------------
    item_type = (
        df.get("item_type", pd.Series("", index=df.index))
        .fillna("").str.lower().str.strip()
    )

    df["is_livestock"]  = item_type.isin(LIVESTOCK_TYPES)
    df["is_medication"] = item_type.isin(MEDICATION_TYPES)
    df["is_perishable"] = item_type.isin(PERISHABLE_TYPES)
    df["is_digital"]    = item_type.isin(DIGITAL_TYPES)
    df["is_equipment"]  = item_type.isin(EQUIPMENT_TYPES)
    df["is_active"]     = df["status"].isin(ACTIVE_STATUSES)

    # ----------------------------------------------------------
    # Log unclassified item types
    # ----------------------------------------------------------
    unclassified = (
        ~df["is_livestock"] & ~df["is_perishable"]
        & ~df["is_digital"] & ~df["is_equipment"]
        & ~item_type.isin(SUPPLY_TYPES)
        & item_type.ne("")
    )
    if unclassified.any():
        unknown_types = item_type[unclassified].value_counts().to_dict()
        logger.info(
            "transform_products: %d unclassified items with types: %s — "
            "add to appropriate type set if needed",
            unclassified.sum(),
            ", ".join(f"{k}({v})" for k, v in unknown_types.items()),
        )

    # ----------------------------------------------------------
    # Inventory value per product row
    # Livestock: head count has no unit_price — value is 0
    # Digital: no physical stock — value is 0
    # Everything else: stock_quantity * unit_price
    # ----------------------------------------------------------
    df["inventory_value"] = (
        (df["stock_quantity"] * df["unit_price"])
        .where(~df["is_livestock"] & ~df["is_digital"], 0)
    )

    # ----------------------------------------------------------
    # Gross margin per product row
    # Only meaningful when unit_price > 0
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
    # Expiry flags — applies to all perishable types
    # (medications, food, vaccines, produce, etc.)
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
    # New items
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
        it = summary["item_type"].fillna("").str.lower().str.strip()
        summary["is_medication"] = it.isin(MEDICATION_TYPES)
        summary["is_livestock"]  = it.isin(LIVESTOCK_TYPES)
        summary["is_perishable"] = it.isin(PERISHABLE_TYPES)
        summary["is_digital"]    = it.isin(DIGITAL_TYPES)
        summary["is_equipment"]  = it.isin(EQUIPMENT_TYPES)
    else:
        summary["is_medication"] = False
        summary["is_livestock"]  = False
        summary["is_perishable"] = False
        summary["is_digital"]    = False
        summary["is_equipment"]  = False

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
        "is_perishable",
        "is_digital",
        "is_equipment",
        "new_last_30d",
    ])
