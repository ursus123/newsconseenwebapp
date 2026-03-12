import pandas as pd
from .base import fetch_json_to_df
from ..config import settings


def extract_people() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_people_url)


def transform_people(df: pd.DataFrame) -> pd.DataFrame:
    df["created_at"] = pd.to_datetime(df["created_at"])

    summary = (
        df.groupby(["enterprise_id", "role"])
        .agg(
            people_count=("person_id", "count"),
            earliest_join=("created_at", "min"),
            latest_join=("created_at", "max"),
        )
        .reset_index()
    )

    return summary
