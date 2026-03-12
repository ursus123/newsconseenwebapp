import pandas as pd
from .base import fetch_json_to_df
from ..config import settings


def extract_services() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_services_url)


def transform_services(df: pd.DataFrame) -> pd.DataFrame:
    df["created_at"] = pd.to_datetime(df["created_at"])

    summary = (
        df.groupby(["enterprise_id", "service_type"])
        .agg(
            service_count=("service_id", "count"),
            first_used=("created_at", "min"),
            last_used=("created_at", "max"),
        )
        .reset_index()
    )

    return summary
