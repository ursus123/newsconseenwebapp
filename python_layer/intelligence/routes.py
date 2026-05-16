"""
intelligence/routes.py

REST endpoints for the Newsconseen Intelligence Layer.

Serves Insight, Recommendation, Risk, and Opportunity objects with
three-tier fallback: analytics.* → raw.* → Supabase live.

All reads are company_id-scoped. No writes from python_layer —
writes happen through the Supabase on the frontend.
"""

import logging
from fastapi import APIRouter, Query
from typing import Optional
import pandas as pd
from database import get_engine_safe
from data_sources import supabase_source
from sqlalchemy import text

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/intelligence", tags=["intelligence"])

# ── Shared helpers ─────────────────────────────────────────────────

def _load_analytics(table: str, company_id: Optional[str], extra_where: str = "") -> list:
    engine = get_engine_safe()
    if not engine:
        return []
    try:
        with engine.connect() as conn:
            where_parts = []
            params = {}
            if company_id:
                where_parts.append("company_id = :company_id")
                params["company_id"] = company_id
            if extra_where:
                where_parts.append(extra_where)
            where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
            rows = conn.execute(
                text(f"SELECT * FROM analytics.{table} {where} ORDER BY loaded_at DESC"),
                params,
            ).mappings().all()
            return [dict(r) for r in rows] if rows else []
    except Exception as exc:
        logger.debug("analytics.%s unavailable — %s", table, exc)
        return []


def _fetch_supabase_entity(entity: str, company_id: Optional[str]) -> list:
    try:
        return supabase_source.list_records(entity, company_id=company_id, limit=1000)
    except Exception as exc:
        logger.debug("Supabase %s fallback failed - %s", entity, exc)
        return []
# -- Insights ───────────────────────────────────────────────────────

@router.get("/insights")
def get_insights(
    company_id:   Optional[str] = Query(None),
    status:       Optional[str] = Query(None),
    insight_type: Optional[str] = Query(None),
    subject_type: Optional[str] = Query(None),
    subject_id:   Optional[str] = Query(None),
    severity:     Optional[str] = Query(None),
    limit:        int           = Query(100),
):
    """List insights for a company with optional filters. Three-tier fallback."""
    extra_parts = []
    if status:       extra_parts.append(f"status = '{status}'")
    if insight_type: extra_parts.append(f"insight_type = '{insight_type}'")
    if subject_type: extra_parts.append(f"subject_type = '{subject_type}'")
    if subject_id:   extra_parts.append(f"subject_id = '{subject_id}'")
    if severity:     extra_parts.append(f"severity = '{severity}'")

    rows = _load_analytics("insight_summary", company_id, " AND ".join(extra_parts))

    # Fallback to Supabase live
    if not rows:
        rows = _fetch_supabase_entity("insight", company_id)
        if status:       rows = [r for r in rows if r.get("status") == status]
        if insight_type: rows = [r for r in rows if r.get("insight_type") == insight_type]
        if subject_type: rows = [r for r in rows if r.get("subject_type") == subject_type]
        if subject_id:   rows = [r for r in rows if r.get("subject_id") == subject_id]
        if severity:     rows = [r for r in rows if r.get("severity") == severity]

    return {"insights": rows[:limit], "total": len(rows)}


@router.get("/insights/summary")
def get_insights_summary(company_id: Optional[str] = Query(None)):
    """Counts by status and insight_type — powers the Inbox tab badges."""
    rows = _load_analytics("insight_summary", company_id)
    if not rows:
        rows = _fetch_supabase_entity("insight", company_id)

    df = pd.DataFrame(rows)
    if df.empty:
        return {
            "total": 0,
            "new": 0,
            "risks": 0,
            "opportunities": 0,
            "by_severity": {},
            "by_type": {},
            "by_status": {},
        }

    return {
        "total":         len(df),
        "new":           int((df.get("status", pd.Series()) == "new").sum()),
        "risks":         int((df.get("insight_type", pd.Series()) == "risk").sum()),
        "opportunities": int((df.get("insight_type", pd.Series()) == "opportunity").sum()),
        "by_severity":   df["severity"].value_counts().to_dict() if "severity" in df else {},
        "by_type":       df["insight_type"].value_counts().to_dict() if "insight_type" in df else {},
        "by_status":     df["status"].value_counts().to_dict() if "status" in df else {},
    }


# ── Recommendations ────────────────────────────────────────────────

@router.get("/recommendations")
def get_recommendations(
    company_id:  Optional[str] = Query(None),
    status:      Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    insight_id:  Optional[str] = Query(None),
    limit:       int           = Query(100),
):
    extra_parts = []
    if status:      extra_parts.append(f"status = '{status}'")
    if action_type: extra_parts.append(f"action_type = '{action_type}'")
    if insight_id:  extra_parts.append(f"insight_id = '{insight_id}'")

    rows = _load_analytics("recommendation_summary", company_id, " AND ".join(extra_parts))

    if not rows:
        rows = _fetch_supabase_entity("recommendation", company_id)
        if status:      rows = [r for r in rows if r.get("status") == status]
        if action_type: rows = [r for r in rows if r.get("action_type") == action_type]
        if insight_id:  rows = [r for r in rows if r.get("insight_id") == insight_id]

    return {"recommendations": rows[:limit], "total": len(rows)}


# ── Risks ──────────────────────────────────────────────────────────

@router.get("/risks")
def get_risks(
    company_id:   Optional[str] = Query(None),
    status:       Optional[str] = Query(None),
    severity:     Optional[str] = Query(None),
    subject_type: Optional[str] = Query(None),
    limit:        int           = Query(100),
):
    extra_parts = []
    if status:       extra_parts.append(f"status = '{status}'")
    if severity:     extra_parts.append(f"severity = '{severity}'")
    if subject_type: extra_parts.append(f"subject_type = '{subject_type}'")

    rows = _load_analytics("risk_summary", company_id, " AND ".join(extra_parts))

    if not rows:
        rows = _fetch_supabase_entity("risk", company_id)
        if status:       rows = [r for r in rows if r.get("status") == status]
        if severity:     rows = [r for r in rows if r.get("severity") == severity]
        if subject_type: rows = [r for r in rows if r.get("subject_type") == subject_type]

    return {"risks": rows[:limit], "total": len(rows)}


# ── Opportunities ──────────────────────────────────────────────────

@router.get("/opportunities")
def get_opportunities(
    company_id:   Optional[str] = Query(None),
    status:       Optional[str] = Query(None),
    type_filter:  Optional[str] = Query(None, alias="type"),
    subject_type: Optional[str] = Query(None),
    limit:        int           = Query(100),
):
    extra_parts = []
    if status:       extra_parts.append(f"status = '{status}'")
    if type_filter:  extra_parts.append(f"type = '{type_filter}'")
    if subject_type: extra_parts.append(f"subject_type = '{subject_type}'")

    rows = _load_analytics("opportunity_summary", company_id, " AND ".join(extra_parts))

    if not rows:
        rows = _fetch_supabase_entity("opportunity", company_id)
        if status:       rows = [r for r in rows if r.get("status") == status]
        if type_filter:  rows = [r for r in rows if r.get("type") == type_filter]
        if subject_type: rows = [r for r in rows if r.get("subject_type") == subject_type]

    return {"opportunities": rows[:limit], "total": len(rows)}


# ── Unified inbox ──────────────────────────────────────────────────

@router.get("/inbox")
def get_inbox(
    company_id: Optional[str] = Query(None),
    limit:      int           = Query(200),
):
    """
    Combined payload for the Intelligence Inbox page.
    Fetches insights, recommendations, risks, and opportunities in one call.
    """
    insights        = _load_analytics("insight_summary", company_id) or _fetch_supabase_entity("insight", company_id)
    recommendations = _load_analytics("recommendation_summary", company_id) or _fetch_supabase_entity("recommendation", company_id)
    risks           = _load_analytics("risk_summary", company_id) or _fetch_supabase_entity("risk", company_id)
    opportunities   = _load_analytics("opportunity_summary", company_id) or _fetch_supabase_entity("opportunity", company_id)

    return {
        "insights":        insights[:limit],
        "recommendations": recommendations[:limit],
        "risks":           risks[:limit],
        "opportunities":   opportunities[:limit],
        "summary": {
            "total_insights":    len(insights),
            "new_insights":      sum(1 for i in insights if i.get("status") == "new"),
            "open_risks":        sum(1 for r in risks if r.get("status") in ("open", "acknowledged")),
            "active_opps":       sum(1 for o in opportunities if o.get("status") in ("identified", "evaluating", "pursuing")),
            "pending_recs":      sum(1 for r in recommendations if r.get("status") == "proposed"),
        },
    }
