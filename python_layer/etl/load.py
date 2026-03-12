import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from ..config import settings


def get_engine() -> Engine:
    """
    Returns a SQLAlchemy engine using DATABASE_URL from .env.
    Example:
    postgresql://user:password@host:5432/newsconseen
    """
    if not settings.database_url:
        raise ValueError("DATABASE_URL is not set in environment variables.")
    return create_engine(settings.database_url)


def load_dataframe(df: pd.DataFrame, table_name: str, schema: str = "analytics"):
    """
    Loads a DataFrame into a database table.
    - Creates schema if needed
    - Replaces table on each load (Airflow-friendly)
    """
    engine = get_engine()

    # Ensure schema exists
    with engine.connect() as conn:
        conn.execute(f"CREATE SCHEMA IF NOT EXISTS {schema};")

    # Load table
    df.to_sql(
        table_name,
        engine,
        schema=schema,
        if_exists="replace",
        index=False
    )

    return {
        "status": "success",
        "rows_loaded": len(df),
        "table": f"{schema}.{table_name}"
    }
