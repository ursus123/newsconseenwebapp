import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_supabase_entity_to_df

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = {"active", "running", "enabled", "scheduled"}
PAUSED_STATUSES = {"paused", "suspended", "disabled", "on_hold"}

DAILY_FREQS   = {"daily", "every_day", "weekday", "weekend"}
WEEKLY_FREQS  = {"weekly", "biweekly", "fortnightly"}
MONTHLY_FREQS = {"monthly", "bimonthly", "quarterly", "annual", "yearly"}

GROUP_COLUMNS = ["enterprise_id", "company_id", "schedule_type", "frequency", "status"]


def extract_schedules() -> pd.DataFrame:
    return fetch_supabase_entity_to_df("schedules")


def transform_schedules(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        logger.warning("transform_schedules: empty DataFrame")
        return _empty_summary()

    now = datetime.now(timezone.utc)
    df = df.copy()

    for col in ("enterprise_id", "company_id", "schedule_type", "frequency",
                "status", "created_date"):
        if col not in df.columns:
            df[col] = None

    df["_status_lower"] = df["status"].fillna("unknown").astype(str).str.lower().str.strip()
    df["_freq_lower"]   = df["frequency"].fillna("").astype(str).str.lower().str.strip()

    df["is_active"]  = df["_status_lower"].isin(ACTIVE_STATUSES)
    df["is_paused"]  = df["_status_lower"].isin(PAUSED_STATUSES)
    df["is_daily"]   = df["_freq_lower"].isin(DAILY_FREQS)
    df["is_weekly"]  = df["_freq_lower"].isin(WEEKLY_FREQS)
    df["is_monthly"] = df["_freq_lower"].isin(MONTHLY_FREQS)

    def _new_nd(days):
        def _f(row):
            cd = row.get("created_date")
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
            schedule_count = ("id", "count"),
            active_count   = ("is_active", "sum"),
            paused_count   = ("is_paused", "sum"),
            is_daily       = ("is_daily", "any"),
            is_weekly      = ("is_weekly", "any"),
            is_monthly     = ("is_monthly", "any"),
            new_last_7d    = ("_new_7d", "sum"),
            new_last_30d   = ("_new_30d", "sum"),
        )
        .reset_index()
    )

    agg["snapshot_date"] = now.date()
    agg["loaded_at"]     = now
    return agg


def _empty_summary() -> pd.DataFrame:
    return pd.DataFrame(columns=[
        "enterprise_id", "company_id", "schedule_type", "frequency", "status",
        "schedule_count", "active_count", "paused_count",
        "is_daily", "is_weekly", "is_monthly",
        "new_last_7d", "new_last_30d",
        "snapshot_date", "loaded_at",
    ])
