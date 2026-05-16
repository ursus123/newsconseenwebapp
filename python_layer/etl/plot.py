import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_supabase_entity_to_df

logger = logging.getLogger(__name__)

ACTIVE_STATUSES   = {"active", "cultivated", "fallow", "in_use"}
INACTIVE_STATUSES = {"inactive", "abandoned", "leased_out", "sold"}

GROUP_COLUMNS = ["enterprise_id", "company_id", "plot_type", "land_use", "status"]


def extract_plots() -> pd.DataFrame:
    return fetch_supabase_entity_to_df("plots")


def transform_plots(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        logger.warning("transform_plots: empty DataFrame")
        return _empty_summary()

    now = datetime.now(timezone.utc)
    df = df.copy()

    for col in ("enterprise_id", "company_id", "plot_type", "land_use",
                "status", "area_ha", "crop_type", "irrigation_type",
                "soil_type", "latitude", "longitude", "created_date"):
        if col not in df.columns:
            df[col] = None

    df["status"]    = df["status"].fillna("unknown").astype(str).str.lower().str.strip()
    df["is_active"] = df["status"].isin(ACTIVE_STATUSES)

    for num_col in ("area_ha", "latitude", "longitude"):
        df[num_col] = pd.to_numeric(df[num_col], errors="coerce")

    df["has_coordinates"] = df["latitude"].notna() & df["longitude"].notna()

    def _new_30d(row):
        cd = row.get("created_date")
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
            plot_count           = ("id", "count"),
            active_count         = ("is_active", "sum"),
            total_area_ha        = ("area_ha", "sum"),
            avg_area_ha          = ("area_ha", "mean"),
            plots_with_coords    = ("has_coordinates", "sum"),
            new_last_30d         = ("_new_30d", "sum"),
        )
        .reset_index()
    )

    agg["inactive_count"] = agg["plot_count"] - agg["active_count"]
    agg["snapshot_date"]  = now.date()
    agg["loaded_at"]      = now

    return agg


def _empty_summary() -> pd.DataFrame:
    return pd.DataFrame(columns=[
        "enterprise_id", "company_id", "plot_type", "land_use", "status",
        "plot_count", "active_count", "inactive_count",
        "total_area_ha", "avg_area_ha", "plots_with_coords", "new_last_30d",
        "snapshot_date", "loaded_at",
    ])
