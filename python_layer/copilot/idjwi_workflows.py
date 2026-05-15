"""
Deterministic workflow runner for Idjwi.

Workflows use /copilot/command-compatible steps and can run without an LLM.
"""

import json
import uuid
from datetime import datetime
from typing import Optional

from database import get_engine_safe
from sqlalchemy import text

from .idjwi_observability import log_event

DDL = """
CREATE TABLE IF NOT EXISTS analytics.idjwi_workflow_runs (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL,
    workflow    TEXT NOT NULL,
    status      TEXT NOT NULL,
    input       JSONB DEFAULT '{}'::jsonb,
    steps       JSONB DEFAULT '[]'::jsonb,
    result      JSONB DEFAULT '{}'::jsonb,
    error       TEXT,
    started_at  TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_idjwi_workflow_runs_company
    ON analytics.idjwi_workflow_runs (company_id, started_at DESC);
"""

WORKFLOWS = {
    "overdue_followup": [
        {"command": "list_overdue_tasks", "save_as": "overdue_tasks"},
        {"command": "create_task", "when_nonempty": "overdue_tasks.records", "payload": {
            "title": "Review overdue tasks",
            "description": "Review overdue tasks identified by Idjwi and assign follow-up owners.",
            "priority": "high",
        }},
    ],
    "memory_review": [
        {"command": "memory_summary", "save_as": "memory_summary"},
        {"command": "list_memory", "save_as": "memories"},
    ],
    "daily_ops_snapshot": [
        {"command": "task_summary", "save_as": "task_summary"},
        {"command": "list_overdue_tasks", "save_as": "overdue_tasks"},
        {"command": "search_intelligence", "payload": {"limit": 10}, "save_as": "intelligence"},
    ],
}


def ensure_table(engine=None) -> bool:
    eng = engine or get_engine_safe()
    if not eng:
        return False
    with eng.connect() as conn:
        conn.execute(text(DDL))
        conn.commit()
    return True


def list_workflows() -> dict:
    return {
        "workflows": [
            {"name": name, "steps": len(steps), "llm_required": False}
            for name, steps in WORKFLOWS.items()
        ]
    }


def _get_path(data: dict, path: str):
    cur = data
    for part in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def run_workflow(company_id: str, workflow: str, payload: Optional[dict] = None, command_runner=None) -> dict:
    if workflow not in WORKFLOWS:
        return {"status": "error", "error": f"Unknown workflow: {workflow}", "available": list(WORKFLOWS)}
    if command_runner is None:
        return {"status": "error", "error": "command_runner is required"}

    run_id = str(uuid.uuid4())
    context = dict(payload or {})
    executed_steps = []
    status = "completed"
    error = None

    for step in WORKFLOWS[workflow]:
        if step.get("when_nonempty"):
            value = _get_path(context, step["when_nonempty"])
            if not value:
                executed_steps.append({"command": step["command"], "status": "skipped"})
                continue
        command_payload = {**step.get("payload", {}), **context.get("payload_overrides", {}).get(step["command"], {})}
        result = command_runner(step["command"], command_payload)
        step_result = {"command": step["command"], "status": "ok", "result": result}
        executed_steps.append(step_result)
        if step.get("save_as"):
            context[step["save_as"]] = result
        if isinstance(result, dict) and result.get("error"):
            status = "partial"

    output = {
        "run_id": run_id,
        "workflow": workflow,
        "company_id": company_id,
        "status": status,
        "context": context,
        "steps": executed_steps,
        "finished_at": datetime.utcnow().isoformat(),
    }

    try:
        engine = get_engine_safe()
        if engine and ensure_table(engine):
            with engine.connect() as conn:
                conn.execute(text("""
                    INSERT INTO analytics.idjwi_workflow_runs
                        (id, company_id, workflow, status, input, steps, result, error, finished_at)
                    VALUES
                        (:id, :company_id, :workflow, :status, :input::jsonb,
                         :steps::jsonb, :result::jsonb, :error, NOW())
                """), {
                    "id": run_id,
                    "company_id": company_id,
                    "workflow": workflow,
                    "status": status,
                    "input": json.dumps(payload or {}),
                    "steps": json.dumps(executed_steps, default=str),
                    "result": json.dumps(context, default=str),
                    "error": error,
                })
                conn.commit()
    finally:
        log_event("workflow.run", company_id=company_id, subject=workflow, metadata={"run_id": run_id, "status": status})

    return output
