"""
Unified Idjwi memory.

This is the assistant-level memory layer. Copilot chat and autonomous agents can
share it instead of each keeping isolated memories.
"""

import json
import logging
from typing import Optional

from database import get_engine_safe
from sqlalchemy import text

logger = logging.getLogger(__name__)

DDL = """
CREATE TABLE IF NOT EXISTS analytics.idjwi_memory (
    id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    company_id        TEXT NOT NULL,
    scope             TEXT NOT NULL DEFAULT 'company',
    owner             TEXT NOT NULL DEFAULT 'idjwi',
    memory_type       TEXT NOT NULL,
    key               TEXT NOT NULL,
    value             JSONB NOT NULL,
    confidence        FLOAT DEFAULT 1.0,
    source            TEXT NOT NULL DEFAULT 'operator_stated',
    review_status     TEXT NOT NULL DEFAULT 'confirmed',
    observation_count INT DEFAULT 1,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, scope, owner, memory_type, key)
);
CREATE INDEX IF NOT EXISTS idx_idjwi_memory_company
    ON analytics.idjwi_memory (company_id, scope, owner, memory_type);
ALTER TABLE analytics.idjwi_memory
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'operator_stated';
ALTER TABLE analytics.idjwi_memory
    ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'confirmed';
CREATE INDEX IF NOT EXISTS idx_idjwi_memory_review
    ON analytics.idjwi_memory (company_id, review_status, confidence);
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
        logger.warning("idjwi_memory.ensure_table failed: %s", e)
        return False


def remember(
    company_id: str,
    key: str,
    value,
    memory_type: str = "note",
    scope: str = "company",
    owner: str = "idjwi",
    confidence: float = 1.0,
    source: str = "operator_stated",
    review_status: str = "confirmed",
    engine=None,
) -> dict:
    eng = engine or get_engine_safe()
    if not eng or not ensure_table(eng):
        return {"saved": False, "reason": "database unavailable"}

    payload = value if isinstance(value, dict) else {"value": value}
    try:
        with eng.connect() as conn:
            conn.execute(text("""
                INSERT INTO analytics.idjwi_memory
                    (company_id, scope, owner, memory_type, key, value,
                     confidence, source, review_status, observation_count, updated_at)
                VALUES
                    (:company_id, :scope, :owner, :memory_type, :key,
                     :value::jsonb, :confidence, :source, :review_status, 1, NOW())
                ON CONFLICT (company_id, scope, owner, memory_type, key)
                DO UPDATE SET
                    value = analytics.idjwi_memory.value || EXCLUDED.value,
                    confidence = GREATEST(analytics.idjwi_memory.confidence, EXCLUDED.confidence),
                    source = EXCLUDED.source,
                    review_status = CASE
                        WHEN analytics.idjwi_memory.review_status = 'confirmed' THEN 'confirmed'
                        ELSE EXCLUDED.review_status
                    END,
                    observation_count = analytics.idjwi_memory.observation_count + 1,
                    updated_at = NOW()
            """), {
                "company_id": company_id,
                "scope": scope,
                "owner": owner,
                "memory_type": memory_type,
                "key": key,
                "value": json.dumps(payload),
                "confidence": confidence,
                "source": source,
                "review_status": review_status,
            })
            conn.commit()
        return {
            "saved": True, "key": key, "memory_type": memory_type,
            "scope": scope, "owner": owner, "source": source,
            "review_status": review_status,
        }
    except Exception as e:
        logger.warning("idjwi_memory.remember failed: %s", e)
        return {"saved": False, "reason": str(e)}


def recall(
    company_id: str,
    memory_type: Optional[str] = None,
    key: Optional[str] = None,
    scope: Optional[str] = None,
    owner: Optional[str] = None,
    review_status: Optional[str] = None,
    min_confidence: Optional[float] = None,
    limit: int = 100,
    engine=None,
) -> list[dict]:
    eng = engine or get_engine_safe()
    if not eng or not ensure_table(eng):
        return []

    filters = ["company_id = :company_id"]
    params = {"company_id": company_id, "limit": limit}
    if memory_type:
        filters.append("memory_type = :memory_type")
        params["memory_type"] = memory_type
    if key:
        filters.append("key = :key")
        params["key"] = key
    if scope:
        filters.append("scope = :scope")
        params["scope"] = scope
    if owner:
        filters.append("owner = :owner")
        params["owner"] = owner
    if review_status:
        filters.append("review_status = :review_status")
        params["review_status"] = review_status
    if min_confidence is not None:
        filters.append("confidence >= :min_confidence")
        params["min_confidence"] = min_confidence

    sql = f"""
        SELECT id, scope, owner, memory_type, key, value, confidence,
               source, review_status, observation_count, updated_at
        FROM analytics.idjwi_memory
        WHERE {' AND '.join(filters)}
        ORDER BY observation_count DESC, updated_at DESC
        LIMIT :limit
    """
    try:
        with eng.connect() as conn:
            rows = conn.execute(text(sql), params).fetchall()
        cols = ["id", "scope", "owner", "memory_type", "key", "value",
                "confidence", "source", "review_status",
                "observation_count", "updated_at"]
        return [dict(zip(cols, row)) for row in rows]
    except Exception as e:
        logger.warning("idjwi_memory.recall failed: %s", e)
        return []


def forget(company_id: str, key: str, memory_type: Optional[str] = None, engine=None) -> dict:
    eng = engine or get_engine_safe()
    if not eng or not ensure_table(eng):
        return {"deleted": False, "reason": "database unavailable"}
    filters = ["company_id = :company_id", "key = :key"]
    params = {"company_id": company_id, "key": key}
    if memory_type:
        filters.append("memory_type = :memory_type")
        params["memory_type"] = memory_type
    try:
        with eng.connect() as conn:
            result = conn.execute(text(
                f"DELETE FROM analytics.idjwi_memory WHERE {' AND '.join(filters)}"
            ), params)
            conn.commit()
        return {"deleted": bool(getattr(result, "rowcount", 0)), "key": key}
    except Exception as e:
        logger.warning("idjwi_memory.forget failed: %s", e)
        return {"deleted": False, "reason": str(e)}


def summary(company_id: str, engine=None) -> dict:
    memories = recall(company_id, limit=500, engine=engine)
    by_type = {}
    by_owner = {}
    for memory in memories:
        by_type[memory["memory_type"]] = by_type.get(memory["memory_type"], 0) + 1
        by_owner[memory["owner"]] = by_owner.get(memory["owner"], 0) + 1
    return {"company_id": company_id, "total": len(memories), "by_type": by_type, "by_owner": by_owner}


def migrate_legacy(company_id: str, engine=None) -> dict:
    """Copy legacy copilot_memory and agent_memory rows into idjwi_memory."""
    eng = engine or get_engine_safe()
    if not eng or not ensure_table(eng):
        return {"migrated": 0, "reason": "database unavailable"}

    migrated = 0
    errors = []
    try:
        with eng.connect() as conn:
            rows = conn.execute(text("""
                SELECT memory_type, key, value
                FROM analytics.copilot_memory
                WHERE company_id = :company_id
            """), {"company_id": company_id}).fetchall()
        for memory_type, key, value in rows:
            if recall(company_id, memory_type=memory_type, key=key, owner="copilot", limit=1, engine=eng):
                continue
            result = remember(company_id, key, value, memory_type, owner="copilot", engine=eng)
            migrated += 1 if result.get("saved") else 0
    except Exception as e:
        errors.append(f"copilot_memory: {e}")

    try:
        with eng.connect() as conn:
            rows = conn.execute(text("""
                SELECT agent_name, memory_type, key, value, confidence
                FROM analytics.agent_memory
                WHERE company_id = :company_id
            """), {"company_id": company_id}).fetchall()
        for agent_name, memory_type, key, value, confidence in rows:
            if recall(company_id, memory_type=memory_type, key=key, scope="agent", owner=agent_name, limit=1, engine=eng):
                continue
            result = remember(
                company_id,
                key,
                value,
                memory_type,
                scope="agent",
                owner=agent_name,
                confidence=confidence or 1.0,
                engine=eng,
            )
            migrated += 1 if result.get("saved") else 0
    except Exception as e:
        errors.append(f"agent_memory: {e}")

    return {"company_id": company_id, "migrated": migrated, "errors": errors}
