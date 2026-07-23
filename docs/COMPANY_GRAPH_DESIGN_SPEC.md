# Company Graph product and design specification

**Authority:** Company Graph product contract  
**Status:** Accepted for staged implementation  
**Last reviewed:** 2026-07-21  
**Related implementation:** `src/pages/CompanyGraphHome.jsx`, `python_layer/company_graph/`  
**Related decision:** `docs/adr/ADR-001-company-graph-governed-operational-projection.md`
**Idjwi intent contract:** `docs/IDJWI_COMPANY_GRAPH_INTENTS.md`

**Bounded retrieval:** `docs/COMPANY_GRAPH_BOUNDED_QUERIES.md` defines ranked
overview budgets, direct neighborhood and edge explanation queries, governed
search, continuation and honest omission reporting. PostgreSQL acceptance is
measured by the reproducible suite in `docs/COMPANY_GRAPH_BENCHMARK.md`.
**Governed data contract:** `docs/COMPANY_GRAPH_CONTRACT_V1.md`

## Product definition

Company Graph is Newsconseen's governed operational map. It helps an authorized
operator understand which records, responsibilities, work, evidence, decisions,
and actions form a bounded operation; how they are related; what changed; and what
requires attention. It is an evidence-linked projection over Newsconseen data, not
a separate source of truth and not a decorative database diagram.

The operational problem is fragmentation. Records may exist without showing how a
person, organization, task, transaction, product, place, recommendation, or action
affects another. Company Graph makes those authorized connections inspectable so an
operator and Idjwi can explain the operation and coordinate governed work.

## Users and outcomes

| User | Primary outcome |
|---|---|
| Administrator | Configure scope, inspect readiness, govern relationships, permissions, and corrections |
| Manager | Understand a permitted operation, investigate change and risk, and approve allowed actions |
| Worker | See only task-relevant records, relationships, evidence, and next actions |
| Technician or data steward | Diagnose source, mapping, projection, and relationship quality |

Backend policy, not hidden UI controls or prompt wording, enforces these boundaries.

## Supported scopes

Operational units are first-class `public.operational_units` records, not
enterprise aliases. Unit scope is authorized through active membership,
management authority or tenant administration, and record inclusion follows
`operational_unit_id` ownership plus governed hierarchy. See
`OPERATIONAL_UNITS_AND_RELATIONSHIP_REGISTRY.md`.

Every request carries an authorized scope. Scope is never inferred from a selected
node alone.

- **Tenant:** the isolated customer boundary that owns configuration, identity,
  permissions, memory, and data. A tenant is not a graph node merely because it is
  the security boundary.
- **Organization:** the governed organization whose operation is being described.
- **Operational unit:** a bounded part of an organization with its own work,
  membership, responsibility, and permissions.
- **Department:** a functional operational unit, such as HR or Finance.
- **Team:** a smaller working group within or across operational units.
- **Enterprise:** a canonical organization, supplier, customer, partner, location,
  or other enterprise record. It must not silently stand in for tenant,
  organization, department, or operational unit.

Organization-wide, operational-unit, department, team, and authorized record
neighborhood views are supported product scopes. Their full data and authorization
implementation is delivered in later stages of the Company Graph programme.

## Operational vocabulary

| Term | Meaning in Company Graph | Owner |
|---|---|---|
| Person | A canonical human record in an authorized operational role | Canonical operational system |
| Record | A governed instance of an ontology object | The owning canonical or derived repository |
| Relationship | A typed, directed, temporal assertion connecting two records | Canonical system when confirmed; projection when derived |
| Observation | Time-bounded internal or external evidence about operational reality | Evidence/intelligence layer; never an automatic canonical overwrite |
| Recommendation | A governed proposal supported by evidence and uncertainty | Idjwi; optional advisors may contribute proposals |
| Decision | An authorized choice with rationale, evidence, approver, and scope | Canonical governance record |
| Action | A permitted execution following policy and any required approval | Canonical action/audit system and governed tool execution |

## Information classes and ownership

Assertion state and transition events are canonical governance records in
Supabase. Graph edges are their authorized projection. Rejection is durable and
must suppress regeneration of the same inferred assertion key while preserving
history for Idjwi and audit.

| Displayed information | System owner | Graph responsibility |
|---|---|---|
| Canonical people, enterprises, work, transactions, products, services, places, documents, schedules, relationships, decisions, and actions | Supabase `public.*` through tenant- and permission-enforcing repositories | Project authorized graph-safe summaries; never redefine the fact |
| Historical facts, summaries, graph quality, cross-object intelligence, predictions, and deterministic derived connections | Python intelligence and projection layer | Preserve derivation, source records, freshness, confidence, and version |
| External weather, closure, recall, transport, regulatory, or market evidence | Governed observation repository | Show source, retrieval time, relevance, confidence, and expiration |
| Recommendations and explanations | Idjwi Core | Cite governed evidence, scope, uncertainty, and permitted next steps |
| Language-model analysis | Optional tenant-controlled advisor | Remain an untrusted proposal until Idjwi validates it |
| Operator confirmation, rejection, decision, and approval | Canonical governance and audit records | Display the authoritative state and history |

The graph service owns projection, bounding, and presentation contracts. It does
not become a second operational database. A future graph database, if justified by
benchmarks, remains a rebuildable, tenant-scoped projection.

## Versioned implementation contract

The graph API, frontend graph workspace, and Idjwi graph context use
`company-graph.v1`. Its authoritative models cover safe node summaries, edges,
evidence, scope, provenance, per-source status, completeness, truncation, quality,
temporal state, permitted actions, and Idjwi context. See
`docs/COMPANY_GRAPH_CONTRACT_V1.md`. A graph response without a supported contract
version is not accepted as governed Company Graph data.

Graph access uses the separate `graph-policy.v1` security contract in
`docs/COMPANY_GRAPH_AUTHORIZATION.md`. Authorization is bound to tenant, user, role,
permission, operational scope, record sensitivity, graph-safe fields, permitted
actions, and a principal-specific cache fingerprint.

Graph data minimization follows
`docs/COMPANY_GRAPH_FIELD_CLASSIFICATION.md`. Every projected field is graph-safe,
role-restricted, sensitive, or prohibited. Idjwi context and export serializers use
the same exposable-field boundary as the graph workspace.

## Idjwi responsibilities

Idjwi is the operational mind presented on this page. It must:

- observe only the authorized graph packet for the current role and scope;
- explain the organization, unit, node, relationship, change, evidence, and gaps;
- distinguish canonical facts, deterministic projections, analytical inference,
  external observations, and advisor proposals;
- disclose missing, partial, stale, conflicting, or truncated evidence;
- recommend role-appropriate next steps with uncertainty;
- invoke only permitted tools and require approval where policy demands it;
- link claims back to visible nodes, relationships, and evidence;
- record governed corrections and outcomes through canonical workflows; and
- remain useful in Core mode when no external advisor is configured.

An advisor may analyze a bounded request. It is never the identity of the page,
source of truth, approval authority, action owner, or owner of organizational memory.

## Operator actions

Subject to role, permission, sensitivity, and scope, an operator may:

- change scope, search, filter, center, expand, compare, and save a view;
- inspect a node, relationship, provenance, history, or quality issue;
- ask Idjwi to explain, compare, identify gaps, or recommend a next step;
- propose, correct, confirm, reject, dispute, or supersede a relationship;
- create or approve a decision, task, or governed action;
- retry a failed source or open Data Readiness; and
- export an explicitly authorized and redacted graph packet.

Viewing information never implies permission to mutate it.

## Prohibited behavior

Official graph exports are produced only by `POST /company-graph/export` and
carry purpose, scope, redaction, sensitivity, requesting principal, timestamp,
and audit metadata. Relationship proposals become canonical only through the
server validation and approval gate documented in
`COMPANY_GRAPH_EXPORT_AND_MUTATION_GOVERNANCE.md`.

Company Graph must never:

- expose records or fields outside the principal's tenant, role, operational scope,
  sensitivity clearance, or field permissions;
- send full canonical rows merely because a record is represented as a node;
- present a derived, predicted, external, or advisor-proposed connection as a
  confirmed canonical fact;
- infer protected or sensitive characteristics without an explicit lawful product
  contract and governed evidence;
- invent missing relationships, evidence, confidence, or completeness;
- hide source failure, authorization filtering, truncation, staleness, or conflict;
- allow an advisor, agent, browser client, or visualization to authorize an action;
- silently overwrite canonical records or convert chat text into organizational truth;
- treat absence of an edge as proof that no real-world relationship exists; or
- allow a graph store, cache, export, or saved view to bypass tenant permissions.

## Surface implications

| Surface | Company Graph responsibility |
|---|---|
| Web | Administration, governance, data readiness, deep exploration, comparison, approvals, and configuration |
| Desktop | Persistent multi-panel operational workspace, notifications, graph investigation, and continuous Idjwi access; no active Base44 dependency |
| Mobile manager | Priority neighborhoods, exceptions, briefings, evidence, and permitted approvals |
| Mobile worker | Task-relevant relationships, next actions, evidence capture, and correction reporting; never a compressed administrator graph |

All surfaces share tenant identity, ontology, operational scope, permissions,
evidence, audit, and Idjwi Core. Presentation and authority vary by role and surface.

## Administrator-facing explanation contract

The page must tell an administrator:

1. It maps authorized operational records and their governed connections.
2. Canonical facts remain owned by Newsconseen's operational system; projections
   and observations retain provenance and uncertainty.
3. Idjwi uses the same bounded evidence to explain change, gaps, and next actions.
4. Administrators can inspect readiness and govern corrections, but actions remain
   subject to permissions and approval.
5. Partial, empty, unauthorized, truncated, and unavailable states have different
   meanings and next steps.

## Stage 1 acceptance test

An engineer can use this specification to identify the operational problem and
users; the supported scope vocabulary; the owner of every displayed information
class; Idjwi's responsibilities and advisor boundary; permitted actions and
prohibited behavior; and distinct web, desktop, and mobile responsibilities.

This contract does not claim that every later-stage security, graph, Idjwi, UX, or
cross-surface requirement is already implemented. Those capabilities must not be
presented as complete until their own verification gates pass.

## Explicit Idjwi graph actions

Company Graph actions use `company-graph-intents.v1`. Buttons carry explicit
intents from the page through the Idjwi request; natural-language classification
is only a fallback. Idjwi executes them deterministically over the authorized
`company-graph.v1` context shown to the operator.
