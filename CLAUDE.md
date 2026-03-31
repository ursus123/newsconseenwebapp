# Newsconseen OS — Project Context

## What Newsconseen is

Newsconseen is the SME version of Palantir Foundry.

It gives any small or medium organisation — a school, clinic, cooperative,
farm, NGO, franchise, government agency, or retail chain — the same
operational intelligence capability that Palantir gives governments and
Fortune 500 companies, at a fraction of the cost and complexity.

The core insight: every SME has the same underlying data problems regardless
of industry. They have people, organisations, things they sell or manage,
tasks they perform, transactions they record, and addresses they operate from.
The industry changes the labels. The structure does not.

Newsconseen solves this with three layers and one universal ontology.

---

## Three-layer architecture

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 1 — ENTERPRISE OS                                │
│  Base44 frontend (React)                                │
│  System of record. Master data. Forms create reality.   │
│  Entities: Person, Enterprise, Product,                 │
│            Relationship, Task, Transaction, Address     │
└──────────────────────┬──────────────────────────────────┘
                       │ ETL trigger after every mutation
┌──────────────────────▼──────────────────────────────────┐
│  LAYER 2 — DEPLOYABLE DATAMART                          │
│  python_layer on Railway (FastAPI + PostgreSQL)         │
│  Analytical engine. ETL pipeline. Analytics tables.     │
│  Rule: ALL stat card values come from here.             │
│        Never query Base44 directly for analytics.       │
└──────────────────────┬──────────────────────────────────┘
                       │ reads Layer 2 only
┌──────────────────────▼──────────────────────────────────┐
│  LAYER 3 — FOUNDRY INTELLIGENCE                         │
│  Copilot (grounded LLM), Alerts, Network Intelligence   │
│  Rule: reads from Layer 2 only. Never touches Layer 1.  │
└─────────────────────────────────────────────────────────┘
```

Golden rule: Forms create reality → Databases store reality → Dashboards explain reality.

Layer violation example:
```javascript
// WRONG — Layer 1 queried directly for a stat card
const count = await base44.entities.Person.filter({}).then(p => p.length);

// CORRECT — Layer 2 analytics endpoint
const { data } = useQuery({ queryFn: () => fetchSummary("/people-summary", companyId) });
```

---

## Repository structure

```
newsconseenwebapp/
├── CLAUDE.md
├── src/                              Base44 frontend (React)
│   ├── pages/
│   │   ├── Enterprises.jsx
│   │   ├── People.jsx
│   │   ├── Products.jsx
│   │   ├── Tasks.jsx
│   │   ├── Transactions.jsx
│   │   ├── Relationships.jsx
│   │   ├── Addresses.jsx
│   │   └── Dashboard.jsx
│   ├── components/
│   │   ├── shared/
│   │   │   ├── BulkImportDialog.jsx
│   │   │   ├── importConfigs.js
│   │   │   ├── TaxonomySelect.jsx    ← PROTECTED
│   │   │   ├── DataTable.jsx
│   │   │   ├── PageHeader.jsx
│   │   │   └── BulkActionBar.jsx
│   │   ├── enterprise/
│   │   ├── people/
│   │   └── layout/
│   ├── hooks/
│   │   ├── useBrand.js
│   │   ├── useTaxonomy.js            ← PROTECTED
│   │   ├── usePermissions.js
│   │   ├── useDataQuery.js
│   │   └── useTerminology.js
│   └── ARCHITECTURE.md              ← PROTECTED
│
└── python_layer/                     FastAPI on Railway
    ├── app.py                        Mounts all routers
    ├── config/
    │   ├── settings.py               Pydantic settings
    │   └── taxonomy.py               ← PROTECTED
    ├── database.py
    ├── etl/
    │   ├── people.py                 → analytics.people_summary
    │   ├── enterprises.py            → analytics.enterprise_summary
    │   ├── products.py               → analytics.product_summary
    │   ├── transactions.py           → analytics.transaction_summary
    │   ├── tasks.py                  → analytics.task_summary
    │   ├── addresses.py              → analytics.address_summary
    │   ├── relationships.py          → analytics.relationship_summary
    │   ├── services.py               → analytics.service_summary
    │   └── geospatial.py             → analytics.geospatial_summary
    ├── connectors/                   Phase 2 — 25 external connectors
    ├── copilot/                      Phase 3A
    │   ├── engine.py                 Tool loop — Anthropic API
    │   └── queries.py                10 universal query tools
    ├── alerts/                       Phase 3B — WhatsApp/Email/SMS
    ├── network/                      Phase 3C — network intelligence
    └── agent/                        Dev assistant
        ├── agent.py
        ├── system_prompt.md
        └── training_examples.md
```

---

## Universal ontology — the three master entities

Everything in any industry maps to these three entities. No exceptions.

### Person
Any human in any role.

```
person_type (enum):
  staff      → employees, teachers, drivers, field agents
  client     → patients, students, customers, members, beneficiaries
  contact    → vendors, partners, donors, referral sources
  volunteer  → unpaid contributors

person_subtype: operator-defined via MasterDataOption
  (e.g. "Registered Nurse", "Student", "Field Worker", "Wholesale Buyer")

engagement_model (enum):
  employed | contracted | freelance | volunteer |
  elected | appointed | enrolled | subscribed

status (enum):
  active | inactive | on_leave

availability_status (enum):
  available | busy | on_leave | unavailable
```

### Enterprise
Any organisation, location, or operational unit.

```
enterprise_type (enum):
  commercial | nonprofit | government | household | cooperative | trust

enterprise_tier (enum):
  headquarters | regional_office | branch | subsidiary |
  franchise | department | unit | project

enterprise_subtype: operator-defined via MasterDataOption

operating_status (enum): open | closed | temporarily_closed | seasonal
status (enum):           active | inactive | prospect | archived
```

### Product
Any item, service, resource, or deliverable.

```
item_type (enum):
  physical | living | digital | service_package | financial_instrument

item_class (enum):
  perishable | non_perishable | hazardous | controlled | regulated |
  unrestricted | serialized | non_serialized | consumable | reusable | returnable

unit_of_measure (enum):
  piece | box | kg | g | mg | liter | ml | hour | day | month | year |
  session | unit | kit | shift | head | flock | herd | acre | license_seat | ...

item_subtype: operator-defined via MasterDataOption
```

### The four supporting entities

```
Relationship  links any two entities (person↔enterprise, person↔item, etc.)
Task          any activity, visit, appointment, shift, or work order
Transaction   any financial record (invoice, payment, expense, payroll)
Address       any physical or postal location
```

---

## MasterDataOption — operator-defined taxonomy

`person_subtype`, `enterprise_subtype`, `item_subtype`, `task_type` etc.
are all operator-defined in MasterDataOption. This is what makes
Newsconseen universal — operators define their own vocabulary without
any code change.

```javascript
// Always use TaxonomySelect — never a custom hardcoded dropdown
<TaxonomySelect
  entityType="person"
  fieldName="person_subtype"
  parentValue={form.person_type}
  companyId={currentUser?.company_id}
  value={form.person_subtype}
  onChange={(v) => set("person_subtype", v)}
/>
```

Never hardcode subtype values in components. They must always come
from MasterDataOption at runtime via useTaxonomy.

---

## ETL pipeline

### Endpoints
```
POST /cron/etl-all                  Full pipeline — all entities
                                    Header: x-cron-secret

POST /load/people-summary           Targeted per entity
POST /load/enterprise-summary
POST /load/product-summary
POST /load/transaction-summary
POST /load/task-summary
POST /load/address-summary
POST /load/relationship-summary
POST /load/service-summary
POST /load/geospatial-summary

GET  /health                        Status + last run timestamps + counts
```

### ETL multi-tenancy rule — CRITICAL
The ETL pipeline is shared across ALL tenants. It must:
- Extract ALL records from Base44 (no company_id filter on extract)
- Stamp each analytics row with the company_id FROM the source record
- Load all rows for all companies into the same analytics tables

Tenant isolation happens ONLY at read time:
- Copilot tools: WHERE company_id = :company_id
- Dashboard endpoints: filter by authenticated user's company_id
- Alert engine: evaluates only records matching operator's company_id

Never scope the ETL to a single tenant. Adding a new client requires
zero ETL configuration changes — their data loads automatically.

### ETL trigger pattern — fires after every mutation
```javascript
const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const triggerETL = (entity) =>
  fetch(`${RAILWAY_URL}/load/${entity}-summary`, { method: "POST" })
    .catch(() => {});    // fire and forget — never block UI

// Usage
triggerETL("people");
triggerETL("enterprise");
triggerETL("product");
triggerETL("transaction");
triggerETL("task");
```

### PostgreSQL analytics tables
```
analytics.people_summary
analytics.enterprise_summary
analytics.product_summary
analytics.transaction_summary
analytics.task_summary
analytics.address_summary
analytics.relationship_summary
analytics.service_summary
analytics.geospatial_summary
```

---

## Frontend patterns

### React Query — standard list page
```javascript
const qc = useQueryClient();

const { data = [], isLoading } = useQuery({
  queryKey:       ["entity-key", companyId],
  queryFn:        () => listFn(base44.entities.EntityName),
  enabled:        currentUser !== null,
  staleTime:      0,
  refetchOnMount: "always",
});

// Desktop visibility fix
useEffect(() => {
  const fn = () => {
    if (document.visibilityState === "visible")
      qc.refetchQueries({ queryKey: ["entity-key"] });
  };
  document.addEventListener("visibilitychange", fn);
  return () => document.removeEventListener("visibilitychange", fn);
}, [qc]);
```

### Tenant scoping
```javascript
base44.entities.Person.create({
  ...data,
  company_id: currentUser?.company_id,
});
```

### TYPE_ALIASES — backward compatibility
```javascript
const TYPE_ALIASES = {
  staff:     ["staff", "employee", "contractor", "freelancer"],
  client:    ["client", "patient", "student", "member"],
  contact:   ["contact", "vendor", "supplier", "external_partner"],
  volunteer: ["volunteer"],
};
```

---

## Bulk import system

### 4-step pipeline
```
Step 1  Upload    → drag/drop Excel or CSV
Step 2  Map       → auto-map columns via MAPPING_RULES, operator adjusts
Step 3  Audit     → validate + duplicate check (batch + system), status badges
Step 4  Import    → chunked (10 rows), 200ms delay, ETL every 100 rows
```

### Required props
```jsx
<BulkImportDialog
  open={importOpen}
  entityName="People"
  fields={PEOPLE_FIELDS}
  mappingRules={PEOPLE_MAPPING_RULES}
  validateRow={validatePerson}
  transformRow={transformPerson}
  entityFetchFn={() => listFn(base44.entities.Person)}
  onImport={async (row) => base44.entities.Person.create({
    ...row, company_id: currentUser?.company_id
  })}
  onClose={() => {
    setImportOpen(false);
    qc.invalidateQueries({ queryKey: ["people"] });
    qc.refetchQueries({ queryKey: ["people"] });
  }}
  currentUser={currentUser}
/>
```

### Mapping rule discipline
```javascript
// Specific before general. Anchored. ID before NAME.

// WRONG — "code" steals zip_code
[/short.?name|code/i, "short_name"]

// CORRECT
[/^zip.?code$|^zip$|^postal$/i,  "zip_code"],   // specific first
[/^short.?name$|^code$/i,        "short_name"],  // general after

// ID before NAME — prevents person_id matching person_name rule
[/^person.?id$|^external.?id$/i, "person_id"],
[/^person.?name$/i,               "person_name"],
```

### Validate functions — always {errors, warnings}
```javascript
export function validateEntity(row) {
  const errors = [], warnings = [];
  if (!row.required_field) errors.push("required_field is required");
  return { errors, warnings };   // NEVER return a plain array
}
```

---

## Copilot (Layer 3)

### Architecture
```python
# engine.py — tool loop
for _ in range(5):
    response = client.messages.create(
        model="claude-sonnet-4-6",
        tools=TOOL_DEFINITIONS,
        messages=messages,
        system=build_system_prompt(company_id),  # built from Enterprise record
    )
    if response.stop_reason == "end_turn":
        return answer
    if response.stop_reason == "tool_use":
        # execute tools → append results → loop again
```

### System prompt — built at runtime, never hardcoded
```python
def build_system_prompt(company_id: str) -> str:
    ctx = get_operator_context(company_id)   # reads Enterprise record
    return f"You are an operational assistant for {ctx['name']}..."
```

### Tool definitions — universal, no industry hardcodes
```
get_operator_context      Enterprise name/type/description
get_people_summary        headcount by person_type
get_person_churn_risk     people with recent end_date
get_staff_availability    active staff by availability_status
get_transaction_summary   revenue by month
get_overdue_invoices      unpaid past due date
get_task_summary          completion rates by type
get_task_outcomes         outcome breakdown
get_product_summary       stock levels and expiry
get_enterprise_overview   branch structure
get_network_overview      cross-branch comparison
```

company_id always injected server-side in execute_tool().
Never trust company_id from tool_input.

---

## White-label

Enterprise brand fields:
```
brand_name              replaces "Newsconseen" in UI
brand_logo_url          sidebar + login logo
brand_primary_color     CSS var --brand-primary
brand_secondary_color   CSS var --brand-secondary
brand_accent_color      CSS var --brand-accent
brand_tagline           login page tagline
brand_custom_domain     CNAME → Railway
brand_hide_newsconseen  hides all Newsconseen branding
brand_favicon_url       browser favicon
brand_support_email     sidebar footer
```

useBrand(currentUser) reads these at runtime and injects CSS variables.

---

## Environment variables (Railway)

```
BASE44_API_KEY
BASE44_APP_ID
BASE44_PEOPLE_URL
BASE44_ENTERPRISES_URL
BASE44_PRODUCTS_URL
BASE44_TASKS_URL
BASE44_TRANSACTIONS_URL
BASE44_SERVICES_URL
BASE44_RELATIONSHIPS_URL     ← commonly missing → startup crash
BASE44_ADDRESSES_URL         ← commonly missing → startup crash

DATABASE_URL
CRON_SECRET
API_KEY
ANTHROPIC_API_KEY
SENDGRID_API_KEY
WHATSAPP_TOKEN
WHATSAPP_PHONE_ID
NETWORK_ADMIN_KEY
```

Startup crash pattern:
```
pydantic_core.ValidationError: Field required
base44_relationships_url
base44_addresses_url
```
Fix: add variables to Railway OR make them Optional[str] = None in settings.py.

---

## Hard rules for Claude in this repo

### Never
- Hardcode person_type values like "employee", "student", "vendor"
- Query Base44 entities directly for analytics stat card values
- Create a new entity when Person/Enterprise/Product covers the use case
- Change entity schema when only the import config needs updating
- Return a plain array from a validate function
- Trust company_id from user input in the copilot
- Use a custom dropdown where TaxonomySelect should be used
- Hardcode industry-specific terminology in shared components
- Hardcode any client name (BrightStar, BRIGHTSTAR, etc.) anywhere in code
- Filter ETL by a single company_id — ETL loads ALL tenants, isolation is at READ time
- Add a COMPANY_ID environment variable to scope ETL to one tenant
- Suggest any Railway variable or config that assumes a single client

### Always
- Trigger ETL after every entity mutation
- Use ^...$ anchors in mapping rules, specific before general
- Pass company_id from currentUser
- Use staleTime:0 + refetchOnMount:always on list pages
- Add entityFetchFn to every BulkImportDialog
- Make new settings.py fields Optional[str] = None

### Protected files — ask before modifying
```
src/ARCHITECTURE.md
src/hooks/useTaxonomy.js
src/components/shared/TaxonomySelect.jsx
src/components/people/PeopleForm.jsx
src/components/enterprise/EnterpriseForm.jsx
python_layer/config/taxonomy.py
```

---

## Phase roadmap

```
Phase 1  Core OS          ✅ All 7 entities, forms, lists, taxonomy
Phase 2  Connectors       🔄 25 connectors, 8 categories
Phase 3A Copilot          ✅ Engine + 10 grounded query tools
Phase 3B Alerts           ✅ WhatsApp/Email/SMS alert engine
Phase 3C Network          ✅ Multi-tenant network intelligence
Phase 4  ML Models        🔲 Survival, time series, clustering, regression
Phase 5  Mobile           🔲 Offline-first field entry
```

---

## Current work in progress

```
BROKEN
  Railway startup crash — BASE44_RELATIONSHIPS_URL and BASE44_ADDRESSES_URL
  missing from environment variables

PENDING
  ETL has not run — analytics tables empty
  Desktop cache fix not applied to Enterprises, Products, Transactions, Tasks
  entityFetchFn missing from Enterprises, Products, Tasks,
    Transactions, Relationships, Addresses BulkImportDialog calls

NEXT IN ORDER
  1. Fix Railway env vars → verify /health returns 200
  2. Run POST /cron/etl-all → verify analytics tables populated
  3. Test copilot with validation questions
  4. Apply desktop cache fix to remaining 4 list pages
  5. Add entityFetchFn to remaining 6 BulkImportDialog usages
  6. Build executive dashboard reading from python_layer endpoints
  7. Configure operational alerts in Phase 3B
```

---

## How to start each VS Code session

CLAUDE.md gives Claude all the context. Just state the task:

```
Fix Railway startup crash — make BASE44_RELATIONSHIPS_URL and
BASE44_ADDRESSES_URL Optional in python_layer/config/settings.py
```

```
Apply desktop cache fix to Enterprises.jsx —
staleTime:0, refetchOnMount:always, visibilitychange handler,
refetchQueries on BulkImportDialog onClose
```

```
Add entityFetchFn to the BulkImportDialog in Products.jsx
```
