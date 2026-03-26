import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from etl import people, tasks, transactions
from etl.load import load_dataframe
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ml", tags=["ML"])

# ----------------------------------------------------------
# ML_ENABLED gate
# Set ML_ENABLED=false in Railway environment to suspend all
# ML endpoints. Do this when the underlying models have not
# been retrained for the current deployment vertical.
# The endpoints return 503 with a clear explanation rather
# than 404 so callers know the feature exists but is off.
# ----------------------------------------------------------
ML_ENABLED = getattr(settings, "ml_enabled", "false")
if isinstance(ML_ENABLED, str):
    ML_ENABLED = ML_ENABLED.lower() == "true"


def _check_ml_enabled():
    if not ML_ENABLED:
        raise HTTPException(
            status_code=503,
            detail=(
                "ML endpoints are currently disabled. "
                "Set ML_ENABLED=true in Railway environment variables "
                "to enable. ML models require retraining before use "
                "with this deployment's data."
            ),
        )


def _load_summary_from_railway(table: str) -> "pd.DataFrame":
    """
    Load a summary table from Railway PostgreSQL for ML input.

    The ML models need the full time-series history from Railway,
    not just the latest Base44 extract. This is what makes the
    models meaningful — they train on weeks or months of snapshots.

    Falls back to a live Base44 extract if Railway is unavailable.
    """
    import pandas as pd
    from sqlalchemy import text

    try:
        from database import get_engine
        engine = get_engine()
        with engine.connect() as conn:
            df = pd.read_sql(
                text(f"SELECT * FROM analytics.{table} ORDER BY snapshot_date ASC"),
                conn,
            )
        logger.info("_load_summary_from_railway: loaded %d rows from %s", len(df), table)
        return df
    except Exception as e:
        logger.warning(
            "_load_summary_from_railway: Railway unavailable for %s (%s) "
            "— falling back to live Base44 extract", table, e
        )
        return pd.DataFrame()


# ----------------------------------------------------------
# GET /ml/status
# Reports whether ML is enabled and which endpoints are live
# ----------------------------------------------------------
@router.get("/status")
def ml_status():
    """Returns ML feature status — always available regardless of ML_ENABLED."""
    return {
        "ml_enabled": ML_ENABLED,
        "status": "available" if ML_ENABLED else "disabled",
        "reason": None if ML_ENABLED else (
            "ML_ENABLED=false in environment. "
            "Models require retraining before enabling."
        ),
        "endpoints": [
            "/ml/retention-risk",
            "/ml/staffing-forecast",
            "/ml/ltv-segmentation",
            "/ml/shift-demand",
        ] if ML_ENABLED else [],
    }


# ----------------------------------------------------------
# POST /ml/retention-risk
# Cox PH client retention risk scoring
# ----------------------------------------------------------
@router.post("/retention-risk")
def retention_risk(
    company_id: Optional[str] = Query(None, description="Tenant filter"),
    horizon_days: int = Query(30, ge=7, le=90, description="Risk horizon in days"),
):
    """
    Score active clients by predicted discharge risk using Cox PH.

    Uses Railway time-series history for model training.
    Falls back to live Base44 extract if Railway unavailable.

    Returns per-enterprise-group risk scores with tier classification:
        high   — >70% predicted discharge probability
        medium — 40–70%
        low    — <40%
    """
    _check_ml_enabled()

    from ml.survival import run_retention_model

    try:
        people_df = _load_summary_from_railway("people_summary")
        task_df = _load_summary_from_railway("task_summary")

        if people_df.empty:
            logger.info("/ml/retention-risk: using live Base44 people extract")
            raw = people.extract_people()
            people_df = people.transform_people(raw)

        if task_df.empty:
            logger.info("/ml/retention-risk: using live Base44 task extract")
            raw = tasks.extract_tasks()
            task_df = tasks.transform_tasks(raw)

        if company_id:
            if "company_id" in people_df.columns:
                people_df = people_df[people_df["company_id"] == company_id]
            if "company_id" in task_df.columns:
                task_df = task_df[task_df["company_id"] == company_id]

        result = run_retention_model(people_df, task_df, horizon_days=horizon_days)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("/ml/retention-risk failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------
# POST /ml/staffing-forecast
# Prophet staffing demand forecast
# ----------------------------------------------------------
@router.post("/staffing-forecast")
def staffing_forecast(
    enterprise_id: str = Query(..., description="Enterprise to forecast"),
    forecast_days: int = Query(30, ge=7, le=90, description="Days ahead to forecast"),
    metric: str = Query("tasks_last_30d", description="Metric to forecast"),
):
    """
    Forecast care visit volume for the next N days using Prophet.

    Requires at least 14 days of Railway snapshot history to produce
    a meaningful forecast. Returns daily predictions with confidence
    intervals suitable for staffing schedule planning.
    """
    _check_ml_enabled()

    from ml.forecast import run_staffing_forecast

    try:
        task_df = _load_summary_from_railway("task_summary")

        if task_df.empty:
            return {
                "status": "skipped",
                "reason": "no Railway history available — run ETL first",
                "forecast": [],
            }

        result = run_staffing_forecast(
            task_df,
            enterprise_id=enterprise_id,
            forecast_days=forecast_days,
            metric=metric,
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("/ml/staffing-forecast failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------
# POST /ml/ltv-segmentation
# K-Means client LTV segmentation
# ----------------------------------------------------------
@router.post("/ltv-segmentation")
def ltv_segmentation(
    company_id: Optional[str] = Query(None, description="Tenant filter"),
    n_clusters: int = Query(3, ge=2, le=5, description="Number of segments"),
):
    """
    Segment clients into LTV tiers using K-Means clustering.

    Returns three segments (default):
        high_value     — long tenure, high revenue per client
        mid_value      — moderate tenure and revenue
        low_engagement — short tenure or low activity

    Also returns segment_summary with aggregate stats per tier.
    """
    _check_ml_enabled()

    from ml.segmentation import run_ltv_segmentation

    try:
        people_df = _load_summary_from_railway("people_summary")
        transaction_df = _load_summary_from_railway("transaction_summary")
        task_df = _load_summary_from_railway("task_summary")

        if people_df.empty:
            raw = people.extract_people()
            people_df = people.transform_people(raw)
        if transaction_df.empty:
            raw = transactions.extract_transactions()
            transaction_df = transactions.transform_transactions(raw)
        if task_df.empty:
            raw = tasks.extract_tasks()
            task_df = tasks.transform_tasks(raw)

        if company_id:
            for df in [people_df, transaction_df, task_df]:
                if "company_id" in df.columns:
                    df.drop(df[df["company_id"] != company_id].index, inplace=True)

        result = run_ltv_segmentation(
            people_df, transaction_df, task_df, n_clusters=n_clusters
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("/ml/ltv-segmentation failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------
# POST /ml/shift-demand
# XGBoost shift demand prediction
# ----------------------------------------------------------
@router.post("/shift-demand")
def shift_demand(
    enterprise_id: str = Query(..., description="Enterprise to forecast"),
    forecast_days: int = Query(14, ge=3, le=30, description="Days ahead to forecast"),
):
    """
    Predict daily shift demand for the next N days using XGBoost.

    Complements the Prophet staffing forecast — Prophet gives the
    trend, XGBoost gives the day-level demand signal including
    day-of-week patterns.

    Returns predicted shifts per day with confidence interval.
    """
    _check_ml_enabled()

    from ml.demand import run_demand_model

    try:
        task_df = _load_summary_from_railway("task_summary")
        people_df = _load_summary_from_railway("people_summary")

        if task_df.empty or people_df.empty:
            return {
                "status": "skipped",
                "reason": "no Railway history available — run ETL first",
                "forecast": [],
            }

        result = run_demand_model(
            task_df,
            people_df,
            enterprise_id=enterprise_id,
            forecast_days=forecast_days,
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("/ml/shift-demand failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
