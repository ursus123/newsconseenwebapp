import pandas as pd
from etl.base import fetch_json_to_df
from config import settings


def extract_services() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_services_url)


def transform_services(df: pd.DataFrame) -> pd.DataFrame:
    df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")

    summary = (
        df.groupby(["service_type", "status"])
        .agg(
            service_count=("_id", "count"),
        )
        .reset_index()
    )
    return summary