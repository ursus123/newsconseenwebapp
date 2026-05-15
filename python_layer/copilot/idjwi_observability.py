"""
Idjwi observability: audit events, tool timing, provider health, and command logs.
"""

import json
import logging
import time
from contextlib import contextmanager
from typing import Optional

from database import get_engine_safe
from sqlalchemy import text

logger = logging.getLogger(__name__)

DDL = """
CREATE TABLE IF NOT EXISTS analytics.idjwi_events (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id  TEXT,
    event_type  TEXT NOT NULL,
    actor       TEXT DEFAULT 'system',
    subject     TEXT,
    metadata    JSONB DEFAULT '{}'::jsonb,
    duration_ms INT,
    status      TEXT DEFAULT 'ok',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_idjwi_events_company
    ON analytics.idjwi_events (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idjwi_events_type
    ON analytics.idjwi_events (event_type, created_at DESC);
"""


def ensure_table(engine=None) -> bool:
    eng = engine or get_engine_safe()
    if not eng:
        return False
    try:
        with eng.connect() as conn:
            conn.execute(text(DDL))
            conn.commit()
        return True
    except Exception as e:
        logger.warning("idjwi_observability.ensure_table failed: %s", e)
        return False


def log_event(
    event_type: str,
    company_id: Optional[str] = None,
    actor: str = "system",
    subject: Optional[str] = None,
    metadata: Optional[dict] = None,
    duration_ms: Optional[int] = None,
    status: str = "ok",
    engine=None,
) -> None:
    eng = engine or get_engine_safe()
    if not eng or not ensure_table(eng):
        logger.info("idjwi_event %s company=%s status=%s", event_type, company_id, status)
        return
    try:
        with eng.connect() as conn:
            conn.execute(text("""
                INSERT INTO analytics.idjwi_events
                    (company_id, event_type, actor, subject, metadata, duration_ms, status)
                VALUES
                    (:company_id, :event_type, :actor, :subject,
                     :metadata::jsonb, :duration_ms, :status)
            """), {
                "company_id": company_id,
                "event_type": event_type,
                "actor": actor,
                "subject": subject,
                "metadata": json.dumps(metadata or {}),
                "duration_ms": duration_ms,
                "status": status,
            })
            conn.commit()
    except Exception as e:
        logger.warning("idjwi_observability.log_event failed: %s", e)


@contextmanager
def timed_event(event_type: str, company_id: Optional[str] = None, subject: Optional[str] = None, metadata: Optional[dict] = None):
    start = time.perf_counter()
    status = "ok"
    try:
        yield
    except Exception:
        status = "error"
        raise
    finally:
        duration_ms = int((time.perf_counter() - start) * 1000)
        log_event(event_type, company_id=company_id, subject=subject, metadata=metadata, duration_ms=duration_ms, status=status)


def health_snapshot() -> dict:
    from .llm_registry import list_models, provider_status
    from .idjwi_memory import ensure_table as memory_ok

    events_ok = ensure_table()
    return {
        "providers": provider_status(),
        "models": list_models(),
        "memory": "ok" if memory_ok() else "unavailable",
        "events": "ok" if events_ok else "unavailable",
    }
