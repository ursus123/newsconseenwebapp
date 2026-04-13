# ==============================================================
# Newsconseen Phase 9 — Workflow Engine API Routes
# ==============================================================
# Trigger-based automation: define once, execute automatically.
#
# Endpoints:
#   GET    /workflows              — list workflows for a company
#   POST   /workflows              — create a new workflow
#   GET    /workflows/{id}         — get a single workflow
#   PUT    /workflows/{id}         — update a workflow
#   DELETE /workflows/{id}         — delete a workflow
#   POST   /workflows/{id}/toggle  — enable / disable
#   POST   /workflows/trigger      — fire matching workflows for an entity event
#   GET    /workflows/runs         — list recent run history for a company
# ==============================================================

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel, Field

from workflows.executor import execute_workflow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workflows", tags=["Workflows"])


# ── In-memory stores ───────────────────────────────────────────────────────────
_WORKFLOWS: dict[str, dict] = {}   # id → WorkflowDefinition dict
_RUN_LOG:   list[dict]      = []
_RUN_LOG_MAX = 2_000


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Pydantic models ────────────────────────────────────────────────────────────

class WorkflowTrigger(BaseModel):
    type:        str                     # manual | entity_created | entity_updated | schedule
    entity_type: Optional[str] = None   # person | enterprise | product | task | transaction
    condition:   Optional[dict] = None  # {field: value} — trigger entity must match


class WorkflowStep(BaseModel):
    step_id:       str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    type:          str                    # create_task | send_alert | update_field | log_note
    label:         Optional[str] = None
    params:        dict = {}
    stop_on_error: bool = False


class WorkflowDefinition(BaseModel):
    company_id:  str
    name:        str
    description: Optional[str] = ""
    trigger:     WorkflowTrigger
    steps:       List[WorkflowStep] = []
    is_active:   bool = True


# ── CRUD ───────────────────────────────────────────────────────────────────────

@router.get("")
def list_workflows(company_id: str = Query(...)):
    """List all workflows for a company, newest first."""
    wfs = [w for w in _WORKFLOWS.values() if w["company_id"] == company_id]
    wfs.sort(key=lambda w: w.get("created_at", ""), reverse=True)
    return {"workflows": wfs, "total": len(wfs)}


@router.post("", status_code=201)
def create_workflow(definition: WorkflowDefinition):
    """Create a new workflow definition."""
    wf_id = str(uuid.uuid4())
    now   = _now_iso()
    record = {
        "id":          wf_id,
        **definition.dict(),
        "created_at":  now,
        "updated_at":  now,
        "run_count":   0,
        "last_run_at": None,
    }
    _WORKFLOWS[wf_id] = record
    logger.info("workflow created: id=%s name=%s company=%s", wf_id, definition.name, definition.company_id)
    return record


@router.get("/runs")
def list_runs(company_id: str = Query(...), limit: int = Query(50, le=500)):
    """List recent workflow run history for a company."""
    runs = [r for r in _RUN_LOG if r.get("company_id") == company_id]
    runs.sort(key=lambda r: r.get("started_at", ""), reverse=True)
    return {"runs": runs[:limit], "total": len(runs)}


@router.get("/{workflow_id}")
def get_workflow(workflow_id: str):
    wf = _WORKFLOWS.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    return wf


@router.put("/{workflow_id}")
def update_workflow(workflow_id: str, definition: WorkflowDefinition):
    if workflow_id not in _WORKFLOWS:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    existing = _WORKFLOWS[workflow_id]
    updated  = {
        **existing,
        **definition.dict(),
        "id":         workflow_id,
        "updated_at": _now_iso(),
        # preserve immutable fields
        "created_at": existing["created_at"],
        "run_count":  existing["run_count"],
        "last_run_at":existing["last_run_at"],
    }
    _WORKFLOWS[workflow_id] = updated
    return updated


@router.delete("/{workflow_id}")
def delete_workflow(workflow_id: str, company_id: str = Query(...)):
    wf = _WORKFLOWS.get(workflow_id)
    if not wf or wf["company_id"] != company_id:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    del _WORKFLOWS[workflow_id]
    return {"status": "deleted", "id": workflow_id}


@router.post("/{workflow_id}/toggle")
def toggle_workflow(workflow_id: str):
    wf = _WORKFLOWS.get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    wf["is_active"]  = not wf["is_active"]
    wf["updated_at"] = _now_iso()
    return {"id": workflow_id, "is_active": wf["is_active"]}


# ── Execution ─────────────────────────────────────────────────────────────────

class TriggerEvent(BaseModel):
    company_id:   str
    trigger_type: str                    # entity_created | entity_updated | manual
    entity_type:  Optional[str] = None  # person | enterprise | product | task | transaction
    entity_data:  Optional[dict] = None # the full entity record that triggered the event
    workflow_id:  Optional[str] = None  # if set, run this specific workflow only


@router.post("/trigger")
def trigger_workflows(event: TriggerEvent):
    """
    Fire all matching active workflows for an entity event.

    Called by the frontend as fire-and-forget after each mutation:
        fetch(`${RAILWAY_URL}/workflows/trigger`, {
            method: "POST",
            body: JSON.stringify({
                company_id:   currentUser.company_id,
                trigger_type: "entity_created",
                entity_type:  "person",
                entity_data:  createdPerson,
            })
        })

    Matching logic:
      - workflow.company_id == event.company_id
      - workflow.trigger.type == event.trigger_type
      - workflow.trigger.entity_type == event.entity_type (if set)
      - workflow.trigger.condition fields all match entity_data (if set)
      - workflow.is_active == True
    """
    triggered = []

    # Build candidate list
    candidates = []
    if event.workflow_id:
        wf = _WORKFLOWS.get(event.workflow_id)
        if wf:
            candidates = [wf]
    else:
        candidates = [
            w for w in _WORKFLOWS.values()
            if w["company_id"] == event.company_id and w.get("is_active")
        ]

    entity_data = event.entity_data or {}
    entity_type = event.entity_type

    # Add internal fields for executor context
    entity_context = {
        **entity_data,
        "_entity_type": entity_type,
    }

    for wf in candidates:
        trig = wf.get("trigger", {})

        # Match trigger type
        if event.workflow_id is None:
            if trig.get("type") != event.trigger_type:
                continue
            if trig.get("entity_type") and trig["entity_type"] != entity_type:
                continue

        # Match conditions (all must match)
        conditions = trig.get("condition") or {}
        if conditions:
            match = all(
                str(entity_data.get(field, "")).lower() == str(val).lower()
                for field, val in conditions.items()
            )
            if not match:
                continue

        # Execute
        started_at = _now_iso()
        try:
            result = execute_workflow(wf, entity_context)
        except Exception as e:
            result = {"status": "error", "error": str(e)}

        # Update run stats on the workflow
        wf["run_count"]   = wf.get("run_count", 0) + 1
        wf["last_run_at"] = started_at

        run_entry = {
            "workflow_id":   wf["id"],
            "workflow_name": wf["name"],
            "company_id":    event.company_id,
            "trigger_type":  event.trigger_type,
            "entity_type":   entity_type,
            "entity_id":     entity_data.get("id"),
            "started_at":    started_at,
            **result,
        }
        _RUN_LOG.append(run_entry)
        if len(_RUN_LOG) > _RUN_LOG_MAX:
            del _RUN_LOG[: len(_RUN_LOG) - _RUN_LOG_MAX]

        triggered.append({
            "workflow_id":   wf["id"],
            "workflow_name": wf["name"],
            "status":        result.get("status"),
            "steps_run":     result.get("steps_run", 0),
        })
        logger.info(
            "workflow triggered: %s for %s/%s → %s",
            wf["name"], entity_type, entity_data.get("id"), result.get("status"),
        )

    return {
        "evaluated":  len(candidates),
        "triggered":  len(triggered),
        "results":    triggered,
    }
