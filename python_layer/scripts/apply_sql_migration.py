"""Apply one repository SQL migration transactionally.

Usage:
  python scripts/apply_sql_migration.py ../src/migrations/010_name.sql
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import psycopg2
from dotenv import dotenv_values


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("migration")
    args = parser.parse_args()

    layer_root = Path(__file__).resolve().parents[1]
    repository_root = layer_root.parent
    migrations_root = (repository_root / "src" / "migrations").resolve()
    migration = Path(args.migration).resolve()
    if migration.parent != migrations_root or migration.suffix.lower() != ".sql":
        raise SystemExit("Migration must be a .sql file directly inside src/migrations.")

    database_url = dotenv_values(layer_root / ".env").get("DATABASE_URL", "")
    if not database_url or "YOUR_" in database_url:
        raise SystemExit("python_layer/.env DATABASE_URL is not configured.")

    sql = migration.read_text(encoding="utf-8")
    expected_tables = re.findall(
        r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.([a-zA-Z0-9_]+)", sql, re.IGNORECASE,
    )
    expected_indexes = re.findall(
        r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z0-9_]+)", sql, re.IGNORECASE,
    )
    expected_policies = re.findall(
        r"CREATE\s+POLICY\s+([a-zA-Z0-9_]+)", sql, re.IGNORECASE,
    )
    expected_triggers = re.findall(
        r"CREATE\s+TRIGGER\s+([a-zA-Z0-9_]+)", sql, re.IGNORECASE,
    )

    connection = psycopg2.connect(database_url, connect_timeout=20)
    try:
        connection.autocommit = False
        with connection.cursor() as cursor:
            cursor.execute(sql)
        connection.commit()
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT relname, relrowsecurity FROM pg_class "
                "WHERE relnamespace = 'public'::regnamespace AND relname = ANY(%s)",
                (expected_tables,),
            )
            tables = dict(cursor.fetchall())
            cursor.execute("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY(%s)", (expected_indexes,))
            indexes = {row[0] for row in cursor.fetchall()}
            cursor.execute("SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND policyname = ANY(%s)", (expected_policies,))
            policies = {row[0] for row in cursor.fetchall()}
            cursor.execute(
                "SELECT trigger_name FROM information_schema.triggers "
                "WHERE event_object_schema = 'public' AND trigger_name = ANY(%s)",
                (expected_triggers,),
            )
            triggers = {row[0] for row in cursor.fetchall()}
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    missing = {
        "tables": sorted(set(expected_tables) - set(tables)),
        "indexes": sorted(set(expected_indexes) - indexes),
        "policies": sorted(set(expected_policies) - policies),
        "triggers": sorted(set(expected_triggers) - triggers),
    }
    if any(missing.values()) or any(not tables.get(table, False) for table in expected_tables):
        raise SystemExit(f"Migration applied but verification failed: {missing}, rls={tables}")
    print(f"Applied transactionally: {migration.name}")
    print({
        "tables": sorted(tables),
        "rls_enabled": all(tables.values()),
        "indexes": len(indexes),
        "policies": len(policies),
        "triggers": len(triggers),
        "verification": "passed",
    })


if __name__ == "__main__":
    main()
