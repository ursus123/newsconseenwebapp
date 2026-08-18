# Intelligence Inbox design specification

**Status:** Accepted product contract
**Contract version:** `intelligence-inbox-product.v1`
**Audience:** Product, engineering, operators, Idjwi and future product surfaces

## Purpose

The Intelligence Inbox is Newsconseen's governed operational attention and
decision surface. It coordinates findings that require an authorized person or
governed agent to become aware, investigate, decide, approve, act, or verify an
outcome. It is not a feed of everything the system observes and it is not the
configuration console for models or agents.

An intelligence item belongs in the inbox only when all of the following are
true:

1. It is a contextualized finding supported by governed evidence.
2. It affects an authorized tenant and operational scope.
3. It requires awareness, investigation, decision, approval, action, or outcome verification.
4. The recipient may see the evidence and can perform, assign, or escalate a valid next step.
5. It is not an unresolved duplicate of an existing item about the same condition.

## Exclusions

The inbox must not contain ordinary application events, raw telemetry, every
model prediction, successful background operations, unvalidated LLM text
presented as fact, duplicate findings about the same condition, or information
the recipient cannot act upon. Those inputs remain in their source system,
analytics, audit, or delivery history until they satisfy the admission contract.

## Lifecycle

```text
Detected
  -> validated and contextualized by Idjwi
  -> assigned and prioritized
  -> investigated
  -> decision or approval
  -> action
  -> outcome observed
  -> resolved, reopened, or learned from
```

Detection does not itself create operational truth. Idjwi validates source,
evidence, tenant scope, permissions, freshness, contradictions, and attention
need before admission. Optional LLM advisors may propose interpretations, but
their text remains a proposal until Idjwi performs this validation.

## Ownership boundaries

| Surface or object | Owns | Does not own |
|---|---|---|
| Intelligence Inbox | Attention, triage, coordination, lifecycle and next-step presentation | Model or agent configuration |
| Alerts | Time-sensitive delivery through configured channels | The governed finding or decision lifecycle |
| Tasks | Work assigned to a person or operational unit | The evidence or reasoning that produced the work |
| Audit | Immutable evidence of events and governed transitions | The active work queue |
| ML Models | Model configuration, evaluation, versions and performance | Human attention and approval workflow |
| Agents | Governed capabilities, execution configuration and run history | Organizational truth or independent approval authority |
| Idjwi Core | Contextualization, policy, memory, evidence, orchestration and governed next steps | Treating advisor prose as truth |

An alert may deliver an intelligence item. A task may execute its approved
action. Audit records the transitions. An ML model, agent, rule, external
observation, or advisor may contribute evidence. None is the intelligence item.

## Users and surfaces

- Administrators govern cross-unit attention, ownership, failures and policy.
- Managers investigate and decide within authorized operational units.
- Technicians inspect source, mapping, model and integration quality.
- Workers receive only task-relevant findings and permitted next actions.

Web, desktop, mobile-manager and mobile-worker may present different bounded
views, but use the same identity, scope, item lifecycle, evidence and Idjwi Core.

## Phase 1 completion test

An engineer can place an object by asking whether it is an observation, an
interpreted evidence-backed condition, a delivery, assigned work, a governed
choice, an execution, or its observed result. Only the coordinated,
action-relevant finding belongs in the Intelligence Inbox.

## Governed item contract

Phase 2 establishes `intelligence-item.v1` inside an
`intelligence-inbox.v1` envelope. The contract contains authorized tenant,
organization and operational-unit scope; classification; explanation; severity;
priority; impact; source authority; evidence references; provenance; confidence;
uncertainty; freshness; lifecycle; ownership; permissions; recommended action;
approval; graph-safe related records; Idjwi context; advisor participation;
contradictions; outcomes; resolution and audit context.

Items are minimized projections. Evidence and related objects are authorized
references and graph-safe summaries, never complete source rows. The same item
ID, contract version, tenant scope, source assertion, and evidence IDs are passed
to the frontend, Idjwi context and audit context.

### Source and assertion governance

| Source class | Default assertion | Authority |
|---|---|---|
| Deterministic rule | deterministic finding | derived |
| Analytical calculation | analytical finding | derived |
| Machine-learning model | predictive finding | derived |
| Governed agent | analytical finding | derived |
| External observation | external finding | evidence |
| Data-quality detector | deterministic finding | derived |
| Idjwi Core reasoning | Idjwi-validated finding | derived |
| Tenant-controlled LLM advisor | advisor proposal | proposal |
| Human/operator report | operator report | operator |

The source class states origin; assertion class states epistemic authority. A
source label or confidence score cannot promote an advisor proposal into a
validated finding. Promotion requires a later Idjwi validation workflow with
evidence, policy and permission checks.

## Authorization and delivery contract

`intelligence-policy.v1` authorizes every inbox projection by verified tenant,
user, role, operational-unit membership, record sensitivity, source sensitivity,
eligible actor, action permission and approval authority. The backend derives
the following permissions:

`intelligence.read`, `intelligence.read_sensitive`, `intelligence.assign`,
`intelligence.investigate`, `intelligence.decide`, `intelligence.approve`,
`intelligence.act`, `intelligence.dismiss`, `intelligence.export`, and
`intelligence.admin`.

Administrators may read organization-wide authorized items. Managers and
technicians are restricted to their memberships or explicit ownership and have
different action authority. Workers receive only explicitly assigned/eligible or
unit-authorized items and do not receive restricted evidence. Tenant mismatch
always fails closed.

The inbox uses short-lived principal-specific caches keyed by a SHA-256
authorization fingerprint containing tenant, user, role, effective permissions,
scope and unit memberships. Cache entries are deep-copied and never keyed only by
tenant. The web page does not subscribe directly to intelligence tables and does
not fall back to direct Supabase reads. Delivery is `authorized_pull`; a future
realtime channel must re-run this same policy before emitting each item.
### Canonical repository and ingestion

The operational inbox reads only `public.intelligence_items`. Rules, analytics,
ML predictions, agents, alert conditions, graph-quality findings, external
observations, Idjwi recommendations, advisor proposals, and failed workflows
must pass through the source-adapter registry and be persisted as
`intelligence-item.v1` before display.

Migration `017_intelligence_repository.sql` separates each durable case from
its evidence, assignments, status transitions, linked decisions, approvals,
actions, outcomes, operator feedback, deduplication group, and audit events.
These tables are service-only: browser clients use the Python authorization
boundary, which applies tenant, role, unit, sensitivity, and action policy.

Correlation combines tenant, organization/unit scope, operational condition,
and affected records. Source identity is excluded from the case key so multiple
independent sources can support one case, but remains in the replay key and audit
history. Correlation never crosses tenant, scope, affected-record, or time-window
boundaries. Repeated detection updates the case occurrence history instead of
creating a duplicate card.
