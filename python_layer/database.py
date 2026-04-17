import math
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from config import settings


def _clean_df(df):
    """
    Replace every NaN / NaT in a DataFrame or Series with Python None so that
    FastAPI / Pydantic can serialise the result without a ValidationError.

    Root cause: pandas represents missing values in ALL column types (including
    TEXT columns) as float NaN. When a record has no enterprise_id, pandas stores
    NaN (a float), not None. Pydantic then rejects it because it expects str | None.

    Usage — call this once before any .to_dict() call:
        rows = _clean_df(df).to_dict(orient="records")
        row  = _clean_df(df.iloc[0]).to_dict()

    Also exported from database.py so every module can import it from one place.
    """
    if isinstance(df, pd.DataFrame):
        return df.where(pd.notnull(df), None)
    if isinstance(df, pd.Series):
        return df.where(pd.notnull(df), None)
    return df


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
    Create the 'analytics' and 'raw' schemas in Railway PostgreSQL
    if they do not already exist.

    Called once at app startup so every subsequent load call
    can assume both schemas are present.

    - analytics.*  — aggregated snapshots (time-series, trend analysis)
    - raw.*        — full individual records from Base44 (ML, advanced queries)
    """
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS analytics;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS raw;"))
        conn.commit()
