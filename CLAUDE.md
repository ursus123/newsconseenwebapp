# Newsconseen OS — Project Context

## Mantra

> **Newsconseen is the Autonomous SME Operating System.**

Every feature, architecture decision, and design choice must be evaluated against:
*"Does this make the system more autonomous for the operator, or does it require them to do more work?"*

---

## What Newsconseen is

Newsconseen is the Autonomous SME Operating System — the SME equivalent of
Palantir Foundry, extended with agentic AI that runs operations autonomously.

It gives any small or medium organisation — a school, clinic, cooperative,
farm, NGO, franchise, government agency, or retail chain — the same
operational intelligence and autonomous execution capability that Palantir
gives governments and Fortune 500 companies, at a fraction of the cost and
complexity.

The core insight: every SME has the same underlying data problems regardless
of industry. They have people, organisations, things they sell or manage,
tasks they perform, transactions they record, and addresses they operate from.
The industry changes the labels. The structure does not.

Newsconseen solves this with three layers, one universal ontology, and
autonomous agents that act on behalf of the operator.

The moat: agent memory + operator data grows over time. The longer an operator
uses Newsconseen, the smarter their agents become about their specific business.
No competitor can replicate this without the history.

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

## PostgreSQL role — clean data export, not primary source

PostgreSQL (Layer 2) is NOT the authoritative data store. Base44 (Layer 1) is.

PostgreSQL serves two purposes:
1. **Analytics acceleration** — pre-aggregated tables for fast stat cards, charts, copilot queries
2. **Clean data export** — a structured, clean mirror of Base44 data that operators can connect to
   external tools (BI tools, Excel, custom databases) without touching Base44 directly

**Base44 is always the fallback. Every single feature must show complete data even when python_layer
is unreachable, cold-starting, or has empty tables.**

### How the data actually flows

```
User enters data → Base44 stores it (Layer 1)
                        │
                        ▼
python_layer GET /people-summary
  → calls extract_people() → fetches from Base44 live
  → returns JSON to frontend
  (does NOT read PostgreSQL on GET requests)

python_layer POST /load/people-summary
  → ETL: extract + transform + write to PostgreSQL analytics.*
  (only writes to PostgreSQL — this is for export + acceleration)

Frontend
  → tries python_layer first
  → if unreachable or empty → falls back to base44.entities.* directly
  → user ALWAYS sees their data
```

This means: **if ETL has not run (analytics tables are empty), every feature must still work**
by falling back to Base44 live data.

### Three-tier fallback chain (applies to ALL features)

```
Tier 1 — analytics.*          PostgreSQL analytics tables (fast, aggregated)
           ↓ if empty or unavailable
Tier 2 — raw.*                PostgreSQL raw tables (full records, still fast)
           ↓ if empty or unavailable
Tier 3 — Base44 live API      Direct Base44 entity query (always available)
```

This applies to:
- Dashboard stat cards
- Query Builder SQL
- Reports & Charts
- Market Intelligence ML models
- Copilot tool queries
- All python_layer GET endpoints

### python_layer fallback pattern (server-side)
```python
def _load_analytics(table, company_id=None):
    engine = get_engine_safe()
    if engine:
        try:
            df = pd.read_sql(f"SELECT * FROM analytics.{table}", engine)
            if not df.empty:
                return filter_by_company(df, company_id)
        except Exception:
            pass
    return _load_raw(table, company_id)

def _load_raw(table, company_id=None):
    engine = get_engine_safe()
    if engine:
        try:
            df = pd.read_sql(f"SELECT * FROM raw.{table}", engine)
            if not df.empty:
                return filter_by_company(df, company_id)
        except Exception:
            pass
    return _fetch_from_base44(table, company_id)

def _fetch_from_base44(url_attr, company_id=None):
    url = getattr(settings, url_attr, None)
    if not url:
        return pd.DataFrame()
    df = fetch_json_to_df(url, HEADERS)
    if company_id and "company_id" in df.columns:
        df = df[df["company_id"] == company_id]
    return df
```

### Frontend fallback pattern
```javascript
// Always try python_layer first; fall back to Base44 if 404/empty
async function fetchWithFallback(endpoint, base44Fn, companyId) {
  try {
    const res = await fetch(`${RAILWAY_URL}${endpoint}?company_id=${companyId}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)
        return data;
    }
  } catch (_) {}
  // Fallback to Base44 live
  return base44Fn();
}
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

### API gateway rule — ALL external APIs must go through python_layer (RULE)

Every external or public API call — whether it enriches the ontology, powers analytics,
or provides reference data — **must be proxied through python_layer**. The React frontend
must never call any third-party or public API directly.

**Why:** python_layer is the single API gateway for Newsconseen. Routing all external calls
through it gives us: company_id scoping, rate-limit management, caching, error normalisation,
audit logging, and the ability to swap providers without touching the frontend.

**Applies to:**
- Public data APIs (OSM, Open-Meteo, RxNorm, World Bank — already in `/open-data/*`)
- Enrichment APIs (geocoding, company lookup, exchange rates, regulatory data)
- Any future third-party integration (SMS providers, payment gateways, ERP connectors)
- Copilot web search (Brave/DuckDuckGo — already proxied via `web_search` tool)

**Pattern:**
```python
# python_layer: expose a thin proxy endpoint
@app.get("/open-data/exchange-rates")
def get_exchange_rates(base: str = "USD"):
    r = httpx.get(f"https://api.exchangerate.host/latest?base={base}")
    return r.json()

# React: always fetch from RAILWAY_URL, never from the provider directly
const { data } = useQuery({ queryFn: () => fetch(`${RAILWAY_URL}/open-data/exchange-rates`) })
```

**Never:**
- `fetch("https://api.some-provider.com/...")` directly from React components
- `axios.get("https://external-api.com/...")` in any frontend file
- Embed third-party API keys in the frontend bundle

### Never
- Hardcode person_type values like "employee", "student", "vendor"
- Query Base44 entities directly for analytics stat card values when python_layer is available
- Show 0 or empty on any stat card, chart, or ML feature if Base44 entities have data
- Build any data-reading feature without a Base44 fallback
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
- Add an app to APP_REGISTRY without declaring its `backend` and `APP_ONTOLOGY` entry

### Copilot documentation sync rule (ALWAYS)

**`python_layer/copilot/docs/newsconseen_docs.md` is the single source of truth for the
copilot's product knowledge.** The file is loaded fresh on every copilot request — no
redeploy, no cache flush required.

**Rule: whenever any of the following change, update `newsconseen_docs.md` to match:**
- CLAUDE.md (architecture, entities, phases, rules)
- ARCHITECTURE.md (schema, entity fields, ontology)
- A new phase is completed (add it to the phase table)
- A new API endpoint is added (add it to the Key API Endpoints section)
- A new agent, connector, alert type, or ML model is added
- Any troubleshooting knowledge is learned (add to Common Troubleshooting table)

Failure to keep `newsconseen_docs.md` in sync means the copilot gives stale or wrong
answers about Newsconseen's own features — the most visible form of product regression.

### Always
- Trigger ETL after every entity mutation
- Use ^...$ anchors in mapping rules, specific before general
- Pass company_id from currentUser
- Use staleTime:0 + refetchOnMount:always on list pages
- Add entityFetchFn to every BulkImportDialog
- Make new settings.py fields Optional[str] = None
- Implement three-tier fallback (analytics → raw → Base44 live) in every data-reading feature
- Use PostgreSQL for analytics acceleration and clean data export — never as the sole data source
- Keep DataModels.jsx and ObjectExplorer.jsx as accurate technical/imagery references (see rule below)
- Declare `backend` + `APP_ONTOLOGY` for every app added to APP_REGISTRY (see Applications rule below)
- Add every new PostgreSQL table to etl/setup.py or enrichment/setup.py so it pre-exists from startup (see Datamart DDL rule below)

### Applications — ontology and datamart as backend (RULE)

Every application in APP_REGISTRY is a purpose-built operational interface. All applications
must be backed by the Newsconseen data infrastructure — never by an independent database,
external API, or bespoke backend:

**Two and only two backend modes:**

| Backend | Layer | When to use | Data path |
|---------|-------|-------------|-----------|
| `ontology` | Layer 1 — Base44 entities | Write-heavy apps: forms, intake, data entry, mutations | Reads/writes base44.entities.* with company_id stamped on every record |
| `datamart` | Layer 2 — python_layer | Read-heavy apps: dashboards, reports, analytics views | Reads python_layer endpoints with three-tier fallback (analytics → raw → Base44 live) |

**Rules:**
- Every entry in APP_REGISTRY must declare `backend: "ontology"` or `backend: "datamart"`
- Every entry in APP_REGISTRY must have a corresponding entry in APP_ONTOLOGY listing
  which of the 7 canonical entities (Person, Enterprise, Product, Task, Transaction,
  Relationship, Address) the app reads or writes — this is the architectural contract
- Ontology-backed apps must always stamp `company_id: currentUser?.company_id` on every
  created or updated record — never allow tenant bleed
- Datamart-backed apps must implement three-tier fallback (analytics → raw → Base44 live)
  and never show empty if Base44 has data
- Applications must never hardcode industry-specific labels — use MasterDataOption /
  TaxonomySelect for any field that varies by operator (person_subtype, task_type, etc.)
- Streamlit-generated apps are datamart-backed only — they read from python_layer and
  never write directly to Base44
- Config-rendered React apps can be either backend — ontology for forms, datamart for views

**When adding a new app:**
1. Add to APP_REGISTRY with `backend` field
2. Add to APP_ONTOLOGY with the entities it reads/writes
3. If ontology-backed: implement company_id scoping and ETL trigger after mutations
4. If datamart-backed: implement three-tier fallback

### Datamart DDL — pre-create all tables at startup (RULE)

Every PostgreSQL table in the datamart must be declared in a startup DDL file and
pre-created when the python_layer boots — not created lazily on the first ETL write.

**Why this matters:**
Pandas `to_sql(if_exists="replace")` and `to_sql(if_exists="append")` only create a table
when the first data batch is written. Until then, the table does not exist in PostgreSQL.
This means:
- DataModels.jsx PostgreSQL view shows a schema that does not actually exist in the DB
- QueryBuilder SQL editor returns "relation does not exist" errors
- Copilot query tools fail silently — the agent has no schema knowledge to reason about
- Three-tier fallback logs spurious errors that mask real failures

Pre-creating tables with full column schemas at startup gives the copilot and query engine
complete schema awareness from the first deploy, even before any operator has loaded data.
The agent can reason about what *could* be in the datamart, not just what currently is.

**Two DDL files — keep them in sync with any new table:**

| File | Covers |
|------|--------|
| `python_layer/etl/setup.py` → `ensure_all_analytics_tables(engine)` | All `raw.*` and `analytics.*` tables: 9 raw, 9 core analytics, 11 enhanced analytics, `copilot_memory` |
| `python_layer/enrichment/setup.py` → `ensure_enrichment_tables(engine)` | All 5 `analytics.*_enrichment` tables with Phase A + Phase B columns |

Both are called in `app.py` lifespan on every startup. Both use `CREATE TABLE IF NOT EXISTS` — safe on every redeploy.

**Pattern for every new table:**
```python
# python_layer/etl/setup.py  (or enrichment/setup.py for enrichment tables)
_NEW_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS analytics.my_new_table (
    company_id      TEXT,
    snapshot_date   DATE,
    -- ... all columns, all nullable
    loaded_at       TIMESTAMP
)
"""
# Add to the relevant _DDL list so ensure_*() picks it up automatically
```

**Rules:**
- Every `CREATE TABLE IF NOT EXISTS` added to any python_layer file must also be added to
  `etl/setup.py` or `enrichment/setup.py` so it pre-exists from startup
- All columns must be nullable — startup DDL creates empty shells, not schema-enforced tables
- After adding a new table to a DDL file, update DataModels.jsx to match (see rule below)
- Never rely on `to_sql()` as the sole mechanism for table creation

### DataModels and ObjectExplorer — living technical references (RULE)

**DataModels.jsx** must always be an accurate, up-to-date technical reference of the actual
PostgreSQL schema and system architecture as it exists in the codebase:
- **Ontology view**: 7 canonical entities + MasterDataOption, open data APIs, analytics pipeline.
  Update this view whenever a new entity, field, or relationship is added to ARCHITECTURE.md.
- **PostgreSQL view**: actual raw.*, analytics.*, audit.* table schemas sourced from real DDL
  in the python_layer (agent_memory.py, approval_gate.py, copilot/queries.py, audit/routes.py).
  Update this view whenever a new CREATE TABLE is added to any python_layer file.
- **API Catalogue**: all FastAPI routers and their key endpoints.
  Update this view whenever a new router is mounted in app.py.

**ObjectExplorer.jsx** must always reflect the 7 canonical business entities with live operator
data from Base44. It is the operational view (runtime records), not the schema view.
- Schema mode shows nodes for the 7 entities with AI Readiness borders sourced from
  /dataquality/report.
- Live mode shows actual record counts from the analytics layer.
- 3D mode is a Three.js render of the same 7 entities.

Rule: DataModels = "what does the architecture look like technically right now?"
      ObjectExplorer = "what entities does this operator have data in right now?"

When adding a new phase, database table, or API router:
1. Update DataModels.jsx to include the new table/endpoint
2. Verify ObjectExplorer still accurately reflects the 7-entity ontology

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
Phase 2  Connectors       ✅ 35 connectors, 9 categories, full connect flow UI
Phase 3A Copilot          ✅ Engine + query tools, session memory, grounded answers
Phase 3B Alerts           ✅ WhatsApp/Email/SMS alert engine, 10 alert types
Phase 3C Network          ✅ Multi-tenant network intelligence + cross-branch compare
Phase 4A Orchestrator     ✅ Multi-LLM routing + base agent loop + tool registry
Phase 4B Core Agents      ✅ Operations + Revenue intelligence agents
Phase 4C Action Agents    ✅ Retention + Inventory + Onboarding agents
Phase 4D Approval Gate    ✅ Human-in-the-loop UI for high-risk agent actions
Phase 4E Full Coverage    ✅ Compliance + Network + Market Research agents
Phase 4F Agent Memory     ✅ Per-company persistent memory + self-calibration
Phase 4G LLM Optimise     ✅ Haiku triage, Sonnet execution, Opus strategy routing
Phase 5  ML Models        ✅ Frontend + backend — survival, segmentation, demand forecast
Phase 6  Mobile           ✅ PWA offline-first field entry, IndexedDB sync, bottom nav
Phase 7  Connector Sync   ✅ Scheduled connector runs + sync history dashboard
Phase 8  Audit Trail      ✅ Immutable change log across all 7 entities
Phase A  Enrichment       ✅ Universal ontology enrichment — phone/email/geocoding/FX/barcode/company registration
Phase B  Enrichment       ✅ Domain-specific enrichment — medications, food, vehicles, chemicals, devices, software, NPI
Phase C  Enrichment       ✅ Compliance & risk — OFAC SDN sanctions, World Bank WGI, GDELT news, AML flags
Phase D  Enrichment       ✅ Scoring & synthesis — entity_scores, relationship/task enrichment (7/7 entities), get_entity_risk_report copilot tool
Phase E  Enrichment       ✅ Predictive & temporal — spend_trend, churn_probability, CLV segment (person); revenue_trend, payment_behavior, avg_days_to_pay (enterprise); demand_trend, stockout_risk, days_of_stock, demand_forecast_30d (product); is_recurring, recurrence_count, seasonal_flag, days_since_prior_tx (transaction)
```

---

## Current state (as of 2026-04-15)

All Phases 1–8, Enrichment Phases A–E, Production Infra, Onboarding flow, BI Export, Multi-tenant Admin UI, and Security hardening are implemented and deployed.

```
COMPLETED
  ✅ All 7 core entities with forms, lists, bulk import, taxonomy
  ✅ ETL pipeline — all 9 entities, multi-tenant, three-tier fallback
  ✅ Copilot — claude-sonnet-4-6, tool loop, 7 query tools, session memory
  ✅ Alerts engine — 10 alert types, WhatsApp/Email/SMS, per-company config
  ✅ Network intelligence — cross-branch performance comparison
  ✅ Autonomous agents — 8 agents, orchestrator, approval gate, agent memory,
     LLM router (Haiku/Sonnet/Opus), market research with weekly briefings
  ✅ ML models — survival, segmentation, demand forecasting, time series (frontend + backend)
  ✅ Mobile — PWA offline-first field entry, IndexedDB sync queue, bottom nav
  ✅ Connectors — 35 connectors (9 categories) with ApiConnectModal UI
  ✅ Connector Sync Scheduler (Phase 7) — cron-based runs, sync history dashboard
  ✅ Audit Trail (Phase 8) — immutable change log, Settings > Audit Trail with filters + CSV export
  ✅ Enrichment Phase A — phone/email/geocoding/FX/barcode/company registration
  ✅ Enrichment Phase B — medications, food, vehicles, chemicals, devices, software, NPI
  ✅ Enrichment Phase C — OFAC SDN, World Bank WGI, GDELT news, AML flags
  ✅ Enrichment Phase D — entity_scores, relationship/task enrichment, risk report copilot tool
  ✅ Enrichment Phase E — predictive/temporal: spend_trend, churn_probability, CLV (person);
     revenue_trend, payment_behavior, avg_days_to_pay (enterprise); demand_trend, stockout_risk,
     days_of_stock, demand_forecast_30d (product); is_recurring, recurrence_count,
     seasonal_flag, days_since_prior_tx (transaction)
  ✅ Production Infra — pytest CI with coverage, DB backup (pg_dump → gzip → local+S3),
     Locust load tests, retry/circuit-breaker reliability, enhanced /health endpoint
  ✅ Onboarding flow — 7-step frontend wizard (frontend already existed) + backend
     python_layer/onboarding/: POST /onboarding/provision (taxonomy seed, default workflows,
     AI readiness score, connector/agent recommendations), GET /onboarding/status/{company_id},
     GET /onboarding/industries; analytics.onboarding_log DDL; DataModels.jsx updated
  ✅ Multi-tenant Admin UI — super_admin-only /TenantAdmin page; python_layer/admin/ (list tenants,
     create+provision, ETL trigger, suspend/reactivate, audit log); ADMIN_SECRET in settings.py;
     analytics.admin_audit_log + analytics.tenant_flags DDL; DataModels.jsx + Layout.jsx + App.jsx updated
  ✅ BI Export — download button on every chart/report; Power BI (.xlsx), Tableau (.twbx),
     CSV/Looker Studio; GET /bi/export?report=&format=&company_id=; python_layer/bi/ package
     (generators, excel, tableau, csv_export, routes); ExportMenu component on TrendCharts +
     Dashboard stat section; analytics.bi_export_log DDL; DataModels.jsx updated
  ✅ Security hardening — (1) SecurityHeadersMiddleware: HSTS, CSP, X-Frame DENY, nosniff,
     Referrer-Policy, Permissions-Policy on all responses; (2) RateLimitMiddleware: sliding-window
     per-IP on 7 sensitive route prefixes; (3) TOTP 2FA: pyotp + qrcode, QR setup + verify flow
     in Settings > Security tab, analytics.user_2fa_secrets DDL; (4) OAuth2 OIDC: Google +
     Microsoft sign-in with CSRF state nonce, identity claims returned to frontend; (5) SOC 2
     compliance evidence endpoint GET /security/compliance (CC6.1–CC7.2, A.12.3, A.14.2, A.17.1);
     python_layer/security/ package: headers, ratelimit, totp, oauth2, compliance, routes;
     middleware + router mounted in app.py; DataModels.jsx updated

PENDING (operational — requires Railway access)
  ⏳ Run POST /cron/etl-all to populate analytics tables
  ⏳ Verify /health returns 200 and copilot tool calls return data
  ⏳ Configure ALERT_DEFAULT_EMAIL / ALERT_DEFAULT_WHATSAPP env vars
  ⏳ Set OPUS_ENABLED=true when Opus budget is approved
```

---

## How to start each VS Code session

CLAUDE.md gives Claude all the context. Just state the task:

```
Build Phase 7 — Connector Sync Scheduler: add schedule config (daily/weekly/monthly)
per connector in the ApiConnectModal, a /connectors/schedule endpoint on python_layer,
and a sync history table in the Connectors page showing last run, status, records synced.
```

```
Build Phase 8 — Audit Trail: a python_layer /audit endpoint that reads from Base44
entity change history, stores to PostgreSQL audit.change_log, and a Settings > Audit Trail
tab in the frontend with date/entity/user filters and CSV export.
```
