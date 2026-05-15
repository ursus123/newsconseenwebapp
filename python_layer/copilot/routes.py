# ==============================================================
# Newsconseen Operational Copilot — API Routes
# ==============================================================
# FastAPI endpoints for the copilot.
#
# POST /copilot/ask           — main question endpoint
# POST /copilot/ask/stream    — streaming version
# GET  /copilot/context       — what the copilot knows about this tenant
# POST /copilot/feedback      — thumbs up/down on an answer
# GET  /copilot/status        — health check
# ==============================================================

import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from copilot.engine import CopilotEngine, ask_stream_events

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/copilot", tags=["Copilot"])

RAILWAY_URL = os.getenv(
    "RAILWAY_URL",
    "https://newsconseenwebapp-production.up.railway.app",
)

COPILOT_BACKEND = os.getenv("COPILOT_BACKEND", "anthropic")


# ----------------------------------------------------------
# Request / response models
# ----------------------------------------------------------

class AskRequest(BaseModel):
    question:             str
    company_id:           str
    enterprise_name:      Optional[str] = ""
    history:              Optional[list[dict]] = []
    context:              Optional[dict] = {}
    session_id:           Optional[str] = ""   # if set, history persisted in session store
    model:                Optional[str] = None  # LLM model override; defaults to engine default
    # Entity-page context — injected when Idjwi is opened from an entity record
    current_page:         Optional[str] = ""
    selected_entity_type: Optional[str] = ""
    selected_entity_id:   Optional[str] = ""


class FeedbackRequest(BaseModel):
    question:   str
    answer:     str
    company_id: str
    rating:     int   # 1 = thumbs up, -1 = thumbs down
    comment:    Optional[str] = None


# ----------------------------------------------------------
# Endpoints
# ----------------------------------------------------------

@router.get("/status")
def copilot_status():
    """Health check — confirms copilot is available and which backend is configured."""
    backend = COPILOT_BACKEND

    backend_available = False
    backend_note      = ""

    if backend in ("anthropic", "claude"):
        try:
            import anthropic
            backend_available = bool(os.getenv("ANTHROPIC_API_KEY"))
            backend_note = "Set ANTHROPIC_API_KEY in Railway environment variables"
        except ImportError:
            backend_note = "Install anthropic: pip install anthropic"

    elif backend == "openai":
        try:
            import openai
            backend_available = bool(os.getenv("OPENAI_API_KEY"))
            backend_note = "Set OPENAI_API_KEY in Railway environment variables"
        except ImportError:
            backend_note = "Install openai: pip install openai"

    elif backend == "local":
        try:
            import requests
            resp = requests.get("http://localhost:11434/api/tags", timeout=2)
            backend_available = resp.ok
            backend_note = "Ollama running locally"
        except Exception:
            backend_note = "Ollama not running. Install from https://ollama.ai"

    return {
        "status":            "available" if backend_available else "degraded",
        "backend":           backend,
        "backend_available": backend_available,
        "backend_note":      backend_note if not backend_available else None,
        "endpoints": [
            "POST /copilot/ask",
            "POST /copilot/ask/stream",
            "GET  /copilot/context",
            "POST /copilot/feedback",
        ],
    }


@router.post("/ask")
def ask(request: AskRequest):
    """
    Ask the copilot a question about your enterprise data.

    The copilot will:
    1. Classify the intent of your question
    2. Query the relevant analytics tables
    3. Return a grounded answer with supporting data

    Example questions:
    - "Which medications expire in the next 7 days?"
    - "How many active staff do we have at the Westlands branch?"
    - "What was our revenue last month?"
    - "Which students have attendance below 70%?"
    - "Show me an overview of how we are doing"
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    if not request.company_id:
        raise HTTPException(status_code=400, detail="company_id is required")

    engine = CopilotEngine(
        company_id=request.company_id,
        enterprise_name=request.enterprise_name or "",
        backend=COPILOT_BACKEND,
        railway_url=RAILWAY_URL,
        model=request.model or None,
    )

    # Merge entity-page context into the context dict so Claude knows the viewport
    ctx = dict(request.context or {})
    if request.current_page:
        ctx["current_page"] = request.current_page
    if request.selected_entity_type:
        ctx["selected_entity_type"] = request.selected_entity_type
    if request.selected_entity_id:
        ctx["selected_entity_id"] = request.selected_entity_id

    result = engine.ask(
        question=request.question,
        history=request.history or [],
        context=ctx,
        session_id=request.session_id or "",
    )

    # Never raise 500 for engine errors — return 200 with the error as the
    # answer so the chat UI can display it instead of "Could not reach copilot".
    if result.get("error") and not result.get("answer"):
        error_msg = result["error"]

        # Friendly messages for known error types
        if "ANTHROPIC_API_KEY" in error_msg:
            friendly = (
                "Idjwi's reasoning engine is not configured yet.\n\n"
                "To enable it, add ANTHROPIC_API_KEY to the Railway environment variables "
                "for the python_layer service.\n\n"
                "Once set, redeploy and Idjwi will be available.\n\n"
                "_Note: Idjwi's autonomous monitor (ETL, alerts, agents) continues to run regardless._"
            )
        else:
            friendly = (
                f"Idjwi encountered a reasoning error:\n\n{error_msg}\n\n"
                "If this persists, check the python_layer logs on Railway."
            )

        result["answer"] = friendly

    return result


@router.post("/ask/stream")
async def ask_stream(request: AskRequest):
    """
    Real SSE streaming version of /copilot/ask.

    Yields events as the tool loop progresses — client sees tool calls
    in real time, then the final answer streams when complete.

    Event format (each line):  data: <JSON>\n\n

    Event types:
      {"event": "thinking",  "content": "..."}         — start
      {"event": "tool_call", "tool": "...", "input": {}}— tool executing
      {"event": "answer",    "content": "..."}          — final answer
      {"event": "done"}                                 — stream complete
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    async def generate():
        try:
            async for event_json in ask_stream_events(
                question=request.question,
                company_id=request.company_id,
                history=request.history or [],
            ):
                yield f"data: {event_json}\n\n"
        except Exception as e:
            import json as _json
            logger.error("SSE streaming error: %s", e)
            yield f"data: {_json.dumps({'event': 'answer', 'content': f'An error occurred: {e}. Please try again.'})}\n\n"
            yield "data: {\"event\": \"done\"}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/context")
def get_context(company_id: str = Query(...)):
    """
    Returns what the copilot knows about this tenant's data.
    Used by the chat UI to show data freshness and scope.
    """
    engine = CopilotEngine(
        company_id=company_id,
        backend=COPILOT_BACKEND,
        railway_url=RAILWAY_URL,
    )

    # Quick overview to show data availability
    overview = engine.query_engine.query_network_overview()

    enterprises = engine.query_engine.query_enterprises()
    ent_list = [
        {"id": e.get("id"), "name": e.get("name"), "type": e.get("enterprise_type")}
        for e in enterprises.get("data", [])
    ]

    return {
        "company_id":          company_id,
        "backend":             COPILOT_BACKEND,
        "data_available":      not bool(overview.get("error")),
        "enterprises":         ent_list,
        "enterprise_count":    len(ent_list),
        "alert_count":         overview.get("summary", {}).get("alert_count", 0),
        "critical_alerts":     overview.get("summary", {}).get("critical_count", 0),
        "sample_questions": [
            "Give me an overview of how we are doing",
            "Which items are expiring in the next 7 days?",
            "How many active staff do we have?",
            "What was our revenue this month?",
            "Which tasks are overdue?",
            "Show me low stock alerts",
        ],
    }


@router.post("/feedback")
def submit_feedback(request: FeedbackRequest):
    """
    Submit feedback on a copilot answer.
    Thumbs up (1) or down (-1) with optional comment.
    Used to improve answer quality over time.
    """
    # Log feedback for analysis
    logger.info(
        "copilot.feedback: company_id=%s rating=%d question='%s'",
        request.company_id, request.rating, request.question[:100],
    )

    # Future: store to Base44 CopilotFeedback entity
    # For now just acknowledge
    return {
        "status":  "received",
        "rating":  request.rating,
        "message": "Thank you for your feedback. It helps improve the copilot.",
    }


@router.get("/diagnose")
def diagnose(company_id: str = Query(...)):
    """
    Runs all 10 copilot query tools for the given company_id and reports
    how many rows each tool returned.  Use this to confirm the analytics
    tables are populated and the copilot can reach data.

    A tool showing count=0 means either:
      - The analytics table has no rows for this company_id (re-run ETL)
      - The ETL ran with company_id=NULL (check Cron: company_id log lines)
      - The Base44 entity has no records yet (create some data first)
    """
    from copilot.queries import (
        get_operator_context, get_people_summary, get_person_churn_risk,
        get_staff_availability, get_transaction_summary, get_overdue_invoices,
        get_task_summary, get_task_outcomes, get_product_summary,
        get_enterprise_overview, get_network_overview,
    )
    from sqlalchemy import text
    from database import get_engine_safe

    # Check raw table row counts alongside analytics
    raw_counts: dict = {}
    engine = get_engine_safe()
    if engine:
        tables = ["people", "enterprises", "products", "tasks", "transactions",
                  "services", "relationships", "addresses", "geospatial"]
        with engine.connect() as conn:
            for t in tables:
                try:
                    row = conn.execute(text(f"SELECT COUNT(*) FROM raw.{t}")).scalar()
                    raw_counts[t] = row
                except Exception:
                    raw_counts[t] = None   # table does not exist yet

    # Check distinct company_ids in each analytics table
    analytics_companies: dict = {}
    if engine:
        atables = ["people_summary", "enterprise_summary", "product_summary",
                   "task_summary", "transaction_summary", "service_summary",
                   "relationship_summary", "address_summary"]
        with engine.connect() as conn:
            for t in atables:
                try:
                    rows = conn.execute(text(
                        f"SELECT DISTINCT company_id FROM analytics.{t} LIMIT 20"
                    )).fetchall()
                    analytics_companies[t] = [r[0] for r in rows]
                except Exception:
                    analytics_companies[t] = None

    # Run each copilot tool and report row counts
    tools: dict = {}
    tool_fns = {
        "get_operator_context":   lambda: get_operator_context(company_id),
        "get_people_summary":     lambda: get_people_summary(company_id),
        "get_person_churn_risk":  lambda: get_person_churn_risk(company_id),
        "get_staff_availability": lambda: get_staff_availability(company_id),
        "get_transaction_summary":lambda: get_transaction_summary(company_id),
        "get_overdue_invoices":   lambda: get_overdue_invoices(company_id),
        "get_task_summary":       lambda: get_task_summary(company_id),
        "get_task_outcomes":      lambda: get_task_outcomes(company_id),
        "get_product_summary":    lambda: get_product_summary(company_id),
        "get_enterprise_overview":lambda: get_enterprise_overview(company_id),
    }
    for name, fn in tool_fns.items():
        try:
            result = fn()
            # Count rows in any list-valued key
            count = 0
            for v in result.values():
                if isinstance(v, list):
                    count = max(count, len(v))
            tools[name] = {"ok": True, "row_count": count, "result": result}
        except Exception as e:
            tools[name] = {"ok": False, "error": str(e)}

    any_data = any(t.get("row_count", 0) > 0 for t in tools.values() if t.get("ok"))

    return {
        "company_id":          company_id,
        "has_data":            any_data,
        "diagnosis":           "Data found — copilot should work" if any_data
                               else "No data found for this company_id. "
                                    "Re-run ETL after confirming Railway is redeployed.",
        "raw_row_counts":      raw_counts,
        "analytics_companies": analytics_companies,
        "tools":               tools,
    }


@router.get("/recommendations")
def list_recommendations(company_id: str = Query(...), status: Optional[str] = Query(None)):
    """
    List copilot-proposed recommendations (from analytics.agent_approvals where agent_name='copilot').
    Supports filtering by status: pending | approved | rejected | executed.
    """
    from database import get_engine_safe
    from sqlalchemy import text as _text

    engine = get_engine_safe()
    if not engine:
        return {"recommendations": [], "count": 0, "note": "Database unavailable."}

    params: dict = {"cid": company_id}
    status_clause = ""
    if status:
        status_clause = "AND status = :status"
        params["status"] = status

    try:
        with engine.connect() as conn:
            rows = conn.execute(_text(f"""
                SELECT id, action_type, action_label AS title, action_payload,
                       risk_level, reasoning AS rationale, status, created_at, updated_at
                FROM analytics.agent_approvals
                WHERE company_id = :cid
                  AND agent_name = 'copilot'
                  {status_clause}
                ORDER BY created_at DESC
                LIMIT 50
            """), params).fetchall()
            cols = ["id", "action_type", "title", "action_payload",
                    "risk_level", "rationale", "status", "created_at", "updated_at"]
            recs = [dict(zip(cols, r)) for r in rows]
    except Exception as e:
        logger.error("list_recommendations failed: %s", e)
        return {"recommendations": [], "count": 0, "error": str(e)}

    return {"recommendations": recs, "count": len(recs)}


@router.post("/recommendations/{approval_id}/approve")
def approve_recommendation(approval_id: str, company_id: str = Query(...)):
    """Approve a copilot-proposed recommendation and queue it for execution."""
    from database import get_engine_safe
    from sqlalchemy import text as _text

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    try:
        with engine.connect() as conn:
            result = conn.execute(_text("""
                UPDATE analytics.agent_approvals
                SET status = 'approved', updated_at = NOW()
                WHERE id = :id AND company_id = :cid AND agent_name = 'copilot'
                RETURNING id, action_type, action_label, status
            """), {"id": approval_id, "cid": company_id})
            row = result.fetchone()
            conn.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not row:
        raise HTTPException(status_code=404, detail="Recommendation not found or wrong company_id.")

    return {
        "status":      "approved",
        "approval_id": approval_id,
        "action_type": row[1],
        "message":     f"'{row[2]}' approved and queued for execution.",
    }


@router.post("/recommendations/{approval_id}/reject")
def reject_recommendation(
    approval_id: str,
    company_id: str = Query(...),
    reason: Optional[str] = Query(""),
):
    """Reject a copilot-proposed recommendation."""
    from database import get_engine_safe
    from sqlalchemy import text as _text

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="Database unavailable.")

    try:
        with engine.connect() as conn:
            result = conn.execute(_text("""
                UPDATE analytics.agent_approvals
                SET status = 'rejected', reasoning = CONCAT(reasoning, ' | Rejected: ', :reason),
                    updated_at = NOW()
                WHERE id = :id AND company_id = :cid AND agent_name = 'copilot'
                RETURNING id, action_type, action_label, status
            """), {"id": approval_id, "cid": company_id, "reason": reason or "No reason given."})
            row = result.fetchone()
            conn.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not row:
        raise HTTPException(status_code=404, detail="Recommendation not found or wrong company_id.")

    return {
        "status":      "rejected",
        "approval_id": approval_id,
        "action_type": row[1],
        "message":     f"'{row[2]}' rejected.",
    }


@router.get("/sample-questions")
def sample_questions(company_id: Optional[str] = Query(None)):
    """
    Return sample questions tailored to the operator's data.
    Used by the chat UI to show suggested questions.
    """
    base_questions = [
        {"question": "Give me an overview of how we are doing today", "intent": "network_overview"},
        {"question": "Which items are expiring in the next 7 days?",  "intent": "stock_expiry"},
        {"question": "How many active staff do we have?",              "intent": "people_count"},
        {"question": "What was our revenue this month?",               "intent": "financial_revenue"},
        {"question": "Which tasks are overdue?",                       "intent": "task_overdue"},
        {"question": "Show me everything that is running low on stock","intent": "stock_low"},
        {"question": "What is our task completion rate?",              "intent": "task_completion"},
        {"question": "How many new clients joined this month?",        "intent": "people_new"},
        {"question": "What are our total expenses this month?",        "intent": "financial_expenses"},
        {"question": "Which branches are active?",                     "intent": "branch_performance"},
    ]

    return {"questions": base_questions}
