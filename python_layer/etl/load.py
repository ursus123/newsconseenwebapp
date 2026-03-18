import pandas as pd
from sqlalchemy import text
from database import engine


def load_dataframe(df: pd.DataFrame, table_name: str, schema: str = "analytics"):
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema};"))
        conn.commit()

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