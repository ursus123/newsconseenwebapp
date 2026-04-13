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


def _compute_tenure_days(df: pd.DataFrame) -> pd.Series:
    """
    Derive tenure in days from raw date columns when avg_tenure_days is absent.
    Handles ISO strings, Excel serial numbers (e.g. 45288), and Unix timestamps.
    Falls back to 30 days when no valid date column is found.
    """
    today = pd.Timestamp.now()

    for col in ["start_date", "created_date", "start_at", "joined_date", "intake_date"]:
        if col not in df.columns:
            continue
        try:
            raw = df[col]
            # Detect Excel serial numbers: numeric values in the range 30000–60000
            # (approx 1982–2064), stored as int, float, or numeric string
            numeric = pd.to_numeric(raw, errors="coerce")
            excel_mask = numeric.notna() & numeric.between(30_000, 60_000)
            if excel_mask.sum() > len(df) * 0.3:
                dates = pd.to_datetime(
                    numeric, unit="D", origin="1899-12-30", errors="coerce"
                )
            else:
                dates = pd.to_datetime(raw, errors="coerce", utc=False)

            tenure = (today - dates.dt.tz_localize(None)
                      if hasattr(dates.dt, "tz_localize") else today - dates).dt.days
            valid = tenure.notna() & tenure.between(0, 36_500)
            if valid.sum() > len(df) * 0.3:
                logger.info(
                    "_compute_tenure_days: using col=%s valid=%d/%d",
                    col, valid.sum(), len(df),
                )
                return tenure.where(valid, 30).clip(lower=1).astype(int)
        except Exception as ex:
            logger.debug("_compute_tenure_days: col=%s error — %s", col, ex)

    logger.info("_compute_tenure_days: no valid date column — defaulting to 30 days")
    return pd.Series(30, index=df.index)


def build_survival_features(
    people_df: pd.DataFrame,
    task_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Build the feature matrix for Cox PH from either:
      - analytics.people_summary + analytics.task_summary (aggregated)
      - raw.people + raw.tasks (individual Base44 records)

    Works with both schemas: detects which it has and adapts.
    """
    if people_df.empty:
        logger.warning("build_survival_features: people_df is empty")
        return pd.DataFrame()

    # ── Candidate selection ───────────────────────────────────────────
    if "is_participant" in people_df.columns:
        candidates = people_df[people_df["is_participant"] == True].copy()
    else:
        pt = people_df.get(
            "person_type", pd.Series("", index=people_df.index)
        ).fillna("").str.lower().str.strip()
        candidates = people_df[pt.isin(PARTICIPANT_TYPES)].copy()

    if candidates.empty:
        logger.info("build_survival_features: no participant rows — using all person types")
        candidates = people_df.copy()

    # ── Task join (skip entirely if no join keys or task_df empty) ────
    # FIX: groupby([]) raises "No group keys passed!" — guard against it.
    join_cols = [c for c in ["enterprise_id", "company_id"]
                 if c in task_df.columns] if not task_df.empty else []

    if join_cols:
        try:
            task_agg = (
                task_df.groupby(join_cols, dropna=False)
                .agg(
                    completion_rate_pct=("completion_rate_pct", "mean"),
                    overdue_tasks=("overdue_tasks", "sum"),
                    tasks_last_30d=("tasks_last_30d", "sum"),
                )
                .reset_index()
            )
            people_join_cols = [c for c in join_cols if c in candidates.columns]
            if people_join_cols:
                features = candidates.merge(task_agg, on=people_join_cols, how="left")
            else:
                features = candidates.copy()
        except Exception as e:
            logger.warning("build_survival_features: task join failed (%s) — skipping", e)
            features = candidates.copy()
    else:
        logger.info("build_survival_features: no task join keys — using people data only")
        features = candidates.copy()

    # ── Duration T (tenure in days) ───────────────────────────────────
    # Analytics tables have avg_tenure_days; raw tables need computation.
    if "avg_tenure_days" in features.columns and features["avg_tenure_days"].notna().sum() > 0:
        features["T"] = features["avg_tenure_days"].fillna(1).clip(lower=1)
    else:
        features["T"] = _compute_tenure_days(features)

    # ── Event E (1 = ended/inactive, 0 = active) ─────────────────────
    status_col = features.get(
        "status", pd.Series("active", index=features.index)
    ).fillna("active").str.lower().str.strip()
    features["E"] = status_col.isin(INACTIVE_STATUSES).astype(int)

    # ── Task features (default to 0/NaN when absent) ─────────────────
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
        "build_survival_features: %d rows — E=0 (active) %d, E=1 (ended) %d",
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


def _research_risk_scores(features: pd.DataFrame, horizon_days: int) -> pd.DataFrame:
    """
    Rule-based risk scoring for research/sparse data mode.

    Used when Cox PH cannot fit (all-active data, fewer than 5 rows, or
    no historical event variance). Produces illustrative risk tiers based
    on tenure and activity heuristics rather than statistical fitting:

        low tenure  + low activity  → high risk (new/disengaged)
        mid tenure  + some activity → medium risk
        high tenure + high activity → low risk (established/engaged)
    """
    df = features.copy()
    # Normalise tenure 0–1
    t_max = df["T"].max() or 1
    df["_t_norm"] = df["T"] / t_max

    # Normalise activity (tasks_last_30d) 0–1
    a_max = df["tasks_last_30d"].max() or 1
    df["_a_norm"] = df["tasks_last_30d"] / a_max

    # Heuristic engagement score: higher = more stable
    df["_engagement"] = (df["_t_norm"] * 0.6 + df["_a_norm"] * 0.4).clip(0, 1)

    # Map engagement → illustrative discharge probability
    prob_col = f"discharge_prob_{horizon_days}d"
    df[prob_col] = (1 - df["_engagement"]).round(3)
    df["risk_tier"] = df[prob_col].apply(_assign_risk_tier)
    df["concordance_index"] = None  # not applicable in research mode

    return df.drop(columns=["_t_norm", "_a_norm", "_engagement"], errors="ignore")


def run_retention_model(
    people_df: pd.DataFrame,
    task_df: pd.DataFrame,
    horizon_days: int = 30,
    research_mode: bool = False,
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
    RESEARCH_NOTE = (
        "Illustrative projection based on tenure and activity heuristics. "
        "Not statistically validated — use for research and exploration only. "
        "Run with real longitudinal data to get statistically fitted risk scores."
    )

    try:
        features = build_survival_features(people_df, task_df)

        if features.empty:
            if not research_mode:
                return {
                    "status":      "skipped",
                    "reason":      "insufficient data for survival model",
                    "predictions": [],
                }
            # Research mode: synthesize minimal features from raw people_df
            logger.info("ml/survival: research mode — synthesizing features from raw people_df")
            features = people_df.copy()
            features["T"]              = features.get("avg_tenure_days", pd.Series(30, index=features.index)).fillna(30).clip(lower=1)
            features["E"]              = 0
            features["tasks_last_30d"] = features.get("tasks_last_30d", pd.Series(0, index=features.index)).fillna(0)
            features["overdue_tasks"]  = 0
            features["completion_rate_pct"] = 0

        prob_col = f"discharge_prob_{horizon_days}d"

        # Attempt statistical Cox PH fit
        cph = fit_cox_model(features)

        if cph is None:
            if not research_mode:
                return {
                    "status":      "skipped",
                    "reason":      (
                        "model fitting failed — need both active and ended "
                        "entities in history, and at least 5 complete rows"
                    ),
                    "predictions": [],
                }
            # Research mode fallback — heuristic scoring
            logger.info("ml/survival: research mode — using heuristic risk scoring")
            predictions = _research_risk_scores(features, horizon_days)
            if predictions.empty:
                return {"status": "skipped", "reason": "no rows to score", "predictions": []}

            output_cols = [c for c in [
                "enterprise_id", "company_id", "person_type", "status",
                "people_count", "active_count", "avg_tenure_days",
                prob_col, "risk_tier", "concordance_index",
            ] if c in predictions.columns]

            return {
                "status":          "success",
                "research_mode":   True,
                "note":            RESEARCH_NOTE,
                "predictions":     predictions[output_cols].to_dict(orient="records"),
                "model_quality":   None,
                "high_risk_count": int((predictions["risk_tier"] == "high").sum()),
                "total_scored":    len(predictions),
                "horizon_days":    horizon_days,
                "prob_column":     prob_col,
            }

        predictions = predict_retention_risk(cph, features, horizon_days)

        if predictions.empty:
            return {
                "status":      "skipped",
                "reason":      "no active entities to score",
                "predictions": [],
            }

        return {
            "status":          "success",
            "research_mode":   research_mode,
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
