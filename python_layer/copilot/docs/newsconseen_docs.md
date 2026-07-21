# Newsconseen — Complete Product Documentation

> **RULE FOR DEVELOPERS**: Whenever this file is updated, Idjwi's product knowledge is automatically
> refreshed on the next request (the file is loaded at request time, not startup). There is no
> redeploy or cache flush required. Keep this file in sync with CLAUDE.md and ARCHITECTURE.md.
> The development method, page definition of done, role-aware surface strategy,
> administrator page explanations, backward review, and living-documentation rule
> are defined in `docs/strategy/DEVELOPMENT_STRATEGY.md`.

---

## What is Newsconseen?

**Newsconseen is the Autonomous SME Operating System.**

It gives any small or medium organisation — a school, clinic, cooperative, farm, NGO, franchise,
government agency, or retail chain — the same operational intelligence and autonomous execution
capability that Palantir Foundry gives governments and Fortune 500 companies, at a fraction of the
cost and without requiring data engineers or a technical team.

The core insight: every SME has the same underlying data structure regardless of industry. They
have people, organisations, things they sell or manage, tasks they perform, transactions they
record, and addresses they operate from. The industry changes the labels. The structure does not.

Newsconseen solves this with three architectural layers, one universal ontology, and autonomous
agents that run operations on behalf of the operator.

### Idjwi product contract

Idjwi is Newsconseen's default operational mind. It owns organizational context,
ontology, memory, permissions, tools, policies, decisions, audits, and governed
actions. Idjwi Core remains available for deterministic intelligence and workflows
without an external LLM.

LLMs are optional tenant-controlled advisors. A tenant may use none, one, or
multiple advisors for different objectives. Advisors receive bounded authorized
context and return proposals to Idjwi. They do not own memory, authorize tools,
approve decisions, or execute actions. Idjwi validates advisor output before it is
presented, remembered, or acted upon. No provider, including Anthropic or
Codex/OpenAI, is Idjwi.

**The moat**: agent memory + operator data grows over time. The longer an operator uses
Newsconseen, the smarter their agents become about their specific business. No competitor can
replicate this without the history.

---

## Three-Layer Architecture

```
Layer 1 — Canonical Operational System (Supabase public.* + Auth + RLS)
  The governed system of record. Canonical master data and actions live here.
  Entities: Person, Enterprise, Product, Relationship, Task, Transaction, Address.
  Rule: every mutation in Layer 1 triggers an ETL to Layer 2.

Layer 2 — Deployable Datamart (python_layer on Railway, FastAPI + PostgreSQL)
  The analytical engine. ETL pipeline extracts from Layer 1, transforms, and loads
  into PostgreSQL analytics tables.
  Rule: ALL stat card values and copilot tool queries come from here.
         Never query Base44 directly for analytics.

Layer 3 — Idjwi Operational Mind (Idjwi Core, Advisors, Agents, Alerts, Network Intelligence)
  Rule: immediate canonical context is read only through tenant- and permission-enforcing
  repositories; historical, cross-object, graph, governance, and predictive reasoning uses
  Layer 2 intelligence. Derived intelligence never silently replaces canonical facts.
  Components: Idjwi, optional tenant advisors, 8 Autonomous Agents, Alert Engine, Anomaly Detection,
              KPI Goal Tracking, ML Models, Network Intelligence.
```

**Golden rule**: Forms create reality → Databases store reality → Dashboards explain reality.

---

## The Universal Ontology — 15 Canonical Entities

Every industry maps to these fifteen entities. The first 7 are the original core; the next 5 (Document, Schedule, Signal, Channel, Territory) extend coverage to document management, recurring patterns, telemetry, communications, and geography; the final 3 (Animal, Plot, Observation) extend to agricultural, aquaculture, veterinary, and ecological operations.

### 1. Person
Any human in any role.

| Field | Values |
|-------|--------|
| person_type | `staff` · `client` · `contact` · `volunteer` |
| engagement_model | `employed` · `contracted` · `freelance` · `volunteer` · `elected` · `appointed` · `enrolled` · `subscribed` |
| status | `active` · `inactive` · `on_leave` |
| availability_status | `available` · `busy` · `on_leave` · `unavailable` |

- **staff** → employees, teachers, drivers, nurses, field agents, contractors
- **client** → patients, students, customers, members, beneficiaries
- **contact** → vendors, partners, donors, referral sources, suppliers
- **volunteer** → unpaid contributors

`person_subtype` is operator-defined (e.g. "Registered Nurse", "Year 4 Student", "Wholesale Buyer").
Never hardcode subtypes — they come from the operator's MasterDataOption taxonomy.

### 2. Enterprise
Any organisation, location, or operational unit.

| Field | Values |
|-------|--------|
| enterprise_type | `commercial` · `nonprofit` · `government` · `household` · `cooperative` · `trust` |
| enterprise_tier | `headquarters` · `regional_office` · `branch` · `subsidiary` · `franchise` · `department` · `unit` · `project` |
| operating_status | `open` · `closed` · `temporarily_closed` · `seasonal` |
| status | `active` · `inactive` · `prospect` · `archived` |

### 3. Product / Item
Any item, service, resource, or deliverable.

| Field | Values |
|-------|--------|
| item_type | `physical` · `living` · `digital` · `service_package` · `financial_instrument` |
| item_class | `perishable` · `non_perishable` · `hazardous` · `controlled` · `regulated` · `unrestricted` · `serialized` · `consumable` · `reusable` |
| unit_of_measure | `piece` · `box` · `kg` · `g` · `liter` · `ml` · `hour` · `day` · `session` · `head` · `flock` · `acre` · `license_seat` · … |

### 4. Relationship
Links any two entities. Captures org structure, assignments, memberships, partnerships.
- person ↔ enterprise (employment, enrolment, membership)
- person ↔ person (reporting lines, family)
- enterprise ↔ enterprise (parent/subsidiary, franchise)
- person ↔ product (ownership, allocation)

### 5. Task
Any activity, visit, appointment, shift, or work order.
Fields: title, task_type, status, priority, due_date, scheduled_date, scheduled_time,
actual_completion_time, assigned_to, completed_by, enterprise, related_person, related_item,
quantity_used, outcome, outcome_reason, outcome_notes.

- `task_type` is operator-defined via MasterDataOption.
- `outcome` values: pending, completed, partially_done, refused, missed, on_hold, loa, not_applicable.
- `outcome_reason` is operator-defined via MasterDataOption (e.g. "Patient refused verbally", "Staff absent", "Supply out of stock").
- `actual_completion_time` records when the task was actually done vs `scheduled_time`.
- `completed_by` records the person who physically carried out the task (may differ from `assigned_to`).
- `quantity_used` records units of `related_item` consumed or administered during this task.

**analytics.task_summary new columns** (available to copilot via get_task_summary):
- `refused_tasks` — count of tasks with outcome = refused
- `missed_tasks` — count of tasks with outcome = missed
- `avg_completion_delay_mins` — mean delta (minutes) between scheduled_time and actual_completion_time on completed tasks
- `total_quantity_used` — total units consumed across completed tasks in this group

### 6. Transaction
Any financial record: invoice, payment, expense, payroll.
Fields: date, transaction_type, amount, net_amount, tax_amount, status, counterparty.

### 7. Address
Any physical or postal location linked to a person, enterprise, or other entity.
Fields: street, city, state, country, zip_code, latitude, longitude.

### 8. Document
Any file, record, or formal document attached to an entity.
Fields: document_type, title, status, file_url, enterprise_id, signed_at, expires_at, is_contract, is_invoice, is_policy.
ETL: `analytics.document_summary` — counts, active/expired/signed flags, new in last 7/30 days.

### 9. Schedule
Any recurring pattern, shift, or calendar rule.
Fields: schedule_type, title, frequency, day_of_week, time_of_day, status, starts_on, ends_on, enterprise_id, assigned_to.
Frequency values: `daily` · `weekly` · `fortnightly` · `monthly` · `custom`.
ETL: `analytics.schedule_summary` — active, paused counts; is_daily, is_weekly, is_monthly flags.

### 10. Signal
Any sensor reading, survey response, or telemetry data point.
Fields: signal_type, source_entity_type, source_entity_id, value, unit_of_measure, recorded_at, is_anomaly, notes, enterprise_id.
ETL: `analytics.signal_summary` — counts, anomaly count, avg_value, is_sensor, is_survey flags.

### 11. Channel
Any communication channel and its interactions (WhatsApp, email, call log, social).
Fields: channel_type, name, purpose, status, last_message_at, message_count, sentiment, enterprise_id, person_id.
ETL: `analytics.channel_summary` — active count, positive/negative sentiment counts, total_messages.

### 12. Territory
Any geographic coverage area: sales zones, delivery zones, catchments, districts.
Fields: territory_type, name, status, country, region, area_km2, population_estimate, description.
Territory types: `sales_zone` · `delivery_zone` · `service_area` · `catchment` · `district` · `region`.
ETL: `analytics.territory_summary` — active count, total_area_km2, total_population, type flags.

### 13. Animal
Any biological subject: livestock, poultry, aquaculture stock, veterinary patients, research animals, pets.
Fields: name, animal_type, species, breed, sex, status, date_of_birth, weight_kg, tag_id, acquisition_date, enterprise_id.
Animal types: `livestock` · `poultry` · `aquaculture` · `pet` · `wildlife` · `research`.
ETL: `analytics.animal_summary` — active count, avg_age_days, avg_weight_kg, by type/species/status.
Copilot tool: `get_animal_summary(animal_type, species)`.

### 14. Plot
Any managed land or water area: farm fields, grazing paddocks, aquaculture ponds, orchards, greenhouses.
Fields: name, plot_type, land_use, crop_type, area_ha, status, irrigation_type, soil_type, latitude, longitude, enterprise_id.
Plot types: `arable` · `grazing` · `orchard` · `pond` · `greenhouse` · `forest`.
ETL: `analytics.plot_summary` — plot count, total_area_ha, avg_area_ha, plots_with_coordinates.
Copilot tool: `get_plot_overview(plot_type, land_use)`.

### 15. Observation
Any time-series field measurement, sensor reading, agronomic sample, or veterinary exam result.
Fields: observation_type, subject_type, subject_id, numeric_value, text_value, unit_of_measure, is_anomaly, observed_at, enterprise_id, notes.
Observation types: `soil_moisture` · `temperature` · `weight` · `yield` · `disease_check` · `water_quality`.
ETL: `analytics.observation_summary` — count, avg/min/max values, anomaly count, 7d/30d recency.
Copilot tool: `get_observation_summary(observation_type, subject_type)`.

---

## Agricultural & Ecological Intelligence

Newsconseen includes public agricultural APIs accessible to Idjwi via `search_public_data`:

| Dataset | Description | Example query |
|---------|-------------|---------------|
| `weather` | 7-day agricultural forecast — temperature, precipitation, evapotranspiration | `location="Nairobi"` |
| `soil` | SoilGrids ISRIC — pH, SOC, clay, sand at 0-5cm | `location="-1.29,36.82"` |
| `faostat` | FAO crop production by country and commodity | `query="Maize", location="Kenya"` |

Additional agricultural endpoints in python_layer:
- `GET /agriculture/weather` — agricultural forecast by lat/lon (Open-Meteo)
- `GET /agriculture/soil` — soil composition (SoilGrids ISRIC)
- `GET /agriculture/faostat` — crop production data (FAO)
- `GET /agriculture/nasa-power` — NASA agro-meteorological data

---

## MasterDataOption — Operator-Defined Taxonomy

`person_subtype`, `enterprise_subtype`, `item_subtype`, `task_type`, etc. are all
operator-defined in MasterDataOption. This makes Newsconseen universal — operators define
their own vocabulary without any code change.

A school can define subtypes like "Year 4 Student", "Mathematics Teacher", "School Governor".
A clinic can define "General Practitioner", "Physiotherapist", "Outpatient".
A farm can define "Dairy Cow", "Broiler Chicken", "Seasonal Worker".

The same platform serves all three without a single line of code change.

---

## ETL Pipeline

After every mutation in Layer 1, an ETL is triggered to sync Layer 2:

```
POST /cron/etl-all              Full pipeline — all entity ETLs
POST /load/people-summary       Targeted: people only
POST /load/enterprise-summary
POST /load/product-summary
POST /load/transaction-summary
POST /load/task-summary
POST /load/address-summary
POST /load/relationship-summary
POST /load/service-summary
POST /load/geospatial-summary
POST /load/document-summary     New entities (Entities 8–12)
POST /load/schedule-summary
POST /load/signal-summary
POST /load/channel-summary
POST /load/territory-summary
GET  /health                    Status + last run timestamps + row counts
```

**Multi-tenancy rule**: ETL extracts ALL records from all companies, stamps each row with
`company_id`, and loads all rows into shared analytics tables. Tenant isolation happens ONLY
at read time (WHERE company_id = :id). Adding a new client requires zero ETL configuration.

**Three-tier fallback** (applies to all data-reading features):
```
Tier 1 — analytics.*     PostgreSQL analytics tables (fast, aggregated)
Tier 2 — raw.*           PostgreSQL raw tables (full records)
Tier 3 — Base44 live     Direct Base44 entity query (always available)
```
If ETL has not run (tables are empty), every feature falls back to Base44 live data.
The user always sees their data regardless of ETL state.

---

## Idjwi — The Operational Mind

Idjwi is Newsconseen's provider-neutral operational intelligence and governance
layer. It understands authorized organizational scopes, answers from the ontology
and datamart, preserves governed memory, coordinates tools and agents, records
decisions and audits, and safely helps the SME act. Optional tenant-selected
advisors can contribute bounded reasoning, but Idjwi owns the final governed result.

### Advisor policy and workspace endpoints

The legacy-compatible `/copilot/*` API prefix exposes Idjwi services:

- `GET /copilot/status` — Idjwi Core readiness and optional advisor availability.
- `GET /copilot/context` — authenticated company and operational-unit context.
- `GET /copilot/advisors` — tenant policy and secret-free advisor portfolio.
- `PUT /copilot/advisors/policy` — manager/admin tenant routing policy.
- `PUT /copilot/advisors/connection` — manager/admin provider metadata and secure credential reference.
- `GET /copilot/decisions` — tenant-scoped decision and outcome register.
- `GET /copilot/events` — tenant-scoped Idjwi audit trail.
- `POST /copilot/ask` — Idjwi Core plus optional policy-routed advisor request.

The Idjwi workspace is organized around Today, Ask Idjwi, Decisions, Work,
Memory, Advisors, and Audit. Provider/model identity is secondary configuration
and audit metadata, not Idjwi's product identity.

### What Idjwi can do

**Operational Intelligence** (your own data):
- Headcount, staff availability, churn risk, people by type/status
- Revenue, expenses, overdue invoices, top debtors, accounts receivable aging
- Task completion rates, overdue tasks, outcome breakdowns
- Stock levels, expiry alerts, reorder urgency, inventory health
- Branch/department structure and cross-branch performance comparison
- KPI goals with progress tracking (on track / at risk / behind / exceeded)
- Anomaly detection — statistical z-score outliers across all metrics
- Alert history — what notifications the system has sent
- **Time & Attendance** — clock-in/out analysis, hours per person, utilisation vs scheduled hours

**ML-Powered Predictions**:
- Client retention/churn risk (Cox Proportional Hazard survival model)
- Customer segmentation and lifetime value (K-Means clustering)
- Demand forecasting and staffing forecast (Prophet + XGBoost)
- Spend trends, revenue trends, payment behaviour predictions

**Market & External Intelligence**:
- Web search (Brave Search → DuckDuckGo → Wikipedia fallback chain)
- World Bank global development indicators (GDP, health, education)
- US Census Bureau demographics (ACS5 dataset)
- OpenFDA drug, food enforcement, and device recall data
- UN Development Programme data
- Live currency exchange rates
- OpenStreetMap business counts by location

**Write-Back Actions** (via approval gate):
- Create tasks, update records, flag items, send messages
- **Create single records** for any entity (`create_record` tool) — low-risk entities (Document, Schedule, Territory, Signal, Channel, Task) execute immediately; high-risk entities (Person, Enterprise, Product, Transaction) queue for operator approval
- **Bulk import** any entity type (`import_records` tool, max 200 records) — always queues for operator approval before executing
- Low-risk actions execute immediately; higher-risk actions queue for operator review

**Ontology-Native Intelligence** (added in Copilot v2):
- Traverse the company graph — fetch an entity and its full web of relationships, tasks, and transactions (`get_company_graph_context`)
- Read enrichment data for any entity — sanctions flags, risk scores, geocoding, spend trends (`get_enrichment_context`)
- Search the intelligence layer — insights, risks, opportunities saved by Idjwi or agents (`search_intelligence`)
- Introspect the full ontology schema with valid enum values for all 15 entities (`get_ontology_schema`)
- **Propose actions** without executing — `propose_task`, `propose_chart`, `propose_record_update` all write to the approval gate for operator review
- **Save insights** to the intelligence layer immediately (`write_insight`) — appears in the Saved to Intelligence Layer panel in chat

**Persistent Memory**:
- Saves operator preferences, instructions, and context across all future sessions
- Examples: "always show amounts in KES", "our fiscal year starts in July",
  "we call our clients 'patients'"

**Product Knowledge** (about Newsconseen itself):
- Architecture, entities, features, phases, ETL, agents, alerts, connectors
- How any feature works, what data flows where, how to set things up
- Troubleshooting guides (empty tables, ETL not running, missing env vars)

### Available Query Tools

| Tool | Purpose |
|------|---------|
| `get_operator_context` | Company name, type, status, contact |
| `get_people_summary` | Headcount by type and status |
| `get_person_churn_risk` | Inactive / at-risk people |
| `get_staff_availability` | Active staff by branch/role |
| `get_transaction_summary` | Revenue, expenses, outstanding amounts |
| `get_overdue_invoices` | Unpaid past due date |
| `get_task_summary` | Task completion rates by type; also returns refused, missed, avg_completion_delay_mins, total_quantity_used |
| `get_task_outcomes` | Outcome breakdown (completed, overdue, missed) |
| `get_product_summary` | Stock levels, expiry alerts |
| `get_enterprise_overview` | Branch and department structure |
| `get_network_overview` | Cross-branch performance |
| `get_ml_predictions` | Churn risk, LTV segments, demand forecast |
| `get_relationship_summary` | Relationship counts by type |
| `get_address_overview` | Geographic breakdown |
| `get_service_overview` | Service catalogue |
| `get_product_at_risk` | Items below reorder level or expiring |
| `get_operational_trends` | Month-by-month task completion % and headcount |
| `get_top_debtors` | Counterparties with highest outstanding amounts |
| `get_kpi_snapshot` | One-row business health snapshot |
| `get_top_clients` | Top clients by lifetime revenue with RFM + churn risk |
| `get_staff_leaderboard` | Staff ranked by completion rate or workload |
| `get_ar_report` | Accounts receivable aging buckets |
| `get_inventory_health` | Stock coverage days, dead stock, reorder urgency |
| `get_network_kpis` | Cross-branch performance rankings |
| `get_concentration_risk` | Revenue/client/staff concentration risk (HHI) |
| `get_entity_risk_report` | Composite risk: sanctions, AML, recalls, country risk |
| `get_kpi_goals` | KPI targets with current status and progress % |
| `get_anomaly_report` | Z-score outliers and metric drift |
| `get_alert_history` | Alerts sent in last N days |
| `find_people_records` | Search people by name/type/status (returns actual names) |
| `find_task_records` | Search tasks by assignee/type/status/overdue |
| `find_transaction_records` | Search transactions by counterparty/type/amount |
| `find_relationship_records` | Search relationships |
| `find_product_records` | Search inventory by name/type/status |
| `find_address_records` | Search addresses by city/type |
| `inspect_raw_record` | Fetch single complete record by ID |
| `get_entity_join` | Join two entity tables in one call |
| `web_search` | Multi-tier web search |
| `search_public_data` | World Bank, Census, FDA, OSM, FX rates, UN data |
| `request_action` | Write-back: create tasks, update records, flag items |
| `create_record` | Create a single record for any entity (approval gate: auto/notify/approve) |
| `import_records` | Bulk import up to 200 records of any entity (always requires approval) |
| `save_copilot_memory` | Persist preferences/instructions for future sessions |
| `get_attendance_report` | Daily clock-in/out records per person (time entries) |
| `get_time_summary` | Total hours per person aggregated by week or month |
| `get_utilisation_report` | Staff utilisation % vs scheduled hours (over/under) |
| `get_document_summary` | Document counts, expiry alerts, signed/active breakdown |
| `get_schedule_summary` | Schedule counts by frequency and status |
| `get_signal_summary` | Signal/telemetry counts, anomaly count, average values |
| `get_channel_summary` | Channel counts, sentiment breakdown, message volumes |
| `get_territory_summary` | Territory counts, total area km², population coverage |
| `get_animal_summary` | Livestock/animal counts by type, species, status; avg age and weight |
| `get_plot_overview` | Managed land counts, total hectares, land use breakdown |
| `get_observation_summary` | Sensor/field readings — avg values, anomaly counts, recency |
| `search_public_data` (weather) | 7-day agricultural weather forecast (Open-Meteo) |
| `search_public_data` (soil) | Soil composition at a location (SoilGrids ISRIC) |
| `search_public_data` (faostat) | FAO crop production data by country and commodity |
| `execute_ingestion_plan` | Load a previously analysed import plan into Newsconseen using cached rows. Requires the operator to say "yes, load it" or "confirm" with the plan_id. Never call without explicit confirmation. |
| `generate_import_template` | Generate a blank CSV import template for any entity type. Returns column headers, a sample row, raw CSV content, and a download URL. Use when operators ask "give me a template for importing people" or "what format do I need for a product import". |
| **Ontology-Native Tools (Copilot v2)** | |
| `get_company_graph_context` | Fetch an entity and its full graph — relationships, open tasks, recent transactions. Returns: center entity fields, connected nodes (type/label/status/strength), edge list, node_count, edge_count. Use for questions about a specific entity's connections or context. |
| `get_enrichment_context` | Read enrichment data attached to an entity — sanctions flags, geocoding, risk scores, spend_trend, churn_probability, domain metadata. Returns structured enrichment records grouped by enrichment_type. |
| `search_intelligence` | Search the intelligence layer for insights, risks, opportunities, or recommendations. Tries Base44 intelligence entities first, falls back to analytics.copilot_insights, then analytics.agent_approvals. Filter by intelligence_type, subject_type, or subject_id. |
| `get_ontology_schema` | Returns the full schema for all 15 canonical entities — field names, valid enum values, and descriptions. Use when an operator asks what fields exist, what values are valid, or before proposing a record update. |
| `propose_task` | Proposes a new task for operator review. Writes to analytics.agent_approvals with action_type="create_task". Returns approval_id. NEVER executes without the operator approving in the Agents panel. |
| `propose_chart` | Proposes a chart or visualisation for operator review. Returns a preview config (type, metric, title) plus approval_id. Chart is not rendered until approved. |
| `propose_record_update` | Proposes a field-level patch on an existing entity record. Returns approval_id. The update is NOT applied until the operator approves. Always call `get_ontology_schema` first to confirm valid field values. |
| `write_insight` | Immediately saves a structured insight to the intelligence layer (analytics.copilot_insights or Base44 insights entity). Returns insight_id. Appears in the "Saved to Intelligence Layer" panel in the chat UI. Use for key findings the operator should be able to retrieve later. |

---

### Time & Attendance Analytics

Clock-in/out data is stored as Tasks with `task_type` set to `clock_in`, `clock_out`,
`break_start`, or `break_end`. The ETL transforms these into `analytics.time_summary`:
one row per person per working day.

Copilot questions you can ask:
- "Who clocked in today?"
- "Attendance report for last week"
- "How many hours did staff work this month?"
- "Who is overloaded?" / "Who has spare capacity?"
- "Show me the timesheet for Mary"
- "Utilisation report for the last 30 days"

---

## Ontology-Native Copilot (Copilot v2)

Idjwi is ontology-native: it answers from structured objects in the company graph,
datamart, enrichment layer, and intelligence layer — not from free-text generation alone.

### Four Data Layers Available to Idjwi

| Layer | Tools | What it contains |
|-------|-------|-----------------|
| Company Graph | `get_company_graph_context` | Entity + all its relationships, tasks, transactions |
| Datamart | All `get_*` query tools | Aggregated metrics, trends, ML predictions |
| Enrichment | `get_enrichment_context` | Sanctions flags, risk scores, spend trends, domain data |
| Intelligence | `search_intelligence`, `write_insight` | Saved insights, risks, opportunities, copilot proposals |

### Structured Answer Format

Every copilot response is structured as four sections:
1. **Answer** — the direct answer to the question
2. **Evidence** — the specific data used (tool name + key metric)
3. **Recommended Actions** — proposed next steps (may include propose_* tool calls)
4. **Limitations** — what Idjwi could not verify or data gaps

### Propose → Approve Workflow

`propose_task`, `propose_chart`, and `propose_record_update` write to the approval gate
(`analytics.agent_approvals`) with `agent_name='copilot'`. They **never execute directly**.

The operator sees a "Proposed Actions" card in the chat UI with Approve / Reject buttons.
Approve calls `POST /copilot/recommendations/{id}/approve`.
Reject calls `POST /copilot/recommendations/{id}/reject`.

When approved, the action status updates to 'approved' in the approvals table.
Full execution (actually creating the record/task) is wired to the approval event.

### Intelligence Layer Storage

`write_insight` persists findings to `analytics.copilot_insights`:

| Column | Description |
|--------|-------------|
| id | UUID primary key |
| company_id | Tenant ID |
| insight_type | insight / risk / opportunity / recommendation |
| title | Short headline |
| body | Full insight text |
| subject_type | Entity type the insight is about |
| subject_id | Entity record ID |
| evidence | JSONB array of supporting data points |
| status | active / archived |
| source | copilot (default) |
| created_at | Timestamp |

Saved insights appear in the "Saved to Intelligence Layer" panel in the chat UI and are
searchable via `search_intelligence` in future sessions.

### Entity Context in AskRequest

When the operator is on an entity page (Enterprises, People, etc.), the frontend can pass:
- `current_page` — which page the operator is on
- `selected_entity_type` — e.g. "enterprise"
- `selected_entity_id` — the specific record being viewed

Idjwi receives this context and can automatically call `get_company_graph_context`
or `get_enrichment_context` for the selected entity without the operator needing to specify it.

---

## 8 Autonomous Agents (Layer 3)

Autonomous agents run on a schedule and take actions without operator intervention.
They operate through the same approval gate as Idjwi's legacy `request_action` tool.

| Agent | Purpose | Model |
|-------|---------|-------|
| Operations Agent | Daily ops health check, task follow-ups, auto-remediation | Sonnet |
| Revenue Intelligence Agent | AR aging, overdue alerts, revenue trend analysis | Sonnet |
| Retention Agent | Churn risk scoring, re-engagement task creation | Sonnet |
| Inventory Agent | Reorder alerts, expiry warnings, dead stock flags | Sonnet |
| Onboarding Agent | New client/staff onboarding workflow automation | Sonnet |
| Compliance Agent | Sanctions screening, AML flags, regulatory checks | Haiku |
| Network Intelligence Agent | Cross-branch performance analysis | Sonnet |
| Market Research Agent | Weekly competitive intelligence briefings | Opus |

**LLM Routing (Phase 4G)**:
- Haiku — triage, simple lookups, compliance scanning (fast + cheap)
- Sonnet — execution-level reasoning, most operational tasks (balanced)
- Opus — strategic analysis, market research briefings (deep + expensive)

---

## Alert Engine (Layer 3)

10 alert types delivered via WhatsApp, Email, or SMS:

1. Overdue invoice alert
2. Low stock / reorder threshold alert
3. Expiry alert (N days before expiry)
4. KPI goal breach alert
5. Anomaly detection alert (z-score outlier)
6. Staff absence / unavailability alert
7. Task overdue alert
8. New client onboarding alert
9. Compliance flag alert (OFAC SDN, AML)
10. Network performance alert (branch underperformance)

Configuration: per-company, per-channel. Set via `ALERT_DEFAULT_EMAIL` /
`ALERT_DEFAULT_WHATSAPP` environment variables, or operator-configured in Settings.

---

## ML Models (Phase 5)

All models run automatically during the ETL cron and write results to analytics tables.
Results are available via `get_ml_predictions` tool.

| Model | Algorithm | Output |
|-------|-----------|--------|
| Retention / Churn Risk | Cox Proportional Hazard | `high_risk_count`, `high_risk_percent`, survival curves |
| Customer Segmentation | K-Means clustering | Segments with LTV, RFM labels |
| Demand Forecasting | Prophet + XGBoost | 30-day forward forecast, seasonal decomposition |
| Spend Trend (person) | Time series | `spend_trend`, `churn_probability`, `clv_segment` |
| Revenue Trend (enterprise) | Time series | `revenue_trend`, `payment_behavior`, `avg_days_to_pay` |
| Inventory Demand (product) | Time series | `demand_trend`, `stockout_risk`, `days_of_stock`, `demand_forecast_30d` |

If `get_ml_predictions` returns empty, it means the ETL cron has not yet run.
Trigger it with `POST /cron/etl-all` or wait for the scheduled run.

---

## Enrichment Phases (A–E)

Enrichment adds external intelligence to each entity record.

| Phase | Covers |
|-------|--------|
| Phase A | Phone/email validation, geocoding, FX rates, barcode lookup, company registration |
| Phase B | Medications (RxNorm), food (USDA), vehicles (NHTSA), chemicals (PubChem), medical devices (FDA), software (SPDX), NPI provider lookup |
| Phase C | OFAC SDN sanctions, World Bank WGI governance scores, GDELT news monitoring, AML risk flags |
| Phase D | Composite entity_scores, relationship enrichment, task enrichment, `get_entity_risk_report` tool |
| Phase E | Predictive/temporal: spend_trend, churn_probability, CLV (person); revenue_trend, payment_behavior (enterprise); demand_trend, stockout_risk (product); recurrence_count, seasonal_flag (transaction) |

---

## 35 External Connectors (Phase 2)

9 categories of connectors:

| Category | Examples |
|----------|---------|
| Accounting | QuickBooks, Xero, Sage, Wave |
| HR / Payroll | Gusto, ADP, BambooHR, Rippling |
| Mobile Money | M-Pesa, MTN MoMo, Airtel Money, Flutterwave |
| Health | HL7/FHIR, Epic, Cerner, OpenMRS |
| Education | Canvas, Google Classroom, Moodle, Brightspace |
| POS / Retail | Square, Shopify, Lightspeed, WooCommerce |
| Government | IRAS, HMRC, Kenya eTIMS, GRA Ghana |
| Databases | PostgreSQL, MySQL, MongoDB, Google Sheets |
| File Import | Excel (.xlsx), CSV, JSON bulk import |

Connectors sync on a schedule (daily/weekly/monthly) with sync history tracked in the UI.

---

## Security & Compliance

| Feature | Details |
|---------|---------|
| TOTP 2FA | Time-based OTP via Google Authenticator / Authy |
| OAuth2 / OIDC | Google and Microsoft sign-in |
| Rate Limiting | Sliding-window per-IP on sensitive routes |
| Security Headers | HSTS, CSP, X-Frame DENY, nosniff, Referrer-Policy |
| Audit Trail | Immutable change log across all 7 entities |
| SOC 2 Evidence | CC6.1–CC7.2 compliance evidence endpoint |
| OFAC Sanctions | Automated SDN screening for all person/enterprise records |
| AML Flags | Anti-money-laundering risk scoring |

---

## White-Label Capabilities

Operators can fully brand their Newsconseen deployment:

| Field | Effect |
|-------|--------|
| `brand_name` | Replaces "Newsconseen" in UI |
| `brand_logo_url` | Sidebar + login page logo |
| `brand_primary_color` | CSS variable `--brand-primary` |
| `brand_secondary_color` | CSS variable `--brand-secondary` |
| `brand_accent_color` | CSS variable `--brand-accent` |
| `brand_tagline` | Login page tagline |
| `brand_custom_domain` | Custom CNAME pointing to Railway |
| `brand_hide_newsconseen` | Hides all Newsconseen branding |
| `brand_favicon_url` | Browser favicon |
| `brand_support_email` | Sidebar footer contact |

---

## Multi-Tenancy

A single Newsconseen deployment serves multiple organisations simultaneously.

- Every record is stamped with `company_id` at creation
- ETL loads ALL tenants into shared analytics tables
- Tenant isolation is enforced at READ time only (WHERE company_id = :id)
- Copilot tools: `company_id` is always injected server-side — never trusted from user input
- Adding a new tenant requires zero configuration changes

---

## Environment Variables (Railway)

```
BASE44_API_KEY              Authentication for Base44 API
BASE44_APP_ID               Application identifier
BASE44_PEOPLE_URL           Base44 People entity URL
BASE44_ENTERPRISES_URL      Base44 Enterprises entity URL
BASE44_PRODUCTS_URL         Base44 Products entity URL
BASE44_TASKS_URL            Base44 Tasks entity URL
BASE44_TRANSACTIONS_URL     Base44 Transactions entity URL
BASE44_SERVICES_URL         Base44 Services entity URL
BASE44_RELATIONSHIPS_URL    Base44 Relationships entity URL   ← commonly missing
BASE44_ADDRESSES_URL        Base44 Addresses entity URL       ← commonly missing
DATABASE_URL                PostgreSQL connection string
CRON_SECRET                 Header secret for POST /cron/etl-all
API_KEY                     x-api-key header for python_layer endpoints
ANTHROPIC_API_KEY           Optional Anthropic advisor credential
OPENAI_API_KEY              Optional OpenAI/Codex advisor credential
SENDGRID_API_KEY            Email alerts
WHATSAPP_TOKEN              WhatsApp Business API token
WHATSAPP_PHONE_ID           WhatsApp sender phone ID
NETWORK_ADMIN_KEY           Multi-tenant network intelligence
OPUS_ENABLED                Set to "true" to enable Opus for strategic agents
ADMIN_SECRET                Super-admin API access
```

**Startup crash pattern**: If `BASE44_RELATIONSHIPS_URL` or `BASE44_ADDRESSES_URL` are missing,
python_layer crashes with `pydantic_core.ValidationError: Field required`. Fix: add the variables
to Railway, or make the fields `Optional[str] = None` in `settings.py`.

---

## Common Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Stat cards show 0 | ETL hasn't run | POST /cron/etl-all or wait for cron |
| Advisor-assisted reasoning unavailable | Selected advisor credential missing | Configure an allowed tenant advisor or use Idjwi Core |
| "relation does not exist" in query builder | Table not pre-created | Run startup DDL via /health endpoint |
| python_layer crashes on startup | Missing BASE44_*_URL variable | Add variable to Railway |
| ML predictions empty | ETL not run since data was added | Trigger POST /cron/etl-all |
| Alerts not sending | SENDGRID/WHATSAPP env vars missing | Add to Railway env vars |
| Advisor-dependent agent cannot reason | Selected advisor unavailable | Use a permitted fallback advisor or a deterministic Idjwi Core plan |
| `get_company_graph_context` returns empty nodes | raw.relationships table is empty | Trigger POST /load/relationship-summary to populate raw tables |
| `write_insight` falls back to PostgreSQL | BASE44_INSIGHTS_URL not set | Set env var in Railway, or leave as-is (PostgreSQL fallback is intentional) |
| `propose_task` approval not appearing in UI | analytics.agent_approvals table missing | Run POST /health to trigger startup DDL which pre-creates the table |
| `search_intelligence` returns no results | No insights saved yet | Use write_insight tool to save findings; or run agents which also save to the table |

---

## Phase Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Core OS — 7 entities, forms, lists, bulk import, taxonomy | ✅ |
| 2 | 35 connectors (9 categories) with ApiConnectModal | ✅ |
| 3A | Copilot — engine, tool loop, session memory | ✅ |
| 3B | Alerts — WhatsApp/Email/SMS, 10 alert types | ✅ |
| 3C | Network intelligence — cross-branch comparison | ✅ |
| 4A | Orchestrator — multi-LLM routing, base agent loop | ✅ |
| 4B | Core Agents — Operations + Revenue intelligence | ✅ |
| 4C | Action Agents — Retention + Inventory + Onboarding | ✅ |
| 4D | Approval Gate — human-in-the-loop for high-risk actions | ✅ |
| 4E | Full Agent Coverage — Compliance + Network + Market Research | ✅ |
| 4F | Agent Memory — per-company persistent memory, self-calibration | ✅ |
| 4G | LLM Optimise — Haiku/Sonnet/Opus routing | ✅ |
| 5 | ML Models — survival, segmentation, demand forecast | ✅ |
| 6 | Mobile — PWA offline-first, IndexedDB sync, bottom nav | ✅ |
| 7 | Connector Sync Scheduler — scheduled runs + history | ✅ |
| 8 | Audit Trail — immutable change log, Settings > Audit Trail | ✅ |
| A | Enrichment — phone/email/geocoding/FX/barcode/company reg | ✅ |
| B | Enrichment — medications, food, vehicles, chemicals, devices | ✅ |
| C | Enrichment — OFAC SDN, World Bank WGI, GDELT, AML | ✅ |
| D | Enrichment — entity_scores, risk report, all 7 entities | ✅ |
| E | Enrichment — predictive/temporal trends across all entities | ✅ |
| — | Production Infra — pytest CI, DB backup, load tests, circuit breaker | ✅ |
| — | Onboarding flow — 7-step wizard + backend provisioning | ✅ |
| — | Multi-tenant Admin UI — tenant management, ETL trigger, suspend | ✅ |
| — | BI Export — Power BI, Tableau, CSV, Looker Studio from all charts | ✅ |
| — | Security hardening — 2FA, OAuth2, rate limit, headers, SOC 2 | ✅ |
| 9 | Ontology Expansion — 5 new canonical entities (Document, Schedule, Signal, Channel, Territory) + ETL + enrichment + copilot tools + frontend pages | ✅ |
| 10 | Agricultural Ontology — 3 new entities (Animal, Plot, Observation) + ETL + copilot tools (get_animal_summary, get_plot_overview, get_observation_summary) + agricultural APIs (weather, soil, FAOSTAT, NASA POWER) | ✅ |
| 11 | Spatial Intelligence — Map Explorer converted to PostGIS engine: /postgis/spatial-pins (multi-layer unified pin feed), /postgis/spatial-density (heatmap grid, adjustable cell size), /postgis/coverage-analysis (boundary coverage %). MapView.jsx rebuilt with Pins/Clusters/Density/Boundaries mode tabs + entity layer toggles. | ✅ |
| 9+ | Copilot Write-Back — `create_record` + `import_records` tools with approval gate routing | ✅ |
| 12 | Ontology Ingestion Agent — universal 7-stage AI import pipeline (Extract → Profile → Fingerprint → Memory recall → LLM Analyse → Deduplicate → Load) supporting CSV, XLSX, JSON, XML. Schema fingerprinting and fuzzy Jaccard memory reuse skip LLM for repeat templates. Row-level relationship materialisation (same-row pairing, FK value lookup, self-referential). Wired into BulkImportDialog, copilot chat (file upload in sidebar), and connectors. Copilot can trigger load via `execute_ingestion_plan` without file re-upload. Phase 12 overhaul: 50k row cap (raised from 5k), dedup defaults to skip-not-update, plan only marked loaded after clean run, memory saved only after successful load, low_confidence blocked at backend, schema contract validation flags unknown field names, webhook endpoint for external pushes, scheduled re-ingestion, `generate_import_template` copilot tool. | ✅ |
| — | Copilot v2 — Ontology-Native Mode: 8 new tools (get_company_graph_context, get_enrichment_context, search_intelligence, get_ontology_schema, propose_task, propose_chart, propose_record_update, write_insight). Structured answer format (Answer / Evidence / Recommended Actions / Limitations). Propose → Approve workflow writes to analytics.agent_approvals. Intelligence layer storage in analytics.copilot_insights. Entity-page context (current_page, selected_entity_type, selected_entity_id) passed in AskRequest. Approve/reject endpoints: POST /copilot/recommendations/{id}/approve|reject. ProposedActionsPanel UI with per-recommendation state management. Company Graph home page as default landing for admin/executive. | ✅ |

---

## Key API Endpoints Reference

```
GET  /health                        System health + ETL timestamps
POST /cron/etl-all                  Trigger full ETL pipeline
POST /load/time-summary             ETL: clock-in/out tasks → analytics.time_summary
POST /load/animal-summary           ETL: animals → analytics.animal_summary
POST /load/plot-summary             ETL: plots → analytics.plot_summary
POST /load/observation-summary      ETL: observations → analytics.observation_summary
GET  /copilot/status                Copilot health check
POST /copilot/ask                   Ask a question (returns JSON)
                                    Body: {question, company_id, current_page?,
                                           selected_entity_type?, selected_entity_id?}
POST /copilot/ask/stream            Ask a question (SSE streaming)
GET  /copilot/context               Data freshness and scope
GET  /copilot/diagnose              Run all tools, report row counts
GET  /copilot/sample-questions      Suggested questions for UI
POST /copilot/feedback              Rate a copilot answer
GET  /copilot/recommendations       List pending copilot proposals for a company
                                    Query: ?company_id=&status=pending|approved|rejected
POST /copilot/recommendations/{id}/approve   Approve a copilot proposal
                                    Query: ?company_id=
POST /copilot/recommendations/{id}/reject    Reject a copilot proposal
                                    Query: ?company_id=&reason=
GET  /dataquality/report            AI Readiness Score + issues
GET  /bi/export                     Export charts to Excel/Tableau/CSV
GET  /security/compliance           SOC 2 compliance evidence
GET  /audit/changes                 Immutable audit trail
POST /onboarding/provision          Seed taxonomy + defaults for new tenant
GET  /onboarding/status/{company}   Onboarding completion status

Spatial Intelligence (PostGIS):
POST /postgis/setup                 Enable PostGIS + spatial indexes (run once)
GET  /postgis/status                Extension status + row counts
GET  /postgis/spatial-pins          Unified pin feed: enterprises + addresses + plots
GET  /postgis/spatial-density       Multi-layer density grid (heatmap cells)
GET  /postgis/coverage-analysis     Inside/outside counts vs a boundary polygon
GET  /postgis/nearby                Enterprises within radius of a point (metres)
GET  /postgis/nearest               N nearest enterprises to a point (KNN)
GET  /postgis/clusters              DBSCAN cluster summaries (bubble map)
GET  /postgis/coverage              Records inside a stored boundary
GET  /postgis/boundaries            List stored boundary polygons
POST /postgis/boundaries            Upload a GeoJSON boundary polygon

Agricultural Open Data:
GET  /agriculture/weather           7-day forecast (Open-Meteo, lat/lon)
GET  /agriculture/soil              Soil properties (SoilGrids ISRIC, lat/lon)
GET  /agriculture/faostat           Crop production data (FAOSTAT, country/crop)
GET  /agriculture/nasa-power        Agro-meteorological data (NASA POWER, lat/lon)
GET  /agriculture/usda              USDA crop data

Ontology Ingestion Agent (Phase 12):
POST /ingestion/upload              Upload file → analyse → return plan (CSV/XLSX/JSON/XML)
GET  /ingestion/plan/{id}           Fetch a plan for operator review
POST /ingestion/approve/{id}        Operator approves a pending_review plan
POST /ingestion/load/{id}           Execute an approved plan (file optional if rows cached)
                                    Form fields: company_id, duplicate_action (skip|update)
POST /ingestion/from-connector      Accept connector rows, run full pipeline, optional auto_load
POST /ingestion/webhook/receive     Real-time JSON push from any external system (same pipeline)
POST /ingestion/schedule            Register recurring re-ingestion schedule (cron_expression)
GET  /ingestion/schedules           List active schedules for a company
DELETE /ingestion/schedule/{id}     Deactivate a schedule
GET  /ingestion/template/{type}.csv Download blank CSV import template for any entity type
GET  /ingestion/plans               List plans for a company (paginated, filter by status)
GET  /ingestion/runs                List execution history for a company
GET  /ingestion/memory              List remembered source schemas for a company
```

---

## How to Answer Questions About Newsconseen

When an operator or user asks "What is Newsconseen?", "How does X work?", or any product
question, draw on this documentation to give a clear, accurate answer. Do NOT speculate
about features or capabilities — only describe what is documented here.

For questions about the operator's own data, always use the query tools to ground your answer
in real numbers rather than generic descriptions.

Examples:
- "What can Idjwi do?" → Describe the full capabilities from this documentation
- "How does the ETL work?" → Explain the three-tier fallback and the ETL trigger pattern
- "What agents do you have?" → List all 8 agents with their purpose
- "How many entities does Newsconseen have?" → Answer: 15 canonical entities (7 original + 5 operational: Document, Schedule, Signal, Channel, Territory + 3 agricultural: Animal, Plot, Observation), describe them
- "What is our revenue this month?" → Call get_transaction_summary, return real numbers
