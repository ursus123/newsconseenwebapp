# Newsconseen Development Strategy

**Authority:** Required product and engineering working strategy  
**Applies to:** Web, desktop, mobile, backend, ontology, analytics, Idjwi, documentation, and deployment  
**Last reviewed:** 2026-07-21

## Purpose and product definition

Newsconseen is developed page by page, but every page must strengthen the shared
operating system beneath it. The objective is not isolated UI modernization. Each
workstream must advance the canonical ontology, Idjwi, role-aware operations,
cross-surface delivery, intelligence, governance, and maintainability.

Newsconseen is a governed operating system for bounded operations. A bounded
operation may be an SME, department, branch, warehouse, pharmacy, clinic unit,
field team, or another specialized operational unit. Task-specific applications
turn work into canonical ontology records. Idjwi combines organizational context,
memory, policy, tools, evidence, recommendations, decisions, and governed actions.
External LLMs are optional tenant-controlled advisors, not Idjwi or a source of truth.

Although currently a solo project, Newsconseen must be organized for a future
multi-engineer team. Architectural knowledge must not exist only in conversations.

## Architectural direction

### Layer 1 — Canonical operational system

Supabase `public.*` is the governed source of truth for tenants, operational units,
users, roles, ontology records, relationships, permissions, evidence, decisions,
actions, and audits. Idjwi may read bounded canonical context only through tenant-
and permission-enforcing repositories.

### Layer 2 — Intelligence and projections

The Python layer and data zones own ingestion, mapping, normalization,
reconciliation, historical facts, summaries, cross-object and governance
intelligence, prediction, graph projections, data quality, and external observations.
Derived intelligence must never silently overwrite canonical facts.

### Layer 3 — Idjwi operational mind

Idjwi owns context, governed memory, rules, policies, permissions, tools, advisor
orchestration, evidence, recommendations, decisions, actions, auditability, and
outcome-based learning. It reads governed canonical context for immediacy and
derived intelligence for deeper reasoning. It never bypasses authorization,
repository, evidence, or approval boundaries.

## Page-by-page working method

Every page is reviewed across:

1. **Purpose:** operational job, users, decisions, outcomes, and duplication.
2. **Canonical data:** ontology reads/writes, operational-unit ownership,
   relationships, and immediate Idjwi visibility.
3. **Idjwi:** what it observes, explains, recommends, and may act on.
4. **Roles:** worker, manager, administrator, technician, and sensitivity rules.
5. **UI/UX:** primary action, responsiveness, accessibility, and distinct loading,
   empty, partial, authorization, and backend-failure states.
6. **Integration:** search, graph, alerts, analytics, audit, and cross-surface use.

### Administrator page explanation

Every operational page must explain to the tenant administrator:

- what the page is for and which problem it solves;
- which records it reads or creates;
- which roles normally use it;
- how it affects Idjwi and which intelligence it enables;
- how it should be configured; and
- whether it is ready, partially configured, degraded, or unavailable.

Use a concise subtitle, a "What is this page?" panel, first-use guidance,
contextual help, readiness guidance, or an Idjwi explanation. Use product language,
not internal engineering terminology.

## Definition of done for a page

A page is complete only when:

- its purpose and administrator explanation exist;
- role-specific behavior and tenant/operational-unit scope are enforced;
- canonical reads and writes use governed repositories;
- relevant relationships and audit events are created;
- new records become immediately visible to Idjwi;
- Idjwi receives page, role, scope, record, tool, and sensitivity context;
- Idjwi explains evidence, changes, missing information, and failures;
- recommendations show uncertainty and actions use approval gates;
- outcomes return to canonical records and governed memory;
- failure states are explicit;
- web, desktop, and mobile implications are considered;
- tests, lint, build, local runtime, and staging checks pass; and
- affected documentation is updated in the same workstream.

A visually improved page without these contracts is not complete.

## Continuous backward improvement

Completed pages are not frozen. When a later page introduces a reusable capability,
extract it into shared infrastructure and review earlier pages for adoption. Track
tenant context, operational-unit scope, Idjwi context, errors, audit, accessibility,
enrichment, approvals, search, and mobile patterns across pages.

## Idjwi development alongside every page

For every page, evaluate:

- **Observe:** authorized records, scope, visible state, and external observations.
- **Explain:** what is shown, why, evidence, changes, gaps, and failed layers.
- **Recommend:** the next appropriate step for the current role.
- **Act:** an authorized tool with evidence, approval, audit, recovery, and outcome.

Idjwi must not remain a generic chat interface added after pages are finished.

## One mind, role-aware behavior

There is one Idjwi core, but its context, vocabulary, tools, and authority vary by
tenant, operational unit, user, role, permissions, product surface, current page,
selected records, tools, approval authority, sensitivity, graph context, and
external-source permissions. Backend policy—not prompt wording—enforces differences
between worker, manager, administrator, and technician access.

## Product surfaces

- **Web:** configuration, governance, analytics, oversight, app building,
  permissions, audit, and Idjwi management.
- **Desktop:** multitasking, notifications, operational workspaces, graph
  exploration, and continuous Idjwi access. Retire active Base44 paths before
  native packaging.
- **Mobile:** assigned work, mini-apps, capture, scanning, checklists, incidents,
  recommendations, escalation, and approvals. It is task-focused, not a compressed
  administrator portal.

All surfaces share ontology, identity, scope, permissions, audit, and Idjwi Core.

## Definition-driven application engine

Hand-coded applications are proofs of requirements. The target is a versioned
definition describing purpose, roles, fields, validation, permissions, ontology
mappings, relationships, workflow, approvals, evidence, notifications, mobile
layout, Idjwi instructions, analytics, audit, and publishing. Shared renderers
should produce web, desktop, and mobile experiences from that definition.

## External enrichment

Permitted external reality—weather, closures, transport, recalls, holidays,
regulation, markets, and supply disruption—must be evaluated against internal
plans, people, places, obligations, and inventory. External data enters as a
time-bounded observation with source, retrieval time, freshness, confidence,
matching method, geographic/temporal relevance, verification, and expiration. It
does not directly overwrite canonical records.

## Living documentation

Documentation evolves with implementation and normally ships in the same commit.
For every material change, review:

- `CLAUDE.md`;
- `src/ARCHITECTURE.md`;
- `python_layer/copilot/docs/newsconseen_docs.md` when Idjwi knowledge changes;
- relevant product, ontology, data-zone, API, security, deployment, testing, and
  operational documents; and
- whether a new document or Architecture Decision Record is required.

Documents should state purpose, authority, last review date, related implementation,
and superseded material where applicable. Avoid contradictory sources of truth.

## Future-engineer readiness

Maintain consistent terminology, module ownership, stable contracts, shared
components, critical-path tests, architecture decisions, setup and staging
instructions, safe migrations, reviewable commits, explicit deprecations, and no
machine-specific configuration or credentials in Git.

## Staging and domain strategy

Use separate local, staging, and production environments. Prefer
`staging.<domain>`, `staging-api.<domain>`, `app.<domain>`, and `api.<domain>` with
isolated configuration, synthetic data, role-specific accounts, health checks,
monitoring, smoke tests, migrations, and rollback. Release through local validation,
commit/push, staging deployment, role/device verification, and production approval.

## Base44 retirement

Inventory Base44 imports, URLs, fallbacks, and terminology; classify active,
compatibility, and dead paths; replace active identity/data/write/ETL paths; verify
all surfaces; remove dependencies and configuration; and finish with a repository
scan proving no active runtime dependency remains.

## Strategic guardrails

- Supabase remains canonical operational truth.
- Idjwi never bypasses tenant, permission, evidence, or approval enforcement.
- Derived intelligence never silently overwrites canonical facts.
- External LLMs remain optional advisors.
- External observations retain provenance, freshness, and uncertainty.
- Governed actions create evidence and audit history.
- Role enforcement occurs in backend policy.
- UI capabilities correspond to real backend capabilities.
- Reusable improvements are reviewed across completed pages.
- Documentation evolves with implementation.
- A graph database requires representative benchmark evidence.
- Runtime verification, not UI or documentation alone, supports product claims.
- Credentials, environments, and machine-specific settings are never committed.

## Working cycle

```text
Discuss purpose → inspect implementation → define ontology, roles, Idjwi, and
surface contracts → implement shared patterns → review previous pages → update
documentation → test locally → deploy to staging → verify by role/device → commit
and push
```
