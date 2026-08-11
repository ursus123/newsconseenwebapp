# Canonical intelligence terminology

These terms are binding across frontend, Python services, Idjwi, contracts,
documentation and operator help.

| Term | Canonical meaning |
|---|---|
| Signal | A raw or normalized observation. It is input, not a finding. |
| Finding | An interpreted condition supported by evidence. |
| Risk | A possible negative operational consequence. |
| Opportunity | A possible beneficial operational consequence. |
| Prediction | A model-generated estimate about a future condition, with model version, horizon, confidence and uncertainty. |
| Recommendation | A proposed response to a finding; it is not a decision or approval. |
| Decision | A governed choice made by an authorized actor or policy. |
| Approval | Authority granted or denied for a proposed decision or action. |
| Action | A governed execution request; approval does not prove execution. |
| Task | Work assigned to a person or operational unit. |
| Agent execution | Work performed through a governed agent under Idjwi policy. |
| Outcome | The observed result of a decision, action, task or agent execution. |
| Feedback | Operator correction or outcome evidence used to improve Idjwi without promoting arbitrary chat to truth. |
| Alert | A time-sensitive delivery mechanism for an authorized condition. |
| Intelligence item | The governed inbox representation coordinating a finding, evidence, ownership, decisions, actions and outcomes. |

## Required distinctions

- A signal can produce a finding; it is not automatically a finding.
- A prediction can support a finding; not every prediction requires attention.
- An insight is display language only unless mapped to a canonical finding type.
- A recommendation proposes; a decision chooses; an approval authorizes; an
  action requests execution; an outcome records what happened.
- An alert delivers. It does not own the condition being delivered.
- Intelligence is the governed system and process; an intelligence item is its
  bounded operational work representation.

Legacy database entities named `Insight` may remain during migration, but new
contracts and operator language must treat their actionable, evidence-backed
projection as a **finding**. Compatibility names do not redefine the product.
