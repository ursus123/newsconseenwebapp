# ==============================================================
# Phase 4D — Approval Gate
# ==============================================================
# Human-in-the-loop system for agent actions.
# High-risk actions pause and wait for operator approval
# before executing. Stored in analytics.agent_approvals.
#
# Risk levels:
#   auto      — executes immediately, no notification
#   notify    — executes immediately, notifies operator after
#   approve   — pauses until operator approves
#   critical  — always requires explicit approval, never auto
# ==============================================================

import json
import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)

DDL = """
CREATE TABLE IF NOT EXISTS analytics.agent_approvals (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id       TEXT NOT NULL,
    agent_name       TEXT NOT NULL,
    action_type      TEXT NOT NULL,
    action_label     TEXT NOT NULL,
    action_payload   JSONB NOT NULL,
    risk_level       TEXT NOT NULL,
    reasoning        TEXT,
    status           TEXT NOT NULL DEFAULT 'pending',
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    resolved_at      TIMESTAMPTZ,
    resolved_by      TEXT,
    resolution_note  TEXT,
    executed_at      TIMESTAMPTZ,
    execution_result JSONB
);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_company_status
    ON analytics.agent_approvals (company_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_executed
    ON analytics.agent_approvals (company_id, executed_at DESC)
    WHERE executed_at IS NOT NULL;
"""

# Migration: add new columns to existing tables (idempotent)
DDL_MIGRATE = """
ALTER TABLE analytics.agent_approvals
    ADD COLUMN IF NOT EXISTS executed_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS execution_result JSONB;
CREATE INDEX IF NOT EXISTS idx_agent_approvals_executed
    ON analytics.agent_approvals (company_id, executed_at DESC)
    WHERE executed_at IS NOT NULL;
"""

CREATE_AGENT_RUNS_DDL = """
CREATE TABLE IF NOT EXISTS analytics.agent_runs (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id      TEXT NOT NULL,
    agent_name      TEXT NOT NULL,
    trigger         TEXT NOT NULL DEFAULT 'scheduled',
    status          TEXT NOT NULL DEFAULT 'running',
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    actions_taken   INT DEFAULT 0,
    actions_pending INT DEFAULT 0,
    summary         TEXT,
    findings        JSONB DEFAULT '[]'::jsonb,
    error           TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_company
    ON analytics.agent_runs (company_id, agent_name, started_at DESC);
"""


class RiskLevel(str, Enum):
    AUTO     = "auto"      # executes immediately
    NOTIFY   = "notify"    # executes + notifies
    APPROVE  = "approve"   # waits for approval
    CRITICAL = "critical"  # always waits


# Action type → risk level mapping
ACTION_RISK_MAP = {
    # Auto — execute immediately, no record needed
    "read_data":            RiskLevel.AUTO,
    "generate_report":      RiskLevel.AUTO,
    "create_task":          RiskLevel.AUTO,
    "create_follow_up":     RiskLevel.AUTO,
    "update_task_status":   RiskLevel.AUTO,
    "trigger_etl":          RiskLevel.AUTO,
    "flag_record":          RiskLevel.AUTO,  # Phase 13: flags are low-risk, auto

    # Notify — execute + notify operator after
    "internal_alert":       RiskLevel.NOTIFY,
    "update_record":        RiskLevel.NOTIFY,
    "reassign_task":        RiskLevel.NOTIFY,

    # Approve — pause until operator approves
    "send_client_message":  RiskLevel.APPROVE,
    "send_whatsapp":        RiskLevel.APPROVE,
    "send_email":           RiskLevel.APPROVE,
    "create_transaction":   RiskLevel.APPROVE,
    "create_purchase_order":RiskLevel.APPROVE,
    "bulk_update":          RiskLevel.APPROVE,
    "create_person":        RiskLevel.APPROVE,
    "create_product":       RiskLevel.APPROVE,

    # Critical — always requires explicit approval, never auto
    "delete_record":        RiskLevel.CRITICAL,
    "bulk_delete":          RiskLevel.CRITICAL,
    "financial_transfer":   RiskLevel.CRITICAL,
    "send_bulk_message":    RiskLevel.CRITICAL,
}


def ensure_tables(engine) -> None:
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text(DDL))
        conn.execute(text(CREATE_AGENT_RUNS_DDL))
        conn.commit()
    # Best-effort migration for existing deployments
    try:
        from sqlalchemy import text as _t
        with engine.connect() as conn:
            conn.execute(_t(DDL_MIGRATE))
            conn.commit()
    except Exception:
        pass


def get_risk_level(action_type: str) -> RiskLevel:
    return ACTION_RISK_MAP.get(action_type, RiskLevel.APPROVE)


def submit_action(engine, company_id: str, agent_name: str,
                  action_type: str, action_label: str,
                  action_payload: dict, reasoning: str = "") -> dict:
    """
    Submit an agent action through the approval gate.

    Returns:
        {
            "status": "executed" | "pending" | "notified",
            "approval_id": str | None,
            "risk_level": str,
        }
    """
    risk = get_risk_level(action_type)

    if risk == RiskLevel.AUTO:
        # Execute immediately — no record needed
        logger.info("ApprovalGate: AUTO %s/%s", agent_name, action_type)
        return {"status": "executed", "approval_id": None, "risk_level": risk}

    # Store the pending action
    approval_id = str(uuid.uuid4())
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO analytics.agent_approvals
                    (id, company_id, agent_name, action_type, action_label,
                     action_payload, risk_level, reasoning, status)
                VALUES
                    (:id, :company_id, :agent_name, :action_type, :action_label,
                     :action_payload::jsonb, :risk_level, :reasoning,
                     :status)
            """), {
                "id":             approval_id,
                "company_id":     company_id,
                "agent_name":     agent_name,
                "action_type":    action_type,
                "action_label":   action_label,
                "action_payload": json.dumps(action_payload),
                "risk_level":     risk.value,
                "reasoning":      reasoning,
                "status":         "notified" if risk == RiskLevel.NOTIFY else "pending",
            })
            conn.commit()
    except Exception as e:
        logger.warning("ApprovalGate: failed to store action: %s", e)
        return {"status": "error", "error": str(e), "risk_level": risk}

    if risk == RiskLevel.NOTIFY:
        logger.info("ApprovalGate: NOTIFY %s/%s id=%s", agent_name, action_type, approval_id)
        return {"status": "notified", "approval_id": approval_id, "risk_level": risk}

    # APPROVE or CRITICAL — pending
    logger.info("ApprovalGate: PENDING %s/%s id=%s", agent_name, action_type, approval_id)
    return {"status": "pending", "approval_id": approval_id, "risk_level": risk}


def resolve(engine, approval_id: str, decision: str,
            resolved_by: str = "operator",
            note: str = "") -> dict:
    """Approve or reject a pending action."""
    if decision not in ("approved", "rejected"):
        return {"error": "decision must be 'approved' or 'rejected'"}
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("""
                UPDATE analytics.agent_approvals
                SET status = :status,
                    resolved_at = NOW(),
                    resolved_by = :resolved_by,
                    resolution_note = :note
                WHERE id = :id AND status = 'pending'
            """), {
                "status":      decision,
                "resolved_by": resolved_by,
                "note":        note,
                "id":          approval_id,
            })
            conn.commit()
        return {"approval_id": approval_id, "status": decision}
    except Exception as e:
        logger.warning("ApprovalGate: resolve failed: %s", e)
        return {"error": str(e)}


def get_pending(engine, company_id: str) -> list[dict]:
    """Get all pending approvals for a company."""
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT id, agent_name, action_type, action_label,
                       action_payload, risk_level, reasoning, created_at
                FROM analytics.agent_approvals
                WHERE company_id = :company_id AND status = 'pending'
                ORDER BY created_at DESC
                LIMIT 50
            """), {"company_id": company_id}).fetchall()
            cols = ["id", "agent_name", "action_type", "action_label",
                    "action_payload", "risk_level", "reasoning", "created_at"]
            result = []
            for r in rows:
                row = dict(zip(cols, r))
                if isinstance(row.get("action_payload"), str):
                    row["action_payload"] = json.loads(row["action_payload"])
                if row.get("created_at"):
                    row["created_at"] = str(row["created_at"])
                result.append(row)
            return result
    except Exception as e:
        logger.warning("ApprovalGate: get_pending failed: %s", e)
        return []


def get_recent_runs(engine, company_id: str, limit: int = 20) -> list[dict]:
    """Get recent agent run records for a company."""
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT id, agent_name, trigger, status, started_at,
                       finished_at, actions_taken, actions_pending, summary
                FROM analytics.agent_runs
                WHERE company_id = :company_id
                ORDER BY started_at DESC
                LIMIT :limit
            """), {"company_id": company_id, "limit": limit}).fetchall()
            cols = ["id", "agent_name", "trigger", "status", "started_at",
                    "finished_at", "actions_taken", "actions_pending", "summary"]
            return [dict(zip(cols, r)) for r in rows]
    except Exception as e:
        logger.warning("ApprovalGate: get_recent_runs failed: %s", e)
        return []


def execute_approved(engine, approval_id: str, company_id: str) -> dict:
    """
    Phase 13: Execute the Base44 mutation for an already-approved action.

    Called immediately after resolve() when decision == 'approved'.
    Returns the execution result and stamps executed_at + execution_result
    on the approval record.
    """
    # Fetch the approval record
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT id, agent_name, action_type, action_payload
                FROM analytics.agent_approvals
                WHERE id = :id
            """), {"id": approval_id}).fetchone()
    except Exception as e:
        return {"executed": False, "error": f"Could not fetch approval: {e}"}

    if not row:
        return {"executed": False, "error": "Approval record not found"}

    rec_id, agent_name, action_type, action_payload = row
    if isinstance(action_payload, str):
        try:
            action_payload = json.loads(action_payload)
        except Exception:
            action_payload = {}

    # Execute
    from .action_executor import execute_action
    result = execute_action(
        action_type=action_type,
        action_payload=action_payload,
        company_id=company_id,
        agent_name=agent_name,
        engine=engine,
    )

    # Stamp the approval record
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("""
                UPDATE analytics.agent_approvals
                SET executed_at      = NOW(),
                    execution_result = :result::jsonb
                WHERE id = :id
            """), {
                "id":     approval_id,
                "result": json.dumps(result),
            })
            conn.commit()
    except Exception as e:
        logger.warning("ApprovalGate: could not stamp execution result: %s", e)

    return result


def get_executed_history(engine, company_id: str, limit: int = 30) -> list[dict]:
    """Get recently executed agent actions for a company (Phase 13 Executed Actions list)."""
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT id, agent_name, action_type, action_label,
                       risk_level, resolved_by, executed_at,
                       execution_result
                FROM analytics.agent_approvals
                WHERE company_id = :company_id
                  AND executed_at IS NOT NULL
                ORDER BY executed_at DESC
                LIMIT :limit
            """), {"company_id": company_id, "limit": limit}).fetchall()
            cols = ["id", "agent_name", "action_type", "action_label",
                    "risk_level", "resolved_by", "executed_at", "execution_result"]
            result = []
            for r in rows:
                row = dict(zip(cols, r))
                if isinstance(row.get("execution_result"), str):
                    try:
                        row["execution_result"] = json.loads(row["execution_result"])
                    except Exception:
                        pass
                if row.get("executed_at"):
                    row["executed_at"] = str(row["executed_at"])
                result.append(row)
            return result
    except Exception as e:
        logger.warning("ApprovalGate: get_executed_history failed: %s", e)
        return []


def get_actions_this_week(engine, company_id: str) -> dict:
    """
    Return count of executed actions in the last 7 days, broken down by agent.
    Used by AgentDashboard to show 'Actions taken this week: N' per card.
    """
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT agent_name, COUNT(*) as cnt
                FROM analytics.agent_approvals
                WHERE company_id = :company_id
                  AND executed_at >= NOW() - INTERVAL '7 days'
                GROUP BY agent_name
            """), {"company_id": company_id}).fetchall()
            total = sum(r[1] for r in rows)
            by_agent = {r[0]: r[1] for r in rows}
            return {"total": total, "by_agent": by_agent}
    except Exception as e:
        logger.warning("ApprovalGate: get_actions_this_week failed: %s", e)
        return {"total": 0, "by_agent": {}}


def log_run(engine, company_id: str, agent_name: str,
            trigger: str, status: str, summary: str,
            actions_taken: int = 0, actions_pending: int = 0,
            findings: list = None) -> None:
    """Record an agent run in the audit log."""
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO analytics.agent_runs
                    (company_id, agent_name, trigger, status,
                     finished_at, actions_taken, actions_pending,
                     summary, findings)
                VALUES
                    (:company_id, :agent_name, :trigger, :status,
                     NOW(), :actions_taken, :actions_pending,
                     :summary, :findings::jsonb)
            """), {
                "company_id":      company_id,
                "agent_name":      agent_name,
                "trigger":         trigger,
                "status":          status,
                "actions_taken":   actions_taken,
                "actions_pending": actions_pending,
                "summary":         summary,
                "findings":        json.dumps(findings or []),
            })
            conn.commit()
    except Exception as e:
        logger.warning("ApprovalGate: log_run failed: %s", e)
