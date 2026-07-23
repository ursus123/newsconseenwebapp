# ADR-001: Company Graph is a governed operational projection

**Status:** Accepted  
**Date:** 2026-07-21  
**Decision owners:** Newsconseen product and architecture  
**Related specification:** `docs/COMPANY_GRAPH_DESIGN_SPEC.md`

## Context

Newsconseen needs to explain how operational records relate without creating a
second source of truth, exposing data through visualization, or allowing an LLM to
invent organizational structure. The same graph semantics must support operators,
Idjwi, web, desktop, and mobile while preserving tenant, role, scope, evidence,
approval, and audit boundaries.

## Decision

Company Graph is a rebuildable, evidence-linked projection over governed canonical
records, derived intelligence, and time-bounded observations.

- Supabase `public.*`, reached through governed repositories, remains canonical.
- The Python layer constructs bounded graph projections and derived intelligence.
- Idjwi reasons over the same authorized graph contract shown to the operator.
- Optional tenant-controlled LLMs are advisors to Idjwi, never graph truth.
- Confirmed decisions, corrections, relationships, and actions return through
  canonical governance workflows.
- Tenant, organization, operational unit, department, team, and enterprise remain
  distinct concepts even when the current schema cannot yet model all of them.
- A dedicated graph database may be introduced only as a tenant-scoped projection
  after representative PostgreSQL traversal benchmarks justify it.
- The completed 2026-07-22 benchmark covered up to 200,000 nodes and 2.4 million
  edges, depths one through three, authorized endpoints, and concurrent users.
  All defined endpoint targets passed, so PostgreSQL is retained. See
  `docs/COMPANY_GRAPH_BENCHMARK.md` for the reproducible evidence.

## Consequences

- Graph nodes require minimized, permission-safe presentation contracts.
- Every non-canonical edge requires provenance, classification, confidence, and
  temporal state.
- The visualization, cache, exports, saved views, Idjwi context, and mutations must
  preserve authorization boundaries.
- Partial sources, truncation, authorization filtering, and mapping gaps must be
  disclosed instead of being summarized as a misleading complete graph.
- Web, desktop, and mobile may render different experiences but cannot create
  separate graph truth or Idjwi identities.

## Rejected alternatives

- **Make the visualization the source of truth:** layout and interaction state are
  not operational facts.
- **Let an LLM infer and write relationships directly:** advisor output is untrusted
  and cannot bypass evidence, policy, approval, or audit.
- **Replace Supabase with a graph database now:** benchmark evidence shows the
  optimized PostgreSQL implementation meets current operational targets, and a
  graph store would still require a canonical operational owner.
- **Treat departments and teams as generic enterprises everywhere:** identity,
  hierarchy, membership, and permission semantics differ.
