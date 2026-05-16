import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_supabase_entity_to_df

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = {"active", "open", "operational", "enabled"}

SALES_TYPES     = {"sales_zone", "sales_territory", "sales_region", "sales_area"}
DELIVERY_TYPES  = {"delivery_zone", "delivery_area", "delivery_region", "last_mile"}
CATCHMENT_TYPES = {"catchment", "catchment_area", "service_area", "coverage_area"}

GROUP_COLUMNS = ["enterprise_id", "company_id", "territory_type", "country", "status"]


def extract_territories() -> pd.DataFrame:
    return fetch_supabase_entity_to_df("territories")


def transform_territories(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        logger.warning("transform_territories: empty DataFrame")
        return _empty_summary()

    now = datetime.now(timezone.utc)
    df = df.copy()

    for col in ("enterprise_id", "company_id", "territory_type", "country",
                "status", "area_km2", "population", "created_date"):
        if col not in df.columns:
            df[col] = None

    df["_status_lower"] = df["status"].fillna("unknown").astype(str).str.lower().str.strip()
    df["_ttype_lower"]  = df["territory_type"].fillna("").astype(str).str.lower().str.strip()

    df["is_active"]        = df["_status_lower"].isin(ACTIVE_STATUSES)
    df["is_sales_zone"]    = df["_ttype_lower"].isin(SALES_TYPES)
    df["is_delivery_zone"] = df["_ttype_lower"].isin(DELIVERY_TYPES)
    df["is_catchment"]     = df["_ttype_lower"].isin(CATCHMENT_TYPES)

    df["area_km2"]   = pd.to_numeric(df["area_km2"], errors="coerce").fillna(0.0)
    df["population"] = pd.to_numeric(df["population"], errors="coerce").fillna(0.0)

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
            territory_count  = ("id", "count"),
            active_count     = ("is_active", "sum"),
            total_area_km2   = ("area_km2", "sum"),
            total_population = ("population", "sum"),
            is_sales_zone    = ("is_sales_zone", "any"),
            is_delivery_zone = ("is_delivery_zone", "any"),
            is_catchment     = ("is_catchment", "any"),
            new_last_7d      = ("_new_7d", "sum"),
            new_last_30d     = ("_new_30d", "sum"),
        )
        .reset_index()
    )

    agg["snapshot_date"] = now.date()
    agg["loaded_at"]     = now
    return agg


def _empty_summary() -> pd.DataFrame:
    return pd.DataFrame(columns=[
        "enterprise_id", "company_id", "territory_type", "country", "status",
        "territory_count", "active_count", "total_area_km2", "total_population",
        "is_sales_zone", "is_delivery_zone", "is_catchment",
        "new_last_7d", "new_last_30d",
        "snapshot_date", "loaded_at",
    ])
