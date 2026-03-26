# Newsconseen OS — Complete System Architecture

> **This file is the single source of truth for Newsconseen.**
> Every developer, every AI assistant, every new feature must read and conform
> to this document before writing a single line of code.
> When in doubt — stop and re-read this file.

---

## 1. The Three Pillars

```
Forms create reality → Databases store reality → Dashboards explain reality
```

Every screen in Newsconseen does exactly one of these three things.

| Pillar | What it means | Examples |
|---|---|---|
| Forms create reality | User input creates or updates master data | Add Person, Add Enterprise, Log Transaction, Stock Count |
| Databases store reality | ETL extracts from Base44, transforms, loads into PostgreSQL | python_layer ETL pipeline running nightly |
| Dashboards explain reality | Analytics read from PostgreSQL summaries | People retention, Revenue trends, Inventory alerts |

Nothing sits outside this cycle. If you are building a screen, ask: is this a form, a database operation, or a dashboard? If you cannot answer, do not build it yet.

---

## 2. System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        BASE44 (Frontend)                     │
│                                                              │
│  ┌──────────┐  ┌─────────────┐  ┌──────────┐  ┌─────────┐  │
│  │  People  │  │ Enterprises │  │  Items   │  │  Apps   │  │
│  │  (form)  │  │   (form)    │  │  (form)  │  │ (forms) │  │
│  └────┬─────┘  └──────┬──────┘  └────┬─────┘  └────┬────┘  │
│       │               │              │              │        │
│       └───────────────┴──────────────┴──────────────┘        │
│                            │                                  │
│                   Master Data Entities                        │
│              Person · Enterprise · Product                   │
│                            │                                  │
│              MasterDataOption (Taxonomy)                     │
└─────────────────────────────────────────────────────────────┘
                             │
                    Base44 REST API
                             │
┌────────────────────────────▼────────────────────────────────┐
│                   python_layer (Railway)                      │
│                                                              │
│   FastAPI  ←→  Airflow DAGs  ←→  PostgreSQL (analytics.*)   │
│                                                              │
│   ETL: extract from Base44 → transform → load to Postgres   │
│   API: serve /people-summary, /transaction-summary etc.      │
└─────────────────────────────────────────────────────────────┘
                             │
                    python_layer REST API
                             │
┌────────────────────────────▼────────────────────────────────┐
│              Base44 QueryBuilder / Reports / Dashboards       │
│         reads analytics_* tables via python_layer endpoints  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. The Three Master Entities

Everything in Newsconseen is one of three things. No exceptions.

### 3.1 Person

Represents any human who has a relationship with an enterprise.

| Field | Type | Values / Notes |
|---|---|---|
| `first_name` | string | required |
| `last_name` | string | required |
| `preferred_name` | string | display name |
| `person_type` | enum | `staff`, `client`, `contact`, `volunteer` |
| `person_subtype` | string | from MasterDataOption — see taxonomy |
| `primary_role` | string | free text specific role description |
| `engagement_model` | enum | `employed`, `contracted`, `freelance`, `volunteer`, `elected`, `appointed`, `enrolled`, `subscribed` |
| `status` | enum | `active`, `inactive`, `on_leave` |
| `availability_status` | enum | `available`, `busy`, `on_leave`, `unavailable` |
| `start_date` | date | |
| `end_date` | date | |
| `phone`, `email` | string | |
| `address`, `city`, `region`, `country` | string | |
| `latitude`, `longitude` | number | geocoded from address |

### 3.2 Enterprise

Represents any organization, business, institution, or household.

| Field | Type | Values / Notes |
|---|---|---|
| `enterprise_name` | string | required |
| `enterprise_type` | enum | `commercial`, `nonprofit`, `government`, `household`, `cooperative`, `trust` |
| `enterprise_subtype` | string | from MasterDataOption — see taxonomy |
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

### 3.3 Product (Item)

Represents anything tracked, owned, sold, consumed, or managed.

| Field | Type | Values / Notes |
|---|---|---|
| `product_name` | string | required |
| `item_type` | enum | `physical`, `living`, `digital`, `service_package`, `financial_instrument` |
| `item_subtype` | string | from MasterDataOption — see taxonomy |
| `item_class` | enum | `perishable`, `non_perishable`, `hazardous`, `controlled`, `regulated`, `unrestricted`, `serialized`, `non_serialized`, `consumable`, `reusable`, `returnable` |
| `item_brand` | string | brand or manufacturer |
| `item_variant` | string | size, color, dosage, breed, model |
| `unit_of_measure` | enum | `piece`, `box`, `kg`, `g`, `liter`, `ml`, `head`, `license_seat`, `session`, `hour`, `day`, `month`, `year` … |
| `stock_quantity` | number | current on-hand |
| `reorder_level` | number | alert threshold |
| `expiry_date` | date | for perishable / controlled items |
| `company_id` | string | tenant scoping |

---

## 4. The Universal Taxonomy

The taxonomy is the nervous system of Newsconseen. It connects every form to master data and every app to every vertical — without hardcoding.

### 4.1 MasterDataOption entity

All type options across the system are stored here.

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

### 4.2 Person taxonomy

| person_type | Replaces old value | person_subtype examples |
|---|---|---|
| `staff` | employee, contractor, freelancer | Executive Leadership, Senior Management, Teacher, Nurse, Doctor, Engineer, Accountant, Driver, Chef, Security Guard, Farmer, Developer, Social Worker, Lawyer |
| `client` | client, patient, student, member | Student Customer, Individual Consumer, Corporate Client, Patient, Member, Beneficiary, Enrollee, Subscriber, Attendee, Participant |
| `contact` | vendor, supplier, external_partner | Raw Material Supplier, Equipment Supplier, Technology Vendor, Board Member, Angel Investor, Equity Partner, Donor, Guarantor, Next of Kin |
| `volunteer` | volunteer | Community Worker, Intern, Fundraiser, Event Volunteer, Peer Support Worker |

### 4.3 Enterprise taxonomy (20 NAICS sectors)

| enterprise_type | Sector examples | enterprise_subtype examples |
|---|---|---|
| `commercial` | Agriculture, Manufacturing, Retail, Finance, Services (sectors 1–14, 17–18) | Crop Farm, Grocery Store, Pharmacy, Restaurant, Hotel, Clinic, School, Software Development Company, Bank |
| `nonprofit` | Other Services, Education, Health (sectors 15, 16, 19) | NGO, Foundation, Church, Mosque, Association, Union, Cooperative Society |
| `government` | Public Administration (sector 20) | Federal Agency, State Agency, Municipality, Public Health Department, Fire Department |
| `household` | — | Family Unit, Household, Individual Business |
| `cooperative` | Agriculture, Finance | Agricultural Cooperative, Credit Cooperative, Worker Cooperative |
| `trust` | Finance, Management | Family Trust, Charitable Trust, Investment Trust |

Full sector list (sector_id → sector_name):
1. Agriculture Forestry Fishing and Hunting
2. Mining Quarrying and Oil and Gas Extraction
3. Utilities
4. Construction
5. Manufacturing
6. Wholesale Trade
7. Retail Trade
8. Transportation and Warehousing
9. Information
10. Finance and Insurance
11. Real Estate and Rental and Leasing
12. Professional Scientific and Technical Services
13. Management of Companies and Enterprises
14. Administrative Support Waste Management
15. Educational Services
16. Health Care and Social Assistance
17. Arts Entertainment and Recreation
18. Accommodation and Food Services
19. Other Services
20. Public Administration

### 4.4 Item taxonomy

| item_type | item_subtype examples |
|---|---|
| `physical` | Medication, Supplement, Vaccine, Medical Device, Food Ingredient, Equipment, Vehicle, Furniture, Tool, Raw Material, Uniform, Fuel, Chemical, Fertilizer, Seed |
| `living` | Cattle, Poultry, Swine, Sheep, Goat, Horse, Fish, Crop, Plant, Timber |
| `digital` | Software, Application, License, Subscription, Course, Ebook, Template, Dataset |
| `service_package` | Consultation, Session, Maintenance Contract, Delivery Service, Support Package |
| `financial_instrument` | Insurance Policy, Loan Product, Savings Product, Investment Product |

---

## 5. The Taxonomy Hook and Component

**Every form that shows person_subtype, enterprise_subtype, or item_subtype must use these two shared files. Never build a custom dropdown for these fields.**

```
src/hooks/useTaxonomy.js
src/components/shared/TaxonomySelect.jsx
```

### 5.1 useTaxonomy.js

Loads options from SYSTEM_DEFAULTS + MasterDataOption for a given entity/field/parent combination.

```javascript
import { useTaxonomy } from "@/hooks/useTaxonomy";

const { systemOptions, customOptions, loading, addCustomOption } = useTaxonomy(
  "person",          // entityType
  "person_subtype",  // fieldName
  "staff",           // parentValue — the currently selected parent type
  currentUser?.company_id
);
```

### 5.2 TaxonomySelect.jsx

The searchable combobox all forms use. Shows system defaults first, custom values below a divider. Allows user to type a new value — saves it to MasterDataOption scoped to company_id.

```jsx
import TaxonomySelect from "@/components/shared/TaxonomySelect";

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

**`parentValue` is the critical prop.** It must always be the currently selected parent type from form state. Without it the combobox shows nothing. When the parent type changes, clear the child field:

```javascript
// In enterprise form — clear subtype when type changes
onChange={e => { set("enterprise_type", e.target.value); set("sub_type", ""); }}
```

---

## 6. How Apps Connect to Master Data

### 6.1 The rule

**An app never defines its own types. It filters master data using the taxonomy.**

```javascript
// WRONG — hardcoded, breaks across verticals, will not match taxonomy data
people.filter(p => p.person_type === "student")
people.filter(p => p.person_type === "teacher")

// RIGHT — taxonomy-aware filter
people.filter(p => p.person_type === "client" && p.person_subtype === "Student Customer")
people.filter(p => p.person_type === "staff"  && p.person_subtype === "Teacher")

// BEST — prop-driven so parent decides the filter
<AttendanceDashboard personType="client" personSubtype="Student Customer" />
```

### 6.2 TYPE_ALIASES — backward compatibility

Old Base44 data uses old type values (employee, contractor, vendor). Always include aliases when filtering people by type until all data is migrated.

```javascript
const TYPE_ALIASES = {
  staff:     ["staff", "employee", "contractor", "freelancer"],
  client:    ["client", "patient", "student", "member"],
  contact:   ["contact", "vendor", "supplier", "external_partner"],
  volunteer: ["volunteer"],
};

// Use in any filter
people.filter(p => (TYPE_ALIASES["staff"] || ["staff"]).includes(p.person_type))
```

### 6.3 App examples

| App | Reads from master data as | Filter used |
|---|---|---|
| Attendance Register | People | `person_type="client" + person_subtype="Student Customer"` for students; `person_type="staff" + person_subtype="Teacher"` for teachers |
| Staff Schedule | People | `person_type="staff"` — shows all staff regardless of subtype |
| Med Admin | People + Items | Staff: `person_type="staff" + person_subtype="Nurse"/"Doctor"` / Items: `item_type="physical" + item_subtype="Medication"` |
| Stock Counter | Items | `item_type` any — works for medication, equipment, livestock, seeds |
| QueryBuilder | All | Queries analytics_* tables directly via python_layer endpoints |

### 6.4 What every app must do on form submit

Every form that creates or updates master data must:

1. **Save to master entity** — Person, Enterprise, or Product with correct taxonomy fields
2. **Create relationships if applicable** — use the Relationship entity to link person↔enterprise, person↔item, enterprise↔item
3. **Create address record if applicable** — use the Address entity, link via `linked_people` or `linked_enterprises`
4. **Trigger ETL refresh** — fire and forget so analytics stay current

```javascript
// ETL refresh after any mutation affecting analytics
const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const triggerETL = (entity) => {
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET }
  }).catch(() => {});
};

// Examples
triggerETL("people");       // after person create/update
triggerETL("task");         // after attendance record saved
triggerETL("product");      // after stock count submitted
triggerETL("transaction");  // after transaction posted
```

---

## 7. python_layer — ETL and API

The python_layer is a FastAPI service deployed on Railway. It is the analytics engine of Newsconseen. Base44 is the operational system. python_layer is the analytical system.

**Railway production URL:** `https://newsconseenwebapp-production.up.railway.app`

### 7.1 How python_layer communicates with Base44

python_layer pulls data from Base44 via the Base44 REST API. It never writes back to Base44 — data flows one way: Base44 → python_layer → PostgreSQL.

```
python_layer ETL:
  1. Extract  → GET https://api.base44.com/entities/Person?company_id=X
  2. Transform → classify by person_type, compute metrics, geocode addresses
  3. Load      → INSERT INTO analytics.people_summary
```

Authentication: python_layer uses `VITE_BASE44_APP_ID` and `BASE44_API_KEY` from Railway environment variables.

### 7.2 ETL modules

| Module | Source entity | Target table | Schedule |
|---|---|---|---|
| `etl/people.py` | Person | `analytics.people_summary` | Nightly append |
| `etl/enterprises.py` | Enterprise | `analytics.enterprise_summary` | Nightly append |
| `etl/products.py` | Product | `analytics.product_summary` | Nightly append |
| `etl/transactions.py` | Transaction | `analytics.transaction_summary` | Nightly, posted-only |
| `etl/tasks.py` | Task | `analytics.task_summary` | Nightly append |
| `etl/services.py` | Service | `analytics.service_summary` | Nightly append |
| `etl/addresses.py` | Address | `analytics.address_summary` | Nightly, geocodes via Nominatim |
| `etl/relationships.py` | Relationship | `analytics.relationship_summary` | Nightly append |
| `etl/geospatial.py` | address_summary | `analytics.geospatial_summary` | Nightly, DBSCAN clustering |

### 7.3 ETL classification rules

ETL modules classify people and items using taxonomy-aware sets — never hardcoded vertical strings.

```python
# people.py
STAFF_TYPES    = {"staff", "employee", "contractor", "freelancer"}
CLIENT_TYPES   = {"client", "patient", "student", "member"}
CONTACT_TYPES  = {"contact", "vendor", "supplier", "external_partner"}
ACTIVE_STATUSES   = {"active", "available"}
INACTIVE_STATUSES = {"inactive", "on_leave", "terminated", "churned"}

# products.py
PHYSICAL_TYPES  = {"physical", "product", "goods"}
LIVING_TYPES    = {"living", "livestock", "crop"}
DIGITAL_TYPES   = {"digital", "software", "license"}
PERISHABLE_SUBTYPES = {"medication", "vaccine", "food_ingredient", "produce", "dairy"}
CONTROLLED_SUBTYPES = {"medication", "vaccine", "controlled_substance"}
```

### 7.4 FastAPI endpoints

All endpoints require tenant scoping via `?company_id=` query parameter.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check — returns API, database, ML status |
| GET | `/people-summary` | Aggregated people metrics by enterprise, person_type, status |
| GET | `/enterprise-summary` | One row per enterprise with operating status |
| GET | `/transaction-summary` | Posted financial transactions with aggregates |
| GET | `/task-summary` | Tasks aggregated by enterprise, task_type, status |
| GET | `/service-summary` | Services aggregated by enterprise and type |
| GET | `/product-summary` | Inventory metrics with expiry alerts |
| GET | `/address-summary` | Geocoded address records |
| GET | `/relationship-summary` | Cross-entity join backbone |
| GET | `/geospatial-summary` | Clustered location data |
| POST | `/cron/etl-all` | Triggers full ETL pipeline |
| POST | `/load/people-summary` | Triggers people ETL only |
| POST | `/load/task-summary` | Triggers task ETL only |
| POST | `/load/product-summary` | Triggers product ETL only |
| POST | `/load/transaction-summary` | Triggers transaction ETL only |
| GET | `/ml/segments` | ML customer segmentation (requires ML_ENABLED=true) |
| GET | `/ml/survival` | ML churn survival analysis |

All `/cron/*` and `/load/*` endpoints require `x-cron-secret` header.

### 7.5 Environment variables (Railway)

```
DATABASE_URL           — Railway PostgreSQL connection string
BASE44_API_KEY         — Base44 API key for ETL extraction
VITE_BASE44_APP_ID     — Base44 app ID
CRON_SECRET            — Secret for protecting ETL endpoints
ML_ENABLED             — true/false — enables ML endpoints
NOMINATIM_CONTACT_EMAIL — required for Nominatim geocoding
```

### 7.6 How Base44 communicates with python_layer

Base44 frontend calls python_layer endpoints in two scenarios:

**1. Reading analytics (QueryBuilder, Reports, Dashboards)**

```javascript
// QueryBuilder sqlEngine.js — fetches analytics table
const fetchAnalyticsTable = async (tableName, companyId) => {
  const endpointMap = {
    analytics_people:        "/people-summary",
    analytics_enterprises:   "/enterprise-summary",
    analytics_transactions:  "/transaction-summary",
    analytics_tasks:         "/task-summary",
    analytics_products:      "/product-summary",
    analytics_addresses:     "/address-summary",
    analytics_relationships: "/relationship-summary",
  };
  const endpoint = endpointMap[tableName];
  const res = await fetch(
    `${RAILWAY_URL}${endpoint}?company_id=${companyId}`,
    { headers: { "Content-Type": "application/json" } }
  );
  return res.json();
};
```

**2. Triggering ETL after mutations (Apps)**

```javascript
// After saving any form that affects analytics
const triggerETL = (entity) => {
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, {
    method: "POST",
    headers: { "x-cron-secret": CRON_SECRET }
  }).catch(() => {});
};
```

---

## 8. Airflow DAGs

Airflow orchestrates the nightly ETL pipeline inside the python_layer container.

```
newsconseen_etl_master.py
  t1: people        → analytics.people_summary
  t2: enterprises   → analytics.enterprise_summary
  t3: transactions  → analytics.transaction_summary
  t4: products      → analytics.product_summary
  t5: services      → analytics.service_summary
  t6: tasks         → analytics.task_summary
  t7: addresses     → analytics.address_summary
  t8: relationships → analytics.relationship_summary (depends on t4, t5, t7)
  t9: geospatial    → analytics.geospatial_summary   (depends on t7)
```

---

## 9. QueryBuilder — Analytics Tables

QueryBuilder in Base44 queries python_layer analytics tables using SQL-like syntax. The column schemas below are the definitive reference.

| analytics_people | Type | Notes |
|---|---|---|
| enterprise_id | string | tenant ID |
| person_type | string | staff/client/contact/volunteer |
| person_subtype | string | from taxonomy |
| primary_role | string | specific role |
| status | string | active/inactive/on_leave |
| total_people | number | count |
| active_count | number | |
| avg_tenure_days | number | |
| snapshot_date | date | |

| analytics_transactions | Type | Notes |
|---|---|---|
| enterprise_id | string | |
| transaction_type | string | |
| total_amount | number | sum of posted transactions |
| transaction_count | number | |
| avg_amount | number | |
| period_start | date | |
| period_end | date | |

| analytics_products | Type | Notes |
|---|---|---|
| enterprise_id | string | |
| item_type | string | physical/living/digital etc. |
| item_subtype | string | |
| total_items | number | |
| total_stock | number | |
| items_expiring_soon | number | within 30 days |
| items_below_reorder | number | |

---

## 10. Docker and Deployment

### Local development

```bash
docker-compose up --build
# FastAPI: http://localhost:8000
# Airflow: http://localhost:8080
# PostgreSQL: localhost:5432
```

### Railway production

- FastAPI container: auto-deploys on push to main
- PostgreSQL: Railway managed database
- Airflow: runs inside same container as FastAPI

**Health check:** `GET https://newsconseenwebapp-production.up.railway.app/health`

Expected response:
```json
{
  "status": "ok",
  "api": "ok",
  "database": "connected",
  "ml_enabled": false
}
```

---

## 11. Frontend File Structure

```
src/
├── ARCHITECTURE.md              ← this file — read before touching anything
├── pages/
│   ├── People.jsx               ← list page, uses TYPE_ALIASES
│   ├── Enterprises.jsx          ← list page
│   ├── Products.jsx             ← list page
│   ├── Reports.jsx              ← analytics, reads from python_layer
│   ├── Pipelines.jsx            ← ETL trigger UI
│   └── [AppPages]/              ← attendance, stock counter, etc.
├── components/
│   ├── shared/
│   │   ├── TaxonomySelect.jsx   ← universal taxonomy combobox
│   │   └── ...
│   ├── people/
│   │   └── PeopleForm.jsx       ← uses TaxonomySelect for person_subtype
│   ├── enterprise/
│   │   └── EnterpriseForm.jsx   ← uses TaxonomySelect for enterprise_subtype
│   └── [app-components]/
└── hooks/
    ├── useTaxonomy.js           ← loads MasterDataOption + SYSTEM_DEFAULTS
    └── ...
```

---

## 12. Rules for Building Any New App

Before writing any code, answer these four questions:

### Q1 — Which master entity does this app read from?

It must be Person, Enterprise, or Product. No custom parallel entities.

### Q2 — Which taxonomy fields does it filter on?

```javascript
// People-based app
person_type + person_subtype
// e.g. Attendance: person_type="client", person_subtype="Student Customer"

// Enterprise-based app
enterprise_type + enterprise_subtype
// e.g. Multi-tenant dashboard: enterprise_type="commercial"

// Item-based app
item_type + item_subtype
// e.g. Med Admin: item_type="physical", item_subtype="Medication"
// e.g. Farm inventory: item_type="living", item_subtype="Cattle"
```

### Q3 — Does the app write back to master data on submit?

Yes — always. Use the correct taxonomy fields. Never create a standalone entity when it should be a Person, Enterprise, or Product.

```javascript
// Attendance marks presence — writes to Task with person link
// Stock count — writes updated stock_quantity to Product
// New patient — writes to Person with person_type="client", person_subtype="Patient"
```

### Q4 — Does it trigger ETL refresh after mutations?

Yes — always fire and forget after any mutation that affects analytics.

---

## 13. Protected Files

These files must not be modified without reading this document first and verifying the change conforms to every rule in it.

```
src/ARCHITECTURE.md                        ← this file
src/hooks/useTaxonomy.js                   ← taxonomy backbone
src/components/shared/TaxonomySelect.jsx   ← universal combobox
src/components/people/PeopleForm.jsx       ← person form
src/components/enterprise/EnterpriseForm.jsx ← enterprise form
src/pages/People.jsx                       ← people list
src/pages/Enterprises.jsx                  ← enterprise list
```

---

## 14. Pre-Change Checklist

Before saving any file, verify every item:

- [ ] Does it use `TaxonomySelect` for subtype fields? Not a custom dropdown.
- [ ] Does it filter on `person_type + person_subtype`? Not hardcoded role strings.
- [ ] Does it use `TYPE_ALIASES` for backward compatibility on person_type filters?
- [ ] Does it use `staff/client/contact/volunteer` — not `employee/contractor/vendor`?
- [ ] Does it use `commercial/nonprofit/government/household/cooperative/trust`?
- [ ] Does it use `physical/living/digital/service_package/financial_instrument`?
- [ ] Does it write back to Person/Enterprise/Product on submit with taxonomy fields?
- [ ] Does it create a Relationship record when linking person↔enterprise?
- [ ] Does it create an Address record when address data is entered?
- [ ] Does it fire ETL refresh after mutations that affect analytics?
- [ ] Does it pass `company_id` to all entity creates for tenant scoping?
- [ ] Does it read analytics from python_layer endpoints — not Base44 entities directly?

---

## 15. Data Migration

Existing records in Base44 use old type values. Run these migrations once in QueryBuilder to align all data to the new taxonomy.

```sql
-- People: migrate old person_type values to new taxonomy
UPDATE people SET person_type = 'staff'   WHERE person_type IN ('employee', 'contractor', 'freelancer');
UPDATE people SET person_type = 'contact' WHERE person_type IN ('vendor', 'supplier', 'external_partner');

-- Enterprises: no migration needed if enterprise_type was already correct
-- Products: migrate if item_type used old values
UPDATE products SET item_type = 'physical' WHERE item_type IN ('product', 'goods', 'medication', 'equipment');
UPDATE products SET item_type = 'living'   WHERE item_type IN ('livestock', 'crop', 'animal');
```

---

## 16. Summary

Newsconseen is not a collection of apps. It is one system with:

- **One master data model** — Person, Enterprise, Product
- **One taxonomy** — MasterDataOption connects all forms to all apps
- **One analytics layer** — python_layer ETL feeds PostgreSQL
- **Many apps** — each is a filtered view of master data, nothing more

When you build anything — a form, a dashboard, a new app — you are building a window into master data. Not a new silo. Not a new entity. Not a new type system.

**Every record created in any app feeds master data.**
**Every dashboard reads from the same source of truth.**
**The taxonomy is what makes this possible across every vertical.**
