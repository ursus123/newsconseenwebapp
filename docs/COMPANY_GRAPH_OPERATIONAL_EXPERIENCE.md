# Company Graph Operational Experience

Status: implemented for Stages 17–22
Surface: web Company Graph; shared contract for future desktop and mobile views

## Stage 17 — Operational Focus

The overview is an authorized, bounded operational projection—not a database
browser. The backend defaults to 36 nodes and 72 edges. Ranking favors urgent
risks, decisions awaiting approval, unhandled actions, active recommendations,
open work, operational units, material enterprises, important people and
significant transactions.

The frontend never expands the default beyond the governed packet. Records
omitted by budgets, or numerous disconnected records, become one
`quality_cluster` presentation node. That node is not canonical data and is
never sent back as organizational truth. Selecting it opens Data-quality Gaps.

## Stage 18 — Semantic layouts

Question-specific layouts cover Operational Focus, Organizational Structure,
Operational Flow, Responsibilities & Work, Customers & Suppliers, Products &
Services, Risks & Opportunities, Decisions & Actions, Data-quality Gaps and
External Disruptions.

Each layout uses semantic lanes. Coordinates are derived deterministically from
the layout key and governed node ID. Refreshes and neighborhood expansion
therefore preserve existing positions. Layout is presentation state and never
creates or changes a relationship.

## Stage 19 — Readable graph semantics

Nodes communicate type through color, shape and glyph; importance through size;
and risk, degraded state, selection and disconnection through borders and
opacity. Labels reveal sublabels at useful zoom levels and interaction targets
remain at least 64 graph pixels.

Edges communicate direction with target arrows, predicate on hover/selection or
readable zoom, canonical assertions with solid lines, derivations with dashed
lines, disputes with dotted red lines, expired assertions with faded lines and
attached evidence with a source-side circle. The expandable legend explains
these meanings in operator language.

## Stage 20 — Coordinated inspection

Node inspection is a coordinated navigation workflow:

- selecting a node requests its authorized depth-one neighborhood;
- selecting another node aborts the previous request and stale responses cannot
  replace the current graph;
- retrieval loading and failures remain visible to the operator;
- breadcrumbs record the inspection path and support direct return and back;
- expansion advances one governed level at a time, up to depth three;
- incoming and outgoing relationships remain separate and retain predicates;
- operational facts, risks, work, decisions and actions are grouped;
- pinned nodes remain visible during neighborhood expansion;
- up to two node snapshots can be compared;
- Idjwi receives the selected node and the same governed neighborhood.

Edge inspection presents source, predicate and target; all returned evidence
records; validity, observation, confirmation and rejection times; assertion and
verification state; confidence; history; and only the correction actions
permitted by policy.

Deterministic Stage 18 coordinates preserve the mental map across all inspection
transitions. Scope changes and return-to-overview cancel in-flight neighborhood
requests and clear scope-specific history.

## Stage 21 — Advanced search and governed saved views

Direct search covers graph-safe labels and references, status, risk and address
fields across canonical and intelligence record types. It also searches visible
predicates and returns connected source/target labels from the same authorized
graph packet. Natural-language search is an explicit
`search_company_graph` Idjwi intent; it never bypasses graph authorization.

Saved views are `public.graph_saved_views` records rather than browser-local
preferences. Each record is tenant-bound and stores its owner, audience,
authorized scope, filters, semantic layout, optional role permissions, version
and validation state. The API derives ownership from the verified principal,
checks operational-unit membership, requires sharing authority for non-private
views and filters every read by audience, role and scope. Invalidated views
cannot be applied.

## Stage 22 — Coordinated Idjwi workspace

On desktop web, opening Idjwi publishes a workspace-width contract. Company
Graph responds by resizing its canvas instead of placing evidence behind the
panel. Closing Idjwi restores the full width. Citation selection no longer
closes the workspace.

Governed graph responses can provide explicit workspace actions to highlight
or center cited records, open an evidence-bearing edge, compare two visible
neighborhoods, review a permitted correction, create a follow-up task, request
approval or explain degraded sources. Visual actions operate only on the
current authorized packet; consequential actions return through Idjwi and the
existing tool and approval policies. The page consistently labels this surface
“Ask Idjwi.”

## Invariants

- Supabase `public.*` remains canonical operational truth.
- Layout and quality clusters are presentation only.
- Authorization is applied before ranking, layout and rendering.
- Idjwi receives governed data and omission diagnostics, not visual coordinates
  as organizational evidence.
- Full Graph is an explicit diagnostic view, never the default.
- Saved views never store canonical records and never broaden authorization.
- Idjwi workspace actions reference governed node and edge identifiers; they do
  not mutate canonical truth without the normal policy and audit path.

## Verification

- backend tests assert the 36/72 overview defaults;
- frontend tests assert ranking, bounded clustering, stable coordinates and
  stale-neighborhood suppression;
- lint and production build validate the integrated page.
