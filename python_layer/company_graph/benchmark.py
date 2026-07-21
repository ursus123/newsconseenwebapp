"""Read-only PostgreSQL traversal benchmark for the Company Graph.

Usage from python_layer:
  python -m company_graph.benchmark --company-id <uuid> --start enterprise:<uuid>
"""
import argparse
import json
import time

from sqlalchemy import text

from database import get_engine_safe


SQL = text("""
WITH RECURSIVE edges AS (
  SELECT 'person:' || person_id::text AS source, 'enterprise:' || enterprise_id::text AS target
  FROM public.relationships WHERE company_id = :company_id AND person_id IS NOT NULL AND enterprise_id IS NOT NULL
  UNION ALL
  SELECT 'enterprise:' || enterprise_id::text, 'enterprise:' || secondary_enterprise_id::text
  FROM public.relationships WHERE company_id = :company_id AND enterprise_id IS NOT NULL AND secondary_enterprise_id IS NOT NULL
  UNION ALL
  SELECT 'person:' || person_id::text, 'person:' || secondary_person_id::text
  FROM public.relationships WHERE company_id = :company_id AND person_id IS NOT NULL AND secondary_person_id IS NOT NULL
), walk(node, depth, path) AS (
  SELECT CAST(:start AS text), 0, ARRAY[CAST(:start AS text)]
  UNION ALL
  SELECT CASE WHEN e.source = w.node THEN e.target ELSE e.source END, w.depth + 1,
         w.path || CASE WHEN e.source = w.node THEN e.target ELSE e.source END
  FROM walk w JOIN edges e ON e.source = w.node OR e.target = w.node
  WHERE w.depth < :depth
    AND NOT (CASE WHEN e.source = w.node THEN e.target ELSE e.source END = ANY(w.path))
)
SELECT depth, count(DISTINCT node) AS nodes FROM walk GROUP BY depth ORDER BY depth
""")


def run(company_id: str, start: str) -> dict:
    engine = get_engine_safe()
    if engine is None:
        raise RuntimeError("DATABASE_URL is unavailable; benchmark was not run")
    results = []
    with engine.connect() as connection:
        for depth in (1, 2, 3):
            started = time.perf_counter()
            rows = [dict(row._mapping) for row in connection.execute(SQL, {"company_id": company_id, "start": start, "depth": depth})]
            results.append({"depth": depth, "duration_ms": round((time.perf_counter() - started) * 1000, 2), "levels": rows})
    return {"company_id": company_id, "start": start, "engine": "postgresql_recursive_cte", "results": results}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--company-id", required=True)
    parser.add_argument("--start", required=True, help="Typed node id, for example enterprise:<uuid>")
    args = parser.parse_args()
    print(json.dumps(run(args.company_id, args.start), indent=2, default=str))
