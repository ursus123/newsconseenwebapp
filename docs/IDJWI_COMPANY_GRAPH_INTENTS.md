# Idjwi Company Graph intents

**Contract:** `company-graph-intents.v1`  
**Graph context:** `company-graph.v1`

Company Graph page actions invoke explicit governed Idjwi capabilities. Button
behavior must never depend on interpreting its display label.

| Intent | Required purpose |
|---|---|
| `explain_company_graph` | Explain the authorized bounded organization graph |
| `explain_operational_unit` | Explain one authorized operational unit |
| `explain_node` | Explain the selected authorized node and visible relationships |
| `explain_relationship` | Explain one selected edge, evidence and confidence |
| `explain_graph_change` | Explain governed assertion-history changes |
| `find_graph_gaps` | Report disconnected records and graph-quality issues |
| `recommend_graph_action` | Prioritize a permitted operator response without executing it |
| `compare_graph_scopes` | Compare at least two separately authorized scopes |

The frontend sends the intent both as the `/copilot/ask` request `intent` and in
the versioned graph context. The backend rejects unknown or mismatched values.
An explicit value takes precedence over natural-language classification. Typed
questions may use conservative classification, but classification is fallback
behavior only.

Execution is deterministic over graph-safe fields from the authorized context.
Responses disclose completeness and truncation caveats and include trust
metadata. An advisor is not required and cannot replace the selected intent.
Each response also returns the validated graph semantic summary and the
governed packet metadata used for the answer. See
`IDJWI_GRAPH_PACKET_AND_RESPONSE_IDENTITY.md`.

## Invariants

- “Explain this company” resolves to `explain_company_graph`, never `find_graph_gaps`.
- Gap detection runs only through `find_graph_gaps`.
- Node and relationship explanations require a selected authorized identifier.
- Scope comparison cannot silently widen authorization.
- Recommendations expose permitted actions; they do not approve or execute them.
- Renaming button text cannot change the capability it invokes.
- Advisor request controls never prove that an advisor contributed.
