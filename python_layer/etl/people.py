import pandas as pd
from etl.base import fetch_json_to_df
from config import settings


def extract_people() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_people_url)


def transform_people(df: pd.DataFrame) -> pd.DataFrame:
    df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")

    summary = (
        df.groupby(["primary_role", "status"])
        .agg(
            people_count=("_id", "count"),
        )
        .reset_index()
    )
    return summary