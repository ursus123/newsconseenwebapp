import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_supabase_entity_to_df

logger = logging.getLogger(__name__)

ACTIVE_STATUSES  = {"active", "current", "valid", "approved", "signed"}
EXPIRED_STATUSES = {"expired", "revoked", "cancelled", "rejected", "voided"}
SIGNED_STATUSES  = {"signed", "approved", "countersigned", "executed"}

CONTRACT_TYPES = {"contract", "agreement", "mou", "nda", "sla"}
INVOICE_TYPES  = {"invoice", "receipt", "bill", "proforma"}
POLICY_TYPES   = {"policy", "procedure", "guideline", "sop", "manual"}

GROUP_COLUMNS = ["enterprise_id", "company_id", "document_type", "status"]


def extract_documents() -> pd.DataFrame:
    return fetch_supabase_entity_to_df("documents")


def transform_documents(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        logger.warning("transform_documents: empty DataFrame")
        return _empty_summary()

    now = datetime.now(timezone.utc)
    df = df.copy()

    for col in ("enterprise_id", "company_id", "document_type", "status",
                "expiry_date", "signed_date", "created_date"):
        if col not in df.columns:
            df[col] = None

    df["_status_lower"] = df["status"].fillna("unknown").astype(str).str.lower().str.strip()
    df["_dtype_lower"]  = df["document_type"].fillna("").astype(str).str.lower().str.strip()

    df["is_active"]  = df["_status_lower"].isin(ACTIVE_STATUSES)
    df["is_expired"] = df["_status_lower"].isin(EXPIRED_STATUSES)
    df["is_signed"]  = df["_status_lower"].isin(SIGNED_STATUSES)

    df["is_contract"] = df["_dtype_lower"].isin(CONTRACT_TYPES)
    df["is_invoice"]  = df["_dtype_lower"].isin(INVOICE_TYPES)
    df["is_policy"]   = df["_dtype_lower"].isin(POLICY_TYPES)

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
            document_count = ("id", "count"),
            active_count   = ("is_active", "sum"),
            expired_count  = ("is_expired", "sum"),
            signed_count   = ("is_signed", "sum"),
            is_contract    = ("is_contract", "any"),
            is_invoice     = ("is_invoice", "any"),
            is_policy      = ("is_policy", "any"),
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
        "enterprise_id", "company_id", "document_type", "status",
        "document_count", "active_count", "expired_count", "signed_count",
        "is_contract", "is_invoice", "is_policy",
        "new_last_7d", "new_last_30d",
        "snapshot_date", "loaded_at",
    ])
