# python_layer/etl/products.py

import pandas as pd
from sqlalchemy import text
from ..database import engine


def extract_products() -> pd.DataFrame:
    """
    Extract raw product data from the database.
    """
    query = text("SELECT * FROM products")
    df = pd.read_sql(query, engine)
    return df


def transform_products(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform product data into a summary table.
    """
    summary = df.groupby("item_type").agg(
        total_products=("id", "count"),
        total_stock=("stock_quantity", "sum"),
        avg_price=("unit_price", "mean"),
    ).reset_index()

    return summary
