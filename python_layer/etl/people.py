import pandas as pd
from etl.base import fetch_json_to_df
from config import settings


def extract_people() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_people_url)


def transform_people(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["person_type", "status", "primary_role", "people_count"])

    summary = (
        df.groupby(["person_type", "status"])
        .agg(
            people_count=("id", "count"),
        )
        .reset_index()
    )
    return summary