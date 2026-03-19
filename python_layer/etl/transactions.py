import pandas as pd
from etl.base import fetch_json_to_df
from config import settings


def extract_transactions() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_transactions_url)


def transform_transactions(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=[
            "transaction_type", "status",
            "total_transactions", "total_amount", "avg_amount"
        ])

    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)

    summary = (
        df.groupby(["transaction_type", "status"])
        .agg(
            total_transactions=("id", "count"),
            total_amount=("amount", "sum"),
            avg_amount=("amount", "mean"),
        )
        .reset_index()
    )
    return summary