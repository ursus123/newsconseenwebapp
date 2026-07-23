# Company Graph governed contract v1

**Contract identifier:** `company-graph.v1`  
**Authority:** API and cross-surface data contract  
**Status:** Implemented  
**Last reviewed:** 2026-07-21  
**Canonical models:** `python_layer/company_graph/contracts.py`  
**Frontend adapter:** `src/services/companyGraphService.js`

Authorization and cache isolation are governed by `graph-policy.v1`, documented in
`docs/COMPANY_GRAPH_AUTHORIZATION.md`. Permitted actions in a v1 packet are the
result of that backend policy and must still be re-authorized at mutation time.

## Purpose

This contract is the only supported Company Graph packet shape for the graph API,
Company Graph frontend, and graph context sent to Idjwi. It is a governed summary
contract, not a database-row transport format.

## Packet

`GraphPacket` contains:

Overview packets are bounded server-side. `GraphTruncation` carries global node
and edge budgets, per-type allocations, omission counts and an opaque
tenant/authorization/scope-bound continuation token. Neighborhood and edge
explanation requests use direct registry-planned retrieval rather than building
the overview first. See `COMPANY_GRAPH_BOUNDED_QUERIES.md`.

- `contract_version`
- tenant identifier and structured `scope`
- graph-safe node summaries
- evidence-linked edges
- per-type counts
- structured provenance and source status
- completeness and truncation reports
- graph-quality issues
- packet-level permitted actions
- a bounded operational briefing

## Node summary

`GraphNodeSummary` contains identity, safe label and sublabel, operational status,
sensitivity, allowlisted attributes, and permitted actions. It must never contain a
complete canonical row or a generic `metadata`/`data` field copied from storage.

Unauthorized sensitivity classes are removed before graph-source reads. Authorized
attributes are filtered again by graph field policy before serialization.
The four-class field registry and projection inventory are documented in
`docs/COMPANY_GRAPH_FIELD_CLASSIFICATION.md`. Unknown fields are prohibited by
default, and sensitive fields never enter a graph node even for an administrator.

Safe attributes are explicitly allowlisted by entity type in both backend and
frontend compatibility projection code. Adding a field requires a sensitivity and
role review; database availability alone never makes a field graph-safe.

## Edge

Edges are temporal assertions with stable `assertion_key`, governed
`assertion_state`, validity/observation/confirmation/rejection timestamps,
supersession, evidence version and sanitized transition history. Rejected
derived assertion keys are suppressed on future builds.

Every registry-derived edge carries `relationship_rule_id`, sensitivity,
evidence requirement and valid correction actions from
`ontology-relationships.v1`. Graph consumers and Idjwi must use these values
instead of recreating relationship semantics locally.

`GraphEdge` contains source, predicate, target, direction, label, assertion class,
status, temporal state, one or more evidence records, confidence, verification
state, and permitted actions.

Allowed assertion classes are:

1. `canonical_relationship`
2. `canonical_reference_projection`
3. `deterministic_derivation`
4. `analytical_inference`
5. `external_observation`
6. `advisor_proposal`
7. `operator_confirmed_assertion`

The assertion class describes how the connection was established. Verification
state separately describes whether it is verified, unverified, proposed, rejected,
disputed, or superseded. Confidence never substitutes for verification.

## Scope and operational status

Completeness uses only `complete`, `partial`, `empty`, `unauthorized` and
`unavailable`. A diagnostic matrix separately reports availability,
authorization, pagination, truncation, mapping, endpoint, predicate,
disconnection, staleness, expiry, duplicate, assignment and analytical coverage.

Scope is structured as tenant, organization, operational unit, department, team,
or neighborhood. Source status reports each source as available, partial,
unavailable, unauthorized, or empty. Completeness reports complete, partial,
truncated, or empty independently from source availability.

Truncation is explicit. Reaching a configured source limit cannot be reported as a
complete graph merely because the read succeeded.

## Idjwi context

`IdjwiGraphContext` carries the same version, node, edge, scope, provenance, source,
completeness, truncation, quality, and action types. The frontend builds this packet
from the displayed governed graph. `/copilot/ask` validates it whenever
`contract_version` is `company-graph.v1`.

Idjwi context may be further bounded to 100 nodes and 100 edges for transport, but
the context records that bounding in truncation metadata. Bounded context is never
represented as the entire graph.

## Compatibility and evolution

Exports and relationship mutations are governed server operations. The browser
may submit a selection or approval response, but the server reconstructs the
authorized `company-graph.v1` packet before exporting or writing. See
`COMPANY_GRAPH_EXPORT_AND_MUTATION_GOVERNANCE.md`.

- Additive optional fields may be introduced within v1.
- Removing or changing required semantics requires a new contract version.
- Consumers reject a missing or unsupported graph contract version.
- The local frontend fallback emits v1-safe summaries and explicitly reports a
  partial compatibility projection.
- Legacy raw graph tools must migrate to this governed contract; they cannot define
  a competing public graph shape.
