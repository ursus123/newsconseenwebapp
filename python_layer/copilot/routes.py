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

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from copilot.engine import CopilotEngine, ask_stream_events
from copilot.llm_registry import (
    DEFAULT_MODEL,
    IDJWI_CAPABILITIES,
    list_models,
    provider_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/copilot", tags=["Copilot"])
idjwi_router = APIRouter(prefix="/idjwi", tags=["Idjwi"])

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
    advisor_enabled:      Optional[bool] = False
    ai_enabled:           Optional[bool] = None  # backward-compatible alias for advisor_enabled
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


class CommandRequest(BaseModel):
    command:    str
    company_id: str
    payload:    Optional[dict] = None


class WorkflowRequest(BaseModel):
    workflow:   str
    company_id: str
    payload:    Optional[dict] = None


class IdjwiWorkflowRequest(BaseModel):
    company_id: str
    payload:    Optional[dict] = None


class MemoryReviewRequest(BaseModel):
    company_id: str
    action:     str


class MemoryCreateRequest(BaseModel):
    company_id:     str
    key:            str
    value:          object
    memory_type:    Optional[str] = "business_rule"
    scope:          Optional[str] = "company"
    owner:          Optional[str] = "idjwi"
    confidence:     Optional[float] = 1.0
    source:         Optional[str] = "operator_stated"
    review_status:  Optional[str] = "confirmed"
    metadata:       Optional[dict] = None
    expires_at:     Optional[str] = None


class MemoryUpdateRequest(BaseModel):
    company_id: str
    patch:      dict


class MemoryUsageRequest(BaseModel):
    company_id: str


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
        "default_model":     DEFAULT_MODEL,
        "models":            list_models(),
        "providers":         provider_status(),
        "capabilities":      IDJWI_CAPABILITIES,
        "endpoints": [
            "POST /copilot/ask",
            "POST /copilot/ask/stream",
            "POST /copilot/command",
            "GET  /copilot/models",
            "GET  /copilot/context",
            "POST /copilot/feedback",
        ],
    }


@router.get("/models")
def copilot_models():
    """Return Idjwi's registered reasoning models and stable capabilities."""
    return {
        "default_model": DEFAULT_MODEL,
        "models": list_models(),
        "providers": provider_status(),
        "capabilities": IDJWI_CAPABILITIES,
    }


@router.post("/ask")
def ask(
    request: AskRequest,
    x_idjwi_api_key: Optional[str] = Header(None),
    x_idjwi_role: Optional[str] = Header(None),
    x_idjwi_user: Optional[str] = Header(None),
    x_idjwi_plan: Optional[str] = Header(None),
):
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

    logger.info("copilot/ask: company_id=%s question=%r", request.company_id, request.question[:80])

    from copilot.idjwi_security import principal_from_headers, require_api_key

    api_gate = require_api_key(x_idjwi_api_key)
    if not api_gate.get("allowed"):
        raise HTTPException(status_code=401, detail=api_gate.get("reason"))

    principal = principal_from_headers(
        company_id=request.company_id,
        user_id=x_idjwi_user,
        role=x_idjwi_role,
        plan=x_idjwi_plan,
    )

    engine = CopilotEngine(
        company_id=request.company_id,
        enterprise_name=request.enterprise_name or "",
        backend=COPILOT_BACKEND,
        railway_url=RAILWAY_URL,
        model=request.model or None,
    )
    engine.principal = principal

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
        advisor_enabled=bool(
            request.advisor_enabled if request.ai_enabled is None else request.ai_enabled
        ),
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


@router.post("/command")
def deterministic_command(
    request: CommandRequest,
    x_idjwi_api_key: Optional[str] = Header(None),
    x_idjwi_role: Optional[str] = Header(None),
    x_idjwi_user: Optional[str] = Header(None),
):
    """
    Deterministic Idjwi command endpoint.

    These actions do not need an LLM. They use Idjwi's capability/tool layer
    directly so the assistant can still perform governed work when AI is down.
    """
    if not request.company_id:
        raise HTTPException(status_code=400, detail="company_id is required")

    command = (request.command or "").strip().lower()
    payload = request.payload or {}

    try:
        from copilot.queries import execute_tool
        from copilot.idjwi_memory import remember, recall, forget, summary
        from copilot.idjwi_security import (
            authorize_capability,
            principal_from_headers,
            require_api_key,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    api_gate = require_api_key(x_idjwi_api_key)
    if not api_gate.get("allowed"):
        raise HTTPException(status_code=401, detail=api_gate.get("reason"))

    principal = principal_from_headers(
        company_id=request.company_id,
        user_id=x_idjwi_user,
        role=x_idjwi_role,
    )
    try:
        from copilot.idjwi_observability import log_event
        log_event(
            "command.request",
            company_id=request.company_id,
            actor=principal.user_id,
            subject=command,
            metadata={"role": principal.role, "payload_keys": sorted(payload.keys())},
        )
    except Exception:
        pass

    def require(capability_id: str):
        gate = authorize_capability(capability_id, principal=principal, llm_available=False)
        if not gate.get("allowed"):
            raise HTTPException(status_code=403, detail=gate.get("reason"))

    if command in ("list_overdue_tasks", "overdue_tasks"):
        require("read_company_data")
        return execute_tool(
            "find_task_records",
            {"overdue_only": True, "limit": int(payload.get("limit", 20))},
            request.company_id,
            principal=principal,
            llm_available=False,
        )

    if command in ("task_summary", "list_tasks"):
        require("read_company_data")
        return execute_tool("get_task_summary", payload, request.company_id, principal=principal, llm_available=False)

    if command in ("search_people", "find_people"):
        require("read_company_data")
        return execute_tool("find_people_records", payload, request.company_id, principal=principal, llm_available=False)

    if command in ("search_intelligence", "intelligence"):
        require("search_intelligence")
        return execute_tool("search_intelligence", payload, request.company_id, principal=principal, llm_available=False)

    if command in ("create_task", "add_task"):
        require("create_task")
        fields = {
            "title": payload.get("title") or payload.get("name") or "New task",
            "description": payload.get("description") or "",
            "assigned_to": payload.get("assigned_to"),
            "due_date": payload.get("due_date"),
            "priority": payload.get("priority"),
            "status": payload.get("status", "open"),
        }
        return execute_tool(
            "create_record",
            {
                "entity_type": "task",
                "fields": fields,
                "reasoning": payload.get("reasoning", "Created through deterministic Idjwi command."),
            },
            request.company_id,
            principal=principal,
            llm_available=False,
        )

    if command in ("remember", "save_memory"):
        require("save_memory")
        key = payload.get("key")
        if not key:
            raise HTTPException(status_code=400, detail="payload.key is required")
        return remember(
            company_id=request.company_id,
            key=key,
            value=payload.get("value", ""),
            memory_type=payload.get("memory_type", "note"),
            owner=payload.get("owner", "operator"),
        )

    if command in ("list_memory", "memory"):
        require("save_memory")
        return {"entries": recall(request.company_id, limit=int(payload.get("limit", 100)))}

    if command in ("forget", "delete_memory"):
        require("save_memory")
        key = payload.get("key")
        if not key:
            raise HTTPException(status_code=400, detail="payload.key is required")
        return forget(request.company_id, key)

    if command in ("memory_summary", "summarize_memory"):
        require("save_memory")
        return summary(request.company_id)

    if command in ("approve_action", "approve_recommendation"):
        require("approve_actions")
        approval_id = payload.get("approval_id")
        if not approval_id:
            raise HTTPException(status_code=400, detail="payload.approval_id is required")
        return approve_recommendation(approval_id, request.company_id)

    return {
        "error": "Unknown deterministic command.",
        "valid_commands": [
            "list_overdue_tasks",
            "task_summary",
            "search_people",
            "search_intelligence",
            "create_task",
            "remember",
            "list_memory",
            "forget",
            "memory_summary",
            "approve_action",
        ],
    }


@router.get("/idjwi-memory")
def list_idjwi_memory(
    company_id: str = Query(...),
    review_status: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    memory_type: Optional[str] = Query(None),
    limit: int = Query(200),
    x_idjwi_api_key: Optional[str] = Header(None),
    x_idjwi_role: Optional[str] = Header(None),
    x_idjwi_user: Optional[str] = Header(None),
):
    from copilot.idjwi_memory import recall, search, summary
    from copilot.idjwi_security import principal_from_headers, require_api_key

    api_gate = require_api_key(x_idjwi_api_key)
    if not api_gate.get("allowed"):
        raise HTTPException(status_code=401, detail=api_gate.get("reason"))

    principal_from_headers(company_id=company_id, user_id=x_idjwi_user, role=x_idjwi_role)
    bounded_limit = max(1, min(int(limit or 200), 500))
    if q or memory_type:
        entries = search(
            company_id,
            q=q or "",
            review_status=review_status or None,
            memory_type=memory_type or None,
            limit=bounded_limit,
        )
    else:
        entries = recall(
            company_id,
            review_status=review_status or None,
            memory_type=memory_type or None,
            limit=bounded_limit,
        )
    return {
        "company_id": company_id,
        "entries": entries,
        "summary": summary(company_id),
    }


@router.post("/idjwi-memory")
def create_idjwi_memory(
    request: MemoryCreateRequest,
    x_idjwi_api_key: Optional[str] = Header(None),
    x_idjwi_role: Optional[str] = Header(None),
    x_idjwi_user: Optional[str] = Header(None),
):
    from copilot.idjwi_memory import remember, summary
    from copilot.idjwi_security import principal_from_headers, require_api_key

    api_gate = require_api_key(x_idjwi_api_key)
    if not api_gate.get("allowed"):
        raise HTTPException(status_code=401, detail=api_gate.get("reason"))

    principal_from_headers(company_id=request.company_id, user_id=x_idjwi_user, role=x_idjwi_role)
    if not request.key.strip():
        raise HTTPException(status_code=400, detail="key is required")

    result = remember(
        company_id=request.company_id,
        key=request.key.strip(),
        value=request.value,
        memory_type=request.memory_type or "business_rule",
        scope=request.scope or "company",
        owner=request.owner or "idjwi",
        confidence=float(request.confidence if request.confidence is not None else 1.0),
        source=request.source or "operator_stated",
        review_status=request.review_status or "confirmed",
        metadata=request.metadata or {},
        expires_at=request.expires_at,
    )
    if not result.get("saved"):
        raise HTTPException(status_code=400, detail=result.get("reason", "memory save failed"))
    return {**result, "summary": summary(request.company_id)}


@router.post("/idjwi-memory/{memory_id}/review")
def review_idjwi_memory(
    memory_id: str,
    request: MemoryReviewRequest,
    x_idjwi_api_key: Optional[str] = Header(None),
    x_idjwi_role: Optional[str] = Header(None),
    x_idjwi_user: Optional[str] = Header(None),
):
    from copilot.idjwi_memory import review_memory
    from copilot.idjwi_security import principal_from_headers, require_api_key

    api_gate = require_api_key(x_idjwi_api_key)
    if not api_gate.get("allowed"):
        raise HTTPException(status_code=401, detail=api_gate.get("reason"))

    principal_from_headers(company_id=request.company_id, user_id=x_idjwi_user, role=x_idjwi_role)
    result = review_memory(request.company_id, memory_id, request.action)
    if not result.get("updated"):
        raise HTTPException(status_code=400, detail=result.get("reason", "memory review failed"))
    return result


@router.patch("/idjwi-memory/{memory_id}")
def update_idjwi_memory(
    memory_id: str,
    request: MemoryUpdateRequest,
    x_idjwi_api_key: Optional[str] = Header(None),
    x_idjwi_role: Optional[str] = Header(None),
    x_idjwi_user: Optional[str] = Header(None),
):
    from copilot.idjwi_memory import update_memory
    from copilot.idjwi_security import principal_from_headers, require_api_key

    api_gate = require_api_key(x_idjwi_api_key)
    if not api_gate.get("allowed"):
        raise HTTPException(status_code=401, detail=api_gate.get("reason"))

    principal_from_headers(company_id=request.company_id, user_id=x_idjwi_user, role=x_idjwi_role)
    result = update_memory(request.company_id, memory_id, request.patch or {})
    if not result.get("updated"):
        raise HTTPException(status_code=400, detail=result.get("reason", "memory update failed"))
    return result


@router.post("/idjwi-memory/{memory_id}/usage")
def mark_idjwi_memory_used(
    memory_id: str,
    request: MemoryUsageRequest,
    x_idjwi_api_key: Optional[str] = Header(None),
    x_idjwi_role: Optional[str] = Header(None),
    x_idjwi_user: Optional[str] = Header(None),
):
    from copilot.idjwi_memory import mark_used
    from copilot.idjwi_security import principal_from_headers, require_api_key

    api_gate = require_api_key(x_idjwi_api_key)
    if not api_gate.get("allowed"):
        raise HTTPException(status_code=401, detail=api_gate.get("reason"))

    principal_from_headers(company_id=request.company_id, user_id=x_idjwi_user, role=x_idjwi_role)
    result = mark_used(request.company_id, memory_id)
    if not result.get("updated"):
        raise HTTPException(status_code=400, detail=result.get("reason", "memory usage update failed"))
    return result


@router.get("/idjwi-memory/conflicts")
def list_idjwi_memory_conflicts(
    company_id: str = Query(...),
    limit: int = Query(100),
    x_idjwi_api_key: Optional[str] = Header(None),
    x_idjwi_role: Optional[str] = Header(None),
    x_idjwi_user: Optional[str] = Header(None),
):
    from copilot.idjwi_memory import conflicts
    from copilot.idjwi_security import principal_from_headers, require_api_key

    api_gate = require_api_key(x_idjwi_api_key)
    if not api_gate.get("allowed"):
        raise HTTPException(status_code=401, detail=api_gate.get("reason"))

    principal_from_headers(company_id=company_id, user_id=x_idjwi_user, role=x_idjwi_role)
    return {"company_id": company_id, "conflicts": conflicts(company_id, limit=max(1, min(limit, 500)))}


@router.get("/health/full")
def idjwi_full_health():
    """Detailed health snapshot for Idjwi's providers, memory, events, and workflows."""
    from copilot.idjwi_observability import health_snapshot
    from copilot.idjwi_workflows import list_workflows

    return {
        **health_snapshot(),
        "workflows": list_workflows()["workflows"],
    }


@router.get("/workflows")
def idjwi_workflows():
    """List deterministic no-LLM workflows."""
    from copilot.idjwi_workflows import list_workflows
    return list_workflows()


@router.post("/workflows/run")
def idjwi_run_workflow(
    request: WorkflowRequest,
    x_idjwi_api_key: Optional[str] = Header(None),
    x_idjwi_role: Optional[str] = Header(None),
    x_idjwi_user: Optional[str] = Header(None),
):
    """Run a deterministic Idjwi workflow without requiring an LLM."""
    from copilot.idjwi_workflows import run_workflow

    def command_runner(command: str, payload: dict):
        return deterministic_command(
            CommandRequest(command=command, company_id=request.company_id, payload=payload),
            x_idjwi_api_key=x_idjwi_api_key,
            x_idjwi_role=x_idjwi_role,
            x_idjwi_user=x_idjwi_user,
        )

    return run_workflow(
        company_id=request.company_id,
        workflow=request.workflow,
        payload=request.payload or {},
        command_runner=command_runner,
    )


@idjwi_router.post("/workflow/{name}")
def idjwi_workflow_by_name(
    name: str,
    request: IdjwiWorkflowRequest,
    x_idjwi_api_key: Optional[str] = Header(None),
    x_idjwi_role: Optional[str] = Header(None),
    x_idjwi_user: Optional[str] = Header(None),
):
    """Run a no-LLM Idjwi workflow by name, suitable for Railway cron calls."""
    return idjwi_run_workflow(
        WorkflowRequest(workflow=name, company_id=request.company_id, payload=request.payload or {}),
        x_idjwi_api_key=x_idjwi_api_key,
        x_idjwi_role=x_idjwi_role,
        x_idjwi_user=x_idjwi_user,
    )


@idjwi_router.get("/events")
def idjwi_events(
    company_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    x_idjwi_api_key: Optional[str] = Header(None),
    x_idjwi_role: Optional[str] = Header(None),
    x_idjwi_user: Optional[str] = Header(None),
):
    """Read Idjwi observability events."""
    from copilot.idjwi_security import authorize_capability, principal_from_headers, require_api_key
    from copilot.idjwi_observability import list_events

    api_gate = require_api_key(x_idjwi_api_key)
    if not api_gate.get("allowed"):
        raise HTTPException(status_code=401, detail=api_gate.get("reason"))

    principal = principal_from_headers(company_id=company_id or "", user_id=x_idjwi_user, role=x_idjwi_role)
    gate = authorize_capability("read_company_data", principal=principal, llm_available=False)
    if not gate.get("allowed"):
        raise HTTPException(status_code=403, detail=gate.get("reason"))

    return list_events(company_id=company_id, event_type=event_type, status=status, limit=limit)


@router.get("/evals")
def idjwi_evals():
    """Run lightweight Idjwi registry and no-LLM capability evals."""
    from copilot.idjwi_evals import run_registry_evals
    return run_registry_evals()


@router.post("/memory/migrate")
def idjwi_migrate_memory(company_id: str = Query(...)):
    """Copy legacy copilot/agent memory into unified Idjwi memory."""
    from copilot.idjwi_memory import migrate_legacy, summary
    result = migrate_legacy(company_id)
    return {**result, "summary": summary(company_id)}


@router.post("/ask/stream")
async def ask_stream(
    request: AskRequest,
    x_idjwi_api_key: Optional[str] = Header(None),
    x_idjwi_role: Optional[str] = Header(None),
    x_idjwi_user: Optional[str] = Header(None),
):
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

    from copilot.idjwi_security import principal_from_headers, require_api_key
    api_gate = require_api_key(x_idjwi_api_key)
    if not api_gate.get("allowed"):
        raise HTTPException(status_code=401, detail=api_gate.get("reason"))
    principal = principal_from_headers(
        company_id=request.company_id,
        user_id=x_idjwi_user,
        role=x_idjwi_role,
    )

    async def generate():
        try:
            async for event_json in ask_stream_events(
                question=request.question,
                company_id=request.company_id,
                history=request.history or [],
                principal=principal,
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

    # ── Supabase live probe — show distinct company_ids in each entity ──────────
    supabase_probe: dict = {}
    try:
        from data_sources.supabase_source import list_records, configured as sb_configured, _request, _headers
        if sb_configured():
            for entity in ("persons", "enterprises", "products", "tasks", "transactions"):
                try:
                    # Fetch up to 20 rows without company_id filter to reveal all company_ids
                    import requests as _req
                    from config.settings import settings as _cfg
                    url = f"{_cfg.supabase_url.rstrip('/')}/rest/v1/{entity}"
                    r = _req.get(
                        url,
                        headers=_headers(),
                        params={"select": "company_id", "limit": 100},
                        timeout=10,
                    )
                    if r.ok:
                        ids = list({row.get("company_id") for row in r.json() if isinstance(row, dict)})
                        matched = [row for row in r.json() if isinstance(row, dict) and row.get("company_id") == company_id]
                        supabase_probe[entity] = {
                            "distinct_company_ids": ids,
                            "rows_matching_requested_company_id": len(matched),
                            "total_rows_sampled": len(r.json()),
                        }
                    else:
                        supabase_probe[entity] = {"error": f"HTTP {r.status_code}"}
                except Exception as exc:
                    supabase_probe[entity] = {"error": str(exc)}
        else:
            supabase_probe["status"] = "Supabase not configured (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing)"
    except Exception as exc:
        supabase_probe["error"] = str(exc)

    return {
        "company_id":          company_id,
        "has_data":            any_data,
        "diagnosis":           "Data found — copilot should work" if any_data
                               else "No data found for this company_id. "
                                    "Re-run ETL after confirming Railway is redeployed.",
        "raw_row_counts":      raw_counts,
        "analytics_companies": analytics_companies,
        "supabase_probe":      supabase_probe,
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

    execution_result = None
    try:
        from agents.approval_gate import execute_approved
        execution_result = execute_approved(engine, approval_id, company_id)
    except Exception as e:
        logger.error("approve_recommendation execution failed: %s", e)
        execution_result = {"executed": False, "error": str(e)}

    return {
        "status":           "approved",
        "approval_id":      approval_id,
        "action_type":      row[1],
        "execution_result": execution_result,
        "message":          f"'{row[2]}' approved.",
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
