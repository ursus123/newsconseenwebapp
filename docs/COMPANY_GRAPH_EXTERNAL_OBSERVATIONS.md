# Company Graph external operational observations

## Product contract

Stage 25 adds governed, expiring external intelligence to Company Graph and
Idjwi. Supported observation classes are severe weather, closures, recalls,
traffic, supply disruption, public holidays, and regulatory changes.

External observations are not canonical operational truth. `public.external_observations`
stores the normalized source claim and `public.external_observation_matches`
stores bounded assertions about the internal records it may affect. Neither
table may silently update an enterprise, operational unit, task, product,
schedule, address, territory, route, pharmacy, or supplier.

## Required evidence

Every observation records its source and source record, retrieval and freshness
times, location, validity window, confidence, expiry, provenance, and a hash of
the provider payload. Provider credentials, request headers, and raw payloads
are prohibited from graph packets.

Every match records the affected target, predicate, deterministic matching
method, confidence, evidence, verification state, validity, and expiry. Matches
begin as `proposed`. Operator confirmation or rejection uses the existing graph
assertion governance and audit path.

## Governed flow

1. The Python API gateway retrieves or receives provider data.
2. A provider adapter normalizes it to `external-operational-observation.v1`.
3. Authorized targets are matched with an explicit, reproducible method.
4. The observation and matches are stored separately from canonical records.
5. Company Graph projects active, unexpired observations and affected edges.
6. Idjwi uses `explain_external_observation`, cites the visible graph evidence,
   discloses uncertainty, and proposes alternatives requiring approval.
7. Outcomes and corrections flow through the existing assertion-learning loop.

## API

- `GET /company-graph/external-observations` lists active authorized observations,
  matches, and non-executing alternative proposals.
- `POST /company-graph/external-observations` is restricted by
  `graph.external_observation_manage`. It validates target authorization and
  records an audit event.

## Operator guidance

Use External Disruptions to understand what outside the organization may affect
today's operation. Check source freshness, expiry, confidence, and matching
evidence before acting. “Ask Idjwi” explains affected records and governed
alternatives. Approving an alternative must use the normal decision/action
policy; an external observation alone never authorizes a change.

## Cross-surface behavior

Web and desktop provide graph inspection, evidence, matching, and approval.
Mobile presents only role-authorized affected tasks and approved alternatives.
All surfaces use the same tenant, operational-unit, graph, and Idjwi contracts.
