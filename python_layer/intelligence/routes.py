"""
intelligence/routes.py

REST endpoints for the Newsconseen Intelligence Layer.

Serves Insight, Recommendation, Risk, and Opportunity objects with
three-tier fallback: analytics.* → raw.* → Supabase live.

All reads are company_id-scoped and require a verified Supabase session
that either owns company_id or is super_admin. No writes from python_layer —
writes happen through the Supabase on the frontend.
"""

import logging
from fastapi import APIRouter, Query, Header, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import pandas as pd
from database import get_engine_safe
from data_sources import supabase_source
from onboarding.auth import verify_tenant_access
from sqlalchemy import text
from intelligence.projector import build_envelope, build_canonical_envelope
from copilot.idjwi_observability import log_event
from intelligence.authorization import IntelligenceAuthorizationPolicy
from intelligence.cache import cache_key, get as get_cached_inbox, put as put_cached_inbox
from tenant_context.supabase_repository import SupabaseTenantContextRepository
from intelligence.repository import SupabaseIntelligenceRepository
from intelligence.ingestion import IntelligenceIngestionService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/intelligence", tags=["intelligence"])
tenant_repository = SupabaseTenantContextRepository()
intelligence_repository = SupabaseIntelligenceRepository()
ingestion_service = IntelligenceIngestionService(intelligence_repository)


class IntelligenceIngestRequest(BaseModel):
    source_kind: str
    payload: dict = Field(default_factory=dict)
    operational_unit_id: Optional[str] = None

# ── Shared helpers ─────────────────────────────────────────────────

def _load_analytics(table: str, company_id: str, extra_filters: Optional[dict] = None) -> list:
    engine = get_engine_safe()
    if not engine:
        return []
    try:
        with engine.connect() as conn:
            where_parts = ["company_id = :company_id"]
            params = {"company_id": company_id}
            for col, val in (extra_filters or {}).items():
                if val is None:
                    continue
                where_parts.append(f"{col} = :{col}")
                params[col] = val
            where = "WHERE " + " AND ".join(where_parts)
            rows = conn.execute(
                text(f"SELECT * FROM analytics.{table} {where} ORDER BY loaded_at DESC"),
                params,
            ).mappings().all()
            return [dict(r) for r in rows] if rows else []
    except Exception as exc:
        logger.debug("analytics.%s unavailable — %s", table, exc)
        return []


def _fetch_supabase_entity(entity: str, company_id: str) -> list:
    try:
        return supabase_source.list_records(entity, company_id=company_id, limit=1000)
    except Exception as exc:
        logger.debug("Supabase %s fallback failed - %s", entity, exc)
        return []
# -- Insights ───────────────────────────────────────────────────────

@router.get("/insights")
def get_insights(
    company_id:   str           = Query(...),
    status:       Optional[str] = Query(None),
    insight_type: Optional[str] = Query(None),
    subject_type: Optional[str] = Query(None),
    subject_id:   Optional[str] = Query(None),
    severity:     Optional[str] = Query(None),
    limit:        int           = Query(100),
    authorization: Optional[str] = Header(None),
):
    """List insights for a company with optional filters. Three-tier fallback."""
    verify_tenant_access(authorization, company_id)

    rows = _load_analytics("insight_summary", company_id, {
        "status": status, "insight_type": insight_type,
        "subject_type": subject_type, "subject_id": subject_id, "severity": severity,
    })

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
def get_insights_summary(company_id: str = Query(...), authorization: Optional[str] = Header(None)):
    """Counts by status and insight_type — powers the Inbox tab badges."""
    verify_tenant_access(authorization, company_id)

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
    company_id:  str           = Query(...),
    status:      Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    insight_id:  Optional[str] = Query(None),
    limit:       int           = Query(100),
    authorization: Optional[str] = Header(None),
):
    verify_tenant_access(authorization, company_id)

    rows = _load_analytics("recommendation_summary", company_id, {
        "status": status, "action_type": action_type, "insight_id": insight_id,
    })

    if not rows:
        rows = _fetch_supabase_entity("recommendation", company_id)
        if status:      rows = [r for r in rows if r.get("status") == status]
        if action_type: rows = [r for r in rows if r.get("action_type") == action_type]
        if insight_id:  rows = [r for r in rows if r.get("insight_id") == insight_id]

    return {"recommendations": rows[:limit], "total": len(rows)}


# ── Risks ──────────────────────────────────────────────────────────

@router.get("/risks")
def get_risks(
    company_id:   str           = Query(...),
    status:       Optional[str] = Query(None),
    severity:     Optional[str] = Query(None),
    subject_type: Optional[str] = Query(None),
    limit:        int           = Query(100),
    authorization: Optional[str] = Header(None),
):
    verify_tenant_access(authorization, company_id)

    rows = _load_analytics("risk_summary", company_id, {
        "status": status, "severity": severity, "subject_type": subject_type,
    })

    if not rows:
        rows = _fetch_supabase_entity("risk", company_id)
        if status:       rows = [r for r in rows if r.get("status") == status]
        if severity:     rows = [r for r in rows if r.get("severity") == severity]
        if subject_type: rows = [r for r in rows if r.get("subject_type") == subject_type]

    return {"risks": rows[:limit], "total": len(rows)}


# ── Opportunities ──────────────────────────────────────────────────

@router.get("/opportunities")
def get_opportunities(
    company_id:   str           = Query(...),
    status:       Optional[str] = Query(None),
    type_filter:  Optional[str] = Query(None, alias="type"),
    subject_type: Optional[str] = Query(None),
    limit:        int           = Query(100),
    authorization: Optional[str] = Header(None),
):
    verify_tenant_access(authorization, company_id)

    rows = _load_analytics("opportunity_summary", company_id, {
        "status": status, "type": type_filter, "subject_type": subject_type,
    })

    if not rows:
        rows = _fetch_supabase_entity("opportunity", company_id)
        if status:       rows = [r for r in rows if r.get("status") == status]
        if type_filter:  rows = [r for r in rows if r.get("type") == type_filter]
        if subject_type: rows = [r for r in rows if r.get("subject_type") == subject_type]

    return {"opportunities": rows[:limit], "total": len(rows)}


# ── Unified inbox ──────────────────────────────────────────────────

@router.get("/inbox")
def get_inbox(
    company_id: str = Query(...),
    operational_unit_id: Optional[str] = Query(None),
    limit:      int = Query(200),
    authorization: Optional[str] = Header(None),
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
    """
    Combined payload for the Intelligence Inbox page.
    Fetches insights, recommendations, risks, and opportunities in one call.
    """
    context = tenant_repository.resolve_context(
        authorization, company_id,
        request_id=x_request_id or "",
        operational_unit_id=operational_unit_id or "",
    )
    policy = IntelligenceAuthorizationPolicy.for_context(context)
    policy.require_scope()
    principal = {"id": context.user_id, "email": context.user_email, "role": context.role}
    key = cache_key(policy.fingerprint(), limit)
    cached = get_cached_inbox(key)
    if cached is not None:
        cached.setdefault("delivery", {})["cache"] = "principal_specific_hit"
        log_event(
            "intelligence.inbox.read", company_id=company_id,
            actor=context.user_email or context.user_id or "unknown", subject=company_id,
            metadata={**cached.get("audit_context", {}), "cache": "hit"},
        )
        return cached

    try:
        canonical_items = intelligence_repository.list_items(company_id, limit=max(limit * 2, 200))
    except Exception as exc:
        logger.warning("Canonical Intelligence Repository unavailable: %s", exc)
        raise HTTPException(status_code=503, detail={
            "code": "INTELLIGENCE_REPOSITORY_UNAVAILABLE", "category": "schema_or_backend",
            "message": "The governed Intelligence Repository is unavailable.",
            "operator_action": "Apply and verify migration 017_intelligence_repository.sql, then retry.",
            "retryable": True,
        }) from exc

    envelope = build_canonical_envelope(company_id, principal, canonical_items, limit, policy)
    log_event(
        "intelligence.inbox.read",
        company_id=company_id,
        actor=context.user_email or context.user_id or "unknown",
        subject=company_id,
        metadata=envelope.audit_context,
    )
    payload = envelope.model_dump(mode="json")
    payload.setdefault("delivery", {})["cache"] = "principal_specific_miss"
    put_cached_inbox(key, payload)
    return payload


@router.post("/ingest")
def ingest_intelligence(
    request: IntelligenceIngestRequest,
    company_id: str = Query(...),
    authorization: Optional[str] = Header(None),
    x_request_id: Optional[str] = Header(None, alias="X-Request-ID"),
):
    """Translate one authorized source event into a durable governed case."""
    context = tenant_repository.resolve_context(
        authorization, company_id, request_id=x_request_id or "",
        operational_unit_id=request.operational_unit_id or "",
    )
    policy = IntelligenceAuthorizationPolicy.for_context(context)
    policy.require("intelligence.admin")
    try:
        result = ingestion_service.ingest(
            request.source_kind, request.payload,
            {"tenant_id": company_id, "organization_id": company_id, "operational_unit_id": request.operational_unit_id},
            actor_id=context.user_id, request_id=x_request_id or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={
            "code": "INTELLIGENCE_SOURCE_UNSUPPORTED", "category": "validation",
            "message": str(exc), "retryable": False,
        }) from exc
    except Exception as exc:
        logger.exception("Intelligence ingestion failed")
        raise HTTPException(status_code=503, detail={
            "code": "INTELLIGENCE_INGESTION_FAILED", "category": "backend",
            "message": "The source event could not be persisted as governed intelligence.",
            "operator_action": "Verify migration 017 and source data, then retry.", "retryable": True,
        }) from exc
    item = result["item"]
    return {
        "contract": "intelligence-ingestion-result.v1", "item": item.model_dump(mode="json"),
        "created": result["created"], "correlated": result["correlated"],
        "source_count": result["source_count"],
    }
