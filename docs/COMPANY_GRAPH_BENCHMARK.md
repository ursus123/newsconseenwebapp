# Company Graph database decision benchmark

Supabase PostgreSQL remains the governed system of record. Run the read-only
benchmark in `python_layer/company_graph/benchmark.py` against representative
small, medium, and large tenants before adding a graph database.

Capture cold and warm timings for depths 1, 2, and 3, plus graph overview,
path, impact, circular-dependency, and centrality workloads. Record tenant
isolation, projection freshness, backup/recovery effort, audit completeness,
operational cost, and failure behavior.

A dedicated graph projection is considered only when representative governed
PostgreSQL queries repeatedly miss the product latency target (250 ms for a
one-hop neighborhood, 750 ms for two hops, and 2 s for bounded three-hop impact)
after indexing, query tuning, and caching. The graph system must remain a
rebuildable, tenant-scoped projection fed by an idempotent outbox; it cannot
become an independent source of canonical facts.
