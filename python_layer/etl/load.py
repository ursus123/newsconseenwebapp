import logging
from datetime import date

import pandas as pd
from sqlalchemy import text

logger = logging.getLogger(__name__)


def _ensure_columns(engine, schema: str, table_name: str, df: pd.DataFrame) -> None:
    """
    Add any columns present in df that are missing from the existing table.
    Runs silently if the table does not yet exist (to_sql will create it).
    """
    from sqlalchemy import inspect as sa_inspect

    try:
        inspector = sa_inspect(engine)
        existing = {c["name"] for c in inspector.get_columns(table_name, schema=schema)}
    except Exception:
        return  # table doesn't exist yet — to_sql will create it

    missing = [c for c in df.columns if c not in existing]
    if not missing:
        return

    type_map = {
        "i": "BIGINT",
        "u": "BIGINT",
        "f": "DOUBLE PRECISION",
        "b": "BOOLEAN",
    }

    with engine.connect() as conn:
        for col in missing:
            kind = df[col].dtype.kind
            sql_type = type_map.get(kind, "TEXT")
            conn.execute(text(
                f'ALTER TABLE {schema}.{table_name} '
                f'ADD COLUMN IF NOT EXISTS "{col}" {sql_type}'
            ))
            logger.info(
                "load_dataframe: added missing column %s (%s) to %s.%s",
                col, sql_type, schema, table_name,
            )
        conn.commit()


def load_dataframe(
    df: pd.DataFrame,
    table_name: str,
    schema: str = "analytics",
    company_id: str | None = None,
) -> dict:
    """
    Append a dated snapshot of df to the Railway PostgreSQL summary table.

    This is the core of the time-variant DataMart. Every ETL run adds one
    row per group per day. Historical rows are never modified or deleted.
    This is what enables trend analysis, Prophet forecasting, and
    period-over-period comparisons in the QueryBuilder.

    Snapshot pattern:
        - Adds snapshot_date (today) and loaded_at (now) columns to df
        - Deletes today's existing rows before inserting (idempotent re-runs)
        - Appends to the table — never replaces it
        - Skips the write if df is empty (prevents false zero anomalies)

    Args:
        df:         Transformed summary DataFrame from any etl/*.py transform
        table_name: Target table name, e.g. "task_summary"
        schema:     PostgreSQL schema, default "analytics"
        company_id: Optional tenant filter — logged for audit purposes

    Returns:
        Dict with status, rows_loaded, table, snapshot_date, company_id
    """
    from database import get_engine

    # ----------------------------------------------------------
    # Guard: never write an empty snapshot
    # An empty DataFrame means Base44 returned no data, which is
    # either a fetch failure or a genuine zero. Either way, writing
    # a zero snapshot would corrupt trend calculations.
    # ----------------------------------------------------------
    if df.empty:
        logger.warning(
            "load_dataframe: skipping empty DataFrame for %s.%s (company_id=%s)",
            schema, table_name, company_id,
        )
        return {
            "status": "skipped",
            "reason": "empty dataframe",
            "rows_loaded": 0,
            "table": f"{schema}.{table_name}",
            "snapshot_date": str(date.today()),
            "company_id": company_id,
        }

    # ----------------------------------------------------------
    # Stamp every row with today's date and the load timestamp.
    # snapshot_date is the primary time axis for all trend queries:
    #   SELECT * FROM analytics.task_summary
    #   WHERE snapshot_date >= NOW() - INTERVAL '30 days'
    # ----------------------------------------------------------
    today = date.today()
    df = df.copy()
    df["snapshot_date"] = today
    df["loaded_at"] = pd.Timestamp.now()
    if company_id:
        df["company_id"] = company_id

    engine = get_engine()

    # ----------------------------------------------------------
    # Idempotent write:
    # Delete today's rows first so re-running the ETL on the same
    # day (after a failure, or a manual trigger) does not double-
    # count. All previous days' snapshots are untouched.
    # ----------------------------------------------------------
    with engine.connect() as conn:
        try:
            conn.execute(text(
                f"DELETE FROM {schema}.{table_name} "
                f"WHERE snapshot_date = :today"
                + (" AND company_id = :company_id" if company_id else "")
            ), {"today": today, **({"company_id": company_id} if company_id else {})})
            conn.commit()
            logger.info(
                "load_dataframe: cleared today's rows from %s.%s",
                schema, table_name,
            )
        except Exception:
            # Table does not exist yet on first run — that is fine.
            # to_sql with if_exists="append" will create it below.
            conn.rollback()
            logger.info(
                "load_dataframe: %s.%s does not exist yet — will be created",
                schema, table_name,
            )

    # ----------------------------------------------------------
    # Schema evolution: add any columns that exist in df but are
    # missing from the existing table. This handles cases where the
    # ETL transform produces new columns after the table was created
    # with an older schema (e.g. people_summary gaining active_count).
    # ----------------------------------------------------------
    _ensure_columns(engine, schema, table_name, df)

    # ----------------------------------------------------------
    # Append this snapshot.
    # if_exists="append" creates the table on first run, then
    # adds rows on every subsequent run. History is never lost.
    # ----------------------------------------------------------
    df.to_sql(
        table_name,
        engine,
        schema=schema,
        if_exists="append",
        index=False,
    )

    logger.info(
        "load_dataframe: wrote %d rows to %s.%s (snapshot_date=%s, company_id=%s)",
        len(df), schema, table_name, today, company_id,
    )

    return {
        "status": "success",
        "rows_loaded": len(df),
        "table": f"{schema}.{table_name}",
        "snapshot_date": str(today),
        "company_id": company_id,
    }


def _sanitize_for_sql(df: pd.DataFrame) -> pd.DataFrame:
    """
    Convert any column that contains Python dicts or lists into JSON strings.

    Base44 returns nested objects in some fields (e.g. address sub-objects,
    relationship arrays). PostgreSQL cannot INSERT a Python dict directly.
    Storing as TEXT preserves the data for JSON-based queries.

    Also handles timezone-aware timestamps: converts to UTC naive to avoid
    SQLAlchemy/psycopg2 timezone insertion issues.
    """
    import json

    df = df.copy()
    for col in df.columns:
        if df[col].dtype != object:
            continue
        # Check sample for dict/list values
        sample = df[col].dropna().head(10)
        if any(isinstance(v, (dict, list)) for v in sample):
            df[col] = df[col].apply(
                lambda x: json.dumps(x, default=str)
                if isinstance(x, (dict, list))
                else x
            )
        # Strip timezone from tz-aware datetime columns stored as object
        elif any(hasattr(v, "tzinfo") for v in sample if not isinstance(v, float)):
            try:
                df[col] = pd.to_datetime(df[col], errors="coerce", utc=True).dt.tz_localize(None)
            except Exception:
                pass

    # Normalise proper datetime columns with timezone to UTC naive
    for col in df.select_dtypes(include=["datetimetz"]).columns:
        df[col] = df[col].dt.tz_localize(None)

    return df


def load_raw(
    df: pd.DataFrame,
    table_name: str,
    schema: str = "raw",
) -> dict:
    """
    Replace the raw table with the full extract from Base44.

    The 'raw' schema stores individual entity records with no aggregation —
    one row per person, product, task, transaction, etc. This is the
    source-of-truth mirror of Base44 in PostgreSQL.

    Why this matters:
        - ML models need individual records (features per person/product)
        - Advanced copilot queries need to filter by name, ID, date range
        - Data validation: compare raw row count to Base44 entity count
        - analytics.* summaries are derived FROM raw.* — not the reverse

    This is a full REPLACE on every ETL run (not an append). The raw schema
    is always the current state of Base44, not a time-series history.
    Use analytics.* tables for trend analysis.

    Args:
        df:         Full extracted DataFrame from any etl/*.extract_*() call
        table_name: Target table, e.g. "people", "tasks", "products"
        schema:     PostgreSQL schema, default "raw"

    Returns:
        Dict with status, rows_loaded, table
    """
    from database import get_engine

    if df.empty:
        logger.warning(
            "load_raw: skipping empty DataFrame for %s.%s",
            schema, table_name,
        )
        return {
            "status":      "skipped",
            "reason":      "empty dataframe",
            "rows_loaded": 0,
            "table":       f"{schema}.{table_name}",
        }

    engine = get_engine()

    df = _sanitize_for_sql(df)
    df["_loaded_at"] = pd.Timestamp.now()

    df.to_sql(
        table_name,
        engine,
        schema=schema,
        if_exists="replace",
        index=False,
    )

    logger.info(
        "load_raw: replaced %s.%s with %d records",
        schema, table_name, len(df),
    )

    return {
        "status":      "success",
        "rows_loaded": len(df),
        "table":       f"{schema}.{table_name}",
    }


def load_dataframe_replace(
    df: pd.DataFrame,
    table_name: str,
    schema: str = "analytics",
) -> dict:
    """
    Replace the entire table with df. No snapshot, no history.

    Use ONLY for reference tables that do not need time series —
    for example a geospatial lookup table or a static config table.
    Never use this for the six core entity summary tables.

    For time-series summary tables, always use load_dataframe().
    """
    from database import get_engine

    if df.empty:
        logger.warning(
            "load_dataframe_replace: skipping empty DataFrame for %s.%s",
            schema, table_name,
        )
        return {
            "status": "skipped",
            "reason": "empty dataframe",
            "rows_loaded": 0,
            "table": f"{schema}.{table_name}",
        }

    engine = get_engine()

    df.to_sql(
        table_name,
        engine,
        schema=schema,
        if_exists="replace",
        index=False,
    )

    logger.info(
        "load_dataframe_replace: replaced %s.%s with %d rows",
        schema, table_name, len(df),
    )

    return {
        "status": "success",
        "rows_loaded": len(df),
        "table": f"{schema}.{table_name}",
    }
