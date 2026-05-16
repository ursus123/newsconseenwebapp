import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_supabase_entity_to_df

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = {"active", "live", "monitoring", "enabled"}
SENSOR_TYPES    = {"sensor", "iot", "telemetry", "device", "meter", "gauge"}
SURVEY_TYPES    = {"survey", "form", "questionnaire", "feedback", "rating", "poll"}

GROUP_COLUMNS = ["enterprise_id", "company_id", "signal_type", "unit_of_measure", "status"]


def extract_signals() -> pd.DataFrame:
    return fetch_supabase_entity_to_df("signals")


def transform_signals(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        logger.warning("transform_signals: empty DataFrame")
        return _empty_summary()

    now = datetime.now(timezone.utc)
    df = df.copy()

    for col in ("enterprise_id", "company_id", "signal_type", "unit_of_measure",
                "status", "numeric_value", "is_anomaly", "recorded_at", "created_date"):
        if col not in df.columns:
            df[col] = None

    df["_status_lower"] = df["status"].fillna("unknown").astype(str).str.lower().str.strip()
    df["_stype_lower"]  = df["signal_type"].fillna("").astype(str).str.lower().str.strip()

    df["is_active"]  = df["_status_lower"].isin(ACTIVE_STATUSES)
    df["is_sensor"]  = df["_stype_lower"].isin(SENSOR_TYPES)
    df["is_survey"]  = df["_stype_lower"].isin(SURVEY_TYPES)
    df["is_anomaly"] = df["is_anomaly"].fillna(False).astype(bool)
    df["numeric_value"] = pd.to_numeric(df["numeric_value"], errors="coerce")

    def _new_nd(days):
        def _f(row):
            cd = row.get("recorded_at") or row.get("created_date")
            if pd.isna(cd) or cd is None:
                return False
            try:
                return (now - pd.to_datetime(cd, utc=True)).days <= days
            except Exception:
                return False
        return _f

    df["_new_7d"]  = df.apply(_new_nd(7), axis=1)
    df["_new_30d"] = df.apply(_new_nd(30), axis=1)

    grp_cols = [c for c in GROUP_COLUMNS if c in df.columns]
    agg = (
        df.groupby(grp_cols, dropna=False)
        .agg(
            signal_count  = ("id", "count"),
            active_count  = ("is_active", "sum"),
            anomaly_count = ("is_anomaly", "sum"),
            avg_value     = ("numeric_value", "mean"),
            is_sensor     = ("is_sensor", "any"),
            is_survey     = ("is_survey", "any"),
            new_last_7d   = ("_new_7d", "sum"),
            new_last_30d  = ("_new_30d", "sum"),
        )
        .reset_index()
    )

    agg["snapshot_date"] = now.date()
    agg["loaded_at"]     = now
    return agg


def _empty_summary() -> pd.DataFrame:
    return pd.DataFrame(columns=[
        "enterprise_id", "company_id", "signal_type", "unit_of_measure", "status",
        "signal_count", "active_count", "anomaly_count", "avg_value",
        "is_sensor", "is_survey",
        "new_last_7d", "new_last_30d",
        "snapshot_date", "loaded_at",
    ])
