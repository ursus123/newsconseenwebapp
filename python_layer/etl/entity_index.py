import logging
from datetime import datetime, timezone

import pandas as pd

from config.taxonomy import (
    PERSON_TYPE_SETS,
    PERSON_TYPE_MAP,
    ACTIVE_STATUSES,
    INACTIVE_STATUSES,
)

logger = logging.getLogger(__name__)

STAFF_TYPES   = PERSON_TYPE_SETS["staff"]
CLIENT_TYPES  = PERSON_TYPE_SETS["client"]
CONTACT_TYPES = PERSON_TYPE_SETS["contact"]


def transform_entity_index(people_df: pd.DataFrame) -> pd.DataFrame:
    """
    Build analytics.entity_index — one row per individual person.

    Unlike people_summary (which collapses groups), this table keeps
    every record so the copilot can answer "who" questions:
        "Which clients are most at risk?"
        "Show me the 10 longest-tenured staff"
        "List all active clients enrolled this year"
        "Who became inactive in the last 30 days?"

    Columns produced:
        entity_id           — Base44 person id
        company_id
        enterprise_id       — linked enterprise (if present)
        entity_name         — display name (preferred_name or first+last)
        entity_type         — canonical type (staff/client/contact/volunteer)
        entity_subtype      — operator-defined subtype
        status
        availability_status
        tenure_days         — days since created_date (0 if unknown)
        is_staff
        is_participant      — True if client/patient/student etc.
        is_contact
        new_last_30d        — True if created in last 30 days
        became_inactive_30d — True if inactive and created/updated in last 30d
        snapshot_date
    """
    if people_df.empty:
        logger.warning("transform_entity_index: empty people_df")
        return pd.DataFrame()

    df = people_df.copy()
    now = pd.Timestamp.now(tz="UTC")

    # ── entity_id ─────────────────────────────────────────────────────────────
    df["entity_id"] = df.get("id", pd.Series(None, index=df.index)).astype(str)

    # ── entity_name ───────────────────────────────────────────────────────────
    # Prefer preferred_name, fall back to first+last, then full_name, then id
    def _name(row):
        if pd.notna(row.get("preferred_name")) and str(row.get("preferred_name", "")).strip():
            return str(row["preferred_name"]).strip()
        first = str(row.get("first_name", "") or "").strip()
        last  = str(row.get("last_name",  "") or "").strip()
        full  = f"{first} {last}".strip()
        if full:
            return full
        if pd.notna(row.get("full_name")) and str(row.get("full_name", "")).strip():
            return str(row["full_name"]).strip()
        return str(row.get("id", "unknown"))

    df["entity_name"] = df.apply(_name, axis=1)

    # ── entity_type (canonical) ────────────────────────────────────────────────
    raw_type = (
        df.get("person_type", pd.Series("", index=df.index))
        .fillna("").str.lower().str.strip()
    )
    df["entity_type"] = raw_type.map(lambda x: PERSON_TYPE_MAP.get(x, x) if x else "staff")

    # ── entity_subtype ─────────────────────────────────────────────────────────
    df["entity_subtype"] = df.get(
        "person_subtype", pd.Series(None, index=df.index)
    )

    # ── status (normalised) ────────────────────────────────────────────────────
    df["status"] = (
        df.get("status", pd.Series("unknown", index=df.index))
        .fillna("unknown").str.lower().str.strip()
    )

    # ── availability_status ────────────────────────────────────────────────────
    df["availability_status"] = df.get(
        "availability_status", pd.Series(None, index=df.index)
    )

    # ── enterprise_id ─────────────────────────────────────────────────────────
    df["enterprise_id"] = df.get("enterprise_id", pd.Series(None, index=df.index))

    # ── company_id ────────────────────────────────────────────────────────────
    df["company_id"] = df.get("company_id", pd.Series(None, index=df.index))

    # ── tenure_days ───────────────────────────────────────────────────────────
    created = pd.to_datetime(df.get("created_date"), errors="coerce", utc=True)
    df["tenure_days"] = (
        (now - created).dt.days
        .where(created.notna(), 0)
        .clip(lower=0)
        .fillna(0)
        .astype(int)
    )

    # ── classification flags ───────────────────────────────────────────────────
    df["is_staff"]       = raw_type.isin(STAFF_TYPES)
    df["is_participant"] = raw_type.isin(CLIENT_TYPES)
    df["is_contact"]     = raw_type.isin(CONTACT_TYPES)

    # ── activity windows ──────────────────────────────────────────────────────
    df["new_last_30d"] = (
        created.notna()
        & (created >= now - pd.Timedelta(days=30))
    )

    df["became_inactive_30d"] = (
        df["status"].isin(INACTIVE_STATUSES)
        & created.notna()
        & (created >= now - pd.Timedelta(days=30))
    )

    df["snapshot_date"] = pd.Timestamp.now(tz="UTC").date()

    # ── Select and order output columns ───────────────────────────────────────
    out_cols = [
        "entity_id", "company_id", "enterprise_id",
        "entity_name", "entity_type", "entity_subtype",
        "status", "availability_status",
        "tenure_days",
        "is_staff", "is_participant", "is_contact",
        "new_last_30d", "became_inactive_30d",
        "snapshot_date",
    ]
    result = df[[c for c in out_cols if c in df.columns]].reset_index(drop=True)

    logger.info(
        "transform_entity_index: %d rows — %d companies, %d active, %d inactive",
        len(result),
        result["company_id"].nunique() if "company_id" in result.columns else 0,
        int((result["status"].isin(ACTIVE_STATUSES)).sum()) if "status" in result.columns else 0,
        int((result["status"].isin(INACTIVE_STATUSES)).sum()) if "status" in result.columns else 0,
    )

    return result
