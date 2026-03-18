import logging
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker
from .config import settings

# ------------------------------------------------------------
# Logging
# ------------------------------------------------------------
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


# ------------------------------------------------------------
# Engine Factory
# ------------------------------------------------------------
def get_engine() -> Engine:
    """
    Create and return a shared SQLAlchemy engine using DATABASE_URL
    from environment variables (loaded via Pydantic settings).
    """
    if not settings.database_url:
        raise ValueError("DATABASE_URL is not set in environment variables.")

    try:
        engine = create_engine(
            settings.database_url,
            echo=False,      # set to True for SQL debugging
            future=True      # SQLAlchemy 2.0 style
        )
        return engine
    except Exception as e:
        logger.exception("Failed to create SQLAlchemy engine")
        raise


# ------------------------------------------------------------
# Module-level engine (shared across ETL + FastAPI)
# ------------------------------------------------------------
engine: Engine = get_engine()


# ------------------------------------------------------------
# Session Factory (optional but recommended)
# ------------------------------------------------------------
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


# ------------------------------------------------------------
# Dependency for FastAPI (optional)
# ------------------------------------------------------------
def get_db():
    """
    FastAPI dependency that yields a SQLAlchemy session.
    Not required for your current read-only ETL endpoints,
    but essential once you add write endpoints or metadata tables.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
