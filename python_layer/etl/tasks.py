import pandas as pd
from etl.base import fetch_json_to_df
from config import settings


def extract_tasks() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_tasks_url)


def transform_tasks(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["task_type", "status", "total_tasks", "completed_tasks"])

    df["created_date"] = pd.to_datetime(df["created_date"], errors="coerce")
    df["is_completed"] = df["status"] == "completed"

    summary = (
        df.groupby(["task_type", "status"])
        .agg(
            total_tasks=("id", "count"),
            completed_tasks=("is_completed", "sum"),
        )
        .reset_index()
    )
    return summary