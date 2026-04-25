# ==============================================================
# Newsconseen — External SQL Database Connector
# ==============================================================
# Connects to any SQL database and extracts records into the
# universal ontology (Person, Enterprise, Product, Transaction).
#
# Supported engines:
#   postgresql  — PostgreSQL, AWS RDS (PostgreSQL), Supabase, Neon
#   mysql       — MySQL, MariaDB, AWS RDS (MySQL), PlanetScale
#   mssql       — Microsoft SQL Server, Azure SQL
#   sqlite      — SQLite file (path passed as credentials["database"])
#
# Credentials dict (passed per-request, never stored):
#   engine_type  str   "postgresql" | "mysql" | "mssql" | "sqlite"
#   host         str   database host or IP
#   port         int   default: 5432 / 3306 / 1433
#   database     str   database (or schema) name
#   username     str   login username
#   password     str   login password
#   query        str   custom SQL to run (optional)
#   table        str   table name to SELECT * FROM (if no query)
#   schema       str   schema prefix for table (optional)
#   ssl          bool  require SSL (default False)
#   entity_type  str   which ontology entity to map rows to
#                      ("people" | "enterprises" | "products" |
#                       "transactions" | "tasks")
#   column_map   dict  {source_col: target_field} operator-confirmed
# ==============================================================

import logging
from typing import Any

from connectors.base import BaseConnector, UnmappedValueError
from connectors.registry import register

logger = logging.getLogger(__name__)

# Default ports per engine
DEFAULT_PORTS = {
    "postgresql": 5432,
    "mysql":      3306,
    "mssql":      1433,
    "sqlite":     None,
}

# Maximum rows to pull in a single connector run (safety limit)
MAX_ROWS = 50_000


def _build_connection_url(credentials: dict) -> str:
    """
    Build a SQLAlchemy connection URL from credentials dict.
    Raises ValueError for unsupported engine_type.
    """
    engine = credentials.get("engine_type", "postgresql").lower()
    host   = credentials.get("host", "localhost")
    port   = credentials.get("port") or DEFAULT_PORTS.get(engine)
    db     = credentials.get("database", "")
    user   = credentials.get("username", "")
    pwd    = credentials.get("password", "")

    # URL-encode password to handle special characters
    from urllib.parse import quote_plus
    pwd_encoded = quote_plus(str(pwd)) if pwd else ""
    user_encoded = quote_plus(str(user)) if user else ""

    if engine == "postgresql":
        driver = "postgresql+psycopg2"
        return f"{driver}://{user_encoded}:{pwd_encoded}@{host}:{port}/{db}"

    elif engine == "mysql":
        # pymysql is lighter than mysqlclient and pure Python
        driver = "mysql+pymysql"
        return f"{driver}://{user_encoded}:{pwd_encoded}@{host}:{port}/{db}"

    elif engine == "mssql":
        # pymssql is the recommended driver for MS SQL on Linux/Railway
        try:
            import pymssql  # noqa: F401
            driver = "mssql+pymssql"
        except ImportError:
            # Fall back to pyodbc if available
            driver = "mssql+pyodbc"
        return f"{driver}://{user_encoded}:{pwd_encoded}@{host}:{port}/{db}"

    elif engine == "sqlite":
        # database = file path for SQLite
        return f"sqlite:///{db}"

    else:
        raise ValueError(
            f"Unsupported engine_type '{engine}'. "
            "Supported: postgresql, mysql, mssql, sqlite"
        )


def test_connection(credentials: dict) -> dict:
    """
    Test a database connection. Returns status dict.
    Called by the /connectors/db/test endpoint.

    Returns:
        {"ok": bool, "message": str, "engine": str, "server_version": str}
    """
    try:
        from sqlalchemy import create_engine, text

        url = _build_connection_url(credentials)
        engine = create_engine(url, connect_args=_ssl_args(credentials), pool_timeout=10)

        with engine.connect() as conn:
            # Engine-specific version query
            engine_type = credentials.get("engine_type", "postgresql").lower()
            if engine_type in ("postgresql",):
                version = conn.execute(text("SELECT version()")).scalar()
            elif engine_type == "mysql":
                version = conn.execute(text("SELECT VERSION()")).scalar()
            elif engine_type == "mssql":
                version = conn.execute(text("SELECT @@VERSION")).scalar()
            elif engine_type == "sqlite":
                version = conn.execute(text("SELECT sqlite_version()")).scalar()
            else:
                version = "unknown"

        return {
            "ok":             True,
            "message":        "Connection successful",
            "engine":         credentials.get("engine_type"),
            "server_version": str(version)[:120] if version else "unknown",
        }

    except ImportError as e:
        driver = str(e).split("'")[1] if "'" in str(e) else "driver"
        return {
            "ok":      False,
            "message": f"Driver not installed: {driver}. "
                       f"Contact support to enable this database type.",
            "engine":  credentials.get("engine_type"),
        }
    except Exception as e:
        return {
            "ok":      False,
            "message": str(e)[:300],
            "engine":  credentials.get("engine_type"),
        }


def list_tables(credentials: dict) -> dict:
    """
    List all tables (and views) in the target database/schema.
    Called by the UI after a successful connection test.

    Returns:
        {"tables": [{"name": str, "schema": str, "type": "table"|"view"}]}
    """
    try:
        from sqlalchemy import create_engine, inspect

        url    = _build_connection_url(credentials)
        engine = create_engine(url, connect_args=_ssl_args(credentials), pool_timeout=10)
        insp   = inspect(engine)

        schema = credentials.get("schema") or None
        tables = [
            {"name": t, "schema": schema or "default", "type": "table"}
            for t in insp.get_table_names(schema=schema)
        ]
        views = [
            {"name": v, "schema": schema or "default", "type": "view"}
            for v in insp.get_view_names(schema=schema)
        ]
        all_objects = sorted(tables + views, key=lambda x: x["name"])

        return {"ok": True, "tables": all_objects, "count": len(all_objects)}

    except Exception as e:
        return {"ok": False, "tables": [], "error": str(e)[:300]}


def get_full_schema(credentials: dict) -> dict:
    """
    Return all tables (and views) with their column names and data types.
    Called by the UI "Explore Full Schema" flow to show the operator the
    complete structure of a connected database before selecting tables to mirror.

    Returns:
        {"ok": bool, "schema": {table: [{"name": str, "type": str}]}, "table_count": int}
    """
    try:
        from sqlalchemy import create_engine, inspect

        url    = _build_connection_url(credentials)
        engine = create_engine(url, connect_args=_ssl_args(credentials), pool_timeout=10)
        insp   = inspect(engine)
        schema = credentials.get("schema") or None

        result: dict = {}
        for table in insp.get_table_names(schema=schema):
            cols = insp.get_columns(table, schema=schema)
            result[table] = [
                {"name": c["name"], "type": str(c["type"]).split("(")[0].upper()}
                for c in cols
            ]
        for view in insp.get_view_names(schema=schema):
            if view not in result:
                try:
                    cols = insp.get_columns(view, schema=schema)
                    result[view] = [
                        {"name": c["name"], "type": str(c["type"]).split("(")[0].upper()}
                        for c in cols
                    ]
                except Exception:
                    result[view] = []

        return {"ok": True, "schema": result, "table_count": len(result)}

    except ImportError as e:
        driver = str(e).split("'")[1] if "'" in str(e) else "driver"
        return {
            "ok":      False,
            "schema":  {},
            "error":   f"Driver not installed: {driver}.",
            "table_count": 0,
        }
    except Exception as e:
        return {"ok": False, "schema": {}, "error": str(e)[:300], "table_count": 0}


def mirror_table(credentials: dict, company_id: str, table_name: str) -> dict:
    """
    Mirror an external table into our PostgreSQL raw schema so the AI copilot
    can query it directly.  Rows are stamped with company_id and written to
    raw.ext_{safe_table_name}.

    Returns:
        {"ok": bool, "table": str, "rows_mirrored": int, "columns": list}
    """
    import re

    # Build a safe PostgreSQL identifier: raw.ext_{alphanumeric_underscore}
    safe_name = "ext_" + re.sub(r"[^a-z0-9_]", "_", table_name.lower())[:48]

    try:
        import pandas as _pd

        # Extract rows from the external DB (reuse preview_query with a high limit)
        creds_copy          = dict(credentials)
        creds_copy["table"] = table_name
        creds_copy.pop("query", None)

        url = _build_connection_url(credentials)
        from sqlalchemy import create_engine, text as _sqlt

        ext_engine = create_engine(url, connect_args=_ssl_args(credentials), pool_timeout=30)
        select_sql = _build_select_sql(creds_copy, limit=10_000)

        with ext_engine.connect() as conn:
            result  = conn.execute(_sqlt(select_sql))
            cols    = list(result.keys())
            rows    = [dict(zip(cols, row)) for row in result.fetchall()]

        if not rows:
            return {
                "ok":          True,
                "table":       f"raw.{safe_name}",
                "rows_mirrored": 0,
                "columns":     cols,
                "note":        "Source table is empty — nothing mirrored.",
            }

        # Stamp company_id
        for row in rows:
            row["company_id"] = company_id

        df = _pd.DataFrame(rows)

        # Write to our raw schema
        try:
            from database import get_engine_safe as _get_engine
        except ImportError:
            return {"ok": False, "error": "Internal database connection not available."}

        int_engine = _get_engine()
        if not int_engine:
            return {"ok": False, "error": "Internal database unavailable — cannot mirror table."}

        df.to_sql(
            safe_name,
            int_engine,
            schema="raw",
            if_exists="replace",
            index=False,
            chunksize=500,
        )

        logger.info(
            "mirror_table: %d rows from '%s' → raw.%s (company=%s)",
            len(rows), table_name, safe_name, company_id,
        )

        return {
            "ok":           True,
            "table":        f"raw.{safe_name}",
            "rows_mirrored": len(rows),
            "columns":      cols,
            "note":         (
                f"Mirrored to raw.{safe_name}. "
                "The AI copilot can now query this table with query_external_table."
            ),
        }

    except Exception as e:
        logger.error("mirror_table failed: %s", e)
        return {"ok": False, "error": str(e)[:300]}


def preview_query(credentials: dict, limit: int = 5) -> dict:
    """
    Run the query/table from credentials and return the first `limit` rows.
    Used by the UI to show a preview before mapping columns.

    Returns:
        {"ok": bool, "columns": [...], "rows": [...], "total_estimate": int}
    """
    try:
        from sqlalchemy import create_engine, text

        sql = _build_select_sql(credentials, limit=limit)
        url = _build_connection_url(credentials)
        engine = create_engine(url, connect_args=_ssl_args(credentials), pool_timeout=15)

        with engine.connect() as conn:
            result = conn.execute(text(sql))
            cols   = list(result.keys())
            rows   = [dict(zip(cols, row)) for row in result.fetchall()]

            # Estimate total rows (best-effort, no EXPLAIN needed)
            count_sql = _build_count_sql(credentials)
            try:
                total = conn.execute(text(count_sql)).scalar() or 0
            except Exception:
                total = len(rows)

        return {
            "ok":             True,
            "columns":        cols,
            "rows":           rows,
            "total_estimate": int(total),
            "sql_used":       sql,
        }

    except Exception as e:
        return {"ok": False, "columns": [], "rows": [], "error": str(e)[:300]}


def _build_select_sql(credentials: dict, limit: int = MAX_ROWS) -> str:
    """Build SELECT SQL from credentials."""
    if credentials.get("query"):
        # Wrap custom query in a subquery to apply limit safely
        inner = credentials["query"].rstrip(";")
        return f"SELECT * FROM ({inner}) AS _q LIMIT {limit}"

    schema = credentials.get("schema", "")
    table  = credentials.get("table", "")
    if not table:
        raise ValueError("Either 'query' or 'table' must be provided in credentials")

    qualified = f"{schema}.{table}" if schema else table

    engine_type = credentials.get("engine_type", "postgresql").lower()
    if engine_type == "mssql":
        return f"SELECT TOP {limit} * FROM {qualified}"
    return f"SELECT * FROM {qualified} LIMIT {limit}"


def _build_count_sql(credentials: dict) -> str:
    """Build COUNT(*) SQL for total estimate."""
    if credentials.get("query"):
        inner = credentials["query"].rstrip(";")
        return f"SELECT COUNT(*) FROM ({inner}) AS _q"
    schema = credentials.get("schema", "")
    table  = credentials.get("table", "")
    qualified = f"{schema}.{table}" if schema else table
    return f"SELECT COUNT(*) FROM {qualified}"


def _ssl_args(credentials: dict) -> dict:
    """Return connect_args for SSL if requested."""
    if credentials.get("ssl"):
        engine_type = credentials.get("engine_type", "postgresql").lower()
        if engine_type == "postgresql":
            return {"sslmode": "require"}
        elif engine_type == "mysql":
            return {"ssl": {"ssl_disabled": False}}
    return {}


@register("postgresql_db")
@register("mysql_db")
@register("aws_rds")
@register("mariadb")
@register("mssql_db")
@register("sqlite_db")
class SqlDatabaseConnector(BaseConnector):
    """
    Connects to any SQL database and extracts rows into the universal ontology.

    The extract() step runs a user-defined SQL query (or SELECT * FROM table)
    against the external database.

    The transform() step maps source columns to target entity fields using
    the operator-confirmed column_map in credentials:
        column_map: {"first_name": "first_name", "role": "person_type", ...}

    If no column_map is provided, raw rows are returned as-is and the
    operator should map them via the Connectors UI before running for real.
    """

    def extract(self) -> list[dict[str, Any]]:
        sql = _build_select_sql(self.credentials, limit=MAX_ROWS)
        url = _build_connection_url(self.credentials)

        try:
            from sqlalchemy import create_engine, text as sqlt

            engine = create_engine(
                url,
                connect_args=_ssl_args(self.credentials),
                pool_timeout=30,
            )
            with engine.connect() as conn:
                result = conn.execute(sqlt(sql))
                cols   = list(result.keys())
                rows   = [dict(zip(cols, row)) for row in result.fetchall()]

            logger.info(
                "SqlDatabaseConnector.extract: fetched %d rows from %s",
                len(rows), self.credentials.get("host", "sqlite"),
            )
            return rows

        except Exception as e:
            logger.error("SqlDatabaseConnector.extract failed: %s", e)
            raise

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        entity_type = self.credentials.get("entity_type", "people")
        column_map  = self.credentials.get("column_map", {})

        transformed: dict[str, list] = {
            "people":        [],
            "enterprises":   [],
            "products":      [],
            "transactions":  [],
            "tasks":         [],
            "relationships": [],
        }

        for raw in raw_records:
            try:
                record = self._map_record(raw, column_map, entity_type)
                if record:
                    transformed[entity_type].append(self.scope(record))
            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value)
                self.run_stats["skipped"] += 1
            except Exception as e:
                logger.warning("SqlDatabaseConnector.transform: row skipped — %s", e)
                self.run_stats["skipped"] += 1

        return {k: v for k, v in transformed.items() if v}

    def _map_record(
        self,
        raw: dict,
        column_map: dict,
        entity_type: str,
    ) -> dict | None:
        """
        Apply column_map to a raw row, producing a record ready for Base44.

        column_map example:
            {
                "emp_id":       "external_id",
                "full_name":    "full_name",
                "job_title":    "person_subtype",
                "dept":         "enterprise_name",
                "hire_date":    "created_date",
                "active":       "status",
            }

        Fields not in column_map are passed through as-is.
        """
        if not column_map:
            # No mapping — pass raw row through; operator reviews in UI
            return dict(raw)

        record: dict = {}
        for src_col, target_field in column_map.items():
            value = raw.get(src_col)
            if value is None:
                continue

            # Taxonomy fields — run through map_value
            if target_field in ("person_type", "enterprise_type", "item_type"):
                try:
                    value = self.map_value(str(value), target_field)
                except UnmappedValueError:
                    raise

            # Boolean normalisation for status fields
            if target_field == "status" and isinstance(value, bool):
                value = "active" if value else "inactive"

            # Convert non-string scalars to strings where needed
            if isinstance(value, (bytes, bytearray)):
                value = value.decode("utf-8", errors="replace")

            record[target_field] = value

        # Always stamp external_id if we can find a likely ID column
        if "external_id" not in record:
            for candidate in ("id", "uuid", "record_id", "emp_id", "patient_id"):
                if candidate in raw:
                    record["external_id"] = str(raw[candidate])
                    break

        return record if record else None
