# Newsconseen — Complete Product Documentation

> **RULE FOR DEVELOPERS**: Whenever this file is updated, the copilot's knowledge is automatically
> refreshed on the next request (the file is loaded at request time, not startup). There is no
> redeploy or cache flush required. Keep this file in sync with CLAUDE.md and ARCHITECTURE.md.

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

**The moat**: agent memory + operator data grows over time. The longer an operator uses
Newsconseen, the smarter their agents become about their specific business. No competitor can
replicate this without the history.

---

## Three-Layer Architecture

```
Layer 1 — Enterprise OS (Base44 frontend, React)
  The system of record. All master data lives here. Forms create reality.
  Entities: Person, Enterprise, Product, Relationship, Task, Transaction, Address.
  Rule: every mutation in Layer 1 triggers an ETL to Layer 2.

Layer 2 — Deployable Datamart (python_layer on Railway, FastAPI + PostgreSQL)
  The analytical engine. ETL pipeline extracts from Layer 1, transforms, and loads
  into PostgreSQL analytics tables.
  Rule: ALL stat card values and copilot tool queries come from here.
         Never query Base44 directly for analytics.

Layer 3 — Foundry Intelligence (Copilot, Agents, Alerts, Network Intelligence)
  Rule: reads from Layer 2 only. Never touches Layer 1 directly.
  Components: Copilot (you), 8 Autonomous Agents, Alert Engine, Anomaly Detection,
              KPI Goal Tracking, ML Models, Network Intelligence.
```

**Golden rule**: Forms create reality → Databases store reality → Dashboards explain reality.

---

## The Universal Ontology — 12 Canonical Entities

Every industry maps to these twelve entities. The first 7 are the original core; the 5 new entities (Document, Schedule, Signal, Channel, Territory) extend coverage to document management, recurring patterns, telemetry, communications, and geography.

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
Fields: title, task_type, status, due_date, assigned_to, enterprise, outcome_notes.
`task_type` is operator-defined via MasterDataOption.

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

## Copilot — The Intelligent Operational Assistant

The Copilot is the interactive AI layer of Newsconseen. It answers any question — operational,
market research, ML predictions, or product questions about Newsconseen itself — in one unified
experience grounded in real data.

### What the Copilot can do

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
| `get_task_summary` | Task completion rates by type |
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

## 8 Autonomous Agents (Layer 3)

Autonomous agents run on a schedule and take actions without operator intervention.
They operate through the same approval gate as the copilot's `request_action` tool.

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
ANTHROPIC_API_KEY           Required for copilot + agents
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
| Copilot returns empty | ANTHROPIC_API_KEY not set | Add key to Railway env vars |
| "relation does not exist" in query builder | Table not pre-created | Run startup DDL via /health endpoint |
| python_layer crashes on startup | Missing BASE44_*_URL variable | Add variable to Railway |
| ML predictions empty | ETL not run since data was added | Trigger POST /cron/etl-all |
| Alerts not sending | SENDGRID/WHATSAPP env vars missing | Add to Railway env vars |
| Agent actions not executing | ANTHROPIC_API_KEY not set | Add key to Railway env vars |

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
| 9+ | Copilot Write-Back — `create_record` + `import_records` tools with approval gate routing | ✅ |

---

## Key API Endpoints Reference

```
GET  /health                        System health + ETL timestamps
POST /cron/etl-all                  Trigger full ETL pipeline
POST /load/time-summary             ETL: clock-in/out tasks → analytics.time_summary
GET  /copilot/status                Copilot health check
POST /copilot/ask                   Ask a question (returns JSON)
POST /copilot/ask/stream            Ask a question (SSE streaming)
GET  /copilot/context               Data freshness and scope
GET  /copilot/diagnose              Run all tools, report row counts
GET  /copilot/sample-questions      Suggested questions for UI
POST /copilot/feedback              Rate a copilot answer
GET  /dataquality/report            AI Readiness Score + issues
GET  /bi/export                     Export charts to Excel/Tableau/CSV
GET  /security/compliance           SOC 2 compliance evidence
GET  /audit/changes                 Immutable audit trail
POST /onboarding/provision          Seed taxonomy + defaults for new tenant
GET  /onboarding/status/{company}   Onboarding completion status
```

---

## How to Answer Questions About Newsconseen

When an operator or user asks "What is Newsconseen?", "How does X work?", or any product
question, draw on this documentation to give a clear, accurate answer. Do NOT speculate
about features or capabilities — only describe what is documented here.

For questions about the operator's own data, always use the query tools to ground your answer
in real numbers rather than generic descriptions.

Examples:
- "What can the copilot do?" → Describe the full capabilities from this documentation
- "How does the ETL work?" → Explain the three-tier fallback and the ETL trigger pattern
- "What agents do you have?" → List all 8 agents with their purpose
- "How many entities does Newsconseen have?" → Answer: 12 canonical entities (7 original + 5 new: Document, Schedule, Signal, Channel, Territory), describe them
- "What is our revenue this month?" → Call get_transaction_summary, return real numbers
