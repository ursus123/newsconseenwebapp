# Company Graph bounded query contract

**Contract:** `company-graph.v1`
**Applies to:** overview, search, neighborhood, edge explanation and Idjwi graph context

Company Graph is an operational projection, not a database browser. Every response has a global node and edge budget. Overview reads receive deterministic per-type allocations weighted toward risks, recommendations, open work, decisions, operational units and active identities. The backend ranks and projects results before they reach the browser.

`GraphTruncation` reports the global budgets, per-type allocations, sources that have more rows, returned node and edge counts, omissions by object type, whether those counts are exact, and whether continuation is available. Production Supabase reads request exact counts only for truncated types; adapters unable to count report a conservative lower bound and set `omission_counts_exact=false`. A continuation token is opaque, integrity protected, and bound to the verified tenant, authorization fingerprint and operational scope. A token from another principal or scope is rejected.

Production deployments set the same `GRAPH_CONTINUATION_SECRET` on every backend worker. Without it, a process-local random secret is used, which is safe for local development but cannot continue a token through another worker.

`GET /company-graph/overview` accepts `node_budget`, `edge_budget` and `continuation_token`. The frontend identifies a bounded view and allows the operator to request another governed page; it never implies that the first packet is the entire tenant.

`GET /company-graph/neighborhood/{entity_type}/{entity_id}` performs a registry-planned traversal. It reads the selected node, only relationship carriers incident to each frontier, exact authorized endpoints and relevant assertion history. It does not construct the organization overview first.

`GET /company-graph/edge/explain` requires the edge ID and its typed source and target. It builds the smallest authorized one-hop neighborhood that can contain the edge, then returns the edge, safe endpoint summaries, evidence and assertion history.

`GET /company-graph/search` searches only registry-approved display columns, applies tenant and operational-unit scope, then returns graph-safe node summaries. This permits finding records omitted from the current overview without broadening the graph packet.

The production repository enforces tenant filters on every request. Operational-unit filters are applied where a canonical type is unit-owned. Authorization is evaluated before query planning, and cache keys include authorization fingerprint, scope, budgets and continuation state.

Runtime latency acceptance belongs to the Stage 11 benchmark. PostgreSQL remains the query engine until reproducible evidence proves it misses targets after indexing, query tuning and caching.
