# ==============================================================
# Newsconseen Phase 3C — Network Benchmarks
# ==============================================================
# Computes percentile rankings, outlier detection, and
# benchmark comparisons across all member companies.
#
# This is what makes the network view genuinely intelligent —
# not just aggregated numbers, but context:
#
#   "Your Kisumu branch is in the bottom 10% for task completion"
#   "Nairobi is 2 standard deviations above network average on revenue"
#   "3 branches are statistical outliers on staff retention"
#
# Methods:
#   Percentile ranking   — where does each member rank 0–100
#   Z-score outliers     — members > 2 std devs from mean
#   Quartile bands       — Q1/Q2/Q3/Q4 grouping per metric
#   Peer comparison      — compare one member vs network average
# ==============================================================

import logging
import math
import statistics
from typing import Optional

logger = logging.getLogger(__name__)


# ----------------------------------------------------------
# Metrics extracted per member for benchmarking
# ----------------------------------------------------------
BENCHMARK_METRICS = {
    "revenue_30d":        {"label": "Revenue (30d)",        "higher_is_better": True,  "unit": "currency"},
    "task_completion":    {"label": "Task completion",      "higher_is_better": True,  "unit": "percent"},
    "health_score":       {"label": "Health score",         "higher_is_better": True,  "unit": "score"},
    "people_active":      {"label": "Active people",        "higher_is_better": True,  "unit": "count"},
    "expiring_7d":        {"label": "Expiring items (7d)",  "higher_is_better": False, "unit": "count"},
    "low_stock":          {"label": "Low stock items",      "higher_is_better": False, "unit": "count"},
    "overdue_tasks":      {"label": "Overdue tasks",        "higher_is_better": False, "unit": "count"},
}


class NetworkBenchmarks:
    """
    Computes benchmark statistics across a list of member summaries.

    Input: member_summaries — list of dicts from NetworkAggregator.aggregate_members()
    Output: rich benchmark data per metric and per member
    """

    def __init__(self, member_summaries: list[dict]):
        # Filter to members with actual data
        self.members = [m for m in member_summaries if m.get("status") == "active"]

    def compute_all(self) -> dict:
        """
        Compute full benchmark report for all metrics.
        Returns:
            metrics:     per-metric stats (mean, std dev, quartiles)
            members:     per-member percentile and outlier flags
            outliers:    list of flagged outlier members with reason
            top_performers: top 3 members by health score
            needs_attention: bottom 3 members by health score
        """
        if len(self.members) < 2:
            return {
                "sufficient_data": False,
                "member_count":    len(self.members),
                "note":            "Benchmarks require at least 2 active members.",
            }

        metric_stats = {}
        for metric_key in BENCHMARK_METRICS:
            stats = self._compute_metric_stats(metric_key)
            if stats:
                metric_stats[metric_key] = stats

        # Enrich each member with percentile ranks and outlier flags
        enriched_members = []
        for member in self.members:
            enriched = dict(member)
            enriched["benchmarks"] = {}
            enriched["outlier_flags"] = []

            for metric_key, stats in metric_stats.items():
                value = member.get(metric_key)
                if value is None:
                    continue

                percentile   = self._percentile_rank(value, stats["values"])
                z_score      = self._z_score(value, stats["mean"], stats["std_dev"])
                quartile     = self._quartile(percentile)
                is_outlier   = abs(z_score) > 2.0 if stats["std_dev"] > 0 else False
                higher_better= BENCHMARK_METRICS[metric_key]["higher_is_better"]

                enriched["benchmarks"][metric_key] = {
                    "value":          value,
                    "percentile":     round(percentile, 1),
                    "z_score":        round(z_score, 2),
                    "quartile":       quartile,
                    "vs_mean":        round(value - stats["mean"], 2),
                    "vs_mean_pct":    round(
                        (value - stats["mean"]) / max(abs(stats["mean"]), 1) * 100, 1
                    ),
                    "is_outlier":     is_outlier,
                    "outlier_direction": (
                        "high" if z_score > 2 else "low" if z_score < -2 else None
                    ),
                }

                if is_outlier:
                    direction = "high" if z_score > 0 else "low"
                    is_good   = (higher_better and direction == "high") or \
                                (not higher_better and direction == "low")
                    enriched["outlier_flags"].append({
                        "metric":    metric_key,
                        "label":     BENCHMARK_METRICS[metric_key]["label"],
                        "direction": direction,
                        "is_positive": is_good,
                        "z_score":   round(z_score, 2),
                        "value":     value,
                        "network_mean": round(stats["mean"], 2),
                        # This member's underlying data may be stale — the
                        # outlier reading could reflect a lagging sync, not
                        # a genuine performance signal. See is_stale/
                        # stale_tables (NetworkAggregator.aggregate_members).
                        "caveat": (
                            "Member data may be stale — outlier reading is unverified"
                            if member.get("is_stale") else None
                        ),
                    })

            enriched_members.append(enriched)

        # Identify outliers across the network
        all_outliers = []
        for member in enriched_members:
            for flag in member.get("outlier_flags", []):
                all_outliers.append({
                    "member_name":   member.get("name", member.get("company_id")),
                    "company_id":    member.get("company_id"),
                    **flag,
                })

        # Top and bottom performers
        scored = sorted(
            [m for m in enriched_members if m.get("health_score") is not None],
            key=lambda x: x["health_score"],
            reverse=True,
        )
        top_performers    = scored[:3]
        needs_attention   = list(reversed(scored[-3:])) if len(scored) >= 3 else []

        stale_members = [
            {"company_id": m.get("company_id"), "name": m.get("name", m.get("company_id")), "stale_tables": m.get("stale_tables", [])}
            for m in enriched_members if m.get("is_stale")
        ]

        return {
            "sufficient_data":   True,
            "member_count":      len(self.members),
            "metrics":           metric_stats,
            "members":           enriched_members,
            "outliers":          all_outliers,
            "top_performers":    [self._summarise(m) for m in top_performers],
            "needs_attention":   [self._summarise(m) for m in needs_attention],
            "network_grade":     self._network_grade(metric_stats),
            "stale_members":     stale_members,
        }

    def compare_member(self, company_id: str) -> dict:
        """
        Detailed benchmark comparison for a single member vs the network.
        Returns per-metric position, distance from mean, and narrative.
        """
        member = next(
            (m for m in self.members if m.get("company_id") == company_id), None
        )
        if not member:
            return {"error": f"Member {company_id} not found in network"}

        all_benchmarks = self.compute_all()
        if not all_benchmarks.get("sufficient_data"):
            return all_benchmarks

        enriched = next(
            (m for m in all_benchmarks["members"] if m.get("company_id") == company_id),
            {},
        )

        comparisons = []
        for metric_key, meta in BENCHMARK_METRICS.items():
            bm    = enriched.get("benchmarks", {}).get(metric_key)
            if not bm:
                continue

            value       = bm["value"]
            percentile  = bm["percentile"]
            vs_mean_pct = bm["vs_mean_pct"]
            higher_better = meta["higher_is_better"]

            # Generate narrative
            if percentile >= 75:
                position = "top quartile"
            elif percentile >= 50:
                position = "above average"
            elif percentile >= 25:
                position = "below average"
            else:
                position = "bottom quartile"

            direction_word = "above" if vs_mean_pct > 0 else "below"
            narrative = (
                f"{member.get('name', company_id)} is in the {position} "
                f"({percentile:.0f}th percentile), "
                f"{abs(vs_mean_pct):.0f}% {direction_word} the network average."
            )

            comparisons.append({
                "metric":        metric_key,
                "label":         meta["label"],
                "value":         value,
                "percentile":    percentile,
                "position":      position,
                "vs_mean_pct":   vs_mean_pct,
                "narrative":     narrative,
                "is_outlier":    bm["is_outlier"],
                "higher_is_better": higher_better,
                "unit":          meta["unit"],
            })

        # Sort by severity — outliers and bottom-quartile first
        comparisons.sort(key=lambda c: (
            0 if c["is_outlier"] and not c["higher_is_better"] else
            1 if c["position"] == "bottom quartile" else
            2 if c["position"] == "below average" else 3
        ))

        return {
            "company_id":     company_id,
            "member_name":    member.get("name", company_id),
            "health_score":   member.get("health_score"),
            "health_grade":   member.get("health_grade"),
            "comparisons":    comparisons,
            "outlier_flags":  enriched.get("outlier_flags", []),
            "rank":           next(
                (i + 1 for i, m in enumerate(
                    sorted(self.members, key=lambda x: x.get("health_score") or 0, reverse=True)
                ) if m.get("company_id") == company_id),
                None,
            ),
            "total_members":  len(self.members),
        }

    def quartile_distribution(self, metric: str) -> dict:
        """
        Return the distribution of members across quartiles for a metric.
        Useful for histogram-style visualisations.
        """
        if metric not in BENCHMARK_METRICS:
            return {"error": f"Unknown metric '{metric}'"}

        stats = self._compute_metric_stats(metric)
        if not stats:
            return {"error": "Insufficient data"}

        q1_members, q2_members, q3_members, q4_members = [], [], [], []

        for member in self.members:
            value = member.get(metric)
            if value is None:
                continue
            percentile = self._percentile_rank(value, stats["values"])
            bucket = (
                q1_members if percentile < 25  else
                q2_members if percentile < 50  else
                q3_members if percentile < 75  else
                q4_members
            )
            bucket.append({
                "company_id": member.get("company_id"),
                "name":       member.get("name"),
                "value":      value,
                "percentile": round(percentile, 1),
            })

        return {
            "metric":  metric,
            "label":   BENCHMARK_METRICS[metric]["label"],
            "stats":   stats,
            "quartiles": {
                "Q1": {"range": "0–25th percentile",  "members": q1_members, "count": len(q1_members)},
                "Q2": {"range": "25–50th percentile", "members": q2_members, "count": len(q2_members)},
                "Q3": {"range": "50–75th percentile", "members": q3_members, "count": len(q3_members)},
                "Q4": {"range": "75–100th percentile","members": q4_members, "count": len(q4_members)},
            },
        }

    # ----------------------------------------------------------
    # Statistical helpers
    # ----------------------------------------------------------

    def _compute_metric_stats(self, metric: str) -> Optional[dict]:
        """Compute mean, std dev, min, max, median, quartiles for a metric."""
        values = [
            m.get(metric) for m in self.members
            if m.get(metric) is not None
        ]
        if len(values) < 2:
            return None

        values_sorted = sorted(values)
        mean   = statistics.mean(values)
        std_dev= statistics.stdev(values) if len(values) > 1 else 0
        median = statistics.median(values)

        n = len(values_sorted)
        q1 = values_sorted[n // 4]
        q3 = values_sorted[(3 * n) // 4]

        return {
            "mean":    round(mean, 2),
            "std_dev": round(std_dev, 2),
            "median":  round(median, 2),
            "min":     round(min(values), 2),
            "max":     round(max(values), 2),
            "q1":      round(q1, 2),
            "q3":      round(q3, 2),
            "iqr":     round(q3 - q1, 2),
            "count":   n,
            "values":  values,
        }

    def _percentile_rank(self, value: float, all_values: list) -> float:
        """
        Compute percentile rank of value within all_values.
        Returns 0–100. Uses interpolation for ties.
        """
        if not all_values:
            return 50.0
        below = sum(1 for v in all_values if v < value)
        equal = sum(1 for v in all_values if v == value)
        return (below + 0.5 * equal) / len(all_values) * 100

    def _z_score(self, value: float, mean: float, std_dev: float) -> float:
        """Compute z-score of value. Returns 0 if std_dev is 0."""
        if std_dev == 0:
            return 0.0
        return (value - mean) / std_dev

    def _quartile(self, percentile: float) -> str:
        if percentile >= 75: return "Q4"
        if percentile >= 50: return "Q3"
        if percentile >= 25: return "Q2"
        return "Q1"

    def _summarise(self, member: dict) -> dict:
        """Compact member summary for top/bottom performer lists."""
        return {
            "company_id":   member.get("company_id"),
            "name":         member.get("name"),
            "health_score": member.get("health_score"),
            "health_grade": member.get("health_grade"),
            "revenue_30d":  member.get("revenue_30d"),
            "task_completion": member.get("task_completion"),
            "outlier_flags":member.get("outlier_flags", []),
            "signals":      member.get("health_signals", []),
        }

    def _network_grade(self, metric_stats: dict) -> str:
        """
        Overall network health grade based on average metrics.
        A = network avg health score >= 85
        B = >= 70, C = >= 50, D = below 50
        """
        health_stats = metric_stats.get("health_score")
        if not health_stats:
            return "N/A"
        mean = health_stats["mean"]
        if mean >= 85: return "A"
        if mean >= 70: return "B"
        if mean >= 50: return "C"
        return "D"
