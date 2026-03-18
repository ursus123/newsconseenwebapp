# python_layer/etl/products.py

import pandas as pd
from .base import fetch_json_to_df
from ..config import settings


def extract_products() -> pd.DataFrame:
    """
    Extract raw product data from Base44 API.
    """
    return fetch_json_to_df(settings.base44_products_url)


def transform_products(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform product data into a summary table grouped by item_type.
    """
    # Coerce numeric fields — Base44 may return them as strings
    df["stock_quantity"] = pd.to_numeric(df["stock_quantity"], errors="coerce").fillna(0)
    df["unit_price"] = pd.to_numeric(df["unit_price"], errors="coerce").fillna(0)
    df["cost_price"] = pd.to_numeric(df["cost_price"], errors="coerce").fillna(0)

    summary = df.groupby("item_type").agg(
        total_products=("id", "count"),
        total_stock=("stock_quantity", "sum"),
        avg_price=("unit_price", "mean"),
    ).reset_index()

    return summary
