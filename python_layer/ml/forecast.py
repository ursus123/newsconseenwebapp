import logging
from typing import Optional

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Prophet — Staffing Demand Forecasting
#
# CRISP-DM Phase 4 Objective 2: forecast care visit volume
# for the next 30/60/90 days to support staffing decisions.
#
# Input:  task_summary time series from Railway PostgreSQL
#         (multiple snapshot_date rows per enterprise)
# Output: forecasted daily task volume with confidence intervals
#
# Prophet requires:
#   ds = date column (snapshot_date from Railway)
#   y  = metric to forecast (tasks_last_30d or total_tasks)
# ----------------------------------------------------------

DEFAULT_FORECAST_DAYS = 30
MIN_HISTORY_ROWS = 14       # Prophet needs at least 2 weeks of history


def build_prophet_features(
    task_summary_df: pd.DataFrame,
    enterprise_id: str,
    metric: str = "tasks_last_30d",
) -> pd.DataFrame:
    """
    Build a Prophet-ready time series DataFrame from Railway task_summary.

    Filters to a single enterprise, pivots snapshot_date as the time axis,
    and returns a ds/y DataFrame Prophet expects.

    task_summary_df: must contain snapshot_date, enterprise_id, and metric columns
    enterprise_id:   which enterprise to forecast
    metric:          which column to use as y (default: tasks_last_30d)
    """
    if task_summary_df.empty:
        logger.warning("build_prophet_features: empty task summary")
        return pd.DataFrame()

    # Filter to enterprise
    if "enterprise_id" in task_summary_df.columns:
        df = task_summary_df[
            task_summary_df["enterprise_id"] == enterprise_id
        ].copy()
    else:
        df = task_summary_df.copy()

    if df.empty:
        logger.warning(
            "build_prophet_features: no rows for enterprise_id=%s", enterprise_id
        )
        return pd.DataFrame()

    if "snapshot_date" not in df.columns:
        logger.error("build_prophet_features: snapshot_date column missing")
        return pd.DataFrame()

    if metric not in df.columns:
        logger.error("build_prophet_features: metric column '%s' missing", metric)
        return pd.DataFrame()

    # Aggregate by date — sum across task types and statuses
    ts = (
        df.groupby("snapshot_date")[metric]
        .sum()
        .reset_index()
        .rename(columns={"snapshot_date": "ds", metric: "y"})
    )

    ts["ds"] = pd.to_datetime(ts["ds"])
    ts = ts.sort_values("ds").reset_index(drop=True)

    logger.info(
        "build_prophet_features: %d time points for enterprise %s",
        len(ts), enterprise_id,
    )

    return ts


def run_staffing_forecast(
    task_summary_df: pd.DataFrame,
    enterprise_id: str,
    forecast_days: int = DEFAULT_FORECAST_DAYS,
    metric: str = "tasks_last_30d",
) -> dict:
    """
    Full pipeline: build time series → fit Prophet → forecast.

    Called by ml/routes.py POST /ml/staffing-forecast.

    Returns dict with:
        forecast        — list of {ds, yhat, yhat_lower, yhat_upper}
        enterprise_id   — which enterprise was forecast
        metric          — which metric was forecast
        forecast_days   — how far ahead the forecast goes
        history_points  — how many historical data points were used
        status          — "success", "skipped", or "error"
    """
    try:
        from prophet import Prophet
    except ImportError:
        logger.error("ml/forecast: prophet not installed — run pip install prophet")
        return {
            "status": "error",
            "reason": "prophet not installed",
            "forecast": [],
        }

    try:
        ts = build_prophet_features(task_summary_df, enterprise_id, metric)

        if ts.empty:
            return {
                "status":      "skipped",
                "reason":      "no time series data available",
                "forecast":    [],
                "enterprise_id": enterprise_id,
            }

        if len(ts) < MIN_HISTORY_ROWS:
            return {
                "status":      "skipped",
                "reason":      f"only {len(ts)} history points — need {MIN_HISTORY_ROWS} minimum",
                "forecast":    [],
                "enterprise_id": enterprise_id,
                "history_points": len(ts),
            }

        # Fit Prophet
        # weekly_seasonality captures Mon-Sun care visit patterns
        # yearly_seasonality off — not enough history for most deployments
        model = Prophet(
            weekly_seasonality=True,
            yearly_seasonality=False,
            daily_seasonality=False,
            uncertainty_samples=200,
        )
        model.fit(ts)

        # Generate future dates
        future = model.make_future_dataframe(periods=forecast_days)
        forecast = model.predict(future)

        # Return only the forecast horizon, not the historical fitted values
        forecast_only = forecast[forecast["ds"] > ts["ds"].max()][
            ["ds", "yhat", "yhat_lower", "yhat_upper"]
        ].copy()

        # Floor negative predictions at zero — task counts cannot be negative
        forecast_only["yhat"] = forecast_only["yhat"].clip(lower=0).round(1)
        forecast_only["yhat_lower"] = forecast_only["yhat_lower"].clip(lower=0).round(1)
        forecast_only["yhat_upper"] = forecast_only["yhat_upper"].clip(lower=0).round(1)
        forecast_only["ds"] = forecast_only["ds"].dt.strftime("%Y-%m-%d")

        logger.info(
            "ml/forecast: Prophet forecast complete for enterprise %s "
            "— %d future days, peak yhat=%.1f",
            enterprise_id,
            len(forecast_only),
            forecast_only["yhat"].max(),
        )

        return {
            "status":         "success",
            "enterprise_id":  enterprise_id,
            "metric":         metric,
            "forecast_days":  forecast_days,
            "history_points": len(ts),
            "forecast":       forecast_only.to_dict(orient="records"),
        }

    except Exception as e:
        logger.error("ml/forecast: run_staffing_forecast failed — %s", e)
        return {"status": "error", "reason": str(e), "forecast": []}
