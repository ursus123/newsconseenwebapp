import pandas as pd
from etl.base import fetch_json_to_df
from config import settings


def extract_enterprises() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_enterprises_url)


def transform_enterprises(df: pd.DataFrame) -> pd.DataFrame:
    summary = df.groupby("status").agg(
        enterprise_count=("_id", "count")
    ).reset_index()
    return summary