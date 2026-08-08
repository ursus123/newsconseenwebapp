# Company Graph role, surface and accessibility contract

`company-graph-surface.v1` is the backend-enforced projection shared by web,
desktop, mobile manager, and mobile worker. Clients may reduce information
further, but must never broaden this packet.

Administrators receive governance capabilities; managers receive investigation
and approval capabilities; technicians receive mapping/source/projection
diagnostics; workers receive only assignment-proven work context. Where
user-to-person-to-task identity is not provable, the worker projection fails
closed with `assignment_identity_required`.

Company Graph provides equivalent non-canvas representations: keyboard record
list, relationship table, hierarchical outline, textual summary, visible focus,
text status, and live inspection announcements. These representations use the
same governed packet and inspection actions as the visual graph.

Company Graph does not use native browser prompts, confirmations, or alerts.
Exports, saved views, relationship governance, quality repair, and failures use
the shared Newsconseen interaction dialog. The dialog supplies an accessible
name and description, labelled inputs, inline validation, trapped keyboard
focus, Escape cancellation, focus restoration, explicit actions, and a live
announcement when it opens. Requests are queued so simultaneous asynchronous
operations cannot overwrite one another.

Desktop requests the `desktop` surface as a persistent multi-panel workspace.
Mobile managers receive priority records and exceptions. Mobile workers receive
only assignment-proven records; the web page is not copied into mobile.

## Governed mobile actions

The `mobile_manager` projection returns approval actions only for authorized,
currently pending canonical recommendations and decisions. Approve and reject
buttons call `POST /company-graph/mobile/manager/decision`; the endpoint
re-resolves tenant identity and scope, requires `graph.action_approve`, rebuilds
the manager projection, verifies the record is still actionable, writes the
canonical outcome, records the reason in audit, invalidates the graph, and asks
the client to refresh.

The `mobile_worker` projection exposes `capture_evidence` and
`report_correction` only after the authenticated user profile is linked to one
canonical Person and that Person is referenced by
`tasks.assigned_to_person_id`. Email and names never authorize access. Reports call
`POST /company-graph/mobile/worker/report`. The endpoint rebuilds the
assignment-scoped worker projection and rejects subjects outside it. Evidence
may include an observation, timestamp, source link, and device location.
Corrections additionally carry a proposed field and value. Both are stored in
`public.graph_field_reports` as review work; they never silently overwrite the
canonical subject record.

Apply `013_mobile_governed_actions.sql` and
`014_canonical_user_person_task_identity.sql` before runtime testing these
flows. Migration 014 backfills only unique tenant-local email matches; ambiguous
identity remains unlinked and therefore fails closed.

## Administrator accessibility floor

The administrator graph surface provides at least 11px supporting copy and larger
body copy in equivalent views, visible `focus-visible` rings, minimum 32px page
controls and minimum 44px primary targets in the accessible record and
relationship views. State is expressed with text and symbols, never color alone.
Relationships combine color with solid, dashed, dotted or faded line patterns.

Canvas animation duration becomes zero when `prefers-reduced-motion: reduce` is
active. `prefers-contrast: more` increases node borders, relationship width,
opacity and arrow scale. Expansion dialogs support Escape, lock background
scrolling and restore focus. Selection changes and dialog operations are announced
through live regions. The record list, relationship table, neighborhood outline
and textual summary operate over the same governed packet as Cytoscape.
