import logging

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# K-Means — Entity LTV Segmentation
#
# Segments enterprise-level groups by lifetime value to
# identify high-value relationships worth retaining and
# low-engagement groups that may need outreach.
#
# Generalised from homecare-specific client segmentation to
# work across all enterprise verticals. Any person type can
# be segmented — staff, participants, contacts, or all.
#
# Input:  people_summary + transaction_summary + task_summary
# Output: per-group segment labels with LTV estimates
#
# Segments (k=3 default):
#   high_value    — long tenure, high transaction value, active
#   mid_value     — moderate tenure and value
#   low_engagement— short tenure or low activity
# ----------------------------------------------------------

N_CLUSTERS = 3
SEGMENT_LABELS = {0: "high_value", 1: "mid_value", 2: "low_engagement"}

# Person types that represent the "served" population —
# i.e. the entities whose LTV is worth measuring.
# Mirrors PARTICIPANT_TYPES from etl/people.py.
# If none of these are present, falls back to all person types.
PARTICIPANT_TYPES = {
    "client", "customer", "patient", "resident",
    "student", "learner", "trainee", "attendee",
    "member", "participant", "beneficiary", "enrollee",
    "subscriber", "applicant",
}

# Inactive statuses — mirrors INACTIVE_STATUSES from etl/people.py
INACTIVE_STATUSES = {
    "inactive", "archived", "closed", "terminated", "discharged",
    "withdrawn", "suspended", "expired", "left", "graduated",
}

# Features used for clustering
CLUSTER_FEATURES = [
    "avg_tenure_days",           # length of relationship
    "retention_rate_pct",        # how consistently active
    "total_revenue_per_client",  # transaction value per person
    "tasks_per_client",          # activity intensity
]


def build_segmentation_features(
    people_df: pd.DataFrame,
    transaction_df: pd.DataFrame,
    task_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Join people, transaction, and task summaries to build
    the feature matrix for K-Means LTV segmentation.

    Attempts to filter to participant-type rows first.
    If no participant rows exist, uses all person types so
    the model still runs for verticals that don't use
    participant/client terminology.

    Returns one row per enterprise/company_id group with
    normalised features ready for clustering.
    """
    if people_df.empty:
        logger.warning("build_segmentation_features: empty people DataFrame")
        return pd.DataFrame()

    # Try participant filter first
    if "is_participant" in people_df.columns:
        participants = people_df[people_df["is_participant"] == True].copy()
    else:
        # Fall back: match person_type against known participant types
        pt = people_df.get(
            "person_type", pd.Series("", index=people_df.index)
        ).fillna("").str.lower().str.strip()
        participants = people_df[pt.isin(PARTICIPANT_TYPES)].copy()

    # If still empty, use all person types — better than returning nothing
    if participants.empty:
        logger.info(
            "build_segmentation_features: no participant rows found — "
            "using all person types for segmentation"
        )
        participants = people_df.copy()

    join_cols = [c for c in ["enterprise_id", "company_id"]
                 if c in participants.columns]

    # Aggregate transaction revenue per enterprise
    if not transaction_df.empty and "is_revenue" in transaction_df.columns:
        revenue_agg = (
            transaction_df[transaction_df["is_revenue"] == True]
            .groupby(join_cols, dropna=False)
            .agg(total_revenue=("total_amount", "sum"))
            .reset_index()
        )
        participants = participants.merge(revenue_agg, on=join_cols, how="left")
    else:
        participants["total_revenue"] = 0.0
        logger.info(
            "build_segmentation_features: no transaction data — "
            "LTV estimates will be tenure-based only"
        )

    # Aggregate task counts per enterprise
    if not task_df.empty:
        task_agg = (
            task_df.groupby(join_cols, dropna=False)
            .agg(total_tasks=("total_tasks", "sum"))
            .reset_index()
        )
        participants = participants.merge(task_agg, on=join_cols, how="left")
    else:
        participants["total_tasks"] = 0

    # Normalise revenue and tasks by active count
    active_count = participants.get(
        "active_count", pd.Series(1, index=participants.index)
    ).replace(0, 1)

    participants["total_revenue_per_client"] = (
        participants["total_revenue"].fillna(0) / active_count
    ).round(2)

    participants["tasks_per_client"] = (
        participants["total_tasks"].fillna(0) / active_count
    ).round(2)

    return participants


def run_ltv_segmentation(
    people_df: pd.DataFrame,
    transaction_df: pd.DataFrame,
    task_df: pd.DataFrame,
    n_clusters: int = N_CLUSTERS,
) -> dict:
    """
    Full pipeline: build features → normalise → K-Means → label segments.

    Called by ml/routes.py POST /ml/ltv-segmentation.

    Returns dict with:
        segments        — list of rows with segment labels and LTV estimates
        segment_summary — aggregate stats per segment
        n_clusters      — number of clusters used
        features_used   — which feature columns were included
        status          — "success", "skipped", or "error"
    """
    try:
        from sklearn.cluster import KMeans
        from sklearn.preprocessing import StandardScaler
    except ImportError:
        logger.error("ml/segmentation: scikit-learn not installed")
        return {
            "status": "error",
            "reason": "scikit-learn not installed",
            "segments": [],
        }

    try:
        features_df = build_segmentation_features(
            people_df, transaction_df, task_df
        )

        if features_df.empty:
            return {
                "status":   "skipped",
                "reason":   "insufficient data for segmentation",
                "segments": [],
            }

        # Use only features that exist in the DataFrame
        available_features = [
            f for f in CLUSTER_FEATURES if f in features_df.columns
        ]

        if len(available_features) < 2:
            return {
                "status":   "skipped",
                "reason":   (
                    f"only {len(available_features)} feature columns available "
                    f"— need at least 2"
                ),
                "segments": [],
            }

        X = features_df[available_features].fillna(0).values

        if len(X) < n_clusters:
            return {
                "status":   "skipped",
                "reason":   (
                    f"only {len(X)} rows — need at least {n_clusters} "
                    f"for {n_clusters} clusters"
                ),
                "segments": [],
            }

        # Normalise features — K-Means is distance-based, scale matters
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # Fit K-Means with fixed seed for reproducibility
        km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        cluster_labels = km.fit_predict(X_scaled)

        features_df = features_df.copy()
        features_df["cluster_id"] = cluster_labels

        # Order clusters by the best available value signal:
        # 1. total_revenue_per_client if revenue data exists and is non-zero
        # 2. avg_tenure_days as fallback (longer tenure = higher value)
        # This prevents arbitrary label assignment when revenue is all zeros.
        revenue_col = "total_revenue_per_client"
        tenure_col = "avg_tenure_days"

        has_revenue = (
            revenue_col in features_df.columns
            and features_df[revenue_col].sum() > 0
        )

        order_col = revenue_col if has_revenue else tenure_col

        if order_col in features_df.columns:
            cluster_order = (
                features_df.groupby("cluster_id")[order_col]
                .mean()
                .sort_values(ascending=False)
                .index.tolist()
            )
            rank_map = {cid: rank for rank, cid in enumerate(cluster_order)}
            features_df["cluster_id"] = features_df["cluster_id"].map(rank_map)

            logger.info(
                "ml/segmentation: clusters ordered by %s", order_col
            )
        else:
            logger.warning(
                "ml/segmentation: neither %s nor %s available for "
                "cluster ordering — labels may be arbitrary",
                revenue_col, tenure_col,
            )

        # Apply human-readable segment labels
        features_df["segment"] = features_df["cluster_id"].map(SEGMENT_LABELS)

        # Estimate LTV — revenue per client * expected tenure years
        # If no revenue data, LTV is expressed as tenure-years only
        if has_revenue:
            avg_tenure_years = (
                features_df.get(
                    "avg_tenure_days", pd.Series(0, index=features_df.index)
                ).fillna(0) / 365
            ).clip(lower=0.5)
            features_df["estimated_ltv"] = (
                features_df[revenue_col] * avg_tenure_years
            ).round(2)
        else:
            # No revenue — LTV proxy is tenure in years
            features_df["estimated_ltv"] = (
                features_df.get(
                    "avg_tenure_days", pd.Series(0, index=features_df.index)
                ).fillna(0) / 365
            ).round(2)
            logger.info(
                "ml/segmentation: no revenue data — estimated_ltv "
                "expressed as tenure years"
            )

        # Segment summary
        summary_agg = {"cluster_id": "count"}
        if "avg_tenure_days" in features_df.columns:
            summary_agg["avg_tenure_days"] = "mean"
        if revenue_col in features_df.columns:
            summary_agg[revenue_col] = "mean"
        if "estimated_ltv" in features_df.columns:
            summary_agg["estimated_ltv"] = "mean"

        segment_summary = (
            features_df.groupby("segment")
            .agg(**{
                "group_count": ("cluster_id", "count"),
                **{k: (k, v) for k, v in summary_agg.items() if k != "cluster_id"},
            })
            .round(2)
            .reset_index()
            .to_dict(orient="records")
        )

        output_cols = [c for c in [
            "enterprise_id", "company_id", "person_type",
            "active_count", "avg_tenure_days", "retention_rate_pct",
            "total_revenue_per_client", "tasks_per_client",
            "cluster_id", "segment", "estimated_ltv",
        ] if c in features_df.columns]

        logger.info(
            "ml/segmentation: K-Means complete — %d groups across %d segments "
            "ordered by %s",
            len(features_df), n_clusters, order_col,
        )

        return {
            "status":          "success",
            "segments":        features_df[output_cols].to_dict(orient="records"),
            "segment_summary": segment_summary,
            "n_clusters":      n_clusters,
            "features_used":   available_features,
            "ordered_by":      order_col,
        }

    except Exception as e:
        logger.error("ml/segmentation: run_ltv_segmentation failed — %s", e)
        return {"status": "error", "reason": str(e), "segments": []}
