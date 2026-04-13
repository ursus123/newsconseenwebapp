# ==============================================================
# Newsconseen — Anomaly Detection Engine
# ==============================================================
# Detects statistical anomalies that threshold-based alerts miss.
# An alert fires when a value crosses a line you drew.
# Anomaly detection fires when something unexpected happens —
# even if you never set a threshold.
#
# Two detection methods:
#
#   1. Point anomalies (transaction amounts, task durations)
#      Z-score > 2.5 on individual records.
#      Works immediately on first run — no baseline needed.
#
#   2. Metric drift (revenue, headcount, completion rate)
#      Compares current ETL snapshot to previous snapshot.
#      Fires when a key metric changes by >30% run-to-run.
#      Works after the second ETL cycle.
#
# Produces an AnomalyReport with:
#   anomaly_count   int
#   anomalies       list[AnomalyRecord]
#   evaluated_at    ISO timestamp
# ==============================================================

import logging
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from config import settings, HEADERS
from etl.base import fetch_json_to_df
from database import get_engine_safe

logger = logging.getLogger(__name__)

Z_THRESHOLD     = 2.5    # standard deviations above mean → point anomaly
DRIFT_THRESHOLD = 0.30   # 30% metric change run-to-run → drift anomaly
MIN_SAMPLE_SIZE = 5      # need at least this many records for z-score


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_raw_df(table: str, company_id: str) -> pd.DataFrame:
    """Load from raw.* PostgreSQL table with Base44 fallback."""
    engine = get_engine_safe()
    if engine:
        try:
            from sqlalchemy import text
            df = pd.read_sql(
                text(f"SELECT * FROM raw.{table} WHERE company_id = :cid"),
                engine, params={"cid": company_id}
            )
            if not df.empty:
                return df
        except Exception as e:
            logger.debug("anomaly: raw.%s unavailable — %s", table, e)
    # Base44 fallback
    url_attr = f"base44_{table}_url"
    url = getattr(settings, url_attr, None)
    if url:
        try:
            df = fetch_json_to_df(url)
            if not df.empty and "company_id" in df.columns:
                return df[df["company_id"] == company_id].copy()
        except Exception as e:
            logger.debug("anomaly: Base44 fallback for %s failed — %s", table, e)
    return pd.DataFrame()


def _z_score_anomalies(
    df: pd.DataFrame,
    col: str,
    entity_type: str,
    page: str,
    label: str,
) -> list:
    """Return anomaly dicts for records with |z-score| > Z_THRESHOLD."""
    anomalies = []
    if df.empty or col not in df.columns:
        return anomalies

    series = pd.to_numeric(df[col], errors="coerce").dropna()
    if len(series) < MIN_SAMPLE_SIZE:
        return anomalies

    mean = float(series.mean())
    std  = float(series.std())
    if std == 0:
        return anomalies

    for idx, val in series.items():
        z = (val - mean) / std
        if abs(z) <= Z_THRESHOLD:
            continue
        direction = "above" if z > 0 else "below"
        severity  = "critical" if abs(z) > 3.5 else "warning"

        # Grab entity name/id for context
        row = df.loc[idx] if idx in df.index else {}
        name = (
            row.get("title") or row.get("name") or
            row.get("full_name") or row.get("item_name") or
            row.get("id", "unknown")
        )

        anomalies.append({
            "type":        "point_anomaly",
            "entity_type": entity_type,
            "page":        page,
            "severity":    severity,
            "title":       f"Unusual {label}: {name}",
            "message": (
                f"{label.capitalize()} of {val:,.2f} is {abs(z):.1f} standard deviations "
                f"{direction} the mean ({mean:,.2f}). This record stands out statistically."
            ),
            "metric":    col,
            "value":     round(float(val), 2),
            "mean":      round(mean, 2),
            "z_score":   round(z, 2),
            "record_id": str(row.get("id", "")),
        })

    # Cap to top-3 most extreme anomalies per metric
    anomalies.sort(key=lambda a: abs(a["z_score"]), reverse=True)
    return anomalies[:3]


def _drift_anomalies(current: dict, baseline: dict) -> list:
    """Detect >30% change in key metrics compared to last snapshot."""
    anomalies = []
    WATCHED = {
        "total_revenue":    ("Revenue",          "Transactions", "financial"),
        "total_people":     ("Total people",      "People",       "people"),
        "active_staff":     ("Active staff",      "People",       "people"),
        "total_tasks":      ("Total tasks",       "Tasks",        "tasks"),
        "task_completion":  ("Task completion %", "Tasks",        "tasks"),
    }
    for metric, (label, page, entity_type) in WATCHED.items():
        cur = current.get(metric)
        bas = baseline.get(metric)
        if cur is None or bas is None:
            continue
        try:
            cur, bas = float(cur), float(bas)
        except Exception:
            continue
        if bas == 0:
            continue
        change = (cur - bas) / abs(bas)
        if abs(change) < DRIFT_THRESHOLD:
            continue

        direction = "increased" if change > 0 else "decreased"
        severity  = "critical" if abs(change) > 0.5 else "warning"

        anomalies.append({
            "type":        "metric_drift",
            "entity_type": entity_type,
            "page":        page,
            "severity":    severity,
            "title":       f"{label} {direction} by {abs(change)*100:.0f}%",
            "message": (
                f"{label} {direction} from {bas:,.2f} to {cur:,.2f} "
                f"({abs(change)*100:.0f}% change) since the last evaluation. "
                "This may indicate a significant operational shift."
            ),
            "metric":    metric,
            "value":     cur,
            "baseline":  bas,
            "change_pct": round(change * 100, 1),
        })

    return anomalies


def _extract_metric_snapshot(company_id: str) -> dict:
    """Pull key scalar metrics from analytics/raw tables for drift detection."""
    snapshot: dict = {}
    engine = get_engine_safe()
    if not engine:
        return snapshot

    try:
        from sqlalchemy import text

        with engine.connect() as conn:
            # Revenue
            try:
                row = conn.execute(text("""
                    SELECT COALESCE(SUM(total_amount), 0) AS total_revenue
                    FROM analytics.transaction_summary
                    WHERE company_id = :cid AND is_revenue = TRUE
                """), {"cid": company_id}).fetchone()
                if row:
                    snapshot["total_revenue"] = float(row[0] or 0)
            except Exception:
                pass

            # People counts
            try:
                row = conn.execute(text("""
                    SELECT
                        COUNT(*) AS total_people,
                        COUNT(*) FILTER (WHERE status = 'active' AND person_type = 'staff') AS active_staff
                    FROM raw.people
                    WHERE company_id = :cid
                """), {"cid": company_id}).fetchone()
                if row:
                    snapshot["total_people"] = int(row[0] or 0)
                    snapshot["active_staff"]  = int(row[1] or 0)
            except Exception:
                pass

            # Task metrics
            try:
                row = conn.execute(text("""
                    SELECT
                        COUNT(*) AS total_tasks,
                        ROUND(
                            COUNT(*) FILTER (WHERE status = 'completed')::numeric
                            / NULLIF(COUNT(*), 0) * 100, 1
                        ) AS completion_pct
                    FROM raw.tasks
                    WHERE company_id = :cid
                """), {"cid": company_id}).fetchone()
                if row:
                    snapshot["total_tasks"]      = int(row[0] or 0)
                    snapshot["task_completion"]   = float(row[1] or 0)
            except Exception:
                pass

    except Exception as e:
        logger.debug("anomaly: snapshot extraction failed — %s", e)

    return snapshot


def evaluate(company_id: str, baseline: Optional[dict] = None) -> dict:
    """
    Run full anomaly detection for a company.

    baseline: metrics snapshot from the previous ETL run (for drift detection).
              Pass None on first run — only point anomalies will be reported.

    Returns a dict suitable for caching in anomaly.routes._CACHE.
    """
    anomalies: list = []

    # ── Point anomalies — transaction amounts ──────────────────
    tx_df = _load_raw_df("transactions", company_id)
    if not tx_df.empty:
        # Only check posted transactions with real amounts
        posted = tx_df[tx_df.get("status", pd.Series()) == "posted"] if "status" in tx_df.columns else tx_df
        anomalies += _z_score_anomalies(
            posted, "amount", "transactions", "Transactions", "transaction amount"
        )

    # ── Point anomalies — task duration (if available) ────────
    task_df = _load_raw_df("tasks", company_id)
    if not task_df.empty and "duration_minutes" in task_df.columns:
        anomalies += _z_score_anomalies(
            task_df, "duration_minutes", "tasks", "Tasks", "task duration"
        )

    # ── Metric drift — compare to previous snapshot ───────────
    current_snapshot = _extract_metric_snapshot(company_id)
    if baseline and current_snapshot:
        anomalies += _drift_anomalies(current_snapshot, baseline)

    # ── Deduplicate and cap ───────────────────────────────────
    seen: set = set()
    unique: list = []
    for a in anomalies:
        key = (a["type"], a.get("metric"), a.get("record_id", a.get("entity_type")))
        if key not in seen:
            seen.add(key)
            unique.append(a)

    # Sort: critical first, then by |z_score| or |change_pct|
    def sort_key(a):
        sev  = 0 if a["severity"] == "critical" else 1
        mag  = abs(a.get("z_score") or a.get("change_pct") or 0)
        return (sev, -mag)

    unique.sort(key=sort_key)
    unique = unique[:10]

    critical_count = sum(1 for a in unique if a["severity"] == "critical")
    warning_count  = sum(1 for a in unique if a["severity"] == "warning")

    return {
        "company_id":       company_id,
        "anomaly_count":    len(unique),
        "critical_count":   critical_count,
        "warning_count":    warning_count,
        "anomalies":        unique,
        "metrics_snapshot": current_snapshot,
        "evaluated_at":     _now_iso(),
    }
