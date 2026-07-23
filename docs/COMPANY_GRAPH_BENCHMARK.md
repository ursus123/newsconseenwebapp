# Company Graph PostgreSQL benchmark

**Contract:** `company-graph-benchmark.v1`
**Decision rule:** PostgreSQL remains the graph query engine unless reproducible evidence shows it misses operational targets after indexing, bounded projections, permission filtering, and caching are optimized.

## Workloads and targets

The harness creates transaction-scoped temporary nodes and edges and never writes canonical tenant records. It covers small (500 nodes), medium (20,000), and large-target (200,000) shapes with sparse (2 edges/node) and dense (12 edges/node) patterns.

It records cold and warm overview, search, permission-filtered and unfiltered reads, payload bytes, cache speedup, depth 1–3 recursive traversals, and concurrent depth-2 users.

| Workload | p95 target |
|---|---:|
| Ranked overview | 500 ms |
| One-hop neighborhood | 250 ms |
| Two-hop neighborhood | 750 ms |
| Three-hop neighborhood | 2,000 ms |
| Search | 300 ms |

## Reproduction

From `python_layer`, with a non-production PostgreSQL `DATABASE_URL` configured:

```powershell
python -m company_graph.benchmark --profiles small medium large --patterns sparse dense --users 4 --repeats 5 --output company-graph-benchmark.json
```

Start with `--profiles small`, then medium, before running the memory-intensive large dense case. The report contains the dataset shape, exact metrics, targets and database decision. Preserve dated reports as deployment evidence; do not commit reports containing connection or tenant identifiers.

### Authorized endpoint benchmark

Start the current FastAPI application, place a short-lived signed-in Supabase
access token in the process-only `NEWSCONSEEN_BENCHMARK_TOKEN` environment
variable, and run:

```powershell
python -m company_graph.endpoint_benchmark --base-url http://localhost:8001 --company-id newsconseen-main --repeats 20 --users 4 --output benchmark-authorized-endpoints.json
```

The report never contains the token. It measures the real overview, search,
depth 1-3 neighborhood and edge-explanation routes, plus concurrent authorized
overview requests. A report without an edge explanation is incomplete rather
than silently passing.

Apply `006_company_graph_bounded_query_indexes.sql` to the governed Supabase project before benchmarking production-shaped canonical queries. The synthetic harness validates PostgreSQL traversal behavior; a production acceptance run must additionally exercise `/company-graph/overview`, `/neighborhood`, `/edge/explain`, and `/search` through real authorization.

## Decision boundary

A failed result means tune SQL, indexes, allocations, projection freshness and cache behavior first. A dedicated graph database is considered only after repeated medium and large failures, with query plans and concurrency evidence attached. Any future graph store remains a rebuildable tenant-scoped projection; Supabase stays canonical truth.

## Current execution status

Stage 11 was completed on 2026-07-22 against the intended PostgreSQL/Supabase
environment. All synthetic profiles and every required authorized endpoint met
their documented latency target.

### Synthetic PostgreSQL results

Values below are warm p95 milliseconds. Synthetic runs used four concurrent
users and isolated temporary benchmark data.

| Shape | Nodes | Edges | Overview | Search | Depth 1 | Depth 2 | Depth 3 | Concurrent p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Small dense | 500 | 6,000 | 91.18 | 76.95 | 78.85 | 91.98 | 102.52 | 86.77 |
| Medium sparse | 20,000 | 40,000 | 97.46 | 82.70 | 83.56 | 98.78 | 89.89 | 82.27 |
| Medium dense | 20,000 | 240,000 | 88.84 | 124.97 | 86.51 | 85.35 | 106.96 | 89.22 |
| Large sparse | 200,000 | 400,000 | 187.89 | 87.69 | 82.19 | 85.86 | 76.09 | 100.52 |
| Large dense | 200,000 | 2,400,000 | 185.40 | 89.16 | 84.05 | 85.01 | 99.96 | 144.27 |

Each report returned `retain_postgresql`.

### Authorized endpoint acceptance result

Source: `python_layer/benchmark-authorized-endpoints-final.json`. The run used
20 repetitions and four concurrent authorized users over a bounded packet of
59 nodes and 7 governed edges.

| Endpoint | Warm median | Warm p95 | Target | Result |
|---|---:|---:|---:|---|
| Overview | 12.81 ms | 21.12 ms | 500 ms | Pass |
| Search | 135.41 ms | 228.05 ms | 300 ms | Pass |
| Neighborhood depth 1 | 7.86 ms | 15.50 ms | 250 ms | Pass |
| Neighborhood depth 2 | 6.42 ms | 8.06 ms | 750 ms | Pass |
| Neighborhood depth 3 | 5.53 ms | 7.09 ms | 2,000 ms | Pass |
| Edge explanation | 238.77 ms | 319.26 ms | 500 ms | Pass |

The initial authorized discovery request took 5,075.47 ms and included cold
authorization, source reads and packet construction. Four simultaneous overview
requests completed between 2,036.79 and 2,090.51 ms. This is a substantial
improvement over the pre-optimization result of approximately 23 seconds and,
because all four timings remain tightly grouped, confirms request coalescing
rather than four independent upstream builds. It also identifies synchronized
cold tenant-context refresh latency as a future optimization target; it does not
justify a different graph database.

The packet is intentionally `partial` and `truncated`: the bounded overview
discloses omitted records rather than claiming to be the tenant's full graph.

## Final decision

**Retain PostgreSQL/Supabase for Company Graph traversal.** The representative
small, medium, large, sparse, dense, depth 1-3, permission-filtered, payload,
cache and concurrent workloads satisfy the operational targets. A dedicated
graph database would add synchronization and governance complexity without a
measured performance need. Reopen this decision only when reproducible
production-shaped evidence fails the documented targets after query, index,
projection and cache optimization.
