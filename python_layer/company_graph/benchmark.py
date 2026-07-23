"""Reproducible PostgreSQL Company Graph benchmark using isolated temp data.

Run from python_layer:
  python -m company_graph.benchmark --profiles small medium large --patterns sparse dense --output graph-benchmark.json
No canonical tenant rows are created or modified.
"""
from __future__ import annotations

import argparse
import json
import statistics
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from sqlalchemy import text

from database import get_engine_safe


PROFILES = {"small": 500, "medium": 20_000, "large": 200_000}
TARGETS_MS = {"overview": 500, "neighborhood_1": 250, "neighborhood_2": 750, "neighborhood_3": 2000, "search": 300}

SETUP_SQL = """
CREATE TEMP TABLE graph_benchmark_nodes (
  id bigint PRIMARY KEY, entity_type text NOT NULL, label text NOT NULL,
  operational_unit_id bigint NOT NULL, visible boolean NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE graph_benchmark_edges (
  source_id bigint NOT NULL, target_id bigint NOT NULL,
  predicate text NOT NULL, visible boolean NOT NULL
) ON COMMIT DROP;
INSERT INTO graph_benchmark_nodes
SELECT n, CASE n % 8 WHEN 0 THEN 'enterprise' WHEN 1 THEN 'person' WHEN 2 THEN 'task'
  WHEN 3 THEN 'transaction' WHEN 4 THEN 'product' WHEN 5 THEN 'service' WHEN 6 THEN 'risk' ELSE 'recommendation' END,
  'record-' || n, 1 + (n % 25), (n % 5 <> 0)
FROM generate_series(1, :node_count) n;
INSERT INTO graph_benchmark_edges
SELECT 1 + ((n - 1) % :node_count),
       1 + (((n - 1) % :node_count + 1 + ((n - 1) / :node_count)) % :node_count),
       'related_to', (n % 5 <> 0)
FROM generate_series(1, :edge_count) n;
CREATE INDEX graph_benchmark_edges_source_idx ON graph_benchmark_edges(source_id);
CREATE INDEX graph_benchmark_edges_target_idx ON graph_benchmark_edges(target_id);
CREATE INDEX graph_benchmark_nodes_type_idx ON graph_benchmark_nodes(entity_type, id);
CREATE INDEX graph_benchmark_nodes_scope_idx ON graph_benchmark_nodes(operational_unit_id, id);
ANALYZE graph_benchmark_nodes;
ANALYZE graph_benchmark_edges;
"""

QUERIES = {
    "overview": """SELECT entity_type, count(*) FROM (SELECT entity_type FROM graph_benchmark_nodes WHERE visible ORDER BY CASE entity_type WHEN 'risk' THEN 1 WHEN 'recommendation' THEN 2 WHEN 'task' THEN 3 ELSE 4 END, id LIMIT 240) ranked GROUP BY entity_type""",
    "search": "SELECT id, entity_type, label FROM graph_benchmark_nodes WHERE visible AND label ILIKE :search ORDER BY id LIMIT 25",
    "permission_unfiltered": "SELECT count(*) FROM graph_benchmark_nodes WHERE operational_unit_id = 3",
    "permission_filtered": "SELECT count(*) FROM graph_benchmark_nodes WHERE operational_unit_id = 3 AND visible",
    "payload": "SELECT jsonb_agg(row_to_json(n)) FROM (SELECT id, entity_type, label, operational_unit_id FROM graph_benchmark_nodes WHERE visible ORDER BY id LIMIT 240) n",
}

TRAVERSAL = """
WITH RECURSIVE walk(node, depth, path) AS (
  SELECT CAST(:start AS bigint), 0, ARRAY[CAST(:start AS bigint)]
  UNION ALL
  SELECT CASE WHEN e.source_id = w.node THEN e.target_id ELSE e.source_id END,
         w.depth + 1,
         w.path || CASE WHEN e.source_id = w.node THEN e.target_id ELSE e.source_id END
  FROM walk w
  JOIN graph_benchmark_edges e ON (e.source_id = w.node OR e.target_id = w.node) AND e.visible
  WHERE w.depth < :depth
    AND NOT (CASE WHEN e.source_id = w.node THEN e.target_id ELSE e.source_id END = ANY(w.path))
)
SELECT depth, count(DISTINCT node) FROM walk GROUP BY depth ORDER BY depth
"""


def _measure(connection, sql, params=None, repeats=5):
    durations, payload_bytes = [], 0
    for _ in range(repeats):
        started = time.perf_counter()
        rows = connection.execute(text(sql), params or {}).fetchall()
        durations.append((time.perf_counter() - started) * 1000)
        payload_bytes = max(payload_bytes, len(json.dumps([tuple(row) for row in rows], default=str).encode()))
    return {
        "cold_ms": round(durations[0], 2),
        "warm_median_ms": round(statistics.median(durations[1:] or durations), 2),
        "warm_p95_ms": round(max(durations[1:] or durations), 2),
        "payload_bytes": payload_bytes,
        "cache_speedup": round(durations[0] / max(0.001, statistics.median(durations[1:] or durations)), 2),
    }


def _setup(connection, node_count, pattern):
    multiplier = 2 if pattern == "sparse" else 12
    connection.execute(text(SETUP_SQL), {"node_count": node_count, "edge_count": node_count * multiplier})


def _concurrent_worker(engine, node_count, pattern, barrier, depth):
    with engine.connect() as connection, connection.begin():
        _setup(connection, node_count, pattern)
        barrier.wait()
        started = time.perf_counter()
        connection.execute(text(TRAVERSAL), {"start": 1, "depth": depth}).fetchall()
        return (time.perf_counter() - started) * 1000


def run_profile(engine, profile, pattern, users=4, repeats=5):
    node_count = PROFILES[profile]
    with engine.connect() as connection, connection.begin():
        _setup(connection, node_count, pattern)
        metrics = {
            "overview": _measure(connection, QUERIES["overview"], repeats=repeats),
            "search": _measure(connection, QUERIES["search"], {"search": "record-12%"}, repeats=repeats),
            "permission_unfiltered": _measure(connection, QUERIES["permission_unfiltered"], repeats=repeats),
            "permission_filtered": _measure(connection, QUERIES["permission_filtered"], repeats=repeats),
            "payload": _measure(connection, QUERIES["payload"], repeats=repeats),
        }
        for depth in (1, 2, 3):
            metrics[f"neighborhood_{depth}"] = _measure(connection, TRAVERSAL, {"start": 1, "depth": depth}, repeats=repeats)
    barrier = threading.Barrier(users)
    with ThreadPoolExecutor(max_workers=users) as pool:
        latencies = list(pool.map(lambda _: _concurrent_worker(engine, node_count, pattern, barrier, 2), range(users)))
    metrics["concurrent_users"] = {
        "users": users, "median_ms": round(statistics.median(latencies), 2),
        "p95_ms": round(max(latencies), 2), "latencies_ms": [round(item, 2) for item in latencies],
    }
    permission_base = metrics["permission_unfiltered"]["warm_median_ms"]
    metrics["permission_filter_cost_ms"] = round(metrics["permission_filtered"]["warm_median_ms"] - permission_base, 2)
    target_results = {
        name: metrics[name]["warm_p95_ms"] <= target for name, target in TARGETS_MS.items()
    }
    return {"profile": profile, "pattern": pattern, "nodes": node_count, "edges": node_count * (2 if pattern == "sparse" else 12), "metrics": metrics, "targets_met": target_results}


def run(profiles, patterns, users=4, repeats=5):
    engine = get_engine_safe()
    if engine is None:
        raise RuntimeError("DATABASE_URL is unavailable; benchmark was not run")
    started = time.time()
    results = [run_profile(engine, profile, pattern, users, repeats) for profile in profiles for pattern in patterns]
    return {
        "contract": "company-graph-benchmark.v1", "engine": "postgresql",
        "isolated_temp_data": True, "profiles": PROFILES, "targets_ms": TARGETS_MS,
        "started_at_epoch": started, "duration_seconds": round(time.time() - started, 2),
        "results": results,
        "decision": "retain_postgresql" if all(all(item["targets_met"].values()) for item in results) else "optimize_postgresql_before_reconsidering_projection",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--profiles", nargs="+", choices=PROFILES, default=["small"])
    parser.add_argument("--patterns", nargs="+", choices=("sparse", "dense"), default=["sparse", "dense"])
    parser.add_argument("--users", type=int, default=4)
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--output", default="")
    args = parser.parse_args()
    report = run(args.profiles, args.patterns, max(1, args.users), max(2, args.repeats))
    rendered = json.dumps(report, indent=2, default=str)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
