import logging

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# XGBoost — Staffing Shift Demand Prediction
#
# CRISP-DM Phase 4 Objective 2 (complement to Prophet):
# Predict the number of caregiver shifts needed per day
# based on current client load, task patterns, and day-of-week.
#
# Prophet gives the trend (how many visits over 30 days).
# XGBoost gives the day-level demand (how many staff on Tuesday).
#
# Input:  task_summary + people_summary from Railway
# Output: predicted shifts needed per day for next N days
#
# Features:
#   active_clients      — current active client count
#   tasks_last_7d       — recent care visit volume
#   completion_rate_pct — care delivery efficiency
#   day_of_week         — 0=Monday ... 6=Sunday (one-hot encoded)
#   is_weekday          — binary
# ----------------------------------------------------------

DEFAULT_FORECAST_DAYS = 14


def build_demand_features(
    task_df: pd.DataFrame,
    people_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Build feature matrix for XGBoost shift demand model.

    Joins task and people summaries at the enterprise level,
    adds time-based features, and returns a training-ready DataFrame.
    """
    if task_df.empty or people_df.empty:
        logger.warning("build_demand_features: one or both inputs empty")
        return pd.DataFrame()

    join_cols = [c for c in ["enterprise_id", "company_id", "snapshot_date"]
                 if c in task_df.columns and c in people_df.columns]

    # Aggregate task metrics per enterprise per snapshot date
    task_agg = (
        task_df.groupby([c for c in ["enterprise_id", "company_id", "snapshot_date"]
                         if c in task_df.columns], dropna=False)
        .agg(
            total_tasks=("total_tasks", "sum"),
            tasks_last_7d=("tasks_last_7d", "sum"),
            completion_rate_pct=("completion_rate_pct", "mean"),
            overdue_tasks=("overdue_tasks", "sum"),
        )
        .reset_index()
    )

    # Aggregate active client counts per enterprise per snapshot date
    participants = people_df[
        people_df.get("is_participant", pd.Series(False, index=people_df.index))
    ]
    people_agg = (
        participants.groupby([c for c in ["enterprise_id", "company_id", "snapshot_date"]
                              if c in participants.columns], dropna=False)
        .agg(active_clients=("active_count", "sum"))
        .reset_index()
    )

    # Join on enterprise + date
    features = task_agg.merge(people_agg, on=join_cols, how="left")
    features["active_clients"] = features["active_clients"].fillna(0)

    # Parse date for time features
    if "snapshot_date" in features.columns:
        features["snapshot_date"] = pd.to_datetime(features["snapshot_date"])
        features["day_of_week"] = features["snapshot_date"].dt.dayofweek
        features["is_weekday"] = (features["day_of_week"] < 5).astype(int)
        features["day_sin"] = np.sin(2 * np.pi * features["day_of_week"] / 7)
        features["day_cos"] = np.cos(2 * np.pi * features["day_of_week"] / 7)

    # Target variable: shift demand proxy
    # Estimated as: ceil(active_clients / 5) * weekday_multiplier
    # A caregiver handles ~5 clients per day; weekends run lighter
    features["shifts_needed"] = (
        np.ceil(features["active_clients"] / 5)
        * features.get("is_weekday", pd.Series(1, index=features.index))
    ).fillna(0).astype(int)

    return features


def run_demand_model(
    task_df: pd.DataFrame,
    people_df: pd.DataFrame,
    enterprise_id: str,
    forecast_days: int = DEFAULT_FORECAST_DAYS,
) -> dict:
    """
    Full pipeline: build features → train XGBoost → forecast shift demand.

    Called by ml/routes.py POST /ml/shift-demand.

    Returns dict with:
        forecast        — list of {date, predicted_shifts, lower, upper}
        enterprise_id   — which enterprise was forecast
        forecast_days   — how far ahead
        model_score     — R² on training data
        status          — "success", "skipped", or "error"
    """
    try:
        from xgboost import XGBRegressor
    except ImportError:
        logger.error("ml/demand: xgboost not installed — run pip install xgboost")
        return {"status": "error", "reason": "xgboost not installed", "forecast": []}

    try:
        features = build_demand_features(task_df, people_df)

        if features.empty:
            return {
                "status":        "skipped",
                "reason":        "insufficient data",
                "enterprise_id": enterprise_id,
                "forecast":      [],
            }

        # Filter to the requested enterprise
        if "enterprise_id" in features.columns:
            features = features[features["enterprise_id"] == enterprise_id].copy()

        if len(features) < 7:
            return {
                "status":        "skipped",
                "reason":        f"only {len(features)} rows for enterprise {enterprise_id}",
                "enterprise_id": enterprise_id,
                "forecast":      [],
            }

        # Feature columns for XGBoost
        feature_cols = [c for c in [
            "active_clients", "tasks_last_7d", "completion_rate_pct",
            "overdue_tasks", "day_of_week", "is_weekday", "day_sin", "day_cos",
        ] if c in features.columns]

        X = features[feature_cols].fillna(0)
        y = features["shifts_needed"]

        # Train on full history — we predict out-of-sample future dates
        model = XGBRegressor(
            n_estimators=100,
            max_depth=4,
            learning_rate=0.1,
            random_state=42,
            verbosity=0,
        )
        model.fit(X, y)
        train_score = round(model.score(X, y), 3)

        logger.info(
            "ml/demand: XGBoost trained for enterprise %s — R²=%.3f on %d rows",
            enterprise_id, train_score, len(features),
        )

        # Build future feature rows
        last_date = features["snapshot_date"].max() if "snapshot_date" in features.columns \
            else pd.Timestamp.now()

        future_rows = []
        for i in range(1, forecast_days + 1):
            future_date = last_date + pd.Timedelta(days=i)
            dow = future_date.dayofweek
            is_wd = int(dow < 5)

            # Use most recent values for non-temporal features
            recent = features.iloc[-1]
            row = {
                "active_clients":       recent.get("active_clients", 0),
                "tasks_last_7d":        recent.get("tasks_last_7d", 0),
                "completion_rate_pct":  recent.get("completion_rate_pct", 100),
                "overdue_tasks":        recent.get("overdue_tasks", 0),
                "day_of_week":          dow,
                "is_weekday":           is_wd,
                "day_sin":              np.sin(2 * np.pi * dow / 7),
                "day_cos":              np.cos(2 * np.pi * dow / 7),
                "_date":                future_date.strftime("%Y-%m-%d"),
            }
            future_rows.append(row)

        future_df = pd.DataFrame(future_rows)
        X_future = future_df[feature_cols].fillna(0)
        preds = model.predict(X_future).clip(min=0)

        # Simple confidence interval: ±15% of prediction
        forecast = [
            {
                "date":              future_df.iloc[i]["_date"],
                "predicted_shifts":  round(float(preds[i]), 1),
                "lower":             round(float(preds[i]) * 0.85, 1),
                "upper":             round(float(preds[i]) * 1.15, 1),
            }
            for i in range(len(preds))
        ]

        return {
            "status":          "success",
            "enterprise_id":   enterprise_id,
            "forecast_days":   forecast_days,
            "model_score":     train_score,
            "forecast":        forecast,
        }

    except Exception as e:
        logger.error("ml/demand: run_demand_model failed — %s", e)
        return {"status": "error", "reason": str(e), "forecast": []}
