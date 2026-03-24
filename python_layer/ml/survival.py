import logging
from typing import Optional

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Cox Proportional Hazards — Client Retention Model
#
# CRISP-DM Phase 4 Objective 1: predict which active clients
# are at risk of discharge within the next 30 days.
#
# Input:  people_summary + task_summary joined on enterprise_id
# Output: per-client risk scores with risk tier classification
#
# Features used (from CRISP-DM Phase 3 feature engineering):
#   T  = tenure_days (time-at-risk — days since enrollment)
#   E  = discharge event (1 = discharged, 0 = still active)
#   x1 = completion_rate_pct (care visit completion rate)
#   x2 = overdue_tasks (count of overdue visits)
#   x3 = tasks_last_30d (recent care activity volume)
#   x4 = avg_tenure_days (enterprise-level baseline tenure)
# ----------------------------------------------------------

RISK_TIERS = {
    "high":   (0.7,  1.0),   # >70% predicted discharge probability
    "medium": (0.4,  0.7),
    "low":    (0.0,  0.4),
}


def build_survival_features(
    people_df: pd.DataFrame,
    task_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Join people and task summary DataFrames to build the
    feature matrix for the Cox PH model.

    people_df: output of etl/people.transform_people()
    task_df:   output of etl/tasks.transform_tasks()

    Returns a DataFrame with one row per enterprise/person_type group
    containing all features needed for Cox PH fitting.
    """
    if people_df.empty or task_df.empty:
        logger.warning("build_survival_features: one or both inputs empty")
        return pd.DataFrame()

    # Filter to participant rows only (clients, not staff)
    participants = people_df[
        people_df.get("is_participant", pd.Series(False, index=people_df.index))
    ].copy()

    if participants.empty:
        logger.warning("build_survival_features: no participant rows found")
        return pd.DataFrame()

    # Aggregate task metrics to enterprise level for join
    task_agg = (
        task_df.groupby(["enterprise_id", "company_id"], dropna=False)
        .agg(
            completion_rate_pct=("completion_rate_pct", "mean"),
            overdue_tasks=("overdue_tasks", "sum"),
            tasks_last_30d=("tasks_last_30d", "sum"),
        )
        .reset_index()
    )

    # Join people and task metrics on enterprise_id
    join_cols = [c for c in ["enterprise_id", "company_id"] if c in participants.columns]
    features = participants.merge(task_agg, on=join_cols, how="left")

    # Duration variable T — tenure in days (time-at-risk)
    features["T"] = features["avg_tenure_days"].fillna(0).clip(lower=1)

    # Event variable E — 1 if inactive (discharged), 0 if active
    features["E"] = (features["status"] == "inactive").astype(int)

    # Fill missing feature values with safe defaults
    features["completion_rate_pct"] = features["completion_rate_pct"].fillna(100.0)
    features["overdue_tasks"] = features["overdue_tasks"].fillna(0)
    features["tasks_last_30d"] = features["tasks_last_30d"].fillna(0)

    return features


def fit_cox_model(features: pd.DataFrame):
    """
    Fit a Cox Proportional Hazards model on the feature matrix.

    Returns the fitted CoxPHFitter instance.
    Returns None if lifelines is unavailable or fitting fails.
    """
    try:
        from lifelines import CoxPHFitter
    except ImportError:
        logger.error("ml/survival: lifelines not installed — run pip install lifelines")
        return None

    required = {"T", "E", "completion_rate_pct", "overdue_tasks", "tasks_last_30d"}
    if not required.issubset(features.columns):
        missing = required - set(features.columns)
        logger.error("ml/survival: missing feature columns %s", missing)
        return None

    if len(features) < 10:
        logger.warning(
            "ml/survival: only %d rows — Cox PH needs more data for reliable estimates",
            len(features),
        )

    cox_features = features[list(required)].dropna()

    try:
        cph = CoxPHFitter(penalizer=0.1)
        cph.fit(cox_features, duration_col="T", event_col="E")
        logger.info(
            "ml/survival: Cox PH model fitted on %d rows, concordance=%.3f",
            len(cox_features),
            cph.concordance_index_,
        )
        return cph
    except Exception as e:
        logger.error("ml/survival: model fitting failed — %s", e)
        return None


def predict_retention_risk(
    cph,
    features: pd.DataFrame,
    horizon_days: int = 30,
) -> pd.DataFrame:
    """
    Score active clients using the fitted Cox PH model.

    Returns a DataFrame with one row per enterprise group containing:
        enterprise_id       — join key
        company_id          — tenant
        discharge_prob_30d  — predicted probability of discharge in next 30 days
        risk_tier           — "high", "medium", or "low"
        concordance_index   — model quality metric (0.5 = random, 1.0 = perfect)
    """
    if cph is None:
        logger.warning("ml/survival: no fitted model — returning empty predictions")
        return pd.DataFrame()

    active = features[features["E"] == 0].copy()

    if active.empty:
        logger.warning("ml/survival: no active clients to score")
        return pd.DataFrame()

    required = {"T", "E", "completion_rate_pct", "overdue_tasks", "tasks_last_30d"}
    score_features = active[list(required)].fillna(0)

    try:
        # Predict survival probability at current T + horizon
        survival = cph.predict_survival_function(
            score_features,
            times=[active["T"].values + horizon_days],
        )

        # Discharge probability = 1 - survival probability
        discharge_prob = 1 - survival.iloc[0].values
        active["discharge_prob_30d"] = discharge_prob.round(3)

    except Exception as e:
        logger.error("ml/survival: prediction failed — %s", e)
        return pd.DataFrame()

    # Assign risk tiers
    active["risk_tier"] = active["discharge_prob_30d"].apply(_assign_risk_tier)
    active["concordance_index"] = round(cph.concordance_index_, 3)

    output_cols = [c for c in [
        "enterprise_id", "company_id", "person_type", "status",
        "people_count", "active_count", "avg_tenure_days",
        "discharge_prob_30d", "risk_tier", "concordance_index",
    ] if c in active.columns]

    result = active[output_cols].reset_index(drop=True)

    high_risk = (result["risk_tier"] == "high").sum()
    logger.info(
        "ml/survival: scored %d groups — %d high risk, %d medium, %d low",
        len(result),
        high_risk,
        (result["risk_tier"] == "medium").sum(),
        (result["risk_tier"] == "low").sum(),
    )

    return result


def run_retention_model(
    people_df: pd.DataFrame,
    task_df: pd.DataFrame,
    horizon_days: int = 30,
) -> dict:
    """
    Full pipeline: build features → fit Cox PH → score active clients.

    Called by ml/routes.py POST /ml/retention-risk.

    Returns dict with:
        predictions     — list of scored rows
        model_quality   — concordance index
        high_risk_count — number of high-risk groups
        horizon_days    — scoring horizon used
        status          — "success" or "error"
    """
    try:
        features = build_survival_features(people_df, task_df)

        if features.empty:
            return {
                "status": "skipped",
                "reason": "insufficient data for survival model",
                "predictions": [],
            }

        cph = fit_cox_model(features)

        if cph is None:
            return {
                "status": "error",
                "reason": "model fitting failed — check logs",
                "predictions": [],
            }

        predictions = predict_retention_risk(cph, features, horizon_days)

        return {
            "status":           "success",
            "predictions":      predictions.to_dict(orient="records"),
            "model_quality":    round(cph.concordance_index_, 3),
            "high_risk_count":  int((predictions["risk_tier"] == "high").sum()),
            "total_scored":     len(predictions),
            "horizon_days":     horizon_days,
        }

    except Exception as e:
        logger.error("ml/survival: run_retention_model failed — %s", e)
        return {"status": "error", "reason": str(e), "predictions": []}


def _assign_risk_tier(prob: float) -> str:
    for tier, (low, high) in RISK_TIERS.items():
        if low <= prob <= high:
            return tier
    return "low"
