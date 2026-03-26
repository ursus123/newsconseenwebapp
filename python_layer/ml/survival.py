import logging

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Cox Proportional Hazards — Entity Retention Model
#
# Predicts which active people are at risk of leaving,
# disengaging, or being discharged within the next N days.
#
# Generalised from homecare client discharge prediction to
# work across all enterprise verticals. Any person type can
# be scored — participants, members, staff, contacts.
#
# Input:  people_summary + task_summary joined on enterprise_id
# Output: per-group risk scores with risk tier classification
#
# Features:
#   T  = avg_tenure_days (time-at-risk)
#   E  = ended event (1 = inactive/ended, 0 = still active)
#   x1 = completion_rate_pct (task completion rate)
#   x2 = overdue_tasks (count of overdue tasks)
#   x3 = tasks_last_30d (recent activity volume)
# ----------------------------------------------------------

RISK_TIERS = {
    "high":   (0.7, 1.0),   # >70% predicted end probability
    "medium": (0.4, 0.7),
    "low":    (0.0, 0.4),
}

# Mirrors PARTICIPANT_TYPES from etl/people.py
PARTICIPANT_TYPES = {
    "client", "customer", "patient", "resident",
    "student", "learner", "trainee", "attendee",
    "member", "participant", "beneficiary", "enrollee",
    "subscriber", "applicant",
}

# Mirrors INACTIVE_STATUSES from etl/people.py
# Used to define the event variable E in the survival model.
INACTIVE_STATUSES = {
    "inactive", "archived", "closed", "terminated", "discharged",
    "withdrawn", "suspended", "expired", "left", "graduated",
}

# Completion rate default when task data is missing.
# Use None (→ NaN) rather than 100.0 so missing data
# doesn't bias risk scores downward.
COMPLETION_RATE_DEFAULT = None


def build_survival_features(
    people_df: pd.DataFrame,
    task_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Join people and task summary DataFrames to build the
    feature matrix for the Cox PH model.

    Attempts to filter to participant-type rows first.
    Falls back to all person types if none found, so the
    model runs for verticals that don't use participant
    terminology.

    Returns a DataFrame with one row per enterprise/person_type
    group containing all features needed for Cox PH fitting.
    """
    if people_df.empty or task_df.empty:
        logger.warning("build_survival_features: one or both inputs empty")
        return pd.DataFrame()

    # Try participant filter first
    if "is_participant" in people_df.columns:
        candidates = people_df[people_df["is_participant"] == True].copy()
    else:
        pt = people_df.get(
            "person_type", pd.Series("", index=people_df.index)
        ).fillna("").str.lower().str.strip()
        candidates = people_df[pt.isin(PARTICIPANT_TYPES)].copy()

    # Fall back to all person types if no participants found
    if candidates.empty:
        logger.info(
            "build_survival_features: no participant rows — "
            "using all person types"
        )
        candidates = people_df.copy()

    # Aggregate task metrics to enterprise level for join
    join_cols = [c for c in ["enterprise_id", "company_id"]
                 if c in task_df.columns]

    task_agg = (
        task_df.groupby(join_cols, dropna=False)
        .agg(
            completion_rate_pct=("completion_rate_pct", "mean"),
            overdue_tasks=("overdue_tasks", "sum"),
            tasks_last_30d=("tasks_last_30d", "sum"),
        )
        .reset_index()
    )

    # Join on enterprise
    people_join_cols = [c for c in join_cols if c in candidates.columns]
    features = candidates.merge(task_agg, on=people_join_cols, how="left")

    # Duration variable T — tenure in days (time-at-risk)
    # Clip at 1 so Cox PH doesn't fail on zero-tenure rows
    features["T"] = features.get(
        "avg_tenure_days", pd.Series(1, index=features.index)
    ).fillna(1).clip(lower=1)

    # Event variable E — 1 if ended/inactive, 0 if still active
    # Uses the full INACTIVE_STATUSES set, not just "inactive"
    status_col = features.get(
        "status", pd.Series("active", index=features.index)
    ).fillna("active").str.lower().str.strip()

    features["E"] = status_col.isin(INACTIVE_STATUSES).astype(int)

    # Fill missing feature values
    # completion_rate_pct: leave as NaN when missing so Cox PH
    # can handle it via penaliser rather than assuming perfection
    features["completion_rate_pct"] = features.get(
        "completion_rate_pct",
        pd.Series(COMPLETION_RATE_DEFAULT, index=features.index)
    )
    features["overdue_tasks"] = features.get(
        "overdue_tasks", pd.Series(0, index=features.index)
    ).fillna(0)
    features["tasks_last_30d"] = features.get(
        "tasks_last_30d", pd.Series(0, index=features.index)
    ).fillna(0)

    logger.info(
        "build_survival_features: built %d rows — "
        "%d active (E=0), %d ended (E=1)",
        len(features),
        int((features["E"] == 0).sum()),
        int((features["E"] == 1).sum()),
    )

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
        logger.error(
            "ml/survival: lifelines not installed — run pip install lifelines"
        )
        return None

    required = {"T", "E", "completion_rate_pct", "overdue_tasks", "tasks_last_30d"}
    if not required.issubset(features.columns):
        missing = required - set(features.columns)
        logger.error("ml/survival: missing feature columns %s", missing)
        return None

    if len(features) < 10:
        logger.warning(
            "ml/survival: only %d rows — Cox PH needs more data "
            "for reliable estimates", len(features),
        )

    cox_features = features[list(required)].dropna()

    if len(cox_features) < 5:
        logger.error(
            "ml/survival: only %d complete rows after dropping NaN — "
            "insufficient for Cox PH", len(cox_features),
        )
        return None

    # Check we have at least some events (E=1) to fit on
    if cox_features["E"].sum() == 0:
        logger.warning(
            "ml/survival: no ended events (E=1) in training data — "
            "Cox PH cannot estimate hazard without observed events. "
            "All entities are currently active."
        )
        return None

    try:
        cph = CoxPHFitter(penalizer=0.1)
        cph.fit(cox_features, duration_col="T", event_col="E")
        logger.info(
            "ml/survival: Cox PH fitted on %d rows, concordance=%.3f",
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
    Score active entities using the fitted Cox PH model.

    Returns a DataFrame with one row per group containing:
        enterprise_id      — join key
        company_id         — tenant
        discharge_prob_Nd  — predicted end probability in next N days
        risk_tier          — "high", "medium", or "low"
        concordance_index  — model quality (0.5 = random, 1.0 = perfect)
    """
    if cph is None:
        logger.warning(
            "ml/survival: no fitted model — returning empty predictions"
        )
        return pd.DataFrame()

    # Score only active entities
    active = features[features["E"] == 0].copy()

    if active.empty:
        logger.warning("ml/survival: no active entities to score")
        return pd.DataFrame()

    required = {"T", "E", "completion_rate_pct", "overdue_tasks", "tasks_last_30d"}
    score_features = active[list(required)].fillna(0)

    try:
        # Predict survival probability at current T + horizon
        survival = cph.predict_survival_function(
            score_features,
            times=[active["T"].values + horizon_days],
        )

        # End probability = 1 - survival probability
        end_prob = 1 - survival.iloc[0].values
        prob_col = f"discharge_prob_{horizon_days}d"
        active[prob_col] = end_prob.round(3)

    except Exception as e:
        logger.error("ml/survival: prediction failed — %s", e)
        return pd.DataFrame()

    active["risk_tier"] = active[prob_col].apply(_assign_risk_tier)
    active["concordance_index"] = round(cph.concordance_index_, 3)

    output_cols = [c for c in [
        "enterprise_id", "company_id", "person_type", "status",
        "people_count", "active_count", "avg_tenure_days",
        prob_col, "risk_tier", "concordance_index",
    ] if c in active.columns]

    result = active[output_cols].reset_index(drop=True)

    logger.info(
        "ml/survival: scored %d groups — %d high risk, %d medium, %d low",
        len(result),
        int((result["risk_tier"] == "high").sum()),
        int((result["risk_tier"] == "medium").sum()),
        int((result["risk_tier"] == "low").sum()),
    )

    return result


def run_retention_model(
    people_df: pd.DataFrame,
    task_df: pd.DataFrame,
    horizon_days: int = 30,
) -> dict:
    """
    Full pipeline: build features → fit Cox PH → score active entities.

    Called by ml/routes.py POST /ml/retention-risk.

    Returns dict with:
        predictions     — list of scored rows
        model_quality   — concordance index
        high_risk_count — number of high-risk groups
        horizon_days    — scoring horizon used
        status          — "success", "skipped", or "error"
    """
    try:
        features = build_survival_features(people_df, task_df)

        if features.empty:
            return {
                "status":      "skipped",
                "reason":      "insufficient data for survival model",
                "predictions": [],
            }

        cph = fit_cox_model(features)

        if cph is None:
            return {
                "status":      "skipped",
                "reason":      (
                    "model fitting failed — need both active and ended "
                    "entities in history, and at least 5 complete rows"
                ),
                "predictions": [],
            }

        predictions = predict_retention_risk(cph, features, horizon_days)

        if predictions.empty:
            return {
                "status":      "skipped",
                "reason":      "no active entities to score",
                "predictions": [],
            }

        prob_col = f"discharge_prob_{horizon_days}d"

        return {
            "status":          "success",
            "predictions":     predictions.to_dict(orient="records"),
            "model_quality":   round(cph.concordance_index_, 3),
            "high_risk_count": int((predictions["risk_tier"] == "high").sum()),
            "total_scored":    len(predictions),
            "horizon_days":    horizon_days,
            "prob_column":     prob_col,
        }

    except Exception as e:
        logger.error("ml/survival: run_retention_model failed — %s", e)
        return {"status": "error", "reason": str(e), "predictions": []}


def _assign_risk_tier(prob: float) -> str:
    for tier, (low, high) in RISK_TIERS.items():
        if low <= prob <= high:
            return tier
    return "low"
