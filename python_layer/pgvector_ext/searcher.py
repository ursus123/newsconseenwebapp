# ==============================================================
# pgvector Similarity Searcher
# ==============================================================
# Core search functions used by routes and the copilot tool.
#
# Three search modes:
#   search_similar(query_text, ...)  — semantic text query
#   find_similar_to(record_id, ...)  — records like a specific record
#   find_duplicates(records, ...)    — duplicate detection in a dataset
# ==============================================================

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def search_similar(
    query: str,
    company_id: str,
    entity_type: Optional[str] = None,
    limit: int = 10,
    min_similarity: float = 0.65,
    engine=None,
) -> list[dict]:
    """
    Semantic similarity search across indexed entity records.

    Args:
        query:          Natural language query, e.g. "nurse at Kigali branch"
        company_id:     Tenant filter
        entity_type:    Restrict to one entity (people/enterprises/products/
                        transactions/tasks). None = search all.
        limit:          Max results to return
        min_similarity: Cosine similarity threshold (0–1). Higher = stricter.
        engine:         SQLAlchemy engine. If None, uses get_engine_safe().

    Returns list of dicts with: id, entity_type, text_content, similarity
    """
    from pgvector_ext.embedder import get_embedding
    from sqlalchemy import text as sqlt

    if engine is None:
        from database import get_engine_safe
        engine = get_engine_safe()
    if not engine:
        return []

    embedding = get_embedding(query)
    if embedding is None:
        logger.warning("pgvector search: no embedding provider — returning empty results")
        return []

    entity_filter = "AND entity_type = :entity_type" if entity_type else ""

    sql = f"""
        SELECT
            id,
            entity_type,
            text_content,
            ROUND((1 - (embedding <=> :vec::vector))::numeric, 4) AS similarity
        FROM analytics.entity_embeddings
        WHERE company_id = :company_id
          {entity_filter}
          AND (1 - (embedding <=> :vec::vector)) >= :min_sim
        ORDER BY embedding <=> :vec::vector
        LIMIT :limit
    """

    params: dict = {
        "vec":        str(embedding),
        "company_id": company_id,
        "min_sim":    min_similarity,
        "limit":      limit,
    }
    if entity_type:
        params["entity_type"] = entity_type

    try:
        with engine.connect() as conn:
            rows = conn.execute(sqlt(sql), params).fetchall()
        return [
            {
                "id":           row[0],
                "entity_type":  row[1],
                "text_content": row[2],
                "similarity":   float(row[3]),
            }
            for row in rows
        ]
    except Exception as e:
        logger.warning("pgvector search_similar failed: %s", e)
        return []


def find_similar_to(
    record_id: str,
    entity_type: str,
    company_id: str,
    limit: int = 10,
    min_similarity: float = 0.70,
    engine=None,
) -> list[dict]:
    """
    Find records similar to a specific indexed record.
    Uses the stored embedding directly — no new API call needed.

    Use case: "Show me all people similar to client ID 1234"
    """
    from sqlalchemy import text as sqlt

    if engine is None:
        from database import get_engine_safe
        engine = get_engine_safe()
    if not engine:
        return []

    try:
        with engine.connect() as conn:
            # Get the source embedding
            source = conn.execute(sqlt("""
                SELECT embedding, text_content
                FROM analytics.entity_embeddings
                WHERE id = :id AND entity_type = :entity_type AND company_id = :company_id
                LIMIT 1
            """), {
                "id": record_id, "entity_type": entity_type, "company_id": company_id,
            }).fetchone()

            if not source:
                return []

            # Find similar (excluding the source itself)
            rows = conn.execute(sqlt("""
                SELECT
                    id,
                    entity_type,
                    text_content,
                    ROUND((1 - (embedding <=> :source_vec::vector))::numeric, 4) AS similarity
                FROM analytics.entity_embeddings
                WHERE company_id   = :company_id
                  AND entity_type  = :entity_type
                  AND id           != :source_id
                  AND (1 - (embedding <=> :source_vec::vector)) >= :min_sim
                ORDER BY embedding <=> :source_vec::vector
                LIMIT :limit
            """), {
                "source_vec":  source[0],
                "company_id":  company_id,
                "entity_type": entity_type,
                "source_id":   record_id,
                "min_sim":     min_similarity,
                "limit":       limit,
            }).fetchall()

        return [
            {
                "id":           row[0],
                "entity_type":  row[1],
                "text_content": row[2],
                "similarity":   float(row[3]),
                "source_id":    record_id,
                "source_text":  source[1],
            }
            for row in rows
        ]
    except Exception as e:
        logger.warning("pgvector find_similar_to failed: %s", e)
        return []


def find_duplicates(
    records: list[dict],
    entity_type: str,
    company_id: str,
    similarity_threshold: float = 0.92,
    engine=None,
) -> list[dict]:
    """
    Detect likely duplicate records in a dataset — used in bulk import
    to warn before creating duplicates.

    Compares each incoming record against:
    a) other records in the same batch
    b) already-indexed records in analytics.entity_embeddings

    Returns a list of duplicate pairs:
    [{"record_a": {...}, "record_b": {...}, "similarity": 0.97}, ...]

    similarity_threshold: 0.92 means ~92% similar — tuned to catch
    near-duplicates (same person, slightly different spelling) while
    avoiding false positives (same first name, different person).
    """
    from pgvector_ext.embedder import get_embedding, entity_to_text
    from sqlalchemy import text as sqlt

    if engine is None:
        from database import get_engine_safe
        engine = get_engine_safe()

    if not records:
        return []

    # Generate embeddings for all incoming records
    embedded = []
    for r in records:
        text = entity_to_text(entity_type, r)
        vec  = get_embedding(text) if text else None
        embedded.append({"record": r, "text": text, "embedding": vec})

    duplicates = []

    # a) Within-batch comparison (O(n²) but batches are small <1000 rows)
    for i in range(len(embedded)):
        if embedded[i]["embedding"] is None:
            continue
        for j in range(i + 1, len(embedded)):
            if embedded[j]["embedding"] is None:
                continue
            sim = _cosine_similarity(
                embedded[i]["embedding"], embedded[j]["embedding"]
            )
            if sim >= similarity_threshold:
                duplicates.append({
                    "type":       "within_batch",
                    "record_a":   embedded[i]["record"],
                    "record_b":   embedded[j]["record"],
                    "text_a":     embedded[i]["text"],
                    "text_b":     embedded[j]["text"],
                    "similarity": round(sim, 4),
                })

    # b) Against indexed records in DB
    if engine:
        for item in embedded:
            if item["embedding"] is None:
                continue
            try:
                with engine.connect() as conn:
                    rows = conn.execute(sqlt("""
                        SELECT id, text_content,
                               ROUND((1 - (embedding <=> :vec::vector))::numeric, 4) AS similarity
                        FROM analytics.entity_embeddings
                        WHERE company_id  = :company_id
                          AND entity_type = :entity_type
                          AND (1 - (embedding <=> :vec::vector)) >= :threshold
                        ORDER BY embedding <=> :vec::vector
                        LIMIT 3
                    """), {
                        "vec":        str(item["embedding"]),
                        "company_id": company_id,
                        "entity_type": entity_type,
                        "threshold":  similarity_threshold,
                    }).fetchall()

                for row in rows:
                    duplicates.append({
                        "type":            "against_existing",
                        "incoming_record": item["record"],
                        "incoming_text":   item["text"],
                        "existing_id":     row[0],
                        "existing_text":   row[1],
                        "similarity":      float(row[2]),
                    })
            except Exception as e:
                logger.warning("pgvector duplicate check failed: %s", e)

    return duplicates


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Pure-Python cosine similarity — used for within-batch comparison."""
    if len(a) != len(b):
        return 0.0
    dot   = sum(x * y for x, y in zip(a, b))
    mag_a = sum(x * x for x in a) ** 0.5
    mag_b = sum(x * x for x in b) ** 0.5
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)
