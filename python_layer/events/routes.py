import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from database import get_engine_safe
from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

router = APIRouter(prefix="/events", tags=["events"])
logger = logging.getLogger(__name__)


class EventRecord(BaseModel):
    company_id:  Optional[str] = None
    event_type:  str                          # e.g. "task.created"
    entity_type: Optional[str] = None
    entity_id:   Optional[str] = None
    entity_name: Optional[str] = None
    actor_email: Optional[str] = None
    actor_role:  Optional[str] = None
    app_source:  Optional[str] = None
    payload:     Optional[Dict[str, Any]] = None
    occurred_at: Optional[str] = None        # ISO 8601


@router.post("/record")
def record_event(event: EventRecord):
    """
    Fire-and-forget operational event sink.
    Called by dataService after every create/update/delete.
    Always returns 200 — never blocks the caller.
    """
    engine = get_engine_safe()
    if not engine:
        return {"ok": True, "stored": False}

    occurred = datetime.now(timezone.utc)
    if event.occurred_at:
        try:
            occurred = datetime.fromisoformat(event.occurred_at.replace("Z", "+00:00"))
        except Exception:
            pass

    payload_json = None
    if event.payload:
        try:
            payload_json = json.dumps(event.payload)
        except Exception:
            pass

    try:
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO analytics.operational_events
                        (company_id, event_type, entity_type, entity_id, entity_name,
                         actor_email, actor_role, app_source, payload, occurred_at)
                    VALUES
                        (:company_id, :event_type, :entity_type, :entity_id, :entity_name,
                         :actor_email, :actor_role, :app_source,
                         CAST(:payload AS jsonb), :occurred_at)
                """),
                {
                    "company_id":  event.company_id,
                    "event_type":  event.event_type,
                    "entity_type": event.entity_type,
                    "entity_id":   event.entity_id,
                    "entity_name": event.entity_name,
                    "actor_email": event.actor_email,
                    "actor_role":  event.actor_role,
                    "app_source":  event.app_source,
                    "payload":     payload_json,
                    "occurred_at": occurred,
                },
            )
        return {"ok": True, "stored": True}
    except Exception as exc:
        logger.warning("events/record: failed to store event — %s", exc)
        return {"ok": True, "stored": False}


@router.get("/stream")
def get_event_stream(
    company_id: str,
    limit: int = 100,
    entity_type: Optional[str] = None,
):
    """List recent operational events for a company (newest first)."""
    engine = get_engine_safe()
    if not engine:
        return {"events": []}

    try:
        with engine.connect() as conn:
            conditions = ["company_id = :company_id"]
            params: Dict[str, Any] = {"company_id": company_id, "limit": min(limit, 500)}

            if entity_type:
                conditions.append("entity_type = :entity_type")
                params["entity_type"] = entity_type

            query = f"""
                SELECT id, company_id, event_type, entity_type, entity_id, entity_name,
                       actor_email, actor_role, app_source, payload, occurred_at
                FROM analytics.operational_events
                WHERE {" AND ".join(conditions)}
                ORDER BY occurred_at DESC
                LIMIT :limit
            """
            rows = conn.execute(text(query), params).fetchall()

        events = []
        for r in rows:
            row = dict(r._mapping)
            if row.get("occurred_at"):
                row["occurred_at"] = str(row["occurred_at"])
            events.append(row)

        return {"events": events, "count": len(events)}
    except Exception as exc:
        logger.warning("events/stream: failed — %s", exc)
        return {"events": [], "count": 0}
