# Graph assertion and completeness governance

**Status:** Implemented  
**Contracts:** `company-graph.v1`, `ontology-relationships.v1`  
**Migration:** `src/migrations/005_graph_assertion_governance.sql`  
**Updated:** 2026-07-22

## Stateful assertions

Graph edges are stateful assertions, not timeless lines. Each edge has a stable
`assertion_key` derived from source, predicate, target and relationship-rule ID.
The governed states are:

- `proposed`: generated but not accepted as an organizational fact;
- `confirmed`: explicitly accepted by an authorized operator;
- `rejected`: explicitly found unsuitable and suppressed from regeneration;
- `disputed`: under active challenge or review;
- `active`: currently effective canonical or reference assertion;
- `expired`: outside its validity period or explicitly ended; and
- `superseded`: replaced by another identified assertion.

`public.graph_assertions` stores current state, valid-from, valid-until, observed,
confirmed and rejected timestamps, superseding assertion, evidence version,
evidence snapshot, rationale and actor. `public.graph_assertion_events` is the
append-only transition history.

Confirm, reject and state-transition endpoints resolve the current authorized
edge before writing. State transitions are validated. Confirmation still creates
the canonical relationship record where applicable. Rejection persists the
stable key; subsequent graph builds suppress the matching derived edge rather
than proposing it again. If the assertion store is unavailable, derived
proposals fail closed because the system cannot prove they were not previously
rejected. Canonical/reference facts remain visible and completeness reports the
governance failure and remediation.

The graph packet and Idjwi context include sanitized assertion history. Raw
operator user IDs are retained only in canonical governance/audit storage; graph
consumers receive `authorized_operator`. Detailed rationale is available only to
principals with sensitive graph-read permission.

## Completeness meanings

Top-level states have exact meanings:

| State | Meaning |
|---|---|
| `complete` | All configured, authorized and applicable diagnostics are complete for the bounded request. |
| `partial` | A usable graph exists, but one or more diagnostics report incomplete coverage or quality. |
| `empty` | Authorized sources were successfully read but returned no graph records for the scope. |
| `unauthorized` | No graph records can be returned because source coverage is denied to the principal. |
| `unavailable` | Configured sources could not be reached, so absence cannot be interpreted as empty data. |

Truncation is a diagnostic reason for `partial`; it is not a sixth top-level
state.

## Diagnostic matrix

Every packet reports:

- source availability;
- authorization coverage;
- pagination completeness;
- truncation;
- registry mapping coverage;
- unmatched endpoints;
- unknown predicates;
- disconnected records;
- stale records (latest known update/observation older than 90 days);
- expired relationships;
- duplicate relationships;
- missing task assignments; and
- analytical-source availability.

Each dimension has its own state, affected count, total, explanation and affected
sources. Source failures additionally report source/table, failure category,
affected capabilities, last successful read when known, retryability and a
concrete operator action.

## Idjwi behavior

Idjwi should answer relationship questions using the current assertion plus its
transition history, evidence version and temporal fields. It should explain who
made a governed change only as an authorized operator unless a separate identity
detail contract permits more. It must distinguish empty data from unavailable or
unauthorized data and cite the exact failing diagnostic dimensions.

## Deployment

Migration 005 must be applied to the same Supabase project used by the frontend
and Python backend. Until applied, assertion persistence sources will correctly
report unavailable and the graph will be partial rather than falsely complete.
