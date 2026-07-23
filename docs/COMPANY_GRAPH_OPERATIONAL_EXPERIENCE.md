# Company Graph Operational Experience

Status: implemented for Stages 17–19  
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

## Invariants

- Supabase `public.*` remains canonical operational truth.
- Layout and quality clusters are presentation only.
- Authorization is applied before ranking, layout and rendering.
- Idjwi receives governed data and omission diagnostics, not visual coordinates
  as organizational evidence.
- Full Graph is an explicit diagnostic view, never the default.

## Verification

- backend tests assert the 36/72 overview defaults;
- frontend tests assert ranking, bounded clustering and stable coordinates;
- lint and production build validate the integrated page.
