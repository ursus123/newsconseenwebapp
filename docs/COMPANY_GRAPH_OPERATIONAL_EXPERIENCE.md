# Company Graph Operational Experience

Status: implemented for Stages 17–24
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
- Daily briefing priorities cite governed evidence and disclose bounded or
  unavailable context.
- Graph-quality badges are projections of owned repair work; resolution never
  silently changes the affected canonical record.

## Administrator workspace hierarchy (2026 Phase 1)

The web administrator surface prioritizes investigation before queue detail:

1. a compact Idjwi operational header discloses authorized scope, graph status,
   key operational counts, pending relationship review and graph-quality work;
2. the collapsed “What is Company Graph?” orientation explains the page before
   the administrator reaches its controls, while retaining the persisted detail;
3. the primary graph workspace provides scope, search, layout, filters,
   representations, inspector access and Ask Idjwi before any long queue;
4. Relationship Review and Graph-quality Work remain collapsed summaries until
   the administrator chooses to inspect them; and
5. optional supporting detail follows the governance summaries.

Briefing detail, relationship review, graph quality, page guidance, graph
status and the relationship legend persist independently. Persistence is keyed
by tenant, user, product surface and responsive device category. These settings
are presentation preferences only and cannot broaden records, fields, actions
or scopes. The graph workspace reserves a minimum usable canvas height so it is
visible without scrolling on a normal administrator laptop.

## Graph expansion and sizing (2026 Phase 2)

Company Graph has two explicit portal-based expansion modes. **Expand graph**
shows the canvas, compact controls and governed relationship legend. **Expand
workspace** coordinates the canvas with the graph inspector and the persistent
Idjwi workspace. Neither mode makes the complete page fullscreen.

The overlay locks background scrolling, supports Escape, restores focus to the
button that opened it and retains the current scope, filters, selected record or
relationship, neighborhood and Cytoscape viewport. The canvas uses an explicit
height contract: 600–720px on normal desktop layouts, at least 480px on smaller
laptops, the available viewport in expansion modes and a bounded graph card on
mobile. The mobile expanded workspace stacks its inspector below the graph.

A `ResizeObserver` keeps Cytoscape synchronized with its actual container when
the browser, sidebar, inspector, Idjwi workspace, disclosure sections or device
orientation changes. Zero-sized observations are ignored; valid transitions
call `resize()` and restore the saved zoom and pan rather than discarding the
operator's mental map.

## Operational visual language (2026 Phase 3)

The default canvas is a light warm-slate workspace with subtle spatial guides;
dark mode is not inferred independently from the product shell. Nodes use white
surfaces, slate labels and semantic accent borders. Emerald identifies governed
selection, indigo identifies informational structure, amber identifies proposed
or uncertain work, rose identifies disputed or critical state, and violet/cyan
identify analytical and external observations.

`company-graph-presentation.v1` is the serializable presentation registry for
graph-safe ontology types. It defines icon keys, semantic shapes, accent colors,
label/status fields, warning and importance inputs, accessible names and
preferred layouts. React icons are bound separately in the web UI so the same
registry can later become an input to the Newsconseen Ontology SDK.

Nodes have three zoom bands: distant semantic markers, medium operational
labels and close cards with secondary detail. Importance changes target size;
warnings, quality and selection remain independent visual signals. Relationships
render as governed assertions: canonical slate, confirmed emerald,
deterministic blue, analytical violet, external cyan, proposals amber, disputes
rose and expired assertions faded slate. Confidence controls line weight and an
indigo source marker discloses evidence. Rejected assertions are hidden from the
operational view and retained for governed history.

Small graphs and focused layouts label their predicates. A selected neighborhood
labels only its connected relationships. Hovering an edge emphasizes its source
and target, dims unrelated elements and discloses predicate, state, confidence
and evidence count; selection opens the governed evidence inspector.

## Semantic layouts and zoom (2026 Phase 4)

`company-graph-layouts.v1` defines each layout by the operational question it
answers, its authorized record types, anchor types and positioning strategy.
Operational Focus places the selected unit or organization at the center and
ranks important current records in deterministic rings. Organization Structure
uses a top-down hierarchy; Responsibilities, Products and Decisions use
left-to-right operational flows; Customers and Suppliers use relationship
sides; Risks and Opportunities use opposing sides; Data Quality applies
quality gravity; External Disruption moves from outside observations inward;
and a selected neighborhood uses relationship-depth rings.

Positions are deterministic and cached by tenant, scope, layout and anchor.
Existing coordinates survive refresh, neighborhood expansion, section or panel
changes and switching away and returning. Layout coordinates remain
presentation metadata and must never be interpreted as organizational truth.

Semantic zoom groups only authorized, non-critical, low-attention populations.
Initial cluster families include completed tasks, disconnected transactions,
low-risk suppliers, disconnected records by ontology type and closed historical
records. Every cluster states its count, source pattern, reason for summarizing,
whether repair work is appropriate and that critical records were excluded.
External relationships are retained as clearly derived aggregate connections.

Operators can inspect a cluster, ask Idjwi about it, expand its authorized
members without moving unrelated records and create governed repair work when a
matching quality finding exists. Expanded clusters can be restored. Cluster
membership never bypasses field or record authorization and never alters
canonical records.

## Verification

- backend tests assert the 36/72 overview defaults;
- frontend tests assert ranking, bounded clustering, stable coordinates and
  stale-neighborhood suppression;
- lint and production build validate the integrated page.

## Administrator governance queues

Relationship Review is a bounded, backend-paginated work queue. Its collapsed
summary reports the complete authorized counts, not merely the current page.
The home page retrieves five priority proposals; the dedicated governance
workspace retrieves a larger bounded page. Filtering covers assertion state,
confidence, source/matching method and age. Priority ordering considers state,
operational impact, confidence and age. Bulk confirmation remains restricted to
one backend-issued `bulk_group_key`; proposals without a compatible group are
reviewed individually. Inspecting a proposal projects a presentation-only edge,
centers both endpoints, opens its evidence context and keeps the decision bound
to the selected assertion. Confirm, edit and reject refresh the graph, review
queue and quality findings together.

Graph Quality is a prioritized repair queue. Its collapsed summary reports
open, critical, unverified and affected-record totals plus an honest health
label. The home page retrieves at most four findings, ordered by severity,
verification state and affected records. Selecting a finding highlights every
authorized affected node and exposes evidence, consequence, owner, scope and
suggested repair. One primary repair action is visible; secondary governed
actions remain in an accessible disclosure. Data Readiness remains the complete
cross-page repair workspace and canonical history surface.

## Consolidated controls and coordinated selection

The administrator toolbar has six explicit groups: Scope, Find, View, Navigate,
Boundary and Governance. Scope selects the organization or an authorized
operational unit. Find separates deterministic record/relationship search from
natural-language Idjwi search. View owns layouts, saved views, filters and the
accessible representation. Navigate owns overview, back, breadcrumbs, pins and
comparison. Boundary explains returned and omitted authorized records using
operator language. Governance owns save, export and review workspaces.

One Graph Health disclosure reports service availability, selected scope,
completeness, freshness, source failures, truncation and pending governance
work. It explicitly distinguishes system health from graph data quality.

The graph, review queues, inspector and Idjwi share one selected governed object
or assertion. Node selection highlights the governed neighborhood and groups
facts, incoming/outgoing relationships, operational context and permitted
actions. Edge selection exposes endpoints, evidence, assertion class/state,
confidence, contradictions, temporal history and permitted corrections. Idjwi
citations use the same selection path and retain a one-step return to the
operator's previous context. With no selection, the inspector is hidden.
