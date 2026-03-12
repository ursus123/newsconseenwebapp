import pandas as pd
from .base import fetch_json_to_df
from ..config import settings


def extract_enterprises() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_enterprises_url)


def transform_enterprises(df: pd.DataFrame) -> pd.DataFrame:
    df["created_at"] = pd.to_datetime(df["created_at"])

    summary = df.assign(
        is_active=df["status"].str.lower().eq("active")
    ).groupby("status").agg(
        enterprise_count=("enterprise_id", "count")
    ).reset_index()

    return summary
