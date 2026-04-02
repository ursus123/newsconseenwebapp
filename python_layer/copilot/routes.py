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

from copilot.engine import CopilotEngine

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
    question:       str
    company_id:     str
    enterprise_name:Optional[str] = ""
    history:        Optional[list[dict]] = []
    context:        Optional[dict] = {}


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
    )

    result = engine.ask(
        question=request.question,
        history=request.history or [],
        context=request.context or {},
    )

    # Never raise 500 for engine errors — return 200 with the error as the
    # answer so the chat UI can display it instead of "Could not reach copilot".
    if result.get("error") and not result.get("answer"):
        error_msg = result["error"]

        # Friendly messages for known error types
        if "ANTHROPIC_API_KEY" in error_msg:
            friendly = (
                "The Copilot is not configured yet.\n\n"
                "To enable it, add ANTHROPIC_API_KEY to the Railway environment variables "
                "for the python_layer service.\n\n"
                "Once set, redeploy and the Copilot will be available."
            )
        else:
            friendly = (
                f"The Copilot encountered an error:\n\n{error_msg}\n\n"
                "If this persists, check the python_layer logs on Railway."
            )

        result["answer"] = friendly

    return result


@router.post("/ask/stream")
async def ask_stream(request: AskRequest):
    """
    Streaming version of /copilot/ask.
    Returns server-sent events as the answer is generated.
    Use this for the chat UI to show typing indicators.
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    async def generate():
        engine = CopilotEngine(
            company_id=request.company_id,
            enterprise_name=request.enterprise_name or "",
            backend=COPILOT_BACKEND,
            railway_url=RAILWAY_URL,
        )

        # First yield: intent classification
        yield f"data: {{'event': 'thinking', 'content': 'Analyzing your question...'}}\n\n"

        result = engine.ask(
            question=request.question,
            history=request.history or [],
            context=request.context or {},
        )

        # Yield tool calls as they happen
        for tool_call in result.get("tools_called", []):
            yield f"data: {{'event': 'querying', 'tool': '{tool_call['tool']}', 'count': {tool_call.get('count', 0)}}}\n\n"

        # Yield the final answer
        import json
        yield f"data: {json.dumps({'event': 'answer', 'content': result['answer'], 'data': result.get('data', {}), 'intent': result.get('intent', '')})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
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
