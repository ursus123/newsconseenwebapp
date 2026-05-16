import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_supabase_entity_to_df

logger = logging.getLogger(__name__)

ACTIVE_STATUSES   = {"active", "open", "live", "connected", "enabled"}
POSITIVE_SENTIMENT = {"positive", "good", "satisfied", "happy", "excellent"}
NEGATIVE_SENTIMENT = {"negative", "bad", "dissatisfied", "unhappy", "poor", "complaint"}

WHATSAPP_TYPES = {"whatsapp", "whatsapp_group", "whatsapp_broadcast"}
EMAIL_TYPES    = {"email", "email_list", "newsletter", "mailing_list"}

GROUP_COLUMNS = ["enterprise_id", "company_id", "channel_type", "purpose", "status"]


def extract_channels() -> pd.DataFrame:
    return fetch_supabase_entity_to_df("channels")


def transform_channels(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        logger.warning("transform_channels: empty DataFrame")
        return _empty_summary()

    now = datetime.now(timezone.utc)
    df = df.copy()

    for col in ("enterprise_id", "company_id", "channel_type", "purpose",
                "status", "sentiment", "message_count", "created_date"):
        if col not in df.columns:
            df[col] = None

    df["_status_lower"]    = df["status"].fillna("unknown").astype(str).str.lower().str.strip()
    df["_ctype_lower"]     = df["channel_type"].fillna("").astype(str).str.lower().str.strip()
    df["_sentiment_lower"] = df["sentiment"].fillna("").astype(str).str.lower().str.strip()

    df["is_active"]    = df["_status_lower"].isin(ACTIVE_STATUSES)
    df["is_positive"]  = df["_sentiment_lower"].isin(POSITIVE_SENTIMENT)
    df["is_negative"]  = df["_sentiment_lower"].isin(NEGATIVE_SENTIMENT)
    df["is_whatsapp"]  = df["_ctype_lower"].isin(WHATSAPP_TYPES)
    df["is_email"]     = df["_ctype_lower"].isin(EMAIL_TYPES)
    df["message_count"] = pd.to_numeric(df["message_count"], errors="coerce").fillna(0)

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
            channel_count   = ("id", "count"),
            active_count    = ("is_active", "sum"),
            positive_count  = ("is_positive", "sum"),
            negative_count  = ("is_negative", "sum"),
            total_messages  = ("message_count", "sum"),
            is_whatsapp     = ("is_whatsapp", "any"),
            is_email        = ("is_email", "any"),
            new_last_7d     = ("_new_7d", "sum"),
            new_last_30d    = ("_new_30d", "sum"),
        )
        .reset_index()
    )

    agg["snapshot_date"] = now.date()
    agg["loaded_at"]     = now
    return agg


def _empty_summary() -> pd.DataFrame:
    return pd.DataFrame(columns=[
        "enterprise_id", "company_id", "channel_type", "purpose", "status",
        "channel_count", "active_count", "positive_count", "negative_count",
        "total_messages", "is_whatsapp", "is_email",
        "new_last_7d", "new_last_30d",
        "snapshot_date", "loaded_at",
    ])
