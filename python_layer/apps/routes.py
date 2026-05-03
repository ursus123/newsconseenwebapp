import logging
from typing import Any, Dict, Optional

from database import get_engine_safe
from fastapi import APIRouter
from sqlalchemy import text

from apps.manifests import APP_REQUIREMENTS, check_readiness

router = APIRouter(prefix="/apps", tags=["apps"])
logger = logging.getLogger(__name__)


# ── Entity count queries (analytics → raw fallback) ───────────────────────────

_ANALYTICS_QUERIES: Dict[str, str] = {
    "staff_exist":      "SELECT COUNT(*) FROM analytics.people_summary  WHERE company_id = :cid AND person_type = 'staff'",
    "clients_exist":    "SELECT COUNT(*) FROM analytics.people_summary  WHERE company_id = :cid AND person_type = 'client'",
    "products_exist":   "SELECT COUNT(*) FROM analytics.product_summary WHERE company_id = :cid AND status = 'active'",
    "enterprise_exist": "SELECT COUNT(*) FROM analytics.enterprise_summary WHERE company_id = :cid",
}

_RAW_QUERIES: Dict[str, str] = {
    "staff_exist":      "SELECT COUNT(*) FROM raw.people       WHERE company_id = :cid AND person_type = 'staff'",
    "clients_exist":    "SELECT COUNT(*) FROM raw.people       WHERE company_id = :cid AND person_type = 'client'",
    "products_exist":   "SELECT COUNT(*) FROM raw.products     WHERE company_id = :cid",
    "enterprise_exist": "SELECT COUNT(*) FROM raw.enterprises  WHERE company_id = :cid",
}


def _get_entity_counts(company_id: str, engine) -> Dict[str, int]:
    """
    Returns entity existence counts for a company.
    Three-tier fallback: analytics → raw → 0 (safe default for new tenants).
    """
    counts: Dict[str, int] = {k: 0 for k in _ANALYTICS_QUERIES}
    if not engine:
        return counts

    try:
        with engine.connect() as conn:
            # Tier 1 — analytics tables
            for key, query in _ANALYTICS_QUERIES.items():
                try:
                    val = conn.execute(text(query), {"cid": company_id}).scalar()
                    counts[key] = int(val or 0)
                except Exception:
                    pass

            # Tier 2 — raw tables (fill any zeros)
            for key, query in _RAW_QUERIES.items():
                if counts[key] == 0:
                    try:
                        val = conn.execute(text(query), {"cid": company_id}).scalar()
                        counts[key] = int(val or 0)
                    except Exception:
                        pass
    except Exception as exc:
        logger.warning("apps/readiness: entity count query failed — %s", exc)

    return counts


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/readiness")
def get_app_readiness(
    company_id: str,
    app_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Server-side app readiness scoring.

    GET /apps/readiness?company_id=xxx            — all apps
    GET /apps/readiness?company_id=xxx&app_id=yyy — single app

    Returns readiness score (0–100) and list of missing setup steps for each app.
    Entity counts are sourced from analytics → raw → 0 (three-tier fallback).

    Response (single app):
      { company_id, app_id, entity_counts, readiness: { ready, score, missing } }

    Response (all apps):
      { company_id, entity_counts, summary: { total, ready, avg_score }, apps: {...} }
    """
    engine        = get_engine_safe()
    entity_counts = _get_entity_counts(company_id, engine)

    if app_id:
        return {
            "company_id":    company_id,
            "app_id":        app_id,
            "entity_counts": entity_counts,
            "readiness":     check_readiness(app_id, entity_counts),
        }

    apps_readiness = {aid: check_readiness(aid, entity_counts) for aid in APP_REQUIREMENTS}
    total          = len(apps_readiness)
    ready_count    = sum(1 for r in apps_readiness.values() if r["ready"])
    avg_score      = round(sum(r["score"] for r in apps_readiness.values()) / total) if total else 0

    return {
        "company_id":    company_id,
        "entity_counts": entity_counts,
        "summary":       {"total": total, "ready": ready_count, "avg_score": avg_score},
        "apps":          apps_readiness,
    }
