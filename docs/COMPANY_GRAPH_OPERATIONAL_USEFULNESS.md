# Company Graph Operational Usefulness — Stages 23–24

Status: implemented in code; migration `009_graph_quality_work.sql` must be
applied before durable quality-work actions are available.

## Stage 23 — Idjwi daily briefing

Contract: `company-graph-daily-briefing.v1`

The daily briefing is deterministic, provider-neutral, tenant-scoped and built
from the same authorized bounded graph packet shown on Company Graph. It
contains:

- records created or updated in the previous 24 hours;
- ranked risks, urgent or overdue work, pending recommendations and undecided
  decisions;
- governed relationships that explain each priority, including evidence,
  confidence and verification state;
- source, truncation and relationship-verification uncertainty;
- the authorized person or role expected to act;
- a recommended next action;
- workflow linkage through evidence, recommendation, decision, approval,
  action, task or agent execution, and observed outcome.

The explicit Idjwi intent is `daily_operational_briefing`. Idjwi cites the
priority nodes and relationships from the same packet. Optional LLM advisors do
not generate or own the briefing contract.

## Stage 24 — Governed graph-quality work

Contract: `company-graph-quality-work.v1`

Every active graph-quality issue is projected into a stable tenant-and-scope
finding key with:

- severity and affected count;
- affected organization or operational-unit scope;
- diagnosed cause and business consequence;
- owner;
- suggested repair;
- governed diagnostic evidence;
- bulk-repair eligibility;
- verification and workflow status;
- linked task, recommendation and alert state;
- append-only resolution history.

Durable state is stored in:

- `public.graph_quality_findings`;
- `public.graph_quality_resolution_events`.

The backend derives the tenant and actor from verified identity. Only principals
with `graph.quality_manage` can create work, acknowledge alerts, verify or
resolve findings. Task and recommendation creation uses the canonical
repositories. Every transition records a resolution event and an Idjwi
observability audit event.

The Company Graph page is the operational repair workspace. Data Readiness
shows the same governed findings and linked-work status. Neither surface
silently changes canonical records or bulk-repairs relationships.

## Failure behavior

If migration 009 is absent or unavailable, the quality endpoint returns
`GRAPH_QUALITY_STORE_UNAVAILABLE` with operator action
`apply_009_graph_quality_work_migration`. The graph and deterministic briefing
remain usable, but durable repair work is explicitly degraded.

## Completion evidence

- briefing tests verify evidence, owner, recommendation and workflow linkage;
- Idjwi intent tests verify the same governed priority packet and citations;
- quality tests verify stable keys, causes, consequences, evidence, ownership,
  operator actions and resolution history;
- frontend contract tests preserve the briefing through the Idjwi serializer;
- scoped lint and production build validate the integrated web surfaces.
