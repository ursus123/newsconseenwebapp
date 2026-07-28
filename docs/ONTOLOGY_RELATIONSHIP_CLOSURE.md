# Ontology Relationship Closure

## Purpose

Newsconseen must connect the whole governed ontology, not merely People and
Enterprises. A relationship is a typed, evidenced assertion between authorized
records. Supabase `public.*` remains canonical truth; detection creates review
proposals and never silently changes canonical records.

## Stage A — Universal candidate contract

`ontology-relationship-candidate.v1` defines one proposal packet for every
registered ontology object. It identifies the carrier, endpoints, semantic
predicate, matching method, evidence and hash, confidence, temporal state,
sensitivity, business consequence, permitted actions, proposed patch, and bulk
eligibility. Ambiguous or unknown matches are disputed and quarantined.

## Stage B — Semantic predicate registry

`ontology-relationships.v2` separates storage shapes from operational meaning.
For example, a legacy `person_enterprise` record with role `Client` proposes
`person → client_of → enterprise`. Predicate definitions govern endpoint types,
inverse meaning, evidence, time, sensitivity, corrections, and bulk review.
Forms, imports, graph extraction, quality, Idjwi, and review share the registry.

## Stage C — Persistent review queue

Migration `011_universal_relationship_candidates.sql` extends
`public.graph_assertions` as a tenant-scoped queue. Stable candidate and evidence
hashes make scans idempotent. Unchanged rejections remain suppressed; materially
changed evidence reopens a versioned proposal. A proposed patch is a preview,
not permission to mutate canonical data.

## Stage D — Governed detection and reads

- `POST /company-graph/relationship-candidates/detect` runs authorized,
  registry-driven detection and persists review candidates.
- `GET /company-graph/relationship-candidates` returns the durable queue.
- `GET /company-graph/relationship-registry` returns shared rules and predicates.

Queue reads require sensitive graph access because evidence may identify people
or financial records. Failures remain explicit and never become negative facts.

## A–D completion boundary

These stages do not confirm candidates, patch UUIDs, bulk mutate relationships,
refresh visible edges, or write learning outcomes. Those belong to the later
governed review and execution stages.

## Stage E — Universal operator review

Company Graph exposes one administrator review queue across all registered
ontology carriers. Operators may inspect state, object type, predicate, matching
method, evidence version, business consequence, and safe bulk grouping.
Selection cannot combine candidates from different deterministic bulk groups.

## Stage F — Deterministic Idjwi Core explanation and preview

`GET /company-graph/relationship-candidates/{id}/explain` discloses matching
fields, normalization, candidate count, scope, uncertainty, source record and
why bulk review is permitted. It explicitly records that no advisor was used.
`GET .../{id}/preview` revalidates current evidence and returns exact before and
after values without writing.

## Stage G — Governed individual and bulk decisions

`POST /company-graph/relationship-candidates/decide` supports individual or
bounded bulk confirmation and rejection. Confirmation requires explicit
approval. Every proposal is independently revalidated against current tenant,
carrier, endpoints, uniqueness, evidence hash, registry predicate, and operation
recipe. Bulk results are per record, so one conflict cannot conceal the others.
Predicate edits are individual only.

## Stage H — Canonical execution, refresh, audit and learning

The registry operation determines execution. `patch_relationship_references`
updates the existing canonical carrier; `confirm_assertion` confirms an already
canonical reference projection; quarantined proposals cannot be confirmed.
Confirmation and rejection create assertion events, structured operational
audit metadata, and governed Idjwi correction memory. Successful decisions
invalidate the tenant graph cache and instruct the web client to refetch the
queue, graph overview, and graph-quality findings immediately.

Canonical mutation provenance is preserved in assertion evidence: before and
after values, evidence version, operator, reason, operation, and bulk operation
identifier. Rejections never mutate canonical records and remain suppressed
until evidence changes.

## Stage I — Visible, explainable confirmed edges

Confirmation bridges the durable review candidate to the stable graph-edge
assertion key. The candidate remains addressable for history and suppression,
while the edge assertion records `operator_confirmed_assertion`, verified state,
temporal validity, and evidence linking the carrier to its confirmation event.
Company Graph refetches immediately and highlights an affected endpoint.

## Stage J — Before/after quality measurement

Every review operation measures the same bounded authorized graph before and
after execution: visible edges, connected and unconnected records, registry
gaps, legacy proposals, disputed/rejected history, truncated sources, omitted
nodes, and relationships preserved by Operational Focus. The API returns the
comparison, the page displays it, and structured audit records it under the bulk
operation ID. Improvement is measured, not assumed.

## Stage K — Relationship-aware bounded Operational Focus

Edge carriers retain separate bounded reads. Missing UUID-referenced endpoints
are retrieved within an explicit global endpoint budget. Final selection reserves
most of its 20–40-node budget for complete, high-value relationship pairs before
adding urgent standalone records; it never preserves only one endpoint.

Truncation discloses the relationship-aware strategy, hydrated endpoint count,
preserved edge count, summarized disconnected records, omission counts, and
continuation state. This changes presentation priority, not canonical truth or
authorization.
