# Company Graph export and mutation governance

**Status:** Implemented  
**Applies to:** `company-graph.v1`  
**Updated:** 2026-07-22

## Product rule

The browser may request a selection, but it cannot authorize an export or
assert a relationship. Both operations are reconstructed from the requesting
principal's current tenant-scoped graph packet. Supabase remains the canonical
system of record; Company Graph is the governed projection and approval surface.

## Governed export

`POST /company-graph/export` requires `graph.export`. The request declares an
operational purpose, optional operational-unit scope, object types, and visible
node IDs. The server resolves tenant identity again, applies scope policy,
rebuilds the graph, intersects the requested selection with authorized nodes,
and only then serializes the result.

Every response contains an `export_metadata` manifest with requesting user,
verified tenant and scope, purpose, included object types, applied redactions,
highest sensitivity, server timestamp, counts, and an audit correlation ID.
The same manifest is written as a `company_graph.exported` audit event.

Export data uses the Stage 4 projections: sensitive, prohibited, unknown,
hidden, and out-of-selection fields or records cannot be restored with modified
browser parameters.

## Governed relationship confirmation

`POST /company-graph/relationship/confirm` requires
`graph.relationship_confirm`. The server verifies:

1. The edge exists in the principal's current authorized graph.
2. It is a deterministic, analytical, or advisor proposal, not a canonical fact.
3. Both endpoint nodes are authorized.
4. Submitted endpoints and predicate exactly match the governed proposal.
5. The predicate registry permits that endpoint shape.
6. The edge and operator permit confirmation.
7. Explicit approval is present when policy requires it.
8. No active duplicate or conflicting relationship governs the endpoint pair.
9. The tenant-scoped canonical repository accepts the write.

Only then is `public.relationships` written, the cache invalidated, and an audit
event recorded. Rejection similarly requires a current authorized proposal and
matching identity; it records feedback without changing a canonical fact.

## Failure behavior and verification

Authorization failures return `403`; absent proposals return `404`; approval,
mismatch, duplicate, and conflict failures return `409`; predicate/shape failures
return `422`. The UI never falls back to a direct write or local official export.

Automated tests alter object types, node IDs, endpoints, predicates, permissions,
approval flags, and existing relationships. Modified requests cannot reveal
hidden records or create a relationship different from the server proposal.
