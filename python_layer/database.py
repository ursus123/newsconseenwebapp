from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from config import settings


def get_engine() -> Engine:
    """
    Create and return a SQLAlchemy engine connected to Railway PostgreSQL.

    Called lazily — only when a route or ETL job actually needs the DB.
    This means the app starts cleanly even if DATABASE_URL is not set,
    which is normal in local development against Base44 only.

    Pool sizing:
        pool_size=5       — max persistent connections kept open
        max_overflow=10   — extra connections allowed under burst load
        pool_timeout=30   — seconds to wait for a connection before error
        pool_recycle=1800 — recycle connections every 30 min to avoid
                            Railway's idle connection drops
    """
    if not settings.database_url:
        raise ValueError(
            "DATABASE_URL is not set. "
            "Add it to your .env file or Railway environment variables. "
            "Format: postgresql://user:password@host:port/dbname"
        )

    return create_engine(
        settings.database_url,
        echo=False,
        future=True,
        pool_size=5,
        max_overflow=10,
        pool_timeout=30,
        pool_recycle=1800,
    )


def get_engine_safe() -> Engine | None:
    """
    Same as get_engine() but returns None instead of raising
    if DATABASE_URL is not configured.

    Use this in app.py startup events and health checks where
    a missing DB should warn but not crash the service.
    """
    try:
        return get_engine()
    except ValueError:
        return None


def ensure_analytics_schema(engine: Engine) -> None:
    """
    Create the 'analytics' schema in Railway PostgreSQL if it
    does not already exist.

    Called once at app startup so every subsequent load_dataframe()
    call can assume the schema is there without re-creating it.
    """
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS analytics;"))
        conn.commit()
