# Company Graph field classification and projection policy

**Authority:** Company Graph data-minimization contract  
**Status:** Implemented  
**Last reviewed:** 2026-07-22  
**Backend registry:** `python_layer/company_graph/field_classification.py`  
**Frontend mirror and serializers:** `src/services/companyGraphService.js`

## Rule

Every field considered for Company Graph has one classification:

| Classification | Graph behavior |
|---|---|
| `graph_safe` | May appear in an authorized graph summary |
| `role_restricted` | May appear only after `graph.read_sensitive` authorization |
| `sensitive` | Never appears in a graph node; requires a dedicated record-detail contract |
| `prohibited` | Never appears in the graph, Idjwi graph context, or graph export |

Unknown fields default to `prohibited`. Database availability, administrator role,
or advisor capability never makes an unclassified field graph-safe.

## Projection inventory

| Object | Graph-safe examples | Role-restricted examples | Sensitive examples | Prohibited examples |
|---|---|---|---|---|
| Enterprise | name, type, tier, status, city/country | parent enterprise | tax or bank details | tenant/user IDs, credentials, notes |
| Operational unit | name, type, status | parent unit, manager display name | budget, cost center | membership user IDs |
| Person | type, subtype, status, availability | display name, primary role, engagement dates | medical, pay, government ID | email, phone, auth IDs, notes |
| Task | title, type, status, priority, due date, outcome | assignee display name, completion time | private outcome notes, labor cost | person/assignee IDs, raw metadata |
| Transaction | type, status, dates, currency | reference and description | amounts, accounts, payment details | endpoint IDs and raw payloads |
| Product | name, type, class, stock state, expiry | SKU, supplier display name | price, cost, margin | enterprise IDs and credentials |
| Service | name, type, active state | service code, delivery owner | price, cost, contract terms | enterprise IDs and secrets |
| Relationship | predicate, status, validity dates | role | private rationale or notes | endpoint IDs in node attributes |
| Address | type, city, region, country | postal code | street line and coordinates | delivery instructions and endpoint IDs |
| Document | title, type, status, issue/expiry | document number, issuer | content and file location | signed URLs and endpoint IDs |
| Schedule | name, type, frequency, dates | timezone and owner display name | participant details | participant and endpoint IDs |
| Risk | title, type, status, severity | owner and mitigation status | exposure and legal analysis | endpoint IDs and private notes |
| Opportunity | title, type, status, confidence | owner and stage | value, margin, terms | endpoint IDs and raw metadata |
| Recommendation | title, type, priority, status | owner and review date | private/advisor rationale | prompts, completions, endpoint IDs |
| Decision | title, type, status, outcome, date | decision text and approver display name | private rationale | approver and endpoint IDs |
| Action | title, type, label, status, priority, dates | reasoning and approval status | action/result payloads | approver IDs, credential references |
| External observation | type, status, severity, time, expiry, confidence | source, location label, summary | precise location or matched-person detail | raw payload, credentials, request headers |

The executable registry is authoritative if this summary and code differ.

## Labels

Labels are projections too. A person or transaction does not receive a name or
reference label unless the principal may read its role-restricted fields. Addresses
use locality labels, never street addresses or coordinates. Unknown object types use
a generic type-and-ID label.

## Enforcement points

1. The backend constructs every node through the projection registry.
2. Stage 3 removes unauthorized sensitivity classes before source reads.
3. Idjwi context is rebuilt through the frontend graph sanitizer.
4. Browser export uses an explicit serializer rather than serializing UI objects.
5. Pydantic graph contracts reject competing full-row metadata containers.

Both frontend sanitizers are defense in depth. Backend projection remains the
security boundary.

## Evolution

Adding or reclassifying a field requires product purpose and minimum-necessary
justification, sensitivity and role review, backend and frontend registry updates,
API/Idjwi/export leak tests, and documentation review.

Operational units and actions have projection contracts now, even though their
first-class graph retrieval and ontology ownership are completed in later stages.
External observations use the `observation` source alias and the
`external_observation` projection policy.
