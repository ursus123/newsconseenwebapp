# ==============================================================
# pgvector API Routes
# ==============================================================
#
# GET  /pgvector/status             — extension status + row counts
# POST /pgvector/setup              — enable extension + create tables
# POST /pgvector/index/{entity}     — generate embeddings for one entity
# POST /pgvector/index/all          — generate embeddings for all entities
# GET  /pgvector/search             — semantic similarity search
# GET  /pgvector/similar/{id}       — records similar to a specific record
# POST /pgvector/duplicates         — duplicate detection in a dataset
# ==============================================================

import logging
import os
from typing import Any, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pgvector", tags=["pgvector Semantic Search"])

VALID_ENTITIES = {"people", "enterprises", "products", "transactions", "tasks"}


# ── Request models ───────────────────────────────────────────────────────────

class IndexRequest(BaseModel):
    company_id:  str
    batch_size:  int = 50
    force:       bool = False   # re-index even if already indexed


class DuplicateRequest(BaseModel):
    records:     list[dict[str, Any]]
    entity_type: str
    company_id:  str
    threshold:   float = 0.92


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/status")
def pgvector_status():
    """
    Check pgvector installation status and indexed record counts.
    """
    from database import get_engine_safe
    from pgvector_ext.setup import pgvector_status as _status
    from pgvector_ext.embedder import embedding_provider

    engine = get_engine_safe()
    if not engine:
        return {"status": "no_database", "note": "DATABASE_URL not configured"}

    status = _status(engine)
    provider = embedding_provider()

    return {
        **status,
        "embedding_provider": provider,
        "embedding_ready":    provider != "none",
        "setup_guide": None if status.get("extension_installed") else {
            "step_1": "pgvector is pre-installed on Railway PostgreSQL — just run POST /pgvector/setup",
            "step_2": "Set OPENAI_API_KEY or VOYAGE_API_KEY in Railway for embedding generation",
            "step_3": "Run POST /pgvector/index/all to index existing records",
            "step_4": "Use GET /pgvector/search to run semantic queries",
        },
        "railway_env_vars": {
            "OPENAI_API_KEY":  "OpenAI API key (text-embedding-3-small, ~$0.02 per 1M tokens)",
            "VOYAGE_API_KEY":  "Voyage AI key (voyage-large-2, alternative to OpenAI)",
        },
    }


@router.post("/setup")
def pgvector_setup():
    """
    Enable the pgvector extension and create the entity_embeddings table.

    Run this once after Railway deploys. Safe to call multiple times.
    Railway PostgreSQL has pgvector pre-installed — no extra configuration needed.
    """
    from database import get_engine_safe
    from pgvector_ext.setup import ensure_pgvector

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="DATABASE_URL not configured")

    results = ensure_pgvector(engine)
    success = results.get("extension") == "enabled" and results.get("table") == "ready"

    return {
        "success": success,
        "results": results,
        "next_step": (
            "Run POST /pgvector/index/all to index your existing records"
            if success else
            "Check Railway logs for errors"
        ),
    }


@router.post("/index/{entity_type}")
def index_entity(entity_type: str, request: IndexRequest):
    """
    Generate embeddings for all records of one entity type.

    Reads from raw.<entity> table (populated by ETL) and upserts
    embeddings into analytics.entity_embeddings.

    entity_type: people | enterprises | products | transactions | tasks
    """
    if entity_type not in VALID_ENTITIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid entity. Valid: {sorted(VALID_ENTITIES)}",
        )

    from database import get_engine_safe
    from pgvector_ext.embedder import index_entity_records, embedding_provider

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="No database connection")

    if embedding_provider() == "none":
        raise HTTPException(
            status_code=503,
            detail="No embedding provider configured. Set OPENAI_API_KEY or VOYAGE_API_KEY in Railway.",
        )

    # Read raw records for this entity and company
    try:
        df = pd.read_sql(
            f"SELECT * FROM raw.{entity_type} WHERE company_id = %(cid)s",
            engine,
            params={"cid": request.company_id},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read raw.{entity_type}: {e}")

    if df.empty:
        return {
            "status":  "skipped",
            "reason":  f"No records in raw.{entity_type} for company {request.company_id}",
            "note":    "Run POST /cron/etl-all first to populate raw tables",
        }

    # Skip already-indexed records unless force=True
    records = df.to_dict(orient="records")
    if not request.force:
        try:
            from sqlalchemy import text as sqlt
            with engine.connect() as conn:
                already = conn.execute(sqlt("""
                    SELECT id FROM analytics.entity_embeddings
                    WHERE entity_type = :et AND company_id = :cid
                """), {"et": entity_type, "cid": request.company_id}).fetchall()
            indexed_ids = {r[0] for r in already}
            records = [r for r in records if str(r.get("id", "")) not in indexed_ids]
        except Exception:
            pass  # table might not exist yet — index everything

    if not records:
        return {"status": "skipped", "reason": "All records already indexed. Use force=true to re-index."}

    result = index_entity_records(
        entity_type=entity_type,
        records=records,
        company_id=request.company_id,
        engine=engine,
        batch_size=request.batch_size,
    )

    return {
        "entity_type": entity_type,
        "total_records": len(df),
        "records_to_index": len(records),
        **result,
    }


@router.post("/index/all")
def index_all_entities(request: IndexRequest):
    """
    Generate embeddings for ALL entity types for a company.

    This is the "first-time setup" call — run after ETL has populated
    the raw tables. Subsequent ETL runs will index new records automatically
    (if wired up via the ETL emit hooks).
    """
    from database import get_engine_safe
    from pgvector_ext.embedder import embedding_provider

    engine = get_engine_safe()
    if not engine:
        raise HTTPException(status_code=503, detail="No database connection")

    if embedding_provider() == "none":
        raise HTTPException(
            status_code=503,
            detail="No embedding provider. Set OPENAI_API_KEY or VOYAGE_API_KEY.",
        )

    results = {}
    for entity in VALID_ENTITIES:
        try:
            df = pd.read_sql(
                f"SELECT * FROM raw.{entity} WHERE company_id = %(cid)s",
                engine,
                params={"cid": request.company_id},
            )
            if df.empty:
                results[entity] = {"status": "skipped", "reason": "no raw records"}
                continue

            from pgvector_ext.embedder import index_entity_records
            r = index_entity_records(
                entity_type=entity,
                records=df.to_dict(orient="records"),
                company_id=request.company_id,
                engine=engine,
                batch_size=request.batch_size,
            )
            results[entity] = r
        except Exception as e:
            results[entity] = {"status": "error", "detail": str(e)}
            logger.warning("pgvector index_all: %s failed — %s", entity, e)

    total_indexed = sum(r.get("indexed", 0) for r in results.values())
    return {
        "company_id":    request.company_id,
        "total_indexed": total_indexed,
        "results":       results,
    }


@router.get("/search")
def semantic_search(
    query:       str   = Query(..., description="Natural language query"),
    company_id:  str   = Query(...),
    entity_type: Optional[str] = Query(None, description="people|enterprises|products|transactions|tasks"),
    limit:       int   = Query(10, le=50),
    min_similarity: float = Query(0.65, ge=0.0, le=1.0),
):
    """
    Semantic similarity search across all indexed records.

    Examples:
      /pgvector/search?query=nurse at Kigali branch&company_id=abc&entity_type=people
      /pgvector/search?query=overdue school fee&company_id=abc&entity_type=transactions
      /pgvector/search?query=expired medication&company_id=abc&entity_type=products

    Returns records ranked by semantic similarity, not keyword match.
    "Nurse" will match "Registered Nurse", "RN", "clinical staff", etc.
    """
    if entity_type and entity_type not in VALID_ENTITIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid entity_type. Valid: {sorted(VALID_ENTITIES)}",
        )

    from pgvector_ext.searcher import search_similar

    results = search_similar(
        query=query,
        company_id=company_id,
        entity_type=entity_type,
        limit=limit,
        min_similarity=min_similarity,
    )

    return {
        "query":       query,
        "entity_type": entity_type or "all",
        "company_id":  company_id,
        "count":       len(results),
        "results":     results,
        "note":        "similarity is cosine similarity (0–1). Higher = more similar.",
    }


@router.get("/similar/{record_id}")
def find_similar(
    record_id:   str,
    entity_type: str   = Query(...),
    company_id:  str   = Query(...),
    limit:       int   = Query(10, le=50),
    min_similarity: float = Query(0.70, ge=0.0, le=1.0),
):
    """
    Find records semantically similar to a specific record.

    Use case: "Show me all clients similar to this one" (for segmentation,
    duplicate detection, or cross-sell recommendations).

    record_id must already be indexed. Run POST /pgvector/index/{entity} first.
    """
    from pgvector_ext.searcher import find_similar_to

    results = find_similar_to(
        record_id=record_id,
        entity_type=entity_type,
        company_id=company_id,
        limit=limit,
        min_similarity=min_similarity,
    )

    if not results:
        return {
            "record_id":   record_id,
            "entity_type": entity_type,
            "count":       0,
            "results":     [],
            "note":        "No similar records found, or this record is not yet indexed.",
        }

    return {
        "record_id":    record_id,
        "source_text":  results[0].get("source_text") if results else None,
        "entity_type":  entity_type,
        "company_id":   company_id,
        "count":        len(results),
        "results":      results,
    }


@router.post("/duplicates")
def detect_duplicates(request: DuplicateRequest):
    """
    Detect likely duplicate records in a dataset before bulk import.

    Pass your incoming records — this checks them against each other
    AND against already-indexed records in the database.

    threshold: 0.92 = very similar (catches spelling variants, same person
    entered twice). Lower = more matches, more false positives.

    Returns pairs of likely duplicates with similarity scores.
    """
    if request.entity_type not in VALID_ENTITIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid entity_type. Valid: {sorted(VALID_ENTITIES)}",
        )

    from pgvector_ext.searcher import find_duplicates

    pairs = find_duplicates(
        records=request.records,
        entity_type=request.entity_type,
        company_id=request.company_id,
        similarity_threshold=request.threshold,
    )

    return {
        "entity_type":       request.entity_type,
        "records_checked":   len(request.records),
        "duplicate_pairs":   len(pairs),
        "threshold":         request.threshold,
        "duplicates":        pairs,
        "recommendation":    (
            f"Review {len(pairs)} potential duplicate pair(s) before importing."
            if pairs else
            "No duplicates detected. Safe to import."
        ),
    }
