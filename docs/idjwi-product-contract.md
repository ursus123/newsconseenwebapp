# Idjwi Product Contract

## Purpose

Idjwi is Newsconseen's default operational mind for SMEs and SME-like operational
units. It turns organizational data, knowledge, rules, and outcomes into governed
understanding, decisions, and action. Idjwi is a Newsconseen capability, not a
rebranded external language model and not merely a conversational copilot.

## Non-negotiable architecture

1. Idjwi owns organizational context, ontology, memory, permissions, tools,
   policies, decisions, audits, and governed actions.
2. Idjwi Core works without an external LLM for deterministic retrieval,
   calculations, rules, monitoring, memory, and approved workflows.
3. LLMs are optional tenant-controlled advisors. A tenant may use none, one, or
   multiple advisors and route different objectives to different advisors.
4. Advisors receive only the minimum context authorized for a bounded objective.
5. Advisor output is a proposal. Idjwi validates evidence, permissions, policy,
   confidence, and approvals before responding or acting.
6. Provider credentials, prompts, model IDs, SDKs, and tool formats remain behind
   provider adapters. No provider is the identity or architectural center of Idjwi.
7. Knowledge learned from an advisor remains a candidate until verified. Durable
   memory is tenant-scoped, attributable, reviewable, and reversible.
8. Every consequential decision and action is explainable and auditable.

## Boundaries

### Tenant

The highest isolation, ownership, billing, credential, and policy boundary. Data,
memory, advisor credentials, and learning never cross tenants by default.

### Organization

A company, institution, agency, NGO, school, clinic, cooperative, or other entity
operated within a tenant. A tenant may contain one or multiple organizations.

### Department or operational unit

A bounded operating context such as Finance, HR, a branch, facility, project,
program, or team. It has its own authorized data, vocabulary, objectives, rules,
memory, tools, and advisor policies while remaining part of its organization.

### User and role

The authenticated human principal and the permissions assigned to that principal.
The role governs which scopes, memories, tools, decisions, and actions are visible
or executable. User input never grants authority by itself.

### Idjwi Core

The always-available, provider-neutral control and intelligence layer. It resolves
scope, loads context, queries the ontology and datamart, applies policies and rules,
retrieves memory, selects tools, routes optional advice, validates proposals,
manages approvals, records audits, and returns or executes the governed result.

### Advisor

An optional reasoning service used for a bounded assignment. It may be a tenant's
Codex/OpenAI account, Anthropic account, private/local model, Newsconseen-managed
model, or another provider. It cannot directly own memory, authorize itself, or
execute organizational actions.

### Agent

A persistent or event-driven worker operating toward an approved objective. An
agent monitors, plans, and invokes tools under Idjwi policy. It may request advisor
input, but an advisor is not an agent and an agent is not automatically authorized
to act.

### Tool

A typed, permissioned capability that reads data, calculates a result, or proposes
or performs an external effect. Tools are invoked through Idjwi governance, not
directly by an advisor.

### Memory

Durable, scoped organizational knowledge with provenance, confidence, sensitivity,
review status, validity, and contradiction history. Advisor responses and chat
transcripts are not automatically memory.

### Decision

A recorded choice among alternatives, including evidence, assumptions, responsible
scope, advisor contributions, approver, rationale, and later outcome. A recommendation
is not a decision until the required authority accepts it.

### Action

An authorized state change performed through a tool or workflow. Every action has
an actor, scope, policy basis, approval state, inputs, result, and audit record.

## Governing flow

```text
Tenant objective or operational event
                |
                v
Idjwi resolves user, role, and operational scope
                |
                v
Idjwi Core loads context, memory, ontology, tools, and policy
                |
                v
Can Idjwi Core handle the objective deterministically?
        | yes                         | no
        v                             v
Query, calculate, or plan       Route bounded request to
                                tenant-approved advisor(s)
        |                             |
        +-------------+---------------+
                      v
Idjwi validates evidence, permissions, policy, and confidence
                      |
                      v
Respond, request approval, refuse, or execute an authorized action
                      |
                      v
Record audit, outcome, and eligible memory candidates
```

## Product terminology

| Use | Meaning | Avoid as product identity |
|---|---|---|
| Idjwi | Newsconseen's operational mind | Claude, Codex, chatbot |
| Idjwi Core | Provider-neutral, always-available intelligence and governance | LLM backend |
| Advisor | Optional tenant-selected reasoning model | Idjwi model |
| Advisor-assisted | Idjwi used one or more advisors | AI mode |
| Core Mode | Idjwi completed work without an external advisor | Offline AI |
| Operational unit | Department, branch, project, facility, program, or team | Separate tenant by default |
| Memory candidate | Unverified proposed knowledge | Learned fact |
| Decision | Authorized recorded choice | Model answer |
| Action | Governed state change | Tool suggestion |

`copilot` may remain in legacy module names, database objects, and `/copilot/*` API
routes until a compatibility migration is completed. New product copy and new
architecture must call the product Idjwi. Provider names are shown only where
transparency, configuration, billing, compliance, or diagnostics require them.

## Completion test

The contract is upheld when Idjwi remains identifiable and useful without any
external LLM; tenants can select one or multiple advisors; providers cannot bypass
scope, memory, tool, policy, decision, approval, or audit boundaries; and no
architectural document defines Idjwi as Claude, Anthropic, or merely a copilot.
