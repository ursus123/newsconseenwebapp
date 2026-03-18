import pandas as pd
from sqlalchemy import text
from ..database import engine


def load_dataframe(df: pd.DataFrame, table_name: str, schema: str = "analytics"):
    """
    Loads a DataFrame into a database table.
    - Uses the shared engine singleton from database.py
    - Creates schema if it doesn't exist
    - Replaces table on each load (Airflow-friendly)
    """
    # Ensure schema exists
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema};"))
        conn.commit()

    # Load table
    df.to_sql(
        table_name,
        engine,
        schema=schema,
        if_exists="replace",
        index=False,
    )

    return {
        "status": "success",
        "rows_loaded": len(df),
        "table": f"{schema}.{table_name}",
    }
