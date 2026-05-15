# ==============================================================
# Phase 4F — Agent Memory
# ==============================================================
# Per-company persistent memory that accumulates over time.
# Stored in analytics.agent_memory (PostgreSQL).
#
# Memory types:
#   observation  — facts the agent has observed about the company
#   preference   — operator preferences learned over time
#   baseline     — statistical baselines for anomaly detection
#   outcome      — results of past agent actions (what worked)
#   calendar     — seasonal patterns the agent has detected
# ==============================================================

import json
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

DDL = """
CREATE TABLE IF NOT EXISTS analytics.agent_memory (
    id              SERIAL PRIMARY KEY,
    company_id      TEXT NOT NULL,
    agent_name      TEXT NOT NULL,
    memory_type     TEXT NOT NULL,
    key             TEXT NOT NULL,
    value           JSONB NOT NULL,
    confidence      FLOAT DEFAULT 1.0,
    observation_count INT DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, agent_name, memory_type, key)
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_company
    ON analytics.agent_memory (company_id, agent_name);
"""


def ensure_tables(engine) -> None:
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text(DDL))
        conn.commit()


def remember(engine, company_id: str, agent_name: str,
             memory_type: str, key: str, value: dict,
             confidence: float = 1.0) -> None:
    """
    Upsert a memory entry. On conflict, merges value and increments
    observation_count — memories strengthen with repetition.
    """
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO analytics.agent_memory
                    (company_id, agent_name, memory_type, key, value,
                     confidence, observation_count, updated_at)
                VALUES
                    (:company_id, :agent_name, :memory_type, :key,
                     :value::jsonb, :confidence, 1, NOW())
                ON CONFLICT (company_id, agent_name, memory_type, key)
                DO UPDATE SET
                    value             = analytics.agent_memory.value || EXCLUDED.value,
                    confidence        = (analytics.agent_memory.confidence + EXCLUDED.confidence) / 2,
                    observation_count = analytics.agent_memory.observation_count + 1,
                    updated_at        = NOW()
            """), {
                "company_id":   company_id,
                "agent_name":   agent_name,
                "memory_type":  memory_type,
                "key":          key,
                "value":        json.dumps(value),
                "confidence":   confidence,
            })
            conn.commit()
    except Exception as e:
        logger.warning("agent_memory.remember failed: %s", e)

    # Also write to unified Idjwi memory so chat and agents share context.
    try:
        from copilot.idjwi_memory import remember as idjwi_remember
        idjwi_remember(
            company_id=company_id,
            key=key,
            value=value,
            memory_type=memory_type,
            scope="agent",
            owner=agent_name,
            confidence=confidence,
            engine=engine,
        )
    except Exception:
        pass


def recall(engine, company_id: str, agent_name: str,
           memory_type: Optional[str] = None,
           key: Optional[str] = None,
           min_confidence: float = 0.0) -> list[dict]:
    """
    Retrieve memories for a company+agent.
    Optionally filter by memory_type, key, or min_confidence.
    Returns list sorted by observation_count DESC (strongest memories first).
    """
    from sqlalchemy import text
    filters = ["company_id = :company_id", "agent_name = :agent_name",
               "confidence >= :min_confidence"]
    params: dict = {"company_id": company_id, "agent_name": agent_name,
                    "min_confidence": min_confidence}

    if memory_type:
        filters.append("memory_type = :memory_type")
        params["memory_type"] = memory_type
    if key:
        filters.append("key = :key")
        params["key"] = key

    sql = f"""
        SELECT id, memory_type, key, value, confidence,
               observation_count, updated_at
        FROM analytics.agent_memory
        WHERE {' AND '.join(filters)}
        ORDER BY observation_count DESC, updated_at DESC
        LIMIT 100
    """
    try:
        from database import get_engine_safe
        eng = engine or get_engine_safe()
        if not eng:
            return []
        with eng.connect() as conn:
            rows = conn.execute(text(sql), params).fetchall()
            cols = ["id", "memory_type", "key", "value",
                    "confidence", "observation_count", "updated_at"]
            native = [dict(zip(cols, r)) for r in rows]
            if native:
                return native
    except Exception as e:
        logger.warning("agent_memory.recall failed: %s", e)

    try:
        from copilot.idjwi_memory import recall as idjwi_recall
        return idjwi_recall(
            company_id=company_id,
            memory_type=memory_type,
            key=key,
            owner=agent_name,
            limit=100,
            engine=engine,
        )
    except Exception:
        return []


def get_baseline(engine, company_id: str, agent_name: str,
                 metric: str) -> Optional[dict]:
    """Retrieve a stored baseline for anomaly detection."""
    memories = recall(engine, company_id, agent_name,
                      memory_type="baseline", key=metric)
    return memories[0]["value"] if memories else None


def update_baseline(engine, company_id: str, agent_name: str,
                    metric: str, current_value: float,
                    window_days: int = 30) -> dict:
    """
    Update a rolling baseline using exponential moving average.
    Returns the updated baseline dict.
    """
    existing = get_baseline(engine, company_id, agent_name, metric)
    if existing:
        alpha = 2 / (window_days + 1)  # EMA smoothing factor
        new_mean  = alpha * current_value + (1 - alpha) * existing.get("mean", current_value)
        new_count = existing.get("count", 0) + 1
        baseline = {
            "mean":       round(new_mean, 4),
            "last_value": current_value,
            "count":      new_count,
            "window_days": window_days,
        }
    else:
        baseline = {
            "mean":       current_value,
            "last_value": current_value,
            "count":      1,
            "window_days": window_days,
        }

    remember(engine, company_id, agent_name, "baseline", metric, baseline)
    return baseline


def get_preferences(engine, company_id: str, agent_name: str) -> dict:
    """Return all operator preferences for this agent as a flat dict."""
    memories = recall(engine, company_id, agent_name, memory_type="preference")
    return {m["key"]: m["value"] for m in memories}


def summarise_memory(engine, company_id: str, agent_name: str) -> dict:
    """Return a count summary of all memory types for this agent."""
    all_memories = recall(engine, company_id, agent_name)
    summary: dict[str, int] = {}
    for m in all_memories:
        summary[m["memory_type"]] = summary.get(m["memory_type"], 0) + 1
    return {
        "company_id":  company_id,
        "agent_name":  agent_name,
        "total":       len(all_memories),
        "by_type":     summary,
    }
