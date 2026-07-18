# Idjwi Advisor Architecture

## Runtime model

Idjwi Core is always the first and last layer in an operational request. It
resolves tenant authorization and operational scope, retrieves governed context,
selects deterministic tools, applies memory and policy, optionally routes a bounded
assignment to tenant-permitted advisors, validates the result, and records the
decision or action.

```text
User or operational event
          |
          v
Tenant + role + operational-unit authorization
          |
          v
Idjwi Core: context, ontology, memory, policy, tools
          |
          +-- deterministic objective --> Core response/action
          |
          +-- reasoning objective ------> tenant advisor policy
                                             |
                                  none / one / comparison
                                             |
                                             v
                               advisor proposal(s), never authority
                                             |
                                             v
                         Idjwi validation, approval, audit, outcome
```

## Tenant advisor policy

Each tenant can configure:

- `default_mode`: `core`, `automatic`, `selected`, or `compare`.
- `default_profile`: `fast`, `balanced`, `deep`, `coding`, or `research`.
- Whether external advisors and independent comparison are allowed.
- Monthly budget metadata and objective-routing rules.
- Advisor priority, permitted objectives, and permitted data classifications.
- An environment or vault credential reference. Plaintext provider secrets are
  rejected and no credential reference is returned to the browser.

Automatic routing evaluates tenant policy, objective, reasoning profile, data
classification, connection priority, provider availability, and fallback. If no
advisor is permitted, Idjwi returns to Core mode.

## Operational scopes

The frontend carries an explicit operational scope with every Idjwi request:

- Tenant-wide organization context
- Department such as Finance or HR
- Branch or facility
- Project, program, or team

The scope is included in Idjwi company context and the advisor request. It does not
replace tenant authorization: the backend still verifies the caller belongs to the
tenant, and tool-level capability checks remain authoritative.

## Security boundaries

1. Advisor policy and connection writes require manager, admin, or super-admin role.
2. Connection configuration accepts only `env:` or `vault:` credential references.
3. Secrets and credential references are never returned in advisor portfolio APIs.
4. Data classification filters run before advisor selection.
5. Advisors receive bounded prompts and cannot authorize tools or actions.
6. Comparison mode uses independent, read-only advisor assessments.
7. Advisor-derived memories enter `pending` review state with provenance.
8. Decisions, actions, policy updates, and tool activity remain tenant-auditable.

## Compatibility

The existing `/copilot/*` routes and `python_layer/copilot` package remain during
migration. They are compatibility identifiers for Idjwi APIs, not the product name.
New customer-facing language uses Idjwi, Idjwi Core, advisor, operational scope,
decision, action, memory candidate, and audit.

## Validation scenarios

| Scenario | Expected behavior |
|---|---|
| No external provider configured | Idjwi Core remains ready and performs deterministic work |
| Tenant selects one advisor | Only that permitted advisor receives bounded context |
| Tenant configures multiple advisors | Objective/profile rules select the permitted advisor |
| Comparison disabled | A comparison request is downgraded to automatic routing |
| Comparison enabled | Up to three permitted advisors return independent read-only assessments |
| Restricted data not allowed by advisor | Routing falls back to another permitted advisor or Core |
| Preferred advisor unavailable | Idjwi selects a permitted fallback or Core |
| Non-manager edits advisor policy | Request is rejected with HTTP 403 |
| Plaintext credential submitted | Request is rejected; only `env:` or `vault:` references are accepted |
| Advisor proposes durable knowledge | It is stored only as a pending, reviewable memory candidate |
| Advisor proposes state change | Idjwi capability and approval gates remain authoritative |
| Department scope selected | Scope travels with context and advisor assignment; tenant auth still applies |

