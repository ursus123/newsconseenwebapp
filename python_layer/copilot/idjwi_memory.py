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

MEMORY_LAYERS = {
    "global",
    "industry",
    "company",
    "enterprise",
    "user_preference",
    "workflow",
    "decision",
    "correction",
    "source",
    "session",
    "entity",
}

REVIEW_STATUSES = {"confirmed", "inferred", "pending", "conflicting", "expired", "rejected", "archived"}

LIFECYCLE_ACTIONS = {
    "confirm": "confirmed",
    "confirmed": "confirmed",
    "infer": "inferred",
    "inferred": "inferred",
    "mark_conflict": "conflicting",
    "conflict": "conflicting",
    "expire": "expired",
    "expired": "expired",
    "reject": "rejected",
    "rejected": "rejected",
    "archive": "archived",
    "archived": "archived",
}

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
ALTER TABLE analytics.idjwi_memory
    ADD COLUMN IF NOT EXISTS usage_count INT DEFAULT 0;
ALTER TABLE analytics.idjwi_memory
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE analytics.idjwi_memory
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE analytics.idjwi_memory
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE analytics.idjwi_memory
    ADD COLUMN IF NOT EXISTS layer TEXT;
ALTER TABLE analytics.idjwi_memory
    ADD COLUMN IF NOT EXISTS subject_type TEXT;
ALTER TABLE analytics.idjwi_memory
    ADD COLUMN IF NOT EXISTS subject_id TEXT;
ALTER TABLE analytics.idjwi_memory
    ADD COLUMN IF NOT EXISTS provenance JSONB DEFAULT '{}'::jsonb;
ALTER TABLE analytics.idjwi_memory
    ADD COLUMN IF NOT EXISTS conflict_group TEXT;
ALTER TABLE analytics.idjwi_memory
    ADD COLUMN IF NOT EXISTS supersedes_memory_id TEXT;
ALTER TABLE analytics.idjwi_memory
    ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE analytics.idjwi_memory
    ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ;
ALTER TABLE analytics.idjwi_memory
    DROP CONSTRAINT IF EXISTS idjwi_memory_company_id_scope_owner_memory_type_key_key;
CREATE INDEX IF NOT EXISTS idx_idjwi_memory_review
    ON analytics.idjwi_memory (company_id, review_status, confidence);
CREATE INDEX IF NOT EXISTS idx_idjwi_memory_search
    ON analytics.idjwi_memory (company_id, memory_type, key);
CREATE INDEX IF NOT EXISTS idx_idjwi_memory_subject
    ON analytics.idjwi_memory (company_id, layer, subject_type, subject_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_idjwi_memory_unique_context
    ON analytics.idjwi_memory (
        company_id, scope, owner, memory_type, key,
        COALESCE(subject_type, ''), COALESCE(subject_id, '')
    );
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


def _normalise_layer(layer: Optional[str], scope: str, memory_type: str) -> str:
    candidate = (layer or "").strip().lower()
    if candidate in MEMORY_LAYERS:
        return candidate
    scope_key = (scope or "").strip().lower()
    if scope_key in MEMORY_LAYERS:
        return scope_key
    type_key = (memory_type or "").strip().lower()
    if type_key in {"preference", "instruction"}:
        return "user_preference"
    if type_key in {"decision", "approved_decision"}:
        return "decision"
    if type_key in {"correction", "terminology_correction", "data_correction"}:
        return "correction"
    if type_key in {"workflow", "automation_rule"}:
        return "workflow"
    if scope_key.startswith("enterprise"):
        return "enterprise"
    return "company"


def _build_provenance(
    source: str,
    provenance: Optional[dict],
    metadata: Optional[dict],
    owner: str,
    review_status: str,
) -> dict:
    payload = dict(provenance or {})
    payload.setdefault("source", source)
    payload.setdefault("owner", owner)
    payload.setdefault("review_status_at_write", review_status)
    if metadata:
        payload.setdefault("metadata_snapshot", metadata)
    return payload


def _jsonish(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value


def _normalise_row(row: dict) -> dict:
    row["value"] = _jsonish(row.get("value"))
    row["metadata"] = _jsonish(row.get("metadata")) or {}
    row["provenance"] = _jsonish(row.get("provenance")) or {}
    if not row.get("layer"):
        row["layer"] = _normalise_layer(row.get("layer"), row.get("scope", ""), row.get("memory_type", ""))
    return row


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
    metadata: Optional[dict] = None,
    expires_at: Optional[str] = None,
    layer: Optional[str] = None,
    subject_type: Optional[str] = None,
    subject_id: Optional[str] = None,
    provenance: Optional[dict] = None,
    valid_from: Optional[str] = None,
    valid_to: Optional[str] = None,
    engine=None,
) -> dict:
    eng = engine or get_engine_safe()
    if not eng or not ensure_table(eng):
        return {"saved": False, "reason": "database unavailable"}

    payload = value if isinstance(value, dict) else {"value": value}
    normalized_layer = _normalise_layer(layer=layer, scope=scope, memory_type=memory_type)
    normalized_status = review_status if review_status in REVIEW_STATUSES else "pending"
    provenance_payload = _build_provenance(
        source=source,
        provenance=provenance,
        metadata=metadata,
        owner=owner,
        review_status=normalized_status,
    )
    try:
        with eng.connect() as conn:
            existing = conn.execute(text("""
                SELECT id, value, review_status, confidence
                FROM analytics.idjwi_memory
                WHERE company_id = :company_id
                  AND scope = :scope
                  AND owner = :owner
                  AND memory_type = :memory_type
                  AND key = :key
                  AND COALESCE(subject_type, '') = COALESCE(:subject_type, '')
                  AND COALESCE(subject_id, '') = COALESCE(:subject_id, '')
                LIMIT 1
            """), {
                "company_id": company_id,
                "scope": scope,
                "owner": owner,
                "memory_type": memory_type,
                "key": key,
                "subject_type": subject_type,
                "subject_id": subject_id,
            }).fetchone()

            if existing:
                conn.execute(text("""
                    UPDATE analytics.idjwi_memory
                    SET value = analytics.idjwi_memory.value || CAST(:value AS jsonb),
                        confidence = GREATEST(analytics.idjwi_memory.confidence, :confidence),
                        source = :source,
                        review_status = CASE
                            WHEN analytics.idjwi_memory.review_status = 'confirmed' THEN 'confirmed'
                            ELSE :review_status
                        END,
                        metadata = COALESCE(analytics.idjwi_memory.metadata, '{}'::jsonb) || CAST(:metadata AS jsonb),
                        provenance = COALESCE(analytics.idjwi_memory.provenance, '{}'::jsonb) || CAST(:provenance AS jsonb),
                        layer = :layer,
                        subject_type = :subject_type,
                        subject_id = :subject_id,
                        expires_at = COALESCE(CAST(:expires_at AS timestamptz), analytics.idjwi_memory.expires_at),
                        valid_from = COALESCE(CAST(:valid_from AS timestamptz), analytics.idjwi_memory.valid_from),
                        valid_to = COALESCE(CAST(:valid_to AS timestamptz), analytics.idjwi_memory.valid_to),
                        observation_count = analytics.idjwi_memory.observation_count + 1,
                        updated_at = NOW()
                    WHERE id = :memory_id
                """), {
                    "memory_id": existing[0],
                    "value": json.dumps(payload),
                    "confidence": confidence,
                    "source": source,
                    "review_status": normalized_status,
                    "metadata": json.dumps(metadata or {}),
                    "provenance": json.dumps(provenance_payload),
                    "layer": normalized_layer,
                    "subject_type": subject_type,
                    "subject_id": subject_id,
                    "expires_at": expires_at,
                    "valid_from": valid_from,
                    "valid_to": valid_to,
                })
            else:
                conn.execute(text("""
                INSERT INTO analytics.idjwi_memory
                    (company_id, scope, owner, memory_type, key, value,
                     confidence, source, review_status, observation_count,
                     metadata, expires_at, layer, subject_type, subject_id,
                     provenance, valid_from, valid_to, updated_at)
                VALUES
                    (:company_id, :scope, :owner, :memory_type, :key,
                     CAST(:value AS jsonb), :confidence, :source, :review_status, 1,
                     CAST(:metadata AS jsonb), CAST(:expires_at AS timestamptz),
                     :layer, :subject_type, :subject_id, CAST(:provenance AS jsonb),
                     CAST(:valid_from AS timestamptz), CAST(:valid_to AS timestamptz), NOW())
                """), {
                    "company_id": company_id,
                    "scope": scope,
                    "owner": owner,
                    "memory_type": memory_type,
                    "key": key,
                    "value": json.dumps(payload),
                    "confidence": confidence,
                    "source": source,
                    "review_status": normalized_status,
                    "metadata": json.dumps(metadata or {}),
                    "expires_at": expires_at,
                    "layer": normalized_layer,
                    "subject_type": subject_type,
                    "subject_id": subject_id,
                    "provenance": json.dumps(provenance_payload),
                    "valid_from": valid_from,
                    "valid_to": valid_to,
                })
            conn.commit()
        return {
            "saved": True, "key": key, "memory_type": memory_type,
            "scope": scope, "owner": owner, "source": source,
            "review_status": normalized_status, "layer": normalized_layer,
            "subject_type": subject_type, "subject_id": subject_id,
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
    layer: Optional[str] = None,
    subject_type: Optional[str] = None,
    subject_id: Optional[str] = None,
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
    if layer:
        filters.append("layer = :layer")
        params["layer"] = layer
    if subject_type:
        filters.append("subject_type = :subject_type")
        params["subject_type"] = subject_type
    if subject_id:
        filters.append("subject_id = :subject_id")
        params["subject_id"] = subject_id
    if review_status:
        filters.append("review_status = :review_status")
        params["review_status"] = review_status
    if min_confidence is not None:
        filters.append("confidence >= :min_confidence")
        params["min_confidence"] = min_confidence

    sql = f"""
        SELECT id, scope, owner, memory_type, key, value, confidence,
               source, review_status, observation_count, usage_count,
               last_used_at, expires_at, metadata, updated_at,
               layer, subject_type, subject_id, provenance, conflict_group,
               supersedes_memory_id, valid_from, valid_to
        FROM analytics.idjwi_memory
        WHERE {' AND '.join(filters)}
          AND (expires_at IS NULL OR expires_at > NOW() OR review_status IN ('archived', 'expired'))
          AND (valid_to IS NULL OR valid_to > NOW() OR review_status IN ('archived', 'expired'))
        ORDER BY observation_count DESC, updated_at DESC
        LIMIT :limit
    """
    try:
        with eng.connect() as conn:
            rows = conn.execute(text(sql), params).fetchall()
        cols = ["id", "scope", "owner", "memory_type", "key", "value",
                "confidence", "source", "review_status",
                "observation_count", "usage_count", "last_used_at",
                "expires_at", "metadata", "updated_at", "layer",
                "subject_type", "subject_id", "provenance", "conflict_group",
                "supersedes_memory_id", "valid_from", "valid_to"]
        return [_normalise_row(dict(zip(cols, row))) for row in rows]
    except Exception as e:
        logger.warning("idjwi_memory.recall failed: %s", e)
        return []


def search(
    company_id: str,
    q: str = "",
    review_status: Optional[str] = None,
    memory_type: Optional[str] = None,
    layer: Optional[str] = None,
    subject_type: Optional[str] = None,
    subject_id: Optional[str] = None,
    limit: int = 100,
    engine=None,
) -> list[dict]:
    eng = engine or get_engine_safe()
    if not eng or not ensure_table(eng):
        return []

    filters = ["company_id = :company_id"]
    params = {"company_id": company_id, "limit": limit, "q": f"%{(q or '').lower()}%"}
    if review_status and review_status != "all":
        filters.append("review_status = :review_status")
        params["review_status"] = review_status
    if memory_type and memory_type != "all":
        filters.append("memory_type = :memory_type")
        params["memory_type"] = memory_type
    if layer and layer != "all":
        filters.append("layer = :layer")
        params["layer"] = layer
    if subject_type:
        filters.append("subject_type = :subject_type")
        params["subject_type"] = subject_type
    if subject_id:
        filters.append("subject_id = :subject_id")
        params["subject_id"] = subject_id
    if q:
        filters.append("(LOWER(key) LIKE :q OR LOWER(value::text) LIKE :q OR LOWER(COALESCE(source,'')) LIKE :q OR LOWER(COALESCE(provenance::text,'')) LIKE :q)")

    try:
        with eng.connect() as conn:
            rows = conn.execute(text(f"""
                SELECT id, scope, owner, memory_type, key, value, confidence,
                       source, review_status, observation_count, usage_count,
                       last_used_at, expires_at, metadata, updated_at,
                       layer, subject_type, subject_id, provenance, conflict_group,
                       supersedes_memory_id, valid_from, valid_to
                FROM analytics.idjwi_memory
                WHERE {' AND '.join(filters)}
                ORDER BY usage_count DESC, observation_count DESC, updated_at DESC
                LIMIT :limit
            """), params).fetchall()
        cols = ["id", "scope", "owner", "memory_type", "key", "value",
                "confidence", "source", "review_status", "observation_count",
                "usage_count", "last_used_at", "expires_at", "metadata", "updated_at",
                "layer", "subject_type", "subject_id", "provenance", "conflict_group",
                "supersedes_memory_id", "valid_from", "valid_to"]
        return [_normalise_row(dict(zip(cols, row))) for row in rows]
    except Exception as e:
        logger.warning("idjwi_memory.search failed: %s", e)
        return []


def update_memory(
    company_id: str,
    memory_id: str,
    patch: dict,
    engine=None,
) -> dict:
    eng = engine or get_engine_safe()
    if not eng or not ensure_table(eng):
        return {"updated": False, "reason": "database unavailable"}

    allowed = {
        "memory_type", "key", "value", "confidence", "source",
        "review_status", "metadata", "expires_at", "layer",
        "subject_type", "subject_id", "provenance", "conflict_group",
        "supersedes_memory_id", "valid_from", "valid_to", "scope", "owner",
    }
    assignments = []
    params = {"company_id": company_id, "memory_id": memory_id}
    for field, value in (patch or {}).items():
        if field not in allowed:
            continue
        if field in ("value", "metadata", "provenance"):
            assignments.append(f"{field} = CAST(:{field} AS jsonb)")
            params[field] = json.dumps(value if isinstance(value, dict) else {"value": value})
        elif field in ("expires_at", "valid_from", "valid_to"):
            assignments.append(f"{field} = CAST(:{field} AS timestamptz)")
            params[field] = value
        else:
            assignments.append(f"{field} = :{field}")
            params[field] = value
    if not assignments:
        return {"updated": False, "reason": "no supported fields to update"}
    assignments.append("updated_at = NOW()")

    try:
        with eng.connect() as conn:
            row = conn.execute(text(f"""
                UPDATE analytics.idjwi_memory
                SET {', '.join(assignments)}
                WHERE id = :memory_id AND company_id = :company_id
                RETURNING id, key, memory_type, value, review_status, confidence
            """), params).fetchone()
            conn.commit()
        if not row:
            return {"updated": False, "reason": "memory not found"}
        cols = ["id", "key", "memory_type", "value", "review_status", "confidence"]
        return {"updated": True, "memory": dict(zip(cols, row))}
    except Exception as e:
        logger.warning("idjwi_memory.update_memory failed: %s", e)
        return {"updated": False, "reason": str(e)}


def mark_used(company_id: str, memory_id: str, engine=None) -> dict:
    eng = engine or get_engine_safe()
    if not eng or not ensure_table(eng):
        return {"updated": False, "reason": "database unavailable"}
    try:
        with eng.connect() as conn:
            row = conn.execute(text("""
                UPDATE analytics.idjwi_memory
                SET usage_count = COALESCE(usage_count, 0) + 1,
                    last_used_at = NOW(),
                    updated_at = NOW()
                WHERE id = :memory_id AND company_id = :company_id
                RETURNING id, usage_count, last_used_at
            """), {"company_id": company_id, "memory_id": memory_id}).fetchone()
            conn.commit()
        if not row:
            return {"updated": False, "reason": "memory not found"}
        return {"updated": True, "id": row[0], "usage_count": row[1], "last_used_at": row[2]}
    except Exception as e:
        logger.warning("idjwi_memory.mark_used failed: %s", e)
        return {"updated": False, "reason": str(e)}


def conflicts(company_id: str, limit: int = 100, engine=None) -> list[dict]:
    eng = engine or get_engine_safe()
    if not eng or not ensure_table(eng):
        return []
    try:
        with eng.connect() as conn:
            rows = conn.execute(text("""
                SELECT key, memory_type,
                       jsonb_agg(jsonb_build_object(
                           'id', id,
                           'value', value,
                           'source', source,
                           'review_status', review_status,
                           'confidence', confidence,
                           'updated_at', updated_at
                       ) ORDER BY confidence DESC, updated_at DESC) AS memories
                FROM analytics.idjwi_memory
                WHERE company_id = :company_id
                  AND review_status <> 'rejected'
                GROUP BY key, memory_type
                HAVING COUNT(DISTINCT value::text) > 1
                LIMIT :limit
            """), {"company_id": company_id, "limit": limit}).fetchall()
        return [{"key": row[0], "memory_type": row[1], "memories": row[2]} for row in rows]
    except Exception as e:
        logger.warning("idjwi_memory.conflicts failed: %s", e)
        return []


def forget(
    company_id: str,
    key: Optional[str] = None,
    memory_type: Optional[str] = None,
    memory_id: Optional[str] = None,
    layer: Optional[str] = None,
    subject_type: Optional[str] = None,
    subject_id: Optional[str] = None,
    mode: str = "delete",
    engine=None,
) -> dict:
    eng = engine or get_engine_safe()
    if not eng or not ensure_table(eng):
        return {"deleted": False, "reason": "database unavailable"}
    filters = ["company_id = :company_id"]
    params = {"company_id": company_id}
    if memory_id:
        filters.append("id = :memory_id")
        params["memory_id"] = memory_id
    elif key:
        filters.append("key = :key")
        params["key"] = key
    else:
        return {"deleted": False, "reason": "key or memory_id is required"}
    if memory_type:
        filters.append("memory_type = :memory_type")
        params["memory_type"] = memory_type
    if layer:
        filters.append("layer = :layer")
        params["layer"] = layer
    if subject_type:
        filters.append("subject_type = :subject_type")
        params["subject_type"] = subject_type
    if subject_id:
        filters.append("subject_id = :subject_id")
        params["subject_id"] = subject_id
    try:
        with eng.connect() as conn:
            if mode in {"archive", "archived"}:
                result = conn.execute(text(
                    f"UPDATE analytics.idjwi_memory SET review_status = 'archived', updated_at = NOW() WHERE {' AND '.join(filters)}"
                ), params)
            elif mode in {"expire", "expired"}:
                result = conn.execute(text(
                    f"UPDATE analytics.idjwi_memory SET review_status = 'expired', expires_at = NOW(), updated_at = NOW() WHERE {' AND '.join(filters)}"
                ), params)
            else:
                result = conn.execute(text(
                    f"DELETE FROM analytics.idjwi_memory WHERE {' AND '.join(filters)}"
                ), params)
            conn.commit()
        count = getattr(result, "rowcount", 0)
        return {"deleted": bool(count), "affected": count, "key": key, "memory_id": memory_id, "mode": mode}
    except Exception as e:
        logger.warning("idjwi_memory.forget failed: %s", e)
        return {"deleted": False, "reason": str(e)}


def review_memory(
    company_id: str,
    memory_id: str,
    action: str,
    engine=None,
) -> dict:
    eng = engine or get_engine_safe()
    if not eng or not ensure_table(eng):
        return {"updated": False, "reason": "database unavailable"}

    action = (action or "").lower().strip()
    review_status = LIFECYCLE_ACTIONS.get(action)
    if not review_status:
        return {"updated": False, "reason": "action must be confirm, infer, mark_conflict, expire, reject, or archive"}

    confidence_sql = ", confidence = GREATEST(confidence, 0.9)" if review_status == "confirmed" else ""
    try:
        with eng.connect() as conn:
            result = conn.execute(text(f"""
                UPDATE analytics.idjwi_memory
                SET review_status = :review_status,
                    expires_at = CASE WHEN :review_status = 'expired' THEN NOW() ELSE expires_at END,
                    updated_at = NOW()
                    {confidence_sql}
                WHERE id = :memory_id
                  AND company_id = :company_id
                RETURNING id, key, memory_type, review_status, confidence
            """), {
                "company_id": company_id,
                "memory_id": memory_id,
                "review_status": review_status,
            })
            row = result.fetchone()
            conn.commit()
        if not row:
            return {"updated": False, "reason": "memory not found"}
        cols = ["id", "key", "memory_type", "review_status", "confidence"]
        return {"updated": True, "memory": dict(zip(cols, row))}
    except Exception as e:
        logger.warning("idjwi_memory.review_memory failed: %s", e)
        return {"updated": False, "reason": str(e)}


def explain_memory(company_id: str, memory_id: Optional[str] = None, key: Optional[str] = None, engine=None) -> dict:
    entries = recall(company_id, key=key, limit=10, engine=engine) if key else []
    if memory_id:
        eng = engine or get_engine_safe()
        if not eng or not ensure_table(eng):
            return {"found": False, "reason": "database unavailable"}
        try:
            with eng.connect() as conn:
                row = conn.execute(text("""
                    SELECT id, scope, owner, memory_type, key, value, confidence,
                           source, review_status, observation_count, usage_count,
                           last_used_at, expires_at, metadata, updated_at,
                           layer, subject_type, subject_id, provenance, conflict_group,
                           supersedes_memory_id, valid_from, valid_to
                    FROM analytics.idjwi_memory
                    WHERE company_id = :company_id AND id = :memory_id
                    LIMIT 1
                """), {"company_id": company_id, "memory_id": memory_id}).fetchone()
            if row:
                cols = ["id", "scope", "owner", "memory_type", "key", "value",
                        "confidence", "source", "review_status", "observation_count",
                        "usage_count", "last_used_at", "expires_at", "metadata", "updated_at",
                        "layer", "subject_type", "subject_id", "provenance", "conflict_group",
                        "supersedes_memory_id", "valid_from", "valid_to"]
                entries = [_normalise_row(dict(zip(cols, row)))]
        except Exception as e:
            return {"found": False, "reason": str(e)}
    if not entries:
        return {"found": False, "reason": "memory not found"}
    memory = entries[0]
    provenance = memory.get("provenance") or {}
    explanation = [
        f"I remember `{memory.get('key')}` as {memory.get('memory_type')} in the {memory.get('layer')} layer.",
        f"Status is {memory.get('review_status')} with confidence {memory.get('confidence')}.",
        f"Source/provenance: {memory.get('source')}; owner: {memory.get('owner')}.",
    ]
    if memory.get("subject_type") or memory.get("subject_id"):
        explanation.append(f"It only applies to {memory.get('subject_type') or 'subject'} {memory.get('subject_id') or ''}.")
    if provenance:
        explanation.append(f"Provenance details: {provenance}.")
    if memory.get("expires_at") or memory.get("valid_to"):
        explanation.append(f"Lifecycle: expires_at={memory.get('expires_at')}, valid_to={memory.get('valid_to')}.")
    return {"found": True, "memory": memory, "explanation": " ".join(explanation)}


def restrict_memory_to_subject(
    company_id: str,
    memory_id: str,
    subject_type: str,
    subject_id: str,
    layer: str = "enterprise",
    engine=None,
) -> dict:
    result = update_memory(
        company_id,
        memory_id,
        {
            "layer": layer,
            "scope": layer,
            "subject_type": subject_type,
            "subject_id": subject_id,
            "metadata": {"restriction": f"Use only for {subject_type}:{subject_id}"},
        },
        engine=engine,
    )
    if result.get("updated"):
        result.update({
            "memory_id": memory_id,
            "layer": layer,
            "subject_type": subject_type,
            "subject_id": subject_id,
        })
    return result


def summary(company_id: str, engine=None) -> dict:
    memories = recall(company_id, limit=500, engine=engine)
    by_type = {}
    by_owner = {}
    by_layer = {}
    by_status = {}
    for memory in memories:
        by_type[memory["memory_type"]] = by_type.get(memory["memory_type"], 0) + 1
        by_owner[memory["owner"]] = by_owner.get(memory["owner"], 0) + 1
        by_layer[memory.get("layer", "company")] = by_layer.get(memory.get("layer", "company"), 0) + 1
        by_status[memory.get("review_status", "unknown")] = by_status.get(memory.get("review_status", "unknown"), 0) + 1
    return {
        "company_id": company_id,
        "total": len(memories),
        "by_type": by_type,
        "by_owner": by_owner,
        "by_layer": by_layer,
        "by_status": by_status,
        "supported_layers": sorted(MEMORY_LAYERS),
        "supported_statuses": sorted(REVIEW_STATUSES),
    }


def memory_manifest() -> dict:
    return {
        "layers": {
            "global": "Newsconseen product/default brain memory shared across tenants.",
            "industry": "Industry defaults such as clinic, farm, retail, education, logistics.",
            "company": "Tenant/company-wide memory stamped by company_id.",
            "enterprise": "Memory scoped to one enterprise/branch using subject_type and subject_id.",
            "user_preference": "A user's display, terminology, response, or workflow preference.",
            "workflow": "Automation and recurring operating rules.",
            "decision": "Approved decisions and why they were made.",
            "correction": "Corrections to previous assumptions, mappings, labels, or data.",
            "source": "Source registry and enrichment source knowledge.",
            "session": "Short-lived session context.",
            "entity": "Memory about a specific ontology record.",
        },
        "lifecycle": sorted(REVIEW_STATUSES),
        "provenance_fields": ["source", "owner", "metadata", "provenance", "created_at", "updated_at", "confidence", "observation_count"],
        "trust_controls": [
            "confirmed vs inferred/pending memory",
            "expires_at and valid_to lifecycle bounds",
            "conflicting status and conflict detection",
            "subject_type/subject_id enterprise or entity scoping",
            "explain_memory for why Idjwi remembers something",
            "forget with delete/archive/expire modes",
        ],
    }


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
