import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from etl import people, tasks, transactions
from etl.load import load_dataframe
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ml", tags=["ML"])


# ------------------------------------------------------------------
# Helpers — persist and retrieve ML predictions in raw.ml_predictions
# ------------------------------------------------------------------

def _store_predictions(company_id: Optional[str], model: str, result: dict) -> None:
    """
    Save ML model output to raw.ml_predictions for later retrieval
    by Reports, QueryBuilder, and Copilot.
    """
    try:
        import pandas as pd
        from database import get_engine_safe

        engine = get_engine_safe()
        if not engine:
            return

        row = {
            "company_id":   company_id or "global",
            "model":        model,
            "result_json":  json.dumps(result, default=str),
            "computed_at":  datetime.now(timezone.utc),
        }
        df = pd.DataFrame([row])

        with engine.begin() as conn:
            conn.execute(
                __import__("sqlalchemy").text(
                    "CREATE TABLE IF NOT EXISTS raw.ml_predictions ("
                    "  id            SERIAL PRIMARY KEY,"
                    "  company_id    TEXT,"
                    "  model         TEXT,"
                    "  result_json   TEXT,"
                    "  computed_at   TIMESTAMPTZ"
                    ")"
                )
            )

        df.to_sql(
            "ml_predictions",
            engine,
            schema="raw",
            if_exists="append",
            index=False,
            method="multi",
        )
        logger.info("_store_predictions: saved %s result for %s", model, company_id)
    except Exception as e:
        logger.warning("_store_predictions: could not persist — %s", e)

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
        _store_predictions(company_id, "retention-risk", result)
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
        _store_predictions(company_id, "ltv-segmentation", result)
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


# ----------------------------------------------------------
# GET /ml/predictions
# Retrieve stored ML results (for Reports, QueryBuilder, Copilot)
# ----------------------------------------------------------
@router.get("/predictions")
def get_predictions(
    company_id:  Optional[str] = Query(None,  description="Tenant filter"),
    model:       Optional[str] = Query(None,  description="Filter by model name"),
    limit:       int           = Query(10,    ge=1, le=100, description="Max results per model"),
):
    """
    Return the most recent stored ML predictions.

    Consumed by:
      - Reports.jsx    — 'AI Predictions' data source
      - QueryBuilder   — 'ML Insights' table
      - Copilot        — background context for forecasting questions
      - Dashboard      — optional ML insight widgets

    Results are stored automatically after each successful model run
    via _store_predictions().
    """
    try:
        import json as _json

        import pandas as pd
        from sqlalchemy import text
        from database import get_engine_safe

        engine = get_engine_safe()
        if not engine:
            return {"predictions": [], "note": "Database not configured"}

        filters = ["1=1"]
        params: dict = {}
        if company_id:
            filters.append("company_id = :cid")
            params["cid"] = company_id
        if model:
            filters.append("model = :model")
            params["model"] = model

        sql = f"""
            SELECT DISTINCT ON (company_id, model)
                id, company_id, model, result_json, computed_at
            FROM raw.ml_predictions
            WHERE {' AND '.join(filters)}
            ORDER BY company_id, model, computed_at DESC
            LIMIT :limit
        """
        params["limit"] = limit

        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).fetchall()

        results = []
        for row in rows:
            try:
                parsed = _json.loads(row[3]) if row[3] else {}
            except Exception:
                parsed = {}
            results.append({
                "id":          row[0],
                "company_id":  row[1],
                "model":       row[2],
                "result":      parsed,
                "computed_at": str(row[4]),
            })

        return {"predictions": results, "count": len(results)}

    except Exception as e:
        if "does not exist" in str(e):
            return {"predictions": [], "note": "No predictions stored yet — run an ML model first"}
        logger.error("/ml/predictions failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------
# POST /ml/push-to-base44
# Write ML risk scores back to Base44 Person records
# ----------------------------------------------------------
@router.post("/push-to-base44")
def push_ml_to_base44(
    company_id: str = Query(..., description="Tenant to push predictions for"),
    model:      str = Query("retention-risk", description="Which model results to push"),
    dry_run:    bool = Query(False, description="Preview without writing"),
):
    """
    Push the latest ML predictions back to Base44 entity records.

    For retention-risk: updates Person.ml_risk_score and Person.ml_risk_tier.
    For ltv-segmentation: updates Person.ml_segment.
    For forecasts: no writeback (forecasts are aggregate, not per-entity).

    Reads the most recent stored prediction from raw.ml_predictions,
    then batch-updates the corresponding Base44 entities.

    This closes the loop:
      Base44 → python_layer ETL → raw.* → ML → raw.ml_predictions → Base44
    """
    import httpx
    from config.settings import HEADERS

    try:
        import json as _json
        from sqlalchemy import text
        from database import get_engine_safe

        engine = get_engine_safe()
        if not engine:
            raise HTTPException(status_code=503, detail="Database not configured")

        # Load latest predictions for this company + model
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT result_json, computed_at FROM raw.ml_predictions "
                    "WHERE company_id = :cid AND model = :model "
                    "ORDER BY computed_at DESC LIMIT 1"
                ),
                {"cid": company_id, "model": model},
            ).fetchone()

        if not row:
            return {
                "status": "skipped",
                "reason": f"No stored predictions for model={model} company={company_id}. Run the model first.",
            }

        predictions = _json.loads(row[0])
        computed_at = str(row[1])

        # Extract per-entity scores
        scored_entities: list[dict] = predictions.get("scored", predictions.get("segments", []))
        if not scored_entities:
            return {"status": "skipped", "reason": "No per-entity scores in result", "model": model}

        if dry_run:
            return {
                "status":       "dry_run",
                "model":        model,
                "company_id":   company_id,
                "computed_at":  computed_at,
                "would_update": len(scored_entities),
                "sample":       scored_entities[:5],
            }

        # Determine which Base44 URL and field names to use
        from config import settings as s
        base_url = s.base44_people_url

        updated, failed = 0, 0
        field_map = {
            "retention-risk":    {"score_field": "ml_risk_score", "tier_field": "ml_risk_tier"},
            "ltv-segmentation":  {"score_field": "ml_ltv_score",  "tier_field": "ml_segment"},
        }.get(model, {"score_field": "ml_score", "tier_field": "ml_tier"})

        for entity in scored_entities:
            entity_id = entity.get("id") or entity.get("external_id")
            if not entity_id:
                continue
            payload = {
                field_map["score_field"]: entity.get("risk_score") or entity.get("score"),
                field_map["tier_field"]:  entity.get("risk_tier")  or entity.get("segment"),
            }
            payload = {k: v for k, v in payload.items() if v is not None}
            if not payload:
                continue

            try:
                r = httpx.patch(
                    f"{base_url}/{entity_id}",
                    json=payload,
                    headers=HEADERS,
                    timeout=10,
                )
                if r.status_code < 300:
                    updated += 1
                else:
                    failed += 1
            except Exception:
                failed += 1

        return {
            "status":      "complete",
            "model":       model,
            "company_id":  company_id,
            "computed_at": computed_at,
            "updated":     updated,
            "failed":      failed,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("/ml/push-to-base44 failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
