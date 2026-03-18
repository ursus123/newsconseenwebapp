import pandas as pd
from etl.base import fetch_json_to_df
from config import settings


def extract_transactions() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_transactions_url)


def transform_transactions(df: pd.DataFrame) -> pd.DataFrame:
    df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)

    summary = (
        df.groupby("enterprise")
        .agg(
            total_transactions=("_id", "count"),
            total_amount=("amount", "sum"),
            avg_amount=("amount", "mean"),
        )
        .reset_index()
    )
    return summary