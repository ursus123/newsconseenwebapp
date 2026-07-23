# Idjwi graph evidence and correction loop

**Citation contract:** `company-graph-citation.v1`  
**Graph contract:** `company-graph.v1`  
**Migration:** `007_graph_correction_learning.sql`

## Evidence-linked explanations

Important Company Graph claims return `graph_citations`. An edge citation
contains the authorized source and target summaries, predicate, edge ID,
assertion and verification state, governed evidence IDs, evidence records and
last confirmation time. A node citation identifies the authorized node.

Selecting a citation on Company Graph:

1. switches to a view capable of displaying the cited objects;
2. centers the cited node or relationship;
3. highlights the source, target and edge;
4. opens the normal governed evidence panel;
5. records `company_graph.citation_inspected`.

Answer confidence is calculated from five disclosed factors: evidence strength,
source completeness, freshness, intent completion and contradiction status.
The `idjwi.response` audit event records citation IDs and the same confidence
packet.

## Correction and learning

The governed lifecycle is:

1. Idjwi or a deterministic/analytical rule identifies a possible edge.
2. `POST /company-graph/relationship/propose` records the proposal and evidence.
3. An authorized operator reviews the evidence.
4. The operator confirms, edits the governed predicate and confirms, rejects,
   or opens the canonical Relationships editor for broader changes.
5. Policy validates role, scope, endpoints, predicate and approval.
6. Confirmation creates a canonical relationship and confirmed assertion;
   rejection remains durable and suppresses regeneration.
7. Tenant graph caches are invalidated and the page refreshes.
8. A confirmed correction outcome is written to Idjwi correction memory with
   assertion/event provenance.
9. `POST /company-graph/relationship/outcome` records later supported, refuted
   or inconclusive operational outcomes.

Idjwi correction memory accepts only governed decision and outcome events.
Arbitrary chat text is explicitly excluded from this learning path. Every
proposal, decision, observed outcome, citation inspection and memory result is
auditable.

The outcome endpoint requires `graph.relationship_confirm`. `supported` and
`refuted` outcomes become confirmed correction memory; `inconclusive` remains
pending until stronger evidence exists.

`POST /company-graph/relationship/edit` validates the corrected predicate
against the authorized endpoint types, supersedes the original proposal,
creates the corrected canonical relationship and assertion, refreshes the
graph and records confirmed correction memory.
