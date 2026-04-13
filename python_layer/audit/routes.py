# ==============================================================
# Newsconseen Phase 8 — Audit Trail
# ==============================================================
# Immutable change log across all 7 entities.
#
# Endpoints:
#   POST /audit/log        — record a change event (called by frontend)
#   GET  /audit/log        — list log entries with filters
#   GET  /audit/export     — download filtered log as CSV
#   GET  /audit/summary    — counts by entity_type + action for dashboard
# ==============================================================

import csv
import io
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audit", tags=["Audit Trail"])

# ── In-memory store ───────────────────────────────────────────────────────────
# Survives for the lifetime of the Railway deployment.
# PostgreSQL persistence is additive — writes to both.
_AUDIT_LOG: list[dict] = []
_AUDIT_LOG_MAX = 10_000  # cap to avoid unbounded memory growth

ENTITY_TYPES = {
    "person", "enterprise", "product",
    "task", "transaction", "relationship", "address",
}

ACTIONS = {"created", "updated", "deleted"}


# ── PostgreSQL persistence ────────────────────────────────────────────────────

def ensure_audit_table(engine) -> bool:
    """
    Create audit schema and change_log table if they don't exist.
    Called at startup from app.py lifespan so the table is always ready.
    Returns True on success.
    """
    _STATEMENTS = [
        "CREATE SCHEMA IF NOT EXISTS audit",
        """
        CREATE TABLE IF NOT EXISTS audit.change_log (
            id             SERIAL PRIMARY KEY,
            company_id     TEXT        NOT NULL,
            entity_type    TEXT        NOT NULL,
            entity_id      TEXT,
            entity_name    TEXT,
            action         TEXT        NOT NULL,
            changed_by     TEXT,
            changed_fields JSONB,
            timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_audit_company ON audit.change_log (company_id, timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit.change_log (company_id, entity_type, timestamp DESC)",
    ]
    try:
        with engine.connect() as conn:
            for stmt in _STATEMENTS:
                conn.execute(text(stmt))
            conn.commit()
        logger.info("audit: audit.change_log table ready")
        return True
    except Exception as e:
        logger.warning("audit: table setup skipped — %s", e)
        return False


# Keep backward-compatible alias
_ensure_audit_table = ensure_audit_table


def _pg_insert(entry: dict) -> None:
    """Write an audit entry to PostgreSQL (best-effort, non-blocking)."""
    try:
        from database import get_engine_safe
        engine = get_engine_safe()
        if not engine:
            return
        with engine.connect() as conn:
            conn.execute(
                text("""
                INSERT INTO audit.change_log
                    (company_id, entity_type, entity_id, entity_name,
                     action, changed_by, changed_fields, timestamp)
                VALUES
                    (:company_id, :entity_type, :entity_id, :entity_name,
                     :action, :changed_by, :changed_fields::jsonb, :timestamp)
                """),
                {
                    "company_id":     entry["company_id"],
                    "entity_type":    entry["entity_type"],
                    "entity_id":      entry.get("entity_id"),
                    "entity_name":    entry.get("entity_name"),
                    "action":         entry["action"],
                    "changed_by":     entry.get("changed_by"),
                    "changed_fields": json.dumps(entry.get("changed_fields") or {}),
                    "timestamp":      entry["timestamp"],
                },
            )
            conn.commit()
    except Exception as e:
        logger.debug("audit pg_insert skipped — %s", e)


def _pg_query(
    company_id: str,
    entity_type: Optional[str],
    action: Optional[str],
    changed_by: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
    limit: int,
) -> Optional[list[dict]]:
    """Read from PostgreSQL audit.change_log. Returns None if unavailable."""
    try:
        from database import get_engine_safe
        import pandas as pd
        engine = get_engine_safe()
        if not engine:
            return None

        conditions = ["company_id = :company_id"]
        params: dict = {"company_id": company_id, "limit": limit}

        if entity_type:
            conditions.append("entity_type = :entity_type")
            params["entity_type"] = entity_type
        if action:
            conditions.append("action = :action")
            params["action"] = action
        if changed_by:
            conditions.append("changed_by ILIKE :changed_by")
            params["changed_by"] = f"%{changed_by}%"
        if date_from:
            conditions.append("timestamp >= :date_from")
            params["date_from"] = date_from
        if date_to:
            conditions.append("timestamp <= :date_to")
            params["date_to"] = date_to

        where = " AND ".join(conditions)
        sql = f"""
            SELECT id, company_id, entity_type, entity_id, entity_name,
                   action, changed_by, changed_fields, timestamp
            FROM audit.change_log
            WHERE {where}
            ORDER BY timestamp DESC
            LIMIT :limit
        """
        df = pd.read_sql(sql, engine, params=params)
        if df.empty:
            return []
        records = df.to_dict(orient="records")
        for r in records:
            if hasattr(r.get("timestamp"), "isoformat"):
                r["timestamp"] = r["timestamp"].isoformat()
            if isinstance(r.get("changed_fields"), str):
                try:
                    r["changed_fields"] = json.loads(r["changed_fields"])
                except Exception:
                    r["changed_fields"] = {}
        return records
    except Exception as e:
        logger.debug("audit pg_query skipped — %s", e)
        return None


# ── Pydantic models ───────────────────────────────────────────────────────────

class AuditEntry(BaseModel):
    company_id:     str
    entity_type:    str          # person | enterprise | product | task | transaction | relationship | address
    entity_id:      Optional[str] = None
    entity_name:    Optional[str] = None
    action:         str          # created | updated | deleted
    changed_by:     Optional[str] = None   # user email
    changed_fields: Optional[dict] = None  # {field: {old, new}} for updates
    timestamp:      Optional[str] = None   # ISO8601 UTC; server fills in if absent


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/log", status_code=201)
def log_change(entry: AuditEntry):
    """
    Record a change event.

    Called by the frontend as a fire-and-forget after every create/update/delete:
        fetch(`${RAILWAY_URL}/audit/log`, { method: "POST", body: JSON.stringify(payload) })

    The server timestamps the entry server-side and appends to both
    in-memory store and PostgreSQL audit.change_log.
    """
    record = entry.dict()
    record["timestamp"] = record.get("timestamp") or datetime.now(timezone.utc).isoformat()
    record["entity_type"] = record["entity_type"].lower()
    record["action"]      = record["action"].lower()

    # In-memory (immediate availability)
    _AUDIT_LOG.append(record)
    if len(_AUDIT_LOG) > _AUDIT_LOG_MAX:
        del _AUDIT_LOG[: len(_AUDIT_LOG) - _AUDIT_LOG_MAX]

    # PostgreSQL (durable)
    _pg_insert(record)

    return {"status": "logged", "timestamp": record["timestamp"]}


@router.get("/log")
def get_audit_log(
    company_id:  str            = Query(...),
    entity_type: Optional[str]  = Query(None, description="person|enterprise|product|task|transaction|relationship|address"),
    action:      Optional[str]  = Query(None, description="created|updated|deleted"),
    changed_by:  Optional[str]  = Query(None, description="Filter by user email (partial match)"),
    date_from:   Optional[str]  = Query(None, description="ISO date — e.g. 2026-01-01"),
    date_to:     Optional[str]  = Query(None, description="ISO date — e.g. 2026-12-31"),
    limit:       int            = Query(200, le=1000),
):
    """
    List audit log entries for a company with optional filters.
    Tries PostgreSQL first; falls back to in-memory store.
    """
    # Try PostgreSQL (has full history)
    pg_results = _pg_query(company_id, entity_type, action, changed_by, date_from, date_to, limit)
    if pg_results is not None:
        return {"entries": pg_results, "total": len(pg_results), "source": "postgresql"}

    # Fallback: in-memory
    entries = [e for e in _AUDIT_LOG if e.get("company_id") == company_id]

    if entity_type:
        entries = [e for e in entries if e.get("entity_type") == entity_type.lower()]
    if action:
        entries = [e for e in entries if e.get("action") == action.lower()]
    if changed_by:
        entries = [e for e in entries if changed_by.lower() in (e.get("changed_by") or "").lower()]
    if date_from:
        entries = [e for e in entries if (e.get("timestamp") or "") >= date_from]
    if date_to:
        entries = [e for e in entries if (e.get("timestamp") or "") <= date_to + "T23:59:59"]

    entries.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return {"entries": entries[:limit], "total": len(entries), "source": "memory"}


@router.get("/export")
def export_audit_log(
    company_id:  str           = Query(...),
    entity_type: Optional[str] = Query(None),
    action:      Optional[str] = Query(None),
    changed_by:  Optional[str] = Query(None),
    date_from:   Optional[str] = Query(None),
    date_to:     Optional[str] = Query(None),
):
    """
    Download filtered audit log as CSV.
    Called by the Settings > Audit Trail export button.
    """
    result = get_audit_log(
        company_id=company_id,
        entity_type=entity_type,
        action=action,
        changed_by=changed_by,
        date_from=date_from,
        date_to=date_to,
        limit=1000,
    )
    entries = result["entries"]

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["timestamp", "entity_type", "entity_name", "entity_id",
                    "action", "changed_by", "changed_fields"],
        extrasaction="ignore",
    )
    writer.writeheader()
    for e in entries:
        row = dict(e)
        if isinstance(row.get("changed_fields"), dict):
            row["changed_fields"] = json.dumps(row["changed_fields"])
        writer.writerow(row)

    output.seek(0)
    filename = f"audit_log_{company_id}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/summary")
def audit_summary(company_id: str = Query(...)):
    """
    Return counts by entity_type and action.
    Tries PostgreSQL first (full history); falls back to in-memory store.
    """
    # Try PostgreSQL — has full durable history
    try:
        from database import get_engine_safe
        import pandas as pd
        engine = get_engine_safe()
        if engine:
            df = pd.read_sql(
                text("""
                    SELECT entity_type, action, changed_by
                    FROM audit.change_log
                    WHERE company_id = :company_id
                """),
                engine,
                params={"company_id": company_id},
            )
            if not df.empty:
                by_entity = df["entity_type"].value_counts().to_dict()
                by_action = df["action"].value_counts().to_dict()
                top_users = (
                    df["changed_by"].dropna()
                    .value_counts()
                    .head(5)
                    .to_dict()
                )
                return {
                    "total":     len(df),
                    "by_entity": by_entity,
                    "by_action": by_action,
                    "top_users": top_users,
                    "source":    "postgresql",
                }
    except Exception as e:
        logger.debug("audit summary pg failed — %s", e)

    # Fallback: in-memory store
    from collections import Counter
    entries = [e for e in _AUDIT_LOG if e.get("company_id") == company_id]
    by_entity = Counter(e.get("entity_type", "unknown") for e in entries)
    by_action = Counter(e.get("action", "unknown")      for e in entries)
    by_user   = Counter(e.get("changed_by", "unknown")  for e in entries)
    return {
        "total":     len(entries),
        "by_entity": dict(by_entity.most_common()),
        "by_action": dict(by_action.most_common()),
        "top_users": dict(by_user.most_common(5)),
        "source":    "memory",
    }
