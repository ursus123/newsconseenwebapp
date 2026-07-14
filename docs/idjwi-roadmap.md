# Idjwi Roadmap — Becoming the Operational Intelligence Layer

## North Star

Idjwi should become the operational intelligence brain of the app. Not just a
chat assistant. Not just a report generator. It should know:

- what Newsconseen is
- what the ontology means
- what data exists
- what public/enrichment APIs exist
- how to analyze graphs, stats, risk, trends
- when to recommend action
- when to require approval
- what it has learned about each company

The final feeling should be: *"Idjwi understands my business, knows the
system, knows the available data sources, explains what matters, and can
safely help me act."*

---

## 1. Core Brain Layers

Build Idjwi as layered memory plus tools.

### Layer 0: Product Brain

Global, before any company data. It knows:

- Newsconseen is an Autonomous SME Operating System.
- The company graph is the center.
- Supabase is source of truth.
- python_layer is analytics/enrichment.
- Idjwi/agents are intelligence and execution.
- Forms create reality, datamart explains reality, agents act on reality.

This should come from `newsconseen_docs.md`, but also from structured
bootstrap memory.

### Layer 1: Ontology Brain

Idjwi must deeply know the entity model: Person, Enterprise, Product,
Service, Task, Transaction, Relationship, Address, Document, Schedule,
Signal, Channel, Territory, Animal, Plot, Observation, Insight,
Recommendation, Risk, Opportunity, Decision.

It should know how each entity connects, e.g.:

- Person works at Enterprise.
- Product is sold by Enterprise.
- Task is assigned to Person.
- Transaction involves Enterprise or Person.
- Address locates Enterprise, Person, Plot, Territory.
- Observation explains Animal, Plot, Product, or Address.
- Risk can attach to any entity.

### Layer 2: Source Intelligence Brain

The piece identified as missing. Idjwi should know every API/source
connected to Newsconseen — World Bank, UN Data, US Census, GDELT,
OpenStreetMap/Overpass/Nominatim, REST Countries, Open-Meteo, SoilGrids,
FAOSTAT, NASA POWER, USDA NASS/AMS, CMS, NPPES NPI, FDA/openFDA, RxNorm,
Open Food Facts, UPC Item DB, PubChem, NHTSA, npm/PyPI, OFAC sanctions,
World Bank Governance Indicators, exchange-rate APIs, and connector APIs
(QuickBooks, Xero, Sage, Stripe, Canvas, Google Classroom, MTN MoMo, Wave,
etc.).

Not just names — for every source, Idjwi should know:

- endpoint/tool name
- what it is good for
- what entity it enriches
- what fields it can create
- what risk/score it affects
- what inputs it needs
- limits/freshness/confidence
- whether it is public data, connector data, or operator-owned data

### Layer 3: Analysis Brain

Default analytical methods.

**Graph analysis:** central nodes, isolated nodes, missing relationships,
dependency risk, concentration risk, communities/clusters, path tracing,
duplicate detection, relationship strength.

**Statistics:** count, sum, average, median, trend and percent change,
distribution, outliers, ranking, cohort comparison, correlation, aging
buckets, completion rate, conversion rate, rolling average, sample-size
caveats.

**Charts:** time series → line/area; category comparison → bar; top-N →
horizontal bar; composition → donut/pie (few categories only); location →
map; relationship → graph/network; risk → matrix/scatter/heatmap; aging →
stacked bar; workflows/status → stacked bar/table.

### Layer 4: Risk Brain

Default risk framework: `risk = severity x likelihood x exposure x
confidence`.

**Risk categories:** operational, financial, compliance, inventory,
geographic, supplier/customer concentration, staff workload, data quality,
safety/recall, churn/retention, fraud/AML/sanctions, document expiry,
automation/action risk.

Every risk answer should explain: trigger, evidence, source, confidence,
impact, recommended action, whether approval is required.

### Layer 5: Company Memory

What it learns per tenant: terminology, KPI definitions, business rules,
approval preferences, operating hours, key locations, report preferences,
import mappings, known data exceptions, domain-specific context, agent
behavior preferences.

This should be reviewable in Settings, with confirmed/pending/rejected
states.

---

## 2. Memory Architecture

Reshape memory into scopes:

```
global      product, ontology, analysis methods, safety rules
source      API/enrichment source registry
industry    school, clinic, farm, retail, NGO, cooperative mappings
company     tenant-specific memory
user        individual user preferences
session     short-lived chat context
entity      memory attached to a specific record/entity
```

Current schema has scope, but memory still depends on `company_id`. Either
allow `company_id = NULL` for global/source memory or use a reserved
company id like `__global__`.

**Recall order:**

1. global product/safety memory
2. source/API registry memory
3. industry memory
4. company memory
5. user preference memory
6. selected page/entity context
7. session history

That gives Idjwi a brain before company data starts.

---

## 3. Source Intelligence Registry

A structured registry — `python_layer/copilot/docs/source_registry.json`,
or database-backed as `analytics.idjwi_source_registry`.

Each source entry:

```json
{
  "source_id": "soilgrids",
  "provider": "ISRIC SoilGrids",
  "category": "agriculture",
  "tools": ["search_public_data:soil", "/agriculture/soil"],
  "entities_enriched": ["Plot", "Address", "Observation"],
  "fields_created": ["soil_ph", "organic_carbon", "clay", "sand", "silt"],
  "requires": ["latitude", "longitude"],
  "used_for": ["crop suitability", "soil risk", "farm planning"],
  "limits": ["location precision matters"],
  "freshness": "provider dependent",
  "confidence": "medium"
}
```

Then Idjwi can answer: *"To enrich this plot, I need coordinates. I can use
SoilGrids for soil composition, NASA POWER for climate history, Open-Meteo
for forecast, and FAOSTAT for crop context."*

---

## 4. Default Answer Policy

Idjwi should always answer in an operational structure:

1. Direct answer
2. Evidence used
3. Meaning
4. Recommended action
5. Caveat / missing data

Example: *"Revenue is down 12% this month. The drop is concentrated in two
enterprises. This matters because they were top contributors last month. I
recommend creating follow-up tasks and checking unpaid invoices. Data
source: transaction summary; confidence: medium."*

It should avoid generic chatbot behavior. Its default personality should be
analyst/operator.

---

## 5. Default Question Routing

When a user asks a question, Idjwi should silently classify it:

| Question | Route |
|---|---|
| "How are we doing?" | KPI snapshot + risks + actions |
| "Why did this happen?" | variance/drilldown |
| "Who matters most?" | graph centrality/concentration |
| "What should I worry about?" | risk analysis |
| "Show me…" | chart/table/map |
| "Compare…" | statistical comparison |
| "What changed?" | trend/anomaly |
| "What should I do?" | recommendation + action proposal |
| "Can you enrich this?" | source registry + required inputs |
| "What do you know about this?" | entity + enrichment + graph context |

---

## 6. Execution Model

Idjwi should have modes, but the user should not have to think about them.

- **Autonomous mode** — deterministic, no LLM required, uses memory +
  tools. Good for summaries, checks, known metrics, simple analysis.
- **Advisor mode** — LLM enabled, deeper reasoning, cross-source synthesis,
  narrative explanations, market/external research.
- **Action mode** — creates tasks, recommendations, workflows, imports.
  Uses the approval gate. Logs every action.

The UI can show the mode, but Idjwi should choose sensibly.

---

## 7. Teach Idjwi Everywhere

`TeachIdjwiButton` should appear anywhere the operator is looking at
meaningful context: charts, reports, map/spatial workbench, entity detail
panels, data repair results, import mapping screens, workflow builder,
agent approvals, risk cards, intelligence inbox items.

Memory from these should be contextual:

```
memory_type: graph_pattern / risk_rule / metric_definition /
             source_preference / domain_context
entity_type: Address
entity_id:   abc123
source_page: MapView
```

This turns ordinary use into training.

---

## 8. UI Pieces Idjwi Needs

- Idjwi Chat
- Idjwi Memory Manager
- Source Intelligence Registry
- Company Readiness Panel
- "Ask About This" button on every entity
- Explain This Chart
- Explain This Risk
- Teach Idjwi
- Agent Approval Queue
- Source/Evidence drawer
- "What Idjwi used" trace panel
- "What Idjwi remembers" panel

The evidence drawer is important. Every serious answer should show: tools
called, tables queried, public APIs used, memory used, confidence, missing
data.

---

## 9. Implementation Roadmap

**Phase 1 — Foundation**
Add global/source/industry memory scopes. Seed product, ontology, safety,
analysis, and source registry memory. Make Idjwi recall global + company
memory together.

**Phase 2 — Source Intelligence**
Build `source_registry`. Map APIs to ontology entities and enrichment
fields. Add "what sources can enrich this?" answers. Add source/evidence
output to Idjwi responses.

**Phase 3 — Analysis Defaults**
Add graph/stat/risk/chart rules to bootstrap memory. Update prompt/tool
routing so Idjwi defaults to analyst behavior. Make chart generation
automatic when useful.

**Phase 4 — Company Onboarding Brain**
Idjwi guides setup before data exists. It asks what industry/company type.
It recommends minimum dataset. It suggests connectors/APIs/enrichments. It
creates a readiness checklist.

**Phase 5 — Entity-Aware Idjwi**
Every entity page can open Idjwi with selected entity context. Idjwi can
explain an entity's graph neighborhood, risks, enrichment, tasks,
transactions.

**Phase 6 — Trust and Governance**
Memory review workflows. Approval policies. Audit trail for Idjwi actions.
Confidence labels. Source trace. "Forget/update this memory."

**Phase 7 — Autonomous Operating Loop**
Daily briefing. Intelligence Inbox generation. Suggested tasks. Risk
monitoring. Enrichment recommendations. Agent handoff.

---

## Final Shape

The finished Idjwi should have five brains:

1. **Ontology Brain** — understands the company graph.
2. **Source Brain** — knows APIs, connectors, and enrichments.
3. **Analysis Brain** — knows stats, charts, graph methods, and risk.
4. **Memory Brain** — learns company-specific truth over time.
5. **Action Brain** — safely proposes and executes work.

That is how it becomes more than a copilot. It becomes the operating
intelligence layer of Newsconseen.
