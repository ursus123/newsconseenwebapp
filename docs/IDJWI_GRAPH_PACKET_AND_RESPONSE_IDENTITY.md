# Idjwi graph packet and response identity

**Graph contract:** `company-graph.v1`  
**Response identity contract:** proof-derived Idjwi response metadata

## Same semantic packet

Company Graph and Idjwi use one authorized, graph-safe packet. The page may
filter or rearrange its visualization, but it must not silently replace the
packet used for counts, quality, evidence, provenance or authorization.

`IdjwiGraphContext` carries:

- tenant, role, authorized scope and permitted actions;
- the selected authorized node or edge;
- ranked nodes and edges, predicates and assertion history;
- graph-safe evidence, provenance and freshness;
- unavailable sources, completeness, truncation and sensitivity classes;
- page name and product surface.

The backend validates `node_count`, `edge_count`, per-type counts, unavailable
sources and selected identifiers against the supplied packet. A contradictory
packet is rejected before reasoning. Deterministic graph intent results return
the validated `graph_semantic_summary`, allowing the page, answer and audit
event to compare the same node, edge, disconnected and unavailable-source
totals.

## Visible identity

The visible operational identity is always **Idjwi**. An external model is an
optional tenant-controlled advisor, never the product identity.

Each response contains a proof-derived `response_identity` with one state:

- `Idjwi Core`
- `advisor available`
- `advisor requested`
- `advisor consulted`
- `multiple advisors consulted`
- `advisor unavailable`
- `Core fallback used`
- `advisor required but unavailable`

Turning on the advisor request control proves only that an advisor was
requested. `advisor consulted` requires successful advisor execution and an
identified contributing model. The response envelope and `idjwi.response`
audit event store the same identity object. The compatibility field
`advisor_enabled` now means that an advisor actually contributed.

The `/copilot/*` URL and internal package names remain temporary API
compatibility paths. They must not appear as the visible product identity.
