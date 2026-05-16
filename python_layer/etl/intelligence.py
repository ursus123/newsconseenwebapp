import logging
from datetime import datetime, timezone

import pandas as pd

from etl.base import fetch_supabase_entity_to_df

logger = logging.getLogger(__name__)


def _extract(entity: str) -> pd.DataFrame:
    return fetch_supabase_entity_to_df(entity)


def extract_insights() -> pd.DataFrame:
    return _extract("insights")


def extract_recommendations() -> pd.DataFrame:
    return _extract("recommendations")


def extract_decisions() -> pd.DataFrame:
    return _extract("decisions")


def extract_risks() -> pd.DataFrame:
    return _extract("risks")


def extract_opportunities() -> pd.DataFrame:
    return _extract("opportunities")


def _empty(columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame(columns=columns + ["snapshot_date", "loaded_at"])


def _normalise(df: pd.DataFrame, columns: list[str], date_cols: tuple[str, ...] = ()) -> pd.DataFrame:
    if df.empty:
        logger.warning("transform_intelligence: received empty DataFrame")
        return _empty(columns)

    out = df.copy()
    for col in columns:
        if col not in out.columns:
            out[col] = None

    for col in date_cols:
        if col in out.columns:
            out[col] = pd.to_datetime(out[col], errors="coerce", utc=True).dt.tz_localize(None)

    now = datetime.now(timezone.utc)
    out = out[columns].copy()
    out["snapshot_date"] = now.date()
    out["loaded_at"] = now.replace(tzinfo=None)
    return out


def transform_insights(df: pd.DataFrame) -> pd.DataFrame:
    columns = [
        "id", "company_id", "subject_type", "subject_id", "subject_name",
        "insight_type", "title", "body", "severity", "confidence", "status",
        "source", "source_run_id", "evidence", "model_version",
        "related_metric_id", "detected_at", "expires_at", "acknowledged_by",
        "acknowledged_at", "dismissed_by", "dismissed_at", "actioned_by",
        "actioned_at", "resolved_by", "resolved_at", "resolution_notes",
        "created_by",
    ]
    return _normalise(
        df,
        columns,
        (
            "detected_at", "expires_at", "acknowledged_at", "dismissed_at",
            "actioned_at", "resolved_at",
        ),
    )


def transform_recommendations(df: pd.DataFrame) -> pd.DataFrame:
    columns = [
        "id", "company_id", "insight_id", "title", "rationale", "priority",
        "estimated_impact", "confidence", "action_type", "action_payload",
        "status", "assigned_to", "due_date", "rejection_reason",
        "created_task_id", "created_workflow_id", "source", "approved_by",
        "approved_at", "rejected_by", "rejected_at", "created_by",
    ]
    return _normalise(df, columns, ("due_date", "approved_at", "rejected_at"))


def transform_risks(df: pd.DataFrame) -> pd.DataFrame:
    columns = [
        "id", "company_id", "subject_type", "subject_id", "category",
        "severity", "likelihood", "title", "description", "mitigation",
        "owner", "status", "source", "insight_id", "opened_at",
        "resolved_at", "created_by",
    ]
    return _normalise(df, columns, ("opened_at", "resolved_at"))


def transform_opportunities(df: pd.DataFrame) -> pd.DataFrame:
    columns = [
        "id", "company_id", "subject_type", "subject_id", "type", "title",
        "description", "estimated_value", "confidence", "market_context",
        "supporting_evidence", "status", "assigned_to", "source",
        "insight_id", "outcome_value", "created_by", "created_at",
        "closed_at",
    ]
    return _normalise(df, columns, ("created_at", "closed_at"))


def transform_decisions(df: pd.DataFrame) -> pd.DataFrame:
    columns = [
        "id", "company_id", "recommendation_id", "insight_id", "decision",
        "decided_by", "decided_at", "notes", "rejection_reason",
        "modified_payload", "outcome_status", "outcome_summary",
        "outcome_metric_delta", "created_by",
    ]
    return _normalise(df, columns, ("decided_at",))
