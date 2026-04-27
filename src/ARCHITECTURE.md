# Newsconseen OS — Product Constitution and Architecture

> This document is the single source of truth for Newsconseen.
> It is a product constitution, not just technical documentation.
> Every developer, every AI assistant, every contributor must read
> Part 1 before touching any code. Part 2 is the technical contract
> that governs every implementation decision.
>
> When in doubt about any decision — return to this document.
> If the document does not answer your question — ask before building.

---

# PART 1 — VISION AND PRODUCT ARCHITECTURE

---

## 1. What Newsconseen Is

Newsconseen is the Autonomous SME Operating System.

Large enterprises have universal operating systems — one ontology, one analytical
layer, applications built on top of structured reality. They cost millions of dollars
and take months to deploy. They require teams of ontology engineers, data pipeline
specialists, and implementation consultants.

The school in Nairobi, the clinic in Lagos, the cooperative in Kampala, the farm in
Accra, the NGO in Port-au-Prince — these operators have the same operational
complexity as large enterprises. They have people with roles, organizations with
hierarchies, things they track, transactions they process, and decisions they need
to make from data. But they have none of the infrastructure, none of the budget,
and none of the technical staff.

They have been running on spreadsheets, WhatsApp, and disconnected vertical SaaS
tools because nothing was built for them at this level of sophistication.

Newsconseen is.

**One system. Any industry. Deploy in hours. No data engineers required.**

---

## 2. The Mantra

> **Newsconseen is the Autonomous SME Operating System.**

This mantra is a constraint, not just a description. Every product decision must
be tested against it.

- If a feature creates a new silo instead of connecting to master data — it violates the mantra.
- If an app hardcodes its own type system instead of reading from the taxonomy — it violates the mantra.
- If a dashboard reads directly from Base44 instead of the analytical layer — it violates the mantra.
- If a new vertical requires rebuilding the data model — it violates the mantra.

The mantra also sets the ambition ceiling. Newsconseen gives SMEs the same
operational intelligence capability that enterprise systems give large organisations:

| Enterprise capability | Newsconseen equivalent |
|---|---|
| Ontology — semantic object model | Three master entities + universal taxonomy |
| Pipelines — ingest from any source | python_layer ETL + external connectors (roadmap) |
| Analytical datasets layer | PostgreSQL analytics.* via nightly ETL |
| Applications built on the ontology | Base44 apps filtered through taxonomy |
| Actions — write back to source | Form → master data → ETL trigger |
| Typed ontology SDK | useTaxonomy + TaxonomySelect + TYPE_ALIASES |
| AI reasoning over ontology | Operational copilot + autonomous agents |
| Multi-tenant | company_id scoping across all entities |
| Operator extensibility | MasterDataOption custom taxonomy values |

---

## 3. The Three Pillars

Every screen, every feature, every component in Newsconseen does exactly one of
three things:

```
Forms create reality → Databases store reality → Dashboards explain reality
```

| Pillar | What it means | Examples |
|---|---|---|
| Forms create reality | User input creates or updates master data | Add Person, Add Enterprise, Log Transaction, Stock Count, Attendance Register |
| Databases store reality | ETL extracts, transforms, loads into analytical layer | python_layer nightly pipeline, PostgreSQL analytics summaries |
| Dashboards explain reality | Intelligence reads from analytical layer, surfaces insights | Revenue trends, Inventory alerts, Attendance rates, People retention |

If you are building something and cannot identify which pillar it belongs to —
stop and ask before building.

---

## 4. The Three Layers

Newsconseen has three distinct product layers. Every component belongs to one of them.

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1 — ENTERPRISE OS                                         │
│  System of record for operations                                 │
│  Base44 · Master entities · Forms · Taxonomy · Relationships     │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2 — DEPLOYABLE DATAMART                                   │
│  Analytical engine                                               │
│  python_layer · ETL pipeline · PostgreSQL · FastAPI              │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3 — AUTONOMOUS INTELLIGENCE                               │
│  Operational intelligence on the ontology                        │
│  QueryBuilder · Dashboards · Copilot · Autonomous Agents         │
└─────────────────────────────────────────────────────────────────┘
```

### Layer 1 — Enterprise OS

The system of record. Every operational event — a person joining, a transaction
posted, stock counted, attendance marked — is captured here as structured master
data. Base44 is the runtime. The canonical entities (Person, Enterprise, Product, Task,
Transaction, Relationship, Address — plus the Phase 9/10 extension and domain-native entities)
are the objects. The universal taxonomy classifies every object without constraining it.

This layer answers: *What is happening in this enterprise right now?*

### Layer 2 — Deployable Datamart

The analytical engine. python_layer extracts from the Enterprise OS nightly,
transforms raw records into classified analytics summaries, and loads them into
PostgreSQL. FastAPI serves those summaries to any consumer. The datamart is
tenant-scoped, schema-consistent, and taxonomy-clean — whatever raw values come
in from Base44, the ETL normalizes them to taxonomy values before storing.

This layer answers: *What has been happening over time, and how does it compare?*

### Layer 3 — Autonomous Intelligence

The intelligence surface. QueryBuilder, dashboards, operational copilot, and
autonomous agents that act on behalf of the operator. This layer reads exclusively
from the Datamart — never from Base44 directly. It speaks in ontology terms —
person_type, enterprise_subtype, item_class — not in raw SQL columns.

The copilot allows an operator to ask questions in plain language and receive
answers drawn directly from their ontology. Autonomous agents go further — they
monitor, reason, draft, and act without waiting to be asked.

This layer answers: *What does this data mean, and what should I do about it?*

---

## 5. The Full System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      BASE44 (Layer 1)                             │
│                                                                   │
│  ┌──────────┐  ┌─────────────┐  ┌──────────┐  ┌─────────────┐   │
│  │  People  │  │ Enterprises │  │  Items   │  │    Apps     │   │
│  │  (form)  │  │   (form)    │  │  (form)  │  │  (forms)    │   │
│  └────┬─────┘  └──────┬──────┘  └────┬─────┘  └──────┬──────┘   │
│       └───────────────┴──────────────┴────────────────┘          │
│                              │                                    │
│              Person · Enterprise · Product · Relationship         │
│                   MasterDataOption (Taxonomy)                     │
└──────────────────────────────┬───────────────────────────────────┘
                               │ Base44 REST API (nightly pull)
                               │ Webhook / event trigger (roadmap)
┌──────────────────────────────▼───────────────────────────────────┐
│                  python_layer on Railway (Layer 2)                 │
│                                                                   │
│  config/taxonomy.py  ←  single taxonomy source of truth          │
│                                                                   │
│  ETL modules:                                                     │
│  people · enterprises · products · transactions · tasks           │
│  services · addresses · relationships · geospatial                │
│                                                                   │
│  Airflow DAGs  →  PostgreSQL analytics.*                          │
│  FastAPI       →  REST endpoints /people-summary etc.             │
└──────────────────────────────┬───────────────────────────────────┘
                               │ python_layer REST API
┌──────────────────────────────▼───────────────────────────────────┐
│           Base44 QueryBuilder / Reports / Dashboards (Layer 3)    │
│                                                                   │
│   analytics_people · analytics_transactions · analytics_products  │
│   analytics_tasks · analytics_relationships · analytics_addresses │
│                                                                   │
│   Operational copilot — LLM reasoning over ontology (roadmap)    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Why the Architecture Is Designed This Way

### Why three entities and not more?

Because every operational reality of an SME can be expressed as a combination of
people, organizations, and things. A student is a person. A school is an enterprise.
A textbook is an item. A prescription is an item. A farm is an enterprise. A cow
is an item. Adding a fourth entity would mean something exists that cannot be
classified as a person, an organization, or a thing — and in the SME context that
situation does not arise.

The constraint of three entities forces clarity. When a developer wants to create
a "Student" entity they are forced to ask: is a student not just a person with
person_type = "client" and person_subtype = "Student Customer"? The answer is
always yes. The constraint eliminates silos.

### Why a taxonomy instead of hardcoded types?

Because Newsconseen must work for a school in Nairobi and a clinic in Lagos and a
farm in Accra without any code changes. If types are hardcoded in components, each
vertical requires a different build. If types are stored in MasterDataOption and
loaded at runtime, the same codebase works for every vertical. The taxonomy is the
technical implementation of the mantra.

### Why a nightly ETL instead of querying Base44 directly?

Because operational systems and analytical systems have different jobs. Base44 is
optimized for transactional writes. PostgreSQL analytics tables are optimized for
aggregations, trends, and cross-entity queries. Running analytical queries directly
against an operational system degrades performance for both. The ETL separates the
concerns cleanly.

---

## 8. The Base44 Fallback Doctrine

**This is a mandatory architectural rule. Every feature that reads data must follow it.**

### The data flow

```
Base44 (Layer 1)
   │  forms write master data here
   │  ETL pulls from here on every mutation
   ▼
python_layer (Layer 2)
   │  GET /people-summary → extract_people() from Base44 live → return JSON
   │  POST /load/people-summary → ETL write to PostgreSQL analytics.*
   │  GET /raw/{entity} → read from PostgreSQL raw.* schema
   ▼
Frontend / Intelligence (Layer 3)
   │  reads from python_layer
   │  if python_layer unreachable or returns empty → must fall back to Base44
   ▼
User sees complete data always
```

**Key fact:** python_layer GET summary endpoints (`/people-summary`, `/enterprise-summary`, etc.)
already call `extract_*()` from Base44 live on every request — they do NOT read from PostgreSQL.
PostgreSQL is only written to by the POST `/load/*` ETL endpoints, and read by the analytics
Query Builder tables (`analytics_*`).

### When does data go missing?

1. Railway is cold-starting or unreachable → GET requests fail → frontend gets `[]`
2. A user enters new data in Base44 and goes to the dashboard immediately — before python_layer
   responds, the frontend has `[]` from a failed or slow request
3. Query Builder queries `analytics_people` or `raw_people` — if ETL has not run, these
   PostgreSQL tables are empty even though Base44 has data

### The mandatory fallback pattern

**Every data-reading feature must implement this chain:**

```
Tier 1: Try python_layer endpoint
         ↓ if empty or unreachable
Tier 2: Fall back to Base44 entities directly (already loaded or fetched live)
         ↓ (never show 0 if Base44 has data)
Tier 3: Show empty state only if Base44 also returns nothing
```

### Frontend implementation rule

```javascript
// WRONG — shows 0 whenever Railway is slow or unreachable
const totalPeople = peopleSummary.reduce((sum, r) => sum + (r.total_count || 0), 0);

// CORRECT — falls back to already-loaded Base44 entities when summary is empty
const totalPeople = peopleSummary.length > 0
  ? peopleSummary.reduce((sum, r) => sum + (r.total_count || 0), 0)
  : people.length;  // people = base44.entities.Person already loaded
```

### Query Builder rule

When `analytics_*` or `raw_*` table returns empty from python_layer, fall back to
the equivalent Base44 entity:

```javascript
// analytics_people / raw_people empty → base44.entities.Person.list()
// analytics_enterprises / raw_enterprises empty → base44.entities.Enterprise.list()
// etc.
```

### This applies to ALL features without exception

- Dashboard stat cards ✓
- Query Builder analytics_* and raw_* tables ✓
- Reports / Charts ✓
- Market Intelligence ML models ✓
- Copilot tool queries ✓
- Object Views pipeline tables ✓
- Any future feature reading from python_layer ✓

PostgreSQL is for clean data export to exterior databases and for analytical performance
acceleration. It is never the sole data source. Base44 is always the fallback.

### Why does taxonomy normalization happen in the ETL and API?

Because the frontend cannot be trusted to normalize consistently across every
component and every developer. The ETL and API are the chokepoints — all data
passes through them. Normalizing at those layers means every consumer of the API
always receives clean taxonomy values regardless of what was stored in Base44.

---

## 7. Where the Product Is Going

### Phase 1 — Ontology integrity (current)

Close the loop between every app and master data. Every app reads from the taxonomy.
Every form writes back to master data with correct taxonomy fields. Every mutation
triggers an ETL refresh. The ARCHITECTURE.md enforces this. The pre-change checklist
verifies it.

### Phase 2 — External connectivity

python_layer opens up to external data sources beyond Base44:

- **Excel and Google Sheets** — import years of existing operational data into the
  ontology without re-entry
- **Mobile money** — M-Pesa, MTN Mobile Money, Airtel Money, Wave — ingest
  transaction data and map to the transaction ontology
- **Accounting software** — QuickBooks, Wave, Xero, Sage — pull financial records
  into the datamart
- **Government APIs** — business registries, tax authorities, health regulatory
  bodies — validate and enrich enterprise records
- **WhatsApp Business** — extract structured operational data from conversational
  interfaces

Each connector maps external data to the canonical entities using the taxonomy.
The ontology absorbs new data sources without changing.

### Phase 3 — Real-time operational layer

Move from nightly ETL to event-driven updates:

- **Stage 1** — Triggered ETL after every mutation (partially built)
- **Stage 2** — Webhook from Base44 to python_layer. Records push events on change.
  ETL processes events within seconds not hours.
- **Stage 3** — In-memory operational queries for high-frequency apps
  (attendance, stock, scheduling)

### Phase 4 — Operational copilot

An AI layer that reasons over the ontology in plain language. Not a chatbot.
An operational intelligence interface.

The operator asks: *"Which nurses are available at the Westlands clinic on Thursday?"*
The copilot queries the ontology: Person where person_type = staff,
person_subtype = Nurse, linked enterprise = Westlands, availability = available,
shift covers Thursday.
The copilot responds in plain language with structured data behind it.

This is the product that does not exist anywhere in the SME market. The technical
foundation — three entities, universal taxonomy, analytics summaries — is already
built. The LLM layer sits on top of it.

### Phase 5 — Network and deployment scale

- **Multi-branch operators** — each branch operates independently, head office
  sees consolidated analytics via enterprise_tier hierarchy
- **Sector deployments** — a government ministry deploys for 200 schools, an NGO
  deploys for 50 clinics, a development bank deploys for their SME loan portfolio
- **White-label deployments** — Newsconseen under a partner brand
- **Offline-first** — works without internet, syncs when connection is restored

---

# PART 2 — TECHNICAL CONTRACT

> Everything below is a binding technical contract.
> Read Part 1 first. Understand why these rules exist.
> Then use Part 2 as the precise implementation guide.

---

## 8. The Three Master Entities

### 8.1 Person

| Field | Type | Values / Notes |
|---|---|---|
| `first_name` | string | required |
| `last_name` | string | required |
| `preferred_name` | string | display name |
| `person_type` | enum | `staff`, `client`, `contact`, `volunteer` |
| `person_subtype` | string | from MasterDataOption |
| `primary_role` | string | free text specific role description |
| `engagement_model` | enum | `employed`, `contracted`, `freelance`, `volunteer`, `elected`, `appointed`, `enrolled`, `subscribed` |
| `status` | enum | `active`, `inactive`, `on_leave` |
| `availability_status` | enum | `available`, `busy`, `on_leave`, `unavailable` |
| `start_date`, `end_date` | date | |
| `phone`, `email` | string | |
| `address`, `city`, `region`, `country` | string | |
| `latitude`, `longitude` | number | geocoded from address |
| `company_id` | string | tenant scoping — always set on create |

### 8.2 Enterprise

| Field | Type | Values / Notes |
|---|---|---|
| `enterprise_name` | string | required |
| `enterprise_type` | enum | `commercial`, `nonprofit`, `government`, `household`, `cooperative`, `trust` |
| `enterprise_subtype` | string | from MasterDataOption |
| `sic_sector_id` | number | NAICS sector 1–20 |
| `sic_sector_name` | string | NAICS sector name |
| `enterprise_tier` | enum | `headquarters`, `regional_office`, `branch`, `subsidiary`, `franchise`, `department`, `unit`, `project` |
| `parent_enterprise_id` | string | ID of parent enterprise |
| `status` | enum | `active`, `inactive`, `prospect`, `archived` |
| `operating_status` | enum | `open`, `closed`, `temporarily_closed`, `seasonal` |
| `phone`, `email`, `website` | string | |
| `city`, `region`, `country` | string | |
| `latitude`, `longitude` | number | geocoded |
| `company_id` | string | tenant scoping — always set on create |

### 8.3 Product (Item)

| Field | Type | Values / Notes |
|---|---|---|
| `product_name` | string | required |
| `item_type` | enum | `physical`, `living`, `digital`, `service_package`, `financial_instrument` |
| `item_subtype` | string | from MasterDataOption |
| `item_class` | enum | `perishable`, `non_perishable`, `hazardous`, `controlled`, `regulated`, `unrestricted`, `serialized`, `non_serialized`, `consumable`, `reusable`, `returnable` |
| `item_brand` | string | brand or manufacturer |
| `item_variant` | string | size, color, dosage, breed, model |
| `unit_of_measure` | enum | `piece`, `box`, `kg`, `g`, `mg`, `liter`, `ml`, `head`, `flock`, `herd`, `acre`, `hectare`, `license_seat`, `user_account`, `session`, `hour`, `day`, `month`, `year` |
| `stock_quantity` | number | current on-hand |
| `reorder_level` | number | alert threshold |
| `expiry_date` | date | for perishable / controlled items |
| `company_id` | string | tenant scoping |

---

## 9. The Universal Taxonomy

### 9.1 MasterDataOption entity

All type options across the system live here.

| Field | Type | Notes |
|---|---|---|
| `entity_type` | string | `"person"`, `"enterprise"`, `"item"` |
| `field_name` | string | `"person_subtype"`, `"enterprise_subtype"`, `"item_subtype"` |
| `value` | string | the stored option value |
| `label` | string | human-readable display label |
| `parent_value` | string | parent type this option belongs to |
| `sector_id` | number | NAICS sector number (enterprise only) |
| `sector_name` | string | NAICS sector name (enterprise only) |
| `sort_order` | number | display order |
| `is_system_default` | boolean | true = built-in, false = tenant custom |
| `is_active` | boolean | soft delete |
| `company_id` | string | null for system defaults, company_id for custom |
| `created_by` | string | email of creator |
| `usage_count` | number | incremented on each selection |

### 9.2 Person taxonomy

| person_type | Replaces old value | person_subtype examples |
|---|---|---|
| `staff` | employee, contractor, freelancer | Executive Leadership, Senior Management, Teacher, Nurse, Doctor, Engineer, Accountant, Driver, Chef, Security Guard, Farmer, Developer, Pharmacist, Social Worker, Lawyer |
| `client` | client, patient, student, member | Student Customer, Individual Consumer, Corporate Client, Patient, Member, Beneficiary, Enrollee, Subscriber, Attendee, Participant |
| `contact` | vendor, supplier, external_partner | Raw Material Supplier, Equipment Supplier, Technology Vendor, Board Member, Angel Investor, Equity Partner, Donor, Guarantor, Next of Kin, Emergency Contact |
| `volunteer` | volunteer | Community Worker, Intern, Fundraiser, Event Volunteer, Peer Support Worker, Apprentice |

### 9.3 Enterprise taxonomy — 20 NAICS sectors

| enterprise_type | Sector IDs | enterprise_subtype examples |
|---|---|---|
| `commercial` | 1–14, 17–18 | Crop Farm, Grocery Store, Pharmacy, Restaurant, Hotel, Clinic, School, Software Development Company, Bank |
| `nonprofit` | 15, 16, 19 | NGO, Foundation, Church, Mosque, Association, Union, Cooperative Society |
| `government` | 20 | Federal Agency, State Agency, Municipality, Public Health Department, Fire Department |
| `household` | — | Family Unit, Household, Individual Business |
| `cooperative` | 1, 10 | Agricultural Cooperative, Credit Cooperative, Worker Cooperative |
| `trust` | 10, 13 | Family Trust, Charitable Trust, Investment Trust |

Full NAICS sector reference:
1 Agriculture Forestry Fishing · 2 Mining · 3 Utilities · 4 Construction ·
5 Manufacturing · 6 Wholesale Trade · 7 Retail Trade · 8 Transportation ·
9 Information · 10 Finance and Insurance · 11 Real Estate · 12 Professional Services ·
13 Management of Companies · 14 Administrative Support · 15 Educational Services ·
16 Health Care and Social Assistance · 17 Arts Entertainment Recreation ·
18 Accommodation and Food Services · 19 Other Services · 20 Public Administration

### 9.4 Item taxonomy

| item_type | item_subtype examples |
|---|---|
| `physical` | Medication, Supplement, Vaccine, Medical Device, Food Ingredient, Equipment, Vehicle, Furniture, Tool, Raw Material, Uniform, Fuel, Chemical, Fertilizer, Seed |
| `living` | Cattle, Poultry, Swine, Sheep, Goat, Horse, Fish, Crop, Plant, Timber, Flower |
| `digital` | Software, Application, License, Subscription, Course, Ebook, Template, Dataset |
| `service_package` | Consultation, Session, Maintenance Contract, Delivery Service, Support Package, Retainer |
| `financial_instrument` | Insurance Policy, Loan Product, Savings Product, Investment Product, Bond, Equity Share |

---

## 10. The Taxonomy Hook and Component

**Every form that shows person_subtype, enterprise_subtype, or item_subtype must
use these two files. Never build a custom dropdown for these fields.**

```
src/hooks/useTaxonomy.js
src/components/shared/TaxonomySelect.jsx
```

### useTaxonomy.js

Loads SYSTEM_DEFAULTS merged with MasterDataOption records for the given entity,
field, and parent combination. Returns `systemOptions`, `customOptions`, `loading`,
and `addCustomOption`. Custom options are saved to MasterDataOption scoped to
company_id.

### TaxonomySelect.jsx

Searchable combobox. System defaults first. Custom values below a "Custom" divider.
User can type a new value — it saves to MasterDataOption and is available to all
users in the same company going forward.

```jsx
<TaxonomySelect
  entityType="person"              // "person" | "enterprise" | "item"
  fieldName="person_subtype"       // the field being populated
  parentValue={form.person_type}   // THE WIRE — filters options by parent type
  companyId={currentUser?.company_id}
  value={form.person_subtype}
  onChange={(v) => set("person_subtype", v)}
  placeholder="Select subtype..."
/>
```

**`parentValue` is the critical prop.** It must always be the currently selected
parent type from form state. When parent type changes, clear the child field:

```javascript
onChange={e => { set("enterprise_type", e.target.value); set("sub_type", ""); }}
```

---

## 11. How Apps Connect to Master Data

### 11.1 The rule

**An app never defines its own types. It filters master data using the taxonomy.**

```javascript
// WRONG — hardcoded, breaks across verticals
people.filter(p => p.person_type === "student")
people.filter(p => p.person_type === "teacher")

// RIGHT — taxonomy-aware filter
people.filter(p => p.person_type === "client" && p.person_subtype === "Student Customer")
people.filter(p => p.person_type === "staff"  && p.person_subtype === "Teacher")

// BEST — prop-driven so parent decides the filter
<AttendanceDashboard personType="client" personSubtype="Student Customer" />
```

### 11.2 TYPE_ALIASES — backward compatibility

Old Base44 data uses old type values. Always include aliases until all data is migrated.

```javascript
const TYPE_ALIASES = {
  staff:     ["staff", "employee", "contractor", "freelancer"],
  client:    ["client", "patient", "student", "member"],
  contact:   ["contact", "vendor", "supplier", "external_partner"],
  volunteer: ["volunteer"],
};

people.filter(p => (TYPE_ALIASES["staff"] || ["staff"]).includes(p.person_type))
```

### 11.3 App-to-master-data mapping

| App | Master entity | Taxonomy filter | Writes back as |
|---|---|---|---|
| Attendance Register | Person | `client + Student Customer` / `staff + Teacher` | Task record per session |
| Staff Schedule | Person | `person_type = staff` | Schedule / Task record |
| Med Admin | Person + Product | `staff` / `physical + Medication` | Transaction + stock update |
| Stock Counter | Product | `item_type` any | Updated `stock_quantity` on Product |
| QueryBuilder | All | Queries analytics_* tables | Read only |

### 11.4 What every app must do on form submit

1. Save to master entity with correct taxonomy fields
2. Create Relationship record when linking person↔enterprise, person↔item, enterprise↔item
3. Create Address record when address data is entered
4. Trigger ETL refresh — fire and forget

```javascript
const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const triggerETL = (entity) => {
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET }
  }).catch(() => {});
};

triggerETL("people");       // after person create/update
triggerETL("task");         // after attendance marked
triggerETL("product");      // after stock count submitted
triggerETL("transaction");  // after transaction posted
```

---

## 12. python_layer — ETL and API

The python_layer is a FastAPI service on Railway. It is the analytical engine — Layer 2.
**It never writes back to Base44. Data flows one way only: Base44 → python_layer → PostgreSQL.**

**Railway production URL:** `https://newsconseenwebapp-production.up.railway.app`

### 12.1 Taxonomy normalization — config/taxonomy.py

The taxonomy is defined once in `config/taxonomy.py`. Every ETL module and every
API response imports from it. No type strings are hardcoded anywhere else.

```python
from config.taxonomy import (
    normalize_person_type,
    normalize_enterprise_type,
    normalize_item_type,
    PERSON_TYPE_SETS,
    ITEM_TYPE_SETS,
    ACTIVE_STATUSES,
    INACTIVE_STATUSES,
    is_perishable,
    is_controlled,
    is_equipment,
    get_sector_for_subtype,
)

# Normalization on ETL extract
person["person_type"] = normalize_person_type(person.get("person_type", ""))
# "employee" → "staff", "vendor" → "contact", "patient" → "client"

enterprise["enterprise_type"] = normalize_enterprise_type(enterprise.get("enterprise_type", ""))
item["item_type"] = normalize_item_type(item.get("item_type", ""))
# "livestock" → "living", "medication" → "physical", "software" → "digital"
```

### 12.2 ETL modules

| Module | Source | Target table | Notes |
|---|---|---|---|
| `etl/people.py` | Person | `analytics.people_summary` | Normalizes person_type |
| `etl/enterprises.py` | Enterprise | `analytics.enterprise_summary` | Adds SIC sector from subtype |
| `etl/products.py` | Product | `analytics.product_summary` | Sets is_perishable, is_controlled |
| `etl/transactions.py` | Transaction | `analytics.transaction_summary` | Posted-only filter |
| `etl/tasks.py` | Task | `analytics.task_summary` | |
| `etl/services.py` | Service | `analytics.service_summary` | |
| `etl/addresses.py` | Address | `analytics.address_summary` | Geocodes via Nominatim |
| `etl/relationships.py` | Relationship | `analytics.relationship_summary` | Join backbone |
| `etl/geospatial.py` | address_summary | `analytics.geospatial_summary` | DBSCAN clustering |

### 12.3 Airflow DAG dependency order

```
t1 people
t2 enterprises
t3 transactions
t4 products
t5 services
t6 tasks
t7 addresses
[t4, t5, t7] → t8 relationships
t7 → t9 geospatial
```

### 12.4 FastAPI endpoints

All endpoints require `?company_id=` for tenant scoping.
All `/cron/*` and `/load/*` endpoints require `x-cron-secret` header.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | API, database, ML status |
| GET | `/people-summary` | People metrics by enterprise, person_type, status |
| GET | `/enterprise-summary` | One row per enterprise with operating status |
| GET | `/transaction-summary` | Posted transactions with aggregates |
| GET | `/task-summary` | Tasks by enterprise, type, status |
| GET | `/service-summary` | Services by enterprise and type |
| GET | `/product-summary` | Inventory with expiry alerts |
| GET | `/address-summary` | Geocoded address records |
| GET | `/relationship-summary` | Cross-entity join backbone |
| GET | `/geospatial-summary` | Clustered location data |
| POST | `/cron/etl-all` | Full ETL pipeline |
| POST | `/load/people-summary` | People ETL only |
| POST | `/load/task-summary` | Task ETL only |
| POST | `/load/product-summary` | Product ETL only |
| POST | `/load/transaction-summary` | Transaction ETL only |
| GET | `/ml/segments` | Customer segmentation (requires ML_ENABLED=true) |
| GET | `/ml/survival` | Churn survival analysis (requires ML_ENABLED=true) |

### 12.5 How Base44 reads from python_layer

```javascript
const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const ANALYTICS_TABLE_MAP = {
  analytics_people:        "/people-summary",
  analytics_enterprises:   "/enterprise-summary",
  analytics_transactions:  "/transaction-summary",
  analytics_tasks:         "/task-summary",
  analytics_products:      "/product-summary",
  analytics_addresses:     "/address-summary",
  analytics_relationships: "/relationship-summary",
};

const fetchAnalyticsTable = async (tableName, companyId) => {
  const endpoint = ANALYTICS_TABLE_MAP[tableName];
  const res = await fetch(`${RAILWAY_URL}${endpoint}?company_id=${companyId}`);
  return res.json();
};
```

### 12.6 Environment variables (Railway)

Go to Railway → your service → Variables and set the following.

#### Core (existing — confirm still set)

```
DATABASE_URL              — Railway PostgreSQL connection string
BASE44_API_KEY            — Base44 API key for ETL extraction
VITE_BASE44_APP_ID        — Base44 app ID
CRON_SECRET               — Protects all /cron/* and /load/* endpoints
ML_ENABLED                — false (set true only when ML endpoints are ready)
NOMINATIM_CONTACT_EMAIL   — Required for Nominatim geocoding
```

#### Phase 3A — Operational Copilot

```
COPILOT_BACKEND           — anthropic  (or openai)
ANTHROPIC_API_KEY         — sk-ant-...
OPENAI_API_KEY            — sk-...     (if using OpenAI backend instead)
```

#### Phase 3B — Alert channels

```
# WhatsApp Business
WHATSAPP_PHONE_NUMBER_ID  — from Meta developer console
WHATSAPP_ACCESS_TOKEN     — permanent token from Meta

# Email — SendGrid (preferred)
SENDGRID_API_KEY          — SG.xxx

# Email — SMTP fallback
SMTP_HOST                 — e.g. smtp.gmail.com
SMTP_PORT                 — 587
SMTP_USER                 — your@email.com
SMTP_PASSWORD             — app password

# SMS — Africa's Talking (default)
SMS_PROVIDER              — africastalking
AT_API_KEY                — from africastalking.com dashboard
AT_USERNAME               — your AT username
AT_SENDER_ID              — Newsconseen

# SMS — Twilio (alternative)
# SMS_PROVIDER            — twilio
# TWILIO_ACCOUNT_SID      — ACxxx
# TWILIO_AUTH_TOKEN       — xxx
# TWILIO_FROM_NUMBER      — +1234567890

# Alert defaults (fallback before AlertConfig is configured in the DB)
ALERT_DEFAULT_EMAIL       — your@email.com
ALERT_DEFAULT_WHATSAPP    — +254712345678
ALERT_DEFAULT_PHONE       — +254712345678
ALERT_FROM_EMAIL          — alerts@newsconseen.com
ALERT_FROM_NAME           — Newsconseen Alerts
```

#### Phase 3C — Network Intelligence

```
NETWORK_ADMIN_KEY         — secret key protecting join code generation and member removal endpoints
```

#### Phase 3C — Base44 entity API URLs (replace YOUR_APP_ID with your actual Base44 app ID)

```
BASE44_NETWORK_MEMBERSHIP_URL   — https://app.base44.com/api/apps/YOUR_APP_ID/entities/networkmemberships
BASE44_JOIN_CODES_URL           — https://app.base44.com/api/apps/YOUR_APP_ID/entities/joincodes
BASE44_ALERT_CONFIG_URL         — https://app.base44.com/api/apps/YOUR_APP_ID/entities/alertconfigs
BASE44_ALERT_LOG_URL            — https://app.base44.com/api/apps/YOUR_APP_ID/entities/alertlogs
BASE44_CONNECTOR_MAPPINGS_URL   — https://app.base44.com/api/apps/YOUR_APP_ID/entities/connectormappings
```

---

## 13. Frontend File Structure

```
src/
├── ARCHITECTURE.md                       ← this file — read before touching anything
├── pages/
│   ├── People.jsx                        ← list page, uses TYPE_ALIASES
│   ├── Enterprises.jsx                   ← list page
│   ├── Products.jsx                      ← list page
│   ├── Reports.jsx                       ← reads from python_layer endpoints
│   ├── Pipelines.jsx                     ← ETL trigger UI
│   └── [AppPages]/                       ← Attendance, StockCounter, MedAdmin etc.
├── components/
│   ├── shared/
│   │   ├── TaxonomySelect.jsx            ← universal taxonomy combobox
│   │   └── ...
│   ├── people/
│   │   └── PeopleForm.jsx                ← uses TaxonomySelect for person_subtype
│   ├── enterprise/
│   │   └── EnterpriseForm.jsx            ← uses TaxonomySelect for enterprise_subtype
│   └── [app-components]/
└── hooks/
    ├── useTaxonomy.js                    ← loads MasterDataOption + SYSTEM_DEFAULTS
    └── ...
```

---

## 14. Rules for Building Any New Feature or App

Before writing any code answer these four questions:

**Q1 — Which master entity does this feature read from?**
Person, Enterprise, or Product. Never a custom parallel entity.

**Q2 — Which taxonomy fields does it filter on?**
```javascript
// People-based app
person_type + person_subtype

// Enterprise-based app
enterprise_type + enterprise_subtype

// Item-based app
item_type + item_subtype
```

**Q3 — Does it write back to master data on submit?**
Yes — always. With correct taxonomy fields. Never create a standalone entity
when it should be a Person, Enterprise, or Product.

**Q4 — Does it trigger ETL refresh after mutations?**
Yes — always fire and forget after any mutation affecting analytics.

---

## 15. Deployment

### Local development

```bash
docker-compose up --build
# FastAPI:    http://localhost:8000
# Airflow:    http://localhost:8080
# PostgreSQL: localhost:5432
```

### Railway production

FastAPI + Airflow container auto-deploys on push to main.
PostgreSQL is Railway managed.

Health check:
```
GET https://newsconseenwebapp-production.up.railway.app/health

{
  "status": "ok",
  "api": "ok",
  "database": "connected",
  "ml_enabled": false
}
```

---

## 16. Data Migration

Run once in QueryBuilder to align all existing Base44 data to the current taxonomy.

```sql
UPDATE people SET person_type = 'staff'
WHERE person_type IN ('employee', 'contractor', 'freelancer');

UPDATE people SET person_type = 'contact'
WHERE person_type IN ('vendor', 'supplier', 'external_partner');

UPDATE products SET item_type = 'physical'
WHERE item_type IN ('product', 'goods', 'medication', 'equipment');

-- NOTE (Phase 10): The Animal entity (base44.entities.Animal) is now the
-- preferred data path for livestock, poultry, and aquatic species that need
-- individual tracking (age, weight, health records, vet data).
-- item_type = 'living' remains valid for non-individually-tracked living goods
-- (e.g. seedlings as inventory stock). For individual animal records, use Animal.
-- This migration line is ONLY needed for pre-Phase-10 data still in Products.
UPDATE products SET item_type = 'living'
WHERE item_type IN ('livestock', 'crop', 'animal')
  AND id NOT IN (SELECT DISTINCT product_id FROM animals WHERE product_id IS NOT NULL);

UPDATE products SET item_type = 'digital'
WHERE item_type IN ('software', 'license');
```

---

## 17. Protected Files

These files must not be modified without reading this document first
and verifying the change conforms to every rule in it.

```
src/ARCHITECTURE.md
src/hooks/useTaxonomy.js
src/components/shared/TaxonomySelect.jsx
src/components/people/PeopleForm.jsx
src/components/enterprise/EnterpriseForm.jsx
src/pages/People.jsx
src/pages/Enterprises.jsx
python_layer/config/taxonomy.py
```

---

## 18. Pre-Change Checklist

Before saving any file, verify every item. If any item cannot be checked — stop.

**Taxonomy compliance**
- [ ] Uses TaxonomySelect for subtype fields — not a custom dropdown
- [ ] Filters on person_type + person_subtype — not hardcoded role strings
- [ ] Uses TYPE_ALIASES for backward compatibility on person_type filters
- [ ] Uses staff / client / contact / volunteer — not employee / contractor / vendor
- [ ] Uses commercial / nonprofit / government / household / cooperative / trust
- [ ] Uses physical / living / digital / service_package / financial_instrument

**Master data integrity**
- [ ] Writes back to Person / Enterprise / Product on submit with taxonomy fields
- [ ] Creates Relationship record when linking person to enterprise
- [ ] Creates Address record when address data is entered
- [ ] Passes company_id to all entity creates for tenant scoping

**Analytics integrity**
- [ ] Fires ETL refresh after mutations that affect analytics
- [ ] Reads analytics from python_layer endpoints — not Base44 entities directly
- [ ] Uses analytics_* table names that map to python_layer endpoints

**Architecture integrity**
- [ ] No new parallel entity created when any of the 15 canonical entities would serve
- [ ] No vertical-specific type strings hardcoded in component logic
- [ ] python_layer config/taxonomy.py used for all type normalization in ETL

**Code review checklist (taxonomy)**
- [ ] No hardcoded subtype values (`"Nurse"`, `"Student"`) in JSX or filter logic
- [ ] No native `<select>` used for `person_subtype`, `enterprise_subtype`, or `item_subtype`
- [ ] No legacy type strings (`"employee"`, `"student"`, `"vendor"`) in comparisons
- [ ] ESLint passes with zero errors — `npm run lint` must exit 0 before merging
- [ ] New taxonomy values added via MasterDataOption, not hardcoded in components

---

## 19. Taxonomy Governance — Rules, Anti-Patterns, and Automated Enforcement

This section is the binding contract for taxonomy discipline.
It is enforced in three places: this document, the ESLint rules, and the CI pipeline.

---

### 19.1 The taxonomy module boundaries

There are exactly two authoritative taxonomy sources.
**Nothing else defines types.**

| Layer | File | Responsibility |
|---|---|---|
| Frontend | `src/hooks/useTaxonomy.js` | Loads `SYSTEM_DEFAULTS` + `MasterDataOption` records. Returns `systemOptions`, `customOptions`, `addCustomOption`. |
| Frontend | `src/components/shared/TaxonomySelect.jsx` | Combobox UI. Every taxonomy field in every form uses this. No exceptions. |
| Backend | `python_layer/config/taxonomy.py` | Canonical type sets, normalization functions, sector maps. All ETL modules import from here. |

**Do not:**
- Add taxonomy-like constants to any component file
- Build a custom dropdown that duplicates `TaxonomySelect`
- Hardcode subtype strings in form JSX
- Add type normalization logic anywhere outside `taxonomy.py`

---

### 19.2 The canonical type values (frontend)

These are the ONLY values that should appear in comparisons and filters.

**person_type** (4 values — canonical)
```javascript
"staff" | "client" | "contact" | "volunteer"
```

**enterprise_type** (6 values — canonical)
```javascript
"commercial" | "nonprofit" | "government" | "household" | "cooperative" | "trust"
```

**item_type** (5 values — canonical)
```javascript
"physical" | "living" | "digital" | "service_package" | "financial_instrument"
```

**sub-types** — operator-defined at runtime via `MasterDataOption`.
Never hardcode. Never enumerate. Always load via `useTaxonomy`.

---

### 19.3 Anti-patterns — do not write these

**Anti-pattern 1: Legacy type value in comparison**
```javascript
// ✗ WRONG — "employee" is a legacy alias, not a canonical value
if (person.person_type === "employee") { ... }
if (["student", "patient"].includes(person.person_type)) { ... }

// ✓ CORRECT — use TYPE_ALIASES for backward compatibility
import { TYPE_ALIASES } from "@/utils/typeAliases";
if ((TYPE_ALIASES["staff"] || ["staff"]).includes(person.person_type)) { ... }
if ((TYPE_ALIASES["client"] || ["client"]).includes(person.person_type)) { ... }
```

**Anti-pattern 2: Native `<select>` for a taxonomy field**
```jsx
// ✗ WRONG — native select with hardcoded options
<select onChange={e => set("person_subtype", e.target.value)}>
  <option value="Nurse">Nurse</option>
  <option value="Doctor">Doctor</option>
  <option value="Pharmacist">Pharmacist</option>
</select>

// ✓ CORRECT — TaxonomySelect loads options at runtime from MasterDataOption
<TaxonomySelect
  entityType="person"
  fieldName="person_subtype"
  parentValue={form.person_type}
  companyId={currentUser?.company_id}
  value={form.person_subtype}
  onChange={(v) => set("person_subtype", v)}
/>
```

**Anti-pattern 3: Hardcoded subtype constant in a component**
```javascript
// ✗ WRONG — hardcoded list breaks across verticals
const NURSE_SUBTYPES = ["Registered Nurse", "Clinical Nurse", "Ward Sister"];
const isNurse = NURSE_SUBTYPES.includes(person.person_subtype);

// ✓ CORRECT — filter by person_type, let the operator define subtypes
const isNurse = person.person_type === "staff" && person.person_subtype === "Nurse";
// Or better: pass the subtype as a prop from the parent (prop-driven)
<AttendanceDashboard personType="staff" personSubtype="Nurse" />
```

**Anti-pattern 4: Taxonomy logic outside the designated files**
```javascript
// ✗ WRONG — normalization in a component
const normalized = raw === "vendor" ? "contact" : raw;

// ✓ CORRECT — normalization in taxonomy.py (ETL) or TYPE_ALIASES (frontend)
// The ETL normalizes at ingest. The frontend uses TYPE_ALIASES for display.
```

---

### 19.4 Patterns — write these instead

**Pattern: filtering a list by type with backward compatibility**
```javascript
import { TYPE_ALIASES } from "@/utils/typeAliases";

// Staff tab — includes legacy "employee", "contractor", "freelancer"
const staffList = people.filter(p =>
  (TYPE_ALIASES["staff"] || ["staff"]).includes(p.person_type)
);

// Client tab — includes legacy "patient", "student", "member"
const clientList = people.filter(p =>
  (TYPE_ALIASES["client"] || ["client"]).includes(p.person_type)
);
```

**Pattern: prop-driven taxonomy filter (app isolation)**
```jsx
// App component receives taxonomy filter as props — never hardcodes internally
function AttendanceDashboard({ personType = "client", personSubtype = null }) {
  const students = people.filter(p =>
    (TYPE_ALIASES[personType] || [personType]).includes(p.person_type) &&
    (personSubtype ? p.person_subtype === personSubtype : true)
  );
}

// Caller passes the filter
<AttendanceDashboard personType="client" personSubtype="Student Customer" />
<AttendanceDashboard personType="client" personSubtype="Patient" />
```

**Pattern: custom taxonomy value with sync notification**
```javascript
// When a form containing new taxonomy values is saved, trigger ETL
import { useTaxonomySync } from "@/hooks/useTaxonomySync";

const { syncState, notifyTaxonomyChange } = useTaxonomySync();

// In mutation onSuccess:
notifyTaxonomyChange("person", currentUser?.company_id);

// In JSX header:
<ETLSyncBanner syncState={syncState} entityType="person" />
```

---

### 19.5 Python / ETL — taxonomy rules

**All normalization lives in `config/taxonomy.py`.**

```python
# ✗ WRONG — type strings hardcoded in ETL module
if row["person_type"] in ["employee", "contractor"]:
    row["person_type"] = "staff"

# ✓ CORRECT — import and call the centralized normalizer
from config.taxonomy import normalize_person_type
row["person_type"] = normalize_person_type(row.get("person_type", ""))
```

The `normalize_person_type()` function in `taxonomy.py` maps every legacy and
alias value to the canonical value.  Adding a new alias requires changing only
that one file — no ETL modules, no frontend code.

---

### 19.6 Automated enforcement — ESLint rules

Two custom ESLint rules enforce the above at lint time.
Location: `src/eslint-rules/no-hardcoded-taxonomy.js`
Configuration: `eslint.config.js`

| Rule | Severity | What it catches |
|---|---|---|
| `newsconseen/no-legacy-type-value` | **error** | `=== "employee"`, `=== "student"`, `["vendor"].includes(...)` and similar legacy values in comparisons |
| `newsconseen/no-select-for-taxonomy-field` | **warn** | `<select>` with `name="person_subtype"` or `onChange={e => set("person_subtype", ...)}` |

Run locally:
```bash
npm run lint          # errors + warnings
npm run lint:fix      # auto-fix where possible
```

These rules run in CI on every push and pull request.
**A merge with `no-legacy-type-value` errors is blocked by CI.**

---

### 19.7 CI enforcement — GitHub Actions

Workflow: `.github/workflows/frontend-lint.yml`

Triggers: push to `main`, PR targeting `main` (when `src/` or `eslint.config.js` changes).

The CI job runs `npx eslint . --quiet --max-warnings=0`.
A single taxonomy error or warning fails the check and blocks the merge.

To see what would fail before pushing:
```bash
npm run lint
```

---

## 20. Summary

Newsconseen is not a collection of apps.

It is one system with one master data model, one taxonomy, one analytical layer,
and many apps that are filtered windows into the same reality.

**Three master entities** — Person, Enterprise, Product — represent every
operational object an SME will ever need to track.

**One taxonomy** — MasterDataOption — classifies every object for every vertical
without code changes.

**One pipeline** — python_layer — extracts, normalizes, and loads operational data
into analytical summaries.

**One intelligence surface** — Layer 3 — explains reality and will soon answer
operational questions in plain language.

When you build anything — a form, a dashboard, a new app — you are building a
window into master data. Not a new silo. Not a new type system. Not a new entity.
A window.

Every record created in any app feeds master data.
Every dashboard reads from the same source of truth.
The taxonomy is what makes this work across every vertical.

---

**Newsconseen is the Autonomous SME Operating System.**
**One system. Any industry. Deploy in hours.**