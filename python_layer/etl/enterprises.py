import pandas as pd
from etl.base import fetch_json_to_df
from config import settings


def extract_enterprises() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_enterprises_url)


def transform_enterprises(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["status", "enterprise_type", "enterprise_count"])

    summary = df.groupby(["status", "enterprise_type"]).agg(
        enterprise_count=("id", "count")
    ).reset_index()

    return summary