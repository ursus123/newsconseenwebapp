# Company Graph authorization and cache isolation

**Authority:** Company Graph security contract  
**Policy version:** `graph-policy.v1`  
**Status:** Implemented  
**Last reviewed:** 2026-07-21  
**Implementation:** `python_layer/company_graph/authorization.py`

## Security boundary

Every graph request verifies the authenticated user and requested tenant before a
graph policy is constructed. The policy binds user, tenant, role, graph
permissions, operational scope, sensitivity, fields, actions, and cache identity.
Frontend visibility is not an authorization control.

## Permissions

- `graph.read`
- `graph.read_sensitive`
- `graph.export`
- `graph.relationship_propose`
- `graph.relationship_confirm`
- `graph.relationship_reject`
- `graph.admin`

`graph.admin` implies all graph permissions. Role defaults are centralized in the
graph authorization module. Explicit graph permissions in a verified tenant
context override role defaults.

| Role | Default graph authority |
|---|---|
| Super administrator | All graph permissions |
| Tenant administrator | All graph permissions |
| Manager | Read, sensitive read, export, and relationship proposal/confirmation/rejection |
| Staff or teacher | Non-sensitive read and relationship proposal |
| User or student | Non-sensitive read |

Role defaults are a compatibility policy until tenant-configurable grants are
stored canonically. Backend policy remains authoritative.

## Sensitivity and fields

Entity-registry sensitivity determines whether a source may be read. Roles without
`graph.read_sensitive` do not read personal, financial, confidential, or restricted
entity sources for graph construction. Edges whose endpoints are not authorized
are omitted.

Even after an entity is authorized, graph attributes pass through both the Stage 2
graph-safe allowlist and the principal's field policy. Complete database rows are
never attached to nodes.

`graph.read_sensitive` means role-restricted graph fields may be included. It does
not permit fields classified as sensitive or prohibited. Those classifications are
defined in `docs/COMPANY_GRAPH_FIELD_CLASSIFICATION.md`.

## Operational-unit scope

Unit scope resolves `public.operational_units` and active
`public.operational_unit_memberships`. A client-supplied unit ID is never enough.
The authorization fingerprint includes allowed and managed unit IDs so membership
changes cannot reuse a broader cached packet.

The tenant is always verified. A client-supplied operational-unit identifier is not
trusted as proof of membership. Until Stage 6 introduces canonical operational-unit
membership and grants, arbitrary operational-unit switching requires `graph.admin`.
This is intentionally restrictive. It prevents a worker or manager from widening or
changing scope using only a URL parameter.

## Cache isolation

Graph cache entries include a SHA-256 authorization fingerprint derived from:

- policy version
- tenant ID
- authenticated user ID
- role
- effective graph permissions
- scope type
- scope ID

The fingerprint contains no bearer token and is safe to record in provenance. The
cache key additionally includes graph center, depth, limits, and unit selection.
Tenant invalidation removes every principal-specific entry for that tenant.

This chooses strict principal isolation over shared graph-packet caching. A future
shared structural cache may be introduced only if authorization and field filtering
are reapplied after retrieval and proven by equivalent isolation tests.

## Action enforcement

Assertion history follows graph field minimization. Raw actor IDs remain in
canonical governance storage and are not included in browser, export or Idjwi
graph packets. Detailed operator rationale requires `graph.read_sensitive`.

`graph.export` authorizes the backend export endpoint; it never permits the
browser to serialize a client packet as an official export. Relationship
permissions authorize participation in governance, not arbitrary graph writes.

Packet, node, and edge actions communicate what the principal may do, but routes
enforce the permission again:

- graph read and scope selection are checked before cache lookup;
- relationship confirmation requires `graph.relationship_confirm`;
- relationship rejection requires `graph.relationship_reject`;
- export audit requires `graph.export`;
- graph administration requires `graph.admin`.

Viewing an action as allowed is never sufficient authorization for a later request.

## Failure behavior

A graph authorization or backend failure fails closed. The web page does not turn a
403, missing governed packet, or unavailable graph service into permission to build
a broader graph through direct client-side entity reads. It reports access denied
or graph unavailable and sends no substitute record packet to Idjwi.

## Verification requirements

Automated tests must request the same tenant graph as administrator and worker in
both cache orders. They must prove different authorized node/source/action packets,
different authorization fingerprints, independent cache misses, and a cache hit
only for the same principal and policy. Tests also cover unauthorized scope changes
and relationship actions.
