import pandas as pd
from etl.base import fetch_json_to_df
from config import settings


def extract_services() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_services_url)


def transform_services(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["service_type", "status", "category", "service_count"])

    summary = (
        df.groupby(["service_type", "status", "category"])
        .agg(service_count=("id", "count"))
        .reset_index()
    )
    return summary