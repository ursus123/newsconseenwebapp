# ==============================================================
# pgvector Database Setup
# ==============================================================
# Enables the pgvector extension and creates the embeddings table.
# Run once at startup via ensure_pgvector() or POST /pgvector/setup.
#
# Railway PostgreSQL supports pgvector natively — no extra install needed.
# ==============================================================

import logging
from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# Embedding dimension — matches OpenAI text-embedding-3-small and Voyage AI
EMBEDDING_DIM = 1536


def ensure_pgvector(engine: Engine) -> dict:
    """
    Enable pgvector extension + create analytics.entity_embeddings table.

    Safe to call multiple times — all statements use IF NOT EXISTS.
    Returns a status dict so callers can log or surface results.
    """
    results = {}

    with engine.connect() as conn:

        # 1. Enable the extension
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            conn.commit()
            results["extension"] = "enabled"
            logger.info("pgvector: extension enabled")
        except Exception as e:
            results["extension"] = f"error: {e}"
            logger.warning("pgvector: could not enable extension — %s", e)
            # If extension fails, nothing else will work
            return results

        # 2. Create embeddings table
        try:
            conn.execute(text(f"""
                CREATE TABLE IF NOT EXISTS analytics.entity_embeddings (
                    id           TEXT        NOT NULL,
                    entity_type  TEXT        NOT NULL,
                    company_id   TEXT        NOT NULL,
                    text_content TEXT,
                    embedding    vector({EMBEDDING_DIM}),
                    indexed_at   TIMESTAMP   DEFAULT NOW(),
                    updated_at   TIMESTAMP   DEFAULT NOW(),
                    PRIMARY KEY (id, entity_type, company_id)
                );
            """))
            conn.commit()
            results["table"] = "ready"
            logger.info("pgvector: analytics.entity_embeddings table ready")
        except Exception as e:
            results["table"] = f"error: {e}"
            logger.warning("pgvector: could not create embeddings table — %s", e)
            return results

        # 3. IVFFlat index for fast cosine similarity search
        # Only useful with 1000+ rows — harmless on smaller datasets
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS entity_embeddings_vector_idx
                ON analytics.entity_embeddings
                USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 100);
            """))
            conn.commit()
            results["index"] = "created"
            logger.info("pgvector: IVFFlat cosine index created")
        except Exception as e:
            # Index creation can fail if not enough rows yet — not fatal
            results["index"] = f"skipped: {e}"
            logger.info("pgvector: index skipped (not enough rows yet) — %s", e)

        # 4. Composite index for filtered searches (entity_type + company_id)
        try:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS entity_embeddings_filter_idx
                ON analytics.entity_embeddings (entity_type, company_id);
            """))
            conn.commit()
            results["filter_index"] = "created"
        except Exception as e:
            results["filter_index"] = f"skipped: {e}"

    return results


def pgvector_status(engine: Engine) -> dict:
    """Check whether pgvector is installed and the embeddings table exists."""
    try:
        with engine.connect() as conn:
            # Check extension
            ext = conn.execute(text(
                "SELECT extname FROM pg_extension WHERE extname = 'vector'"
            )).fetchone()

            # Check table
            tbl = conn.execute(text("""
                SELECT COUNT(*) FROM information_schema.tables
                WHERE table_schema = 'analytics'
                AND table_name = 'entity_embeddings'
            """)).scalar()

            # Row count if table exists
            row_count = 0
            if tbl:
                row_count = conn.execute(text(
                    "SELECT COUNT(*) FROM analytics.entity_embeddings"
                )).scalar()

        return {
            "extension_installed": bool(ext),
            "table_exists":        bool(tbl),
            "indexed_records":     row_count,
            "embedding_dim":       EMBEDDING_DIM,
        }
    except Exception as e:
        return {"extension_installed": False, "error": str(e)}
