import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_json_to_df
from config import settings

logger = logging.getLogger(__name__)

GROUP_COLUMNS = [
    "enterprise_id", "company_id", "observation_type",
    "unit_of_measure", "subject_type",
]


def extract_observations() -> pd.DataFrame:
    if not settings.base44_observations_url:
        return pd.DataFrame()
    return fetch_json_to_df(settings.base44_observations_url)


def transform_observations(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        logger.warning("transform_observations: empty DataFrame")
        return _empty_summary()

    now = datetime.now(timezone.utc)
    df = df.copy()

    for col in ("enterprise_id", "company_id", "observation_type",
                "unit_of_measure", "subject_type", "subject_id",
                "numeric_value", "text_value", "is_anomaly",
                "observed_at", "created_date"):
        if col not in df.columns:
            df[col] = None

    df["numeric_value"] = pd.to_numeric(df["numeric_value"], errors="coerce")
    df["is_anomaly"]    = df["is_anomaly"].fillna(False).astype(bool)

    def _new_30d(row):
        cd = row.get("observed_at") or row.get("created_date")
        if pd.isna(cd) or cd is None:
            return False
        try:
            d = pd.to_datetime(cd, utc=True)
            return (now - d).days <= 30
        except Exception:
            return False

    def _new_7d(row):
        cd = row.get("observed_at") or row.get("created_date")
        if pd.isna(cd) or cd is None:
            return False
        try:
            d = pd.to_datetime(cd, utc=True)
            return (now - d).days <= 7
        except Exception:
            return False

    df["_new_30d"] = df.apply(_new_30d, axis=1)
    df["_new_7d"]  = df.apply(_new_7d, axis=1)

    grp_cols = [c for c in GROUP_COLUMNS if c in df.columns]
    agg = (
        df.groupby(grp_cols, dropna=False)
        .agg(
            observation_count  = ("id", "count"),
            avg_value          = ("numeric_value", "mean"),
            min_value          = ("numeric_value", "min"),
            max_value          = ("numeric_value", "max"),
            anomaly_count      = ("is_anomaly", "sum"),
            new_last_7d        = ("_new_7d", "sum"),
            new_last_30d       = ("_new_30d", "sum"),
        )
        .reset_index()
    )

    agg["snapshot_date"] = now.date()
    agg["loaded_at"]     = now

    return agg


def _empty_summary() -> pd.DataFrame:
    return pd.DataFrame(columns=[
        "enterprise_id", "company_id", "observation_type",
        "unit_of_measure", "subject_type",
        "observation_count", "avg_value", "min_value", "max_value",
        "anomaly_count", "new_last_7d", "new_last_30d",
        "snapshot_date", "loaded_at",
    ])
