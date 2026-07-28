# Company Graph reusable-capability review

**Reviewed:** 2026-07-27
**Scope:** Earlier web, desktop and mobile pages
**Decision:** Company Graph capabilities belong in shared contracts and services;
pages adopt them according to operational need and role.

## Reusable capabilities already extracted

| Capability | Shared owner | Current consumers |
|---|---|---|
| Governed graph packet and redaction | Python Company Graph service and `companyGraphService.js` | Company Graph, Idjwi |
| Explicit Idjwi graph intents | `company_graph/intents.py` and frontend intent registry | Company Graph, Idjwi |
| Proof-derived advisor identity | Idjwi response identity | Idjwi dock and graph answers |
| Operational-unit scope | tenant context and graph authorization | Company Graph, Idjwi, Object Explorer, Enterprises |
| Evidence citations | graph explanation contract and citation events | Company Graph, Idjwi dock |
| Governed errors | graph HTTP errors and source diagnostics | Company Graph |
| Accessible dialogs | `AccessibleInteractionDialog` | Company Graph and any page adopting the host |
| Accessible graph alternatives | `AccessibleGraphView` | Company Graph |
| Saved graph views | governed backend records | Company Graph |

## Repository review findings

The review found that reusable graph improvements are not fully adopted outside
Company Graph:

- Idjwi entry points exist across Intelligence Inbox, Object Explorer, Reports,
  Query Public, Data Models and shared desktop components. Each must send an
  explicit product intent and governed context rather than infer authority from
  prompt text.
- Operational-unit language appears in only Company Graph, Data Models,
  Enterprises, Idjwi and Object Explorer. Tasks, Transactions, Reports,
  Intelligence Inbox and Data Readiness need first-class scope adoption when
  their page contracts are revisited.
- Native browser dialogs remain on several earlier pages. They are accessibility
  debt and should migrate to the shared accessible interaction host page by page.
- Many pages still hard-code the production Railway hostname. They bypass clean
  local/staging separation and must move to `src/config/api.js`.
- Legacy visible `Copilot` language remains in desktop and data-model surfaces.
  Compatibility route names may remain internal, but visible identity must be
  Idjwi and advisor state must be proof-derived.

## Adoption order

1. **Idjwi, Intelligence Inbox and Object Explorer:** explicit intents, governed
   context, evidence citations, source diagnostics and advisor truth.
2. **Tasks, Transactions and Data Readiness:** operational-unit scope, governed
   errors, graph-quality work and relationship evidence.
3. **Reports and Query surfaces:** safe graph context, citation-preserving output
   and authorized saved views.
4. **Desktop and Mobile:** shared identity/scope, role-specific actions, accessible
   dialogs and no production-only API constants.
5. **Remaining work apps:** replace native dialogs and attach record-level
   evidence without exposing broad graph context to workers.

## Review boundary

This review completes the Phase 9 requirement to identify and route reusable
Company Graph improvements. It does not silently redesign every earlier page in
one release. Each adoption is performed under that page's operational contract,
tested by role and surface, and recorded in architecture documentation.
