# ==============================================================
# Text → Vector Embedder
# ==============================================================
# Converts entity records into searchable text, then into
# embedding vectors using available embedding APIs.
#
# Priority chain (uses first available):
#   1. OpenAI text-embedding-3-small  (OPENAI_API_KEY)
#   2. Voyage AI voyage-large-2        (VOYAGE_API_KEY)
#   3. None — indexing skipped, similarity unavailable
#
# Entity text representation:
#   Each entity type has a dedicated text serialiser that produces
#   a natural-language string. This string is what gets embedded.
#   Better text = better similarity results.
# ==============================================================

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Cache client instances
_openai_client  = None
_voyage_client  = None


# ── Embedding API wrappers ────────────────────────────────────────────────────

def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        import openai
        _openai_client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _openai_client


def _embed_openai(text: str) -> list[float]:
    client = _get_openai_client()
    resp = client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
    )
    return resp.data[0].embedding


def _embed_voyage(text: str) -> list[float]:
    import requests
    resp = requests.post(
        "https://api.voyageai.com/v1/embeddings",
        headers={
            "Authorization": f"Bearer {os.getenv('VOYAGE_API_KEY')}",
            "Content-Type": "application/json",
        },
        json={"input": [text], "model": "voyage-large-2"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


def get_embedding(text: str) -> Optional[list[float]]:
    """
    Generate an embedding vector for text.

    Returns None if no embedding API is configured — callers should
    handle this gracefully (skip indexing, disable similarity features).
    """
    if not text or not text.strip():
        return None

    # Truncate to ~8000 chars — well within all model context limits
    text = text[:8000].strip()

    if os.getenv("OPENAI_API_KEY"):
        try:
            return _embed_openai(text)
        except Exception as e:
            logger.warning("OpenAI embedding failed: %s", e)

    if os.getenv("VOYAGE_API_KEY"):
        try:
            return _embed_voyage(text)
        except Exception as e:
            logger.warning("Voyage AI embedding failed: %s", e)

    return None


def embedding_provider() -> str:
    """Return which provider is active, or 'none'."""
    if os.getenv("OPENAI_API_KEY"):
        return "openai/text-embedding-3-small"
    if os.getenv("VOYAGE_API_KEY"):
        return "voyage/voyage-large-2"
    return "none"


# ── Entity → text serialisers ─────────────────────────────────────────────────

def entity_to_text(entity_type: str, record: dict) -> str:
    """
    Convert an entity record to a natural-language text string for embedding.

    The richer the text, the better the similarity results.
    All fields are joined with spaces — punctuation is intentionally minimal
    so the embedding model focuses on semantic content.
    """
    fn = _SERIALISERS.get(entity_type)
    if fn is None:
        # Generic fallback: join all string values
        parts = [str(v) for v in record.values() if v and isinstance(v, (str, int, float))]
        return " ".join(parts)
    return fn(record)


def _person_text(r: dict) -> str:
    name = (
        r.get("full_name")
        or f"{r.get('first_name', '')} {r.get('last_name', '')}".strip()
        or r.get("name", "")
    )
    parts = [
        name,
        r.get("person_type", ""),
        r.get("person_subtype", ""),
        r.get("primary_role", ""),
        r.get("role_category", ""),
        r.get("engagement_model", ""),
        r.get("email", ""),
        r.get("phone", ""),
        r.get("department", ""),
        r.get("skills", ""),
        r.get("notes", ""),
        r.get("tags", ""),
        r.get("city", ""),
        r.get("country", ""),
        r.get("enterprise_name", ""),
        r.get("primary_enterprise_name", ""),
    ]
    return " ".join(p for p in parts if p).strip()


def _enterprise_text(r: dict) -> str:
    parts = [
        r.get("name", ""),
        r.get("enterprise_type", ""),
        r.get("enterprise_subtype", ""),
        r.get("enterprise_tier", ""),
        r.get("operating_status", ""),
        r.get("description", ""),
        r.get("industry", ""),
        r.get("city", ""),
        r.get("country", ""),
        r.get("website", ""),
        r.get("notes", ""),
        r.get("tags", ""),
    ]
    return " ".join(p for p in parts if p).strip()


def _product_text(r: dict) -> str:
    parts = [
        r.get("name", ""),
        r.get("item_type", ""),
        r.get("item_class", ""),
        r.get("item_subtype", ""),
        r.get("description", ""),
        r.get("unit_of_measure", ""),
        r.get("supplier_name", ""),
        r.get("brand", ""),
        r.get("sku", ""),
        r.get("tags", ""),
        r.get("notes", ""),
    ]
    return " ".join(p for p in parts if p).strip()


def _transaction_text(r: dict) -> str:
    parts = [
        r.get("transaction_type", ""),
        r.get("description", ""),
        r.get("primary_person", ""),
        r.get("enterprise", ""),
        r.get("counterparty", ""),
        r.get("payment_method", ""),
        r.get("reference_number", ""),
        r.get("invoice_number", ""),
        str(r.get("amount", "")) if r.get("amount") else "",
        r.get("currency", ""),
        r.get("notes", ""),
        r.get("internal_notes", ""),
    ]
    return " ".join(p for p in parts if p).strip()


def _task_text(r: dict) -> str:
    parts = [
        r.get("task_type", ""),
        r.get("task_subtype", ""),
        r.get("title", ""),
        r.get("description", ""),
        r.get("assigned_to", ""),
        r.get("status", ""),
        r.get("priority", ""),
        r.get("outcome", ""),
        r.get("notes", ""),
        r.get("tags", ""),
    ]
    return " ".join(p for p in parts if p).strip()


_SERIALISERS = {
    "people":       _person_text,
    "enterprises":  _enterprise_text,
    "products":     _product_text,
    "transactions": _transaction_text,
    "tasks":        _task_text,
}


# ── Batch indexer ────────────────────────────────────────────────────────────

def index_entity_records(
    entity_type: str,
    records: list[dict],
    company_id: str,
    engine,
    batch_size: int = 50,
) -> dict:
    """
    Generate embeddings for a list of entity records and upsert into
    analytics.entity_embeddings.

    Uses batched API calls to stay within rate limits.
    Skips records with no meaningful text content.

    Returns: {"indexed": N, "skipped": N, "errors": N}
    """
    from sqlalchemy import text as sqlt

    if not records:
        return {"indexed": 0, "skipped": 0, "errors": 0}

    provider = embedding_provider()
    if provider == "none":
        logger.warning(
            "pgvector: no embedding provider configured — "
            "set OPENAI_API_KEY or VOYAGE_API_KEY in Railway"
        )
        return {"indexed": 0, "skipped": len(records), "errors": 0,
                "note": "No embedding provider. Set OPENAI_API_KEY or VOYAGE_API_KEY."}

    indexed = skipped = errors = 0

    for i in range(0, len(records), batch_size):
        batch = records[i: i + batch_size]

        for record in batch:
            record_id = str(record.get("id") or record.get("external_id") or "")
            if not record_id:
                skipped += 1
                continue

            text_content = entity_to_text(entity_type, record)
            if not text_content:
                skipped += 1
                continue

            embedding = get_embedding(text_content)
            if embedding is None:
                skipped += 1
                continue

            try:
                with engine.connect() as conn:
                    conn.execute(sqlt("""
                        INSERT INTO analytics.entity_embeddings
                            (id, entity_type, company_id, text_content, embedding, updated_at)
                        VALUES
                            (:id, :entity_type, :company_id, :text_content,
                             :embedding::vector, NOW())
                        ON CONFLICT (id, entity_type, company_id)
                        DO UPDATE SET
                            text_content = EXCLUDED.text_content,
                            embedding    = EXCLUDED.embedding,
                            updated_at   = NOW();
                    """), {
                        "id":           record_id,
                        "entity_type":  entity_type,
                        "company_id":   company_id,
                        "text_content": text_content,
                        "embedding":    str(embedding),
                    })
                    conn.commit()
                indexed += 1
            except Exception as e:
                logger.warning(
                    "pgvector: failed to index %s/%s — %s", entity_type, record_id, e
                )
                errors += 1

    logger.info(
        "pgvector: indexed %d/%d %s records for company %s (%d errors)",
        indexed, len(records), entity_type, company_id, errors,
    )
    return {"indexed": indexed, "skipped": skipped, "errors": errors}
