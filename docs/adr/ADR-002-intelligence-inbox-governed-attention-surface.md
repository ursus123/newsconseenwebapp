# ADR-002: Intelligence Inbox is a governed attention surface

**Status:** Accepted
**Date:** 2026-08-08
**Decision owners:** Newsconseen product and architecture
**Related specifications:** `docs/INTELLIGENCE_INBOX_DESIGN_SPEC.md`, `docs/INTELLIGENCE_TERMINOLOGY.md`

## Context

Newsconseen receives observations from canonical operations, rules, analytics,
ML models, agents, external sources and optional LLM advisors. Treating all of
those outputs as equivalent insights creates noise, hides authority and makes it
unclear whether an operator should investigate, approve, act, or merely read.

## Decision

The Intelligence Inbox is the governed human-attention and decision surface for
contextualized, evidence-backed findings requiring an authorized next step.

- Idjwi validates and contextualizes candidate findings before admission.
- Admission requires actionable relevance, authorized scope, evidence and deduplication.
- Alerts deliver; Tasks assign work; Audit records transitions; ML Models and Agents configure and execute capabilities.
- Optional advisors produce proposals only and cannot create truth by generating text.
- Ordinary events, telemetry, successful background work and non-actionable model outputs remain outside the inbox.
- The lifecycle continues through observed outcome so Idjwi learns from governed corrections and results.

## Consequences

- A versioned intelligence-item contract and repository are required later.
- Existing `Insight`, `Risk`, `Opportunity` and `Recommendation` records require adapters rather than indiscriminate concatenation.
- Role and operational-unit authorization determine visibility and valid next steps.
- Page counters measure governed work, not raw source volume.
- Web, desktop and mobile share the lifecycle and evidence while presenting role-appropriate subsets.

## Rejected alternatives

- **Generic notification feed:** produces noise and confuses delivery with truth.
- **ML and agent dashboard:** configuration and runtime diagnostics are different from attention and decision management.
- **LLM-generated insight stream:** cannot establish evidence, permissions, authority or outcome truth.
- **One card per source output:** creates duplicates instead of a correlated operational case.

## Verification consequence

Tests must eventually prove admission rules, source classification,
deduplication, authorization, lifecycle transitions, evidence, advisor identity
and outcomes. Phase 1 is verified when the page and living documentation use the
canonical boundaries and terminology.
