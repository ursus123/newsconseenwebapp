import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_supabase_entity_to_df

logger = logging.getLogger(__name__)

ACTIVE_STATUSES   = {"active", "healthy", "alive", "in_care"}
INACTIVE_STATUSES = {"inactive", "deceased", "discharged", "sold", "transferred"}

GROUP_COLUMNS = ["enterprise_id", "company_id", "animal_type", "species", "status"]


def extract_animals() -> pd.DataFrame:
    return fetch_supabase_entity_to_df("animals")


def transform_animals(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        logger.warning("transform_animals: empty DataFrame")
        return _empty_summary()

    now = datetime.now(timezone.utc)
    df = df.copy()

    # Normalise optional columns
    for col in ("enterprise_id", "company_id", "animal_type", "species",
                "status", "sex", "date_of_birth", "acquisition_date",
                "weight_kg", "created_date"):
        if col not in df.columns:
            df[col] = None

    df["status"]   = df["status"].fillna("unknown").astype(str).str.lower().str.strip()
    df["is_active"] = df["status"].isin(ACTIVE_STATUSES)

    # Age in days
    def _age(row):
        dob = row.get("date_of_birth")
        if pd.isna(dob) or dob is None:
            return None
        try:
            d = pd.to_datetime(dob, utc=True)
            return (now - d).days
        except Exception:
            return None

    df["age_days"] = df.apply(_age, axis=1)

    # New in last 30 days
    def _new_30d(row):
        cd = row.get("created_date") or row.get("acquisition_date")
        if pd.isna(cd) or cd is None:
            return False
        try:
            d = pd.to_datetime(cd, utc=True)
            return (now - d).days <= 30
        except Exception:
            return False

    df["_new_30d"] = df.apply(_new_30d, axis=1)

    grp_cols = [c for c in GROUP_COLUMNS if c in df.columns]
    agg = (
        df.groupby(grp_cols, dropna=False)
        .agg(
            animal_count     = ("id", "count"),
            active_count     = ("is_active", "sum"),
            avg_age_days     = ("age_days", "mean"),
            avg_weight_kg    = ("weight_kg", "mean"),
            new_last_30d     = ("_new_30d", "sum"),
        )
        .reset_index()
    )

    agg["inactive_count"]  = agg["animal_count"] - agg["active_count"]
    agg["snapshot_date"]   = now.date()
    agg["loaded_at"]       = now

    return agg


def _empty_summary() -> pd.DataFrame:
    return pd.DataFrame(columns=[
        "enterprise_id", "company_id", "animal_type", "species", "status",
        "animal_count", "active_count", "inactive_count",
        "avg_age_days", "avg_weight_kg", "new_last_30d",
        "snapshot_date", "loaded_at",
    ])
