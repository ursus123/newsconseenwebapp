# Company Graph administrator acceptance report

Environment evidence must identify the frontend, API, tenant, administrator
principal, commit and timestamp. A scenario is not a pass merely because its
control is visible. Governance scenarios require a backend result, graph refresh
and audit evidence.

| # | Scenario | Required evidence | Current result |
|---:|---|---|---|
| 1 | Open Company Graph and see the graph immediately | Initial workspace and non-zero canvas size | Automated |
| 2 | Collapse and restore each section | Disclosure states survive refresh for the same principal | Automated |
| 3 | Expand the graph | Canvas remains visible; Escape and focus restoration pass | Automated |
| 4 | Expand the complete workspace | Graph, inspector and Idjwi remain coordinated | Automated |
| 5 | Search and center a record | Search response and centered authorized record | Runtime required |
| 6 | Select and explain a node | Selected node, semantic packet and explicit Idjwi intent | Runtime required |
| 7 | Select and explain an edge | Selected edge and `explain_relationship` intent | Runtime required |
| 8 | Review relationship evidence | Visible evidence linked to the selected assertion | Runtime required |
| 9 | Confirm a relationship | Authorized mutation, audit event and immediate edge refresh | Runtime required |
| 10 | Reject an incorrect proposal | Persistent rejection, audit event and suppressed proposal | Runtime required |
| 11 | Inspect a graph-quality finding | Finding centers affected scope and exposes evidence | Runtime required |
| 12 | Create repair work | Governed task/action ID and quality-work refresh | Runtime required |
| 13 | Open Idjwi and retain graph context | Selection remains visible and citation can return | Runtime required |
| 14 | Switch layouts without losing the mental map | Stable node positions and usable canvas | Automated |
| 15 | Verify authorized export | Authorized redacted file and export audit | Runtime required |
| 16 | Refresh and preserve safe preferences | Same tenant/principal/surface/device preference key | Automated |
| 17 | Complete workflow using keyboard equivalents | Records, relationships, outline and summary usable without canvas | Automated |

`scripts/capture-staging-hars.mjs` captures browser, layout, accessibility,
session and zero-legacy-network evidence. The backend test suite covers policy,
mutation and audit contracts. Final staging acceptance must replace every
“Runtime required” entry with timestamped synthetic-tenant evidence; absent data
or unavailable infrastructure is reported as blocked, never passed.

## Local Stage 14 evidence — 2026-08-07

The administrator desktop run at `http://localhost:5173/CompanyGraphHome` passed
the Stage 14 browser gate. The generated local HAR and screenshots were inspected
and removed from the worktree after the results below were recorded; local
evidence is not a staging release substitute.

- Root typography floor: 11px.
- Accessible record targets checked: 11; each at least 44×44px.
- Keyboard record selection opened the coordinated inspector.
- Record list, relationship table, neighborhood outline and textual summary rendered.
- Reduced-motion mode, Escape and focus restoration passed.
- Supporting states were visible: Alerts `degraded`, Pending approvals `available`,
  Intelligence Inbox `unavailable`, Graph audit `available`.
- Base44 request matches: zero.

The Intelligence Inbox request was aborted during the local run and was correctly
shown as unavailable. This proves failure presentation, not Intelligence Inbox
availability. The full mutation scenarios and corrected authorization responses
must be repeated after deployment on staging before the final administrator
release gate can be marked complete.
