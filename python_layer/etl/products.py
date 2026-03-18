import pandas as pd
from etl.base import fetch_json_to_df
from config import settings


def extract_products() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_products_url)


def transform_products(df: pd.DataFrame) -> pd.DataFrame:
    df["stock_quantity"] = pd.to_numeric(df["stock_quantity"], errors="coerce").fillna(0)
    df["unit_price"] = pd.to_numeric(df["unit_price"], errors="coerce").fillna(0)
    df["cost_price"] = pd.to_numeric(df["cost_price"], errors="coerce").fillna(0)

    summary = df.groupby("item_type").agg(
        total_products=("_id", "count"),
        total_stock=("stock_quantity", "sum"),
        avg_price=("unit_price", "mean"),
    ).reset_index()
    return summary