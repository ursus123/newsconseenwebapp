import logging

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# K-Means — Client LTV Segmentation
#
# CRISP-DM Phase 4 Objective 3: segment clients by lifetime
# value to identify high-value relationships worth retaining
# and low-engagement clients who may need outreach.
#
# Input:  people_summary + transaction_summary joined on enterprise_id
# Output: per-enterprise-group segment labels with LTV estimates
#
# Segments (k=3):
#   high_value    — long tenure, high transaction value, active
#   mid_value     — medium tenure, moderate value
#   low_engagement— short tenure or low transaction history
# ----------------------------------------------------------

N_CLUSTERS = 3
SEGMENT_LABELS = {0: "high_value", 1: "mid_value", 2: "low_engagement"}

# Features used for clustering
CLUSTER_FEATURES = [
    "avg_tenure_days",          # length of care relationship
    "retention_rate_pct",       # how consistently active
    "total_revenue_per_client", # transaction value normalized by client count
    "tasks_per_client",         # care intensity
]


def build_segmentation_features(
    people_df: pd.DataFrame,
    transaction_df: pd.DataFrame,
    task_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Join people, transaction, and task summaries to build
    the feature matrix for K-Means LTV segmentation.

    Returns one row per enterprise/company_id group with
    normalized features ready for clustering.
    """
    if people_df.empty:
        logger.warning("build_segmentation_features: empty people DataFrame")
        return pd.DataFrame()

    # Filter to participant rows only
    participants = people_df[
        people_df.get("is_participant", pd.Series(False, index=people_df.index))
    ].copy()

    if participants.empty:
        logger.warning("build_segmentation_features: no participant rows")
        return pd.DataFrame()

    join_cols = [c for c in ["enterprise_id", "company_id"]
                 if c in participants.columns]

    # Aggregate transaction revenue per enterprise
    if not transaction_df.empty and "is_revenue" in transaction_df.columns:
        revenue_agg = (
            transaction_df[transaction_df["is_revenue"]]
            .groupby(join_cols, dropna=False)
            .agg(total_revenue=("total_amount", "sum"))
            .reset_index()
        )
        participants = participants.merge(revenue_agg, on=join_cols, how="left")
    else:
        participants["total_revenue"] = 0.0

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

    # Normalize revenue and tasks by client count
    client_count = participants["active_count"].replace(0, 1)
    participants["total_revenue_per_client"] = (
        participants["total_revenue"].fillna(0) / client_count
    ).round(2)
    participants["tasks_per_client"] = (
        participants["total_tasks"].fillna(0) / client_count
    ).round(2)

    return participants


def run_ltv_segmentation(
    people_df: pd.DataFrame,
    transaction_df: pd.DataFrame,
    task_df: pd.DataFrame,
    n_clusters: int = N_CLUSTERS,
) -> dict:
    """
    Full pipeline: build features → normalize → K-Means → label segments.

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
        return {"status": "error", "reason": "scikit-learn not installed", "segments": []}

    try:
        features_df = build_segmentation_features(people_df, transaction_df, task_df)

        if features_df.empty:
            return {
                "status":   "skipped",
                "reason":   "insufficient data for segmentation",
                "segments": [],
            }

        # Use only features that exist in the DataFrame
        available_features = [f for f in CLUSTER_FEATURES if f in features_df.columns]

        if len(available_features) < 2:
            return {
                "status":   "skipped",
                "reason":   f"only {len(available_features)} feature columns available — need at least 2",
                "segments": [],
            }

        X = features_df[available_features].fillna(0).values

        if len(X) < n_clusters:
            return {
                "status":   "skipped",
                "reason":   f"only {len(X)} rows — need at least {n_clusters} for {n_clusters} clusters",
                "segments": [],
            }

        # Normalize features — K-Means is distance-based, scale matters
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # Fit K-Means with fixed seed for reproducibility
        km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        cluster_labels = km.fit_predict(X_scaled)

        features_df = features_df.copy()
        features_df["cluster_id"] = cluster_labels

        # Order clusters by total_revenue_per_client descending
        # so cluster 0 is always the highest-value segment
        if "total_revenue_per_client" in features_df.columns:
            cluster_order = (
                features_df.groupby("cluster_id")["total_revenue_per_client"]
                .mean()
                .sort_values(ascending=False)
                .index.tolist()
            )
            rank_map = {cid: rank for rank, cid in enumerate(cluster_order)}
            features_df["cluster_id"] = features_df["cluster_id"].map(rank_map)

        # Apply human-readable segment labels
        features_df["segment"] = features_df["cluster_id"].map(SEGMENT_LABELS)

        # Estimate LTV — revenue per client * expected tenure years
        if "total_revenue_per_client" in features_df.columns:
            avg_tenure_years = (features_df["avg_tenure_days"].fillna(0) / 365).clip(lower=0.5)
            features_df["estimated_ltv"] = (
                features_df["total_revenue_per_client"] * avg_tenure_years
            ).round(2)
        else:
            features_df["estimated_ltv"] = 0.0

        # Segment summary — aggregate stats per segment
        segment_summary = (
            features_df.groupby("segment")
            .agg(
                group_count=("cluster_id", "count"),
                avg_tenure_days=("avg_tenure_days", "mean"),
                avg_revenue_per_client=("total_revenue_per_client", "mean"),
                avg_estimated_ltv=("estimated_ltv", "mean"),
            )
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
            "ml/segmentation: K-Means complete — %d groups across %d segments",
            len(features_df), n_clusters,
        )

        return {
            "status":          "success",
            "segments":        features_df[output_cols].to_dict(orient="records"),
            "segment_summary": segment_summary,
            "n_clusters":      n_clusters,
            "features_used":   available_features,
        }

    except Exception as e:
        logger.error("ml/segmentation: run_ltv_segmentation failed — %s", e)
        return {"status": "error", "reason": str(e), "segments": []}
