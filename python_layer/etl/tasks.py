import pandas as pd
from datetime import datetime
from etl.base import fetch_json_to_df
from config import settings


def extract_tasks() -> pd.DataFrame:
    return fetch_json_to_df(settings.base44_tasks_url)


def transform_tasks(df: pd.DataFrame) -> pd.DataFrame:
    df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
    df["completed_at"] = pd.to_datetime(df["completed_at"], errors="coerce")

    df["duration_days"] = (df["completed_at"] - df["created_at"]).dt.days
    df["is_completed"] = df["status"] == "completed"
    df["is_delayed"] = df["duration_days"] > 2
    df["month"] = df["created_at"].dt.to_period("M").astype(str)

    summary = (
        df.groupby("enterprise")
        .agg(
            total_tasks=("_id", "count"),
            completed_tasks=("is_completed", "sum"),
            delayed_tasks=("is_delayed", "sum"),
            avg_duration_days=("duration_days", "mean"),
        )
        .reset_index()
    )
    return summary