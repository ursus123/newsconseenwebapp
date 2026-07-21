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

## Idjwi product contract (NON-NEGOTIABLE)

> **Idjwi is Newsconseen's default operational mind.**

Idjwi owns the durable intelligence of an SME: organizational context, ontology,
memory, permissions, tools, policies, decisions, audits, and governed actions.
It is available to every tenant independently of any external language-model
provider. Idjwi Core must remain useful through deterministic queries, rules,
calculations, memory retrieval, monitoring, and approved workflows when no LLM is
configured or an advisor is unavailable.

LLMs are optional, tenant-controlled **advisors** to Idjwi. An advisor may analyze
a bounded objective using the minimum authorized context, but it does not own
tenant memory, permissions, tools, decisions, or actions. Advisor output is an
untrusted proposal until Idjwi validates its evidence, scope, policy compliance,
and required approvals. Anthropic, Codex/OpenAI, local models, and future models
are interchangeable implementations behind the advisor boundary; none is Idjwi.

The authoritative detailed contract and terminology are in
[`docs/idjwi-product-contract.md`](docs/idjwi-product-contract.md). Product copy,
architecture, APIs, and code comments must use those terms consistently. Legacy
`/copilot/*` routes and `copilot` module names are compatibility identifiers, not
the product definition.

The required page-by-page engineering method, cross-surface strategy, definition
of done, backward-review loop, administrator page-explanation requirement, and
living-documentation rules are in
[`docs/strategy/DEVELOPMENT_STRATEGY.md`](docs/strategy/DEVELOPMENT_STRATEGY.md).
Material changes must keep that strategy and all affected Markdown contracts
current in the same workstream.

---

## Three-layer architecture

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 1 — ENTERPRISE OS                                │
│  Supabase (PostgreSQL + RLS + Auth + Realtime)          │
│  System of record. Master data. Forms create reality.   │
│  Entities: Person, Enterprise, Product,                 │
│            Relationship, Task, Transaction, Address     │
│  Frontend: React — all entity access via ncClient        │
│            proxy which routes to Supabase               │
└──────────────────────┬──────────────────────────────────┘
                       │ ETL trigger after every mutation
┌──────────────────────▼──────────────────────────────────┐
│  LAYER 2 — DEPLOYABLE DATAMART                          │
│  python_layer on Railway (FastAPI + PostgreSQL)         │
│  Analytical engine. ETL pipeline. Analytics tables.     │
│  Rule: ALL stat card values come from here.             │
│        Never query Layer 1 directly for analytics.      │
└──────────────────────┬──────────────────────────────────┘
                       │ governed canonical context + derived intelligence
┌──────────────────────▼──────────────────────────────────┐
│  LAYER 3 — FOUNDRY INTELLIGENCE                         │
│  Idjwi Core, Advisors, Agents, Alerts, Network Intel.    │
│  Canonical reads use tenant repositories; deeper        │
│  reasoning uses Layer 2 intelligence.                   │
└─────────────────────────────────────────────────────────┘
```

Golden rule: Forms create reality → Databases store reality → Intelligence explains reality → Agents act on reality.

Layer violation example:
```javascript
// WRONG — Supabase entity queried directly for a stat card
const count = await ncClient.entities.Person.filter({}).then(p => p.length);

// CORRECT — Layer 2 analytics endpoint
const { data } = useQuery({ queryFn: () => fetchSummary("/people-summary", companyId) });
```

---

## PostgreSQL role — clean data export, not primary source

PostgreSQL (Layer 2) is NOT the authoritative data store. Supabase (Layer 1) is.

PostgreSQL serves two purposes:
1. **Analytics acceleration** — pre-aggregated tables for fast stat cards, charts, copilot queries
2. **Clean data export** — a structured, clean mirror of Supabase data that operators can connect to
   external tools (BI tools, Excel, custom databases) without touching Supabase directly

**Supabase is always the fallback. Every single feature must show complete data even when python_layer
is unreachable, cold-starting, or has empty tables.**

### How the data actually flows

```
User enters data → Supabase stores it (Layer 1)
                        │
                        ▼
python_layer GET /people-summary
  → calls extract_people() → fetches from Supabase live
  → returns JSON to frontend
  (does NOT read PostgreSQL on GET requests)

python_layer POST /load/people-summary
  → ETL: extract + transform + write to PostgreSQL analytics.*
  (only writes to PostgreSQL — this is for export + acceleration)

Frontend
  → tries python_layer first
  → if unreachable or empty → falls back to Supabase entity queries directly
  → user ALWAYS sees their data
```

This means: **if ETL has not run (analytics tables are empty), every feature must still work**
by falling back to Supabase live data.

### Three-tier fallback chain (applies to ALL features)

```
Tier 1 — analytics.*          PostgreSQL analytics tables (fast, aggregated)
           ↓ if empty or unavailable
Tier 2 — raw.*                PostgreSQL raw tables (full records, still fast)
           ↓ if empty or unavailable
Tier 3 — Supabase entity query  Direct Supabase entity query (always available)
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
    return _fetch_from_supabase(table, company_id)

def _fetch_from_supabase(table, company_id=None):
    # Query Supabase via the REST API as the ultimate fallback
    from config.settings import settings
    url = f"{settings.supabase_url}/rest/v1/{table}"
    headers = {"apikey": settings.supabase_service_role_key,
               "Authorization": f"Bearer {settings.supabase_service_role_key}"}
    params = {"select": "*"}
    if company_id:
        params["company_id"] = f"eq.{company_id}"
    r = httpx.get(url, headers=headers, params=params)
    return pd.DataFrame(r.json()) if r.is_success else pd.DataFrame()
```

### Frontend fallback pattern
```javascript
// Always try python_layer first; fall back to Supabase entity query if 404/empty
async function fetchWithFallback(endpoint, entityFn, companyId) {
  try {
    const res = await fetch(`${RAILWAY_URL}${endpoint}?company_id=${companyId}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)
        return data;
    }
  } catch (_) {}
  // Fallback to Supabase live
  return entityFn();
}
```

---

## Repository structure

```
newsconseenwebapp/
├── CLAUDE.md
├── src/                              React frontend (Supabase-backed via ncClient proxy)
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
    │   ├── geospatial.py             → analytics.geospatial_summary
    │   ├── document.py               → analytics.document_summary   (Phase 9)
    │   ├── schedule.py               → analytics.schedule_summary   (Phase 9)
    │   ├── signal.py                 → analytics.signal_summary     (Phase 9)
    │   ├── channel.py                → analytics.channel_summary    (Phase 9)
    │   ├── territory.py              → analytics.territory_summary  (Phase 9)
    │   ├── animal.py                 → analytics.animal_summary     (Phase 10)
    │   ├── plot.py                   → analytics.plot_summary       (Phase 10)
    │   └── observation.py            → analytics.observation_summary(Phase 10)
    ├── connectors/                   Phase 2 — 25 external connectors
    ├── postgis/                      Phase 11 — spatial intelligence engine
    │   ├── queries.py                Multi-layer spatial queries
    │   └── routes.py                 /postgis/* endpoints
    ├── copilot/                      Phase 3A
    │   ├── engine.py                 Idjwi orchestration + legacy advisor loop
    │   └── queries.py                Query tools (15+ tools across all entities)
    ├── alerts/                       Phase 3B — WhatsApp/Email/SMS
    ├── network/                      Phase 3C — network intelligence
    └── agent/                        Dev assistant
        ├── agent.py
        ├── system_prompt.md
        └── training_examples.md
```

---

## Universal ontology — 15 canonical entities

The Newsconseen ontology has three tiers:

- **Core (7)** — Person, Enterprise, Product, Task, Transaction, Relationship, Address. Universal across every industry. The original architecture.
- **Operational extensions (5)** — Document, Schedule, Signal, Channel, Territory. Cross-cutting operational entities added in Phase 9 that any industry may need.
- **Domain-native (3)** — Animal, Plot, Observation. Agricultural, aquaculture, veterinary, and ecological entities added in Phase 10. These exist as dedicated Supabase entities (via supabaseEntities registry) with their own ETL, analytics tables, copilot tools, and frontend pages.

The rule "use Person/Enterprise/Product before creating a new entity" still holds for general-purpose cases. It does not apply when the entity model is fundamentally different from all 12 existing entities — that is the threshold that justified Animal, Plot, and Observation.

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

  Note: item_type = 'living' is a valid schema value and still used for
  generic living-goods stock management (e.g. seedlings, plants as inventory items).
  For livestock, poultry, aquatic species, or any animal that needs individual
  tracking, health records, age, weight, or vet data — use the Animal entity instead.

item_class (enum):
  perishable | non_perishable | hazardous | controlled | regulated |
  unrestricted | serialized | non_serialized | consumable | reusable | returnable

unit_of_measure (enum):
  piece | box | kg | g | mg | liter | ml | hour | day | month | year |
  session | unit | kit | shift | head | flock | herd | acre | license_seat | ...

item_subtype: operator-defined via MasterDataOption
```

### The four supporting entities (Core tier)

```
Relationship  links any two entities (person↔enterprise, person↔item, etc.)
Task          any activity, visit, appointment, shift, or work order
Transaction   any financial record (invoice, payment, expense, payroll)
Address       any physical or postal location
```

### Operational extension entities (Phase 9)

```
Document      any managed file — contracts, certificates, policies, invoices (as files)
Schedule      recurring pattern — daily briefing, weekly inspection, monthly payroll run
Signal        telemetry reading — IoT sensor value, survey score, KPI measurement
Channel       communication channel — WhatsApp group, email thread, broadcast list
Territory     geographic zone — sales territory, delivery zone, catchment area
```

### Domain-native entities (Phase 10)

```
Animal        any living creature tracked individually — livestock, poultry,
              aquatic species, companion animals, lab animals
              Fields: animal_type, species, sex, date_of_birth, weight_kg, status
              Dedicated ETL → analytics.animal_summary
              Copilot tool: get_animal_summary

Plot          any managed land parcel or water body
              Fields: name, plot_type, land_use, crop_type, area_ha, latitude, longitude, status
              Dedicated ETL → analytics.plot_summary; queryable via /postgis/spatial-pins
              Copilot tool: get_plot_overview

Observation   any field reading, measurement, or recorded value
              Fields: observation_type, subject_type, numeric_value, text_value,
                      unit_of_measure, is_anomaly, observed_at
              Dedicated ETL → analytics.observation_summary
              Copilot tool: get_observation_summary
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

# Core 7 entities
POST /load/people-summary
POST /load/enterprise-summary
POST /load/product-summary
POST /load/transaction-summary
POST /load/task-summary
POST /load/address-summary
POST /load/relationship-summary
POST /load/service-summary
POST /load/geospatial-summary

# Phase 9 — operational extension entities
POST /load/document-summary
POST /load/schedule-summary
POST /load/signal-summary
POST /load/channel-summary
POST /load/territory-summary

# Phase 10 — domain-native entities
POST /load/animal-summary
POST /load/plot-summary
POST /load/observation-summary

GET  /health                        Status + last run timestamps + counts
```

### ETL multi-tenancy rule — CRITICAL
The ETL pipeline is shared across ALL tenants. It must:
- Extract ALL records from Supabase (no company_id filter on extract)
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
# Core 7 entities
analytics.people_summary
analytics.enterprise_summary
analytics.product_summary
analytics.transaction_summary
analytics.task_summary
analytics.address_summary
analytics.relationship_summary
analytics.service_summary
analytics.geospatial_summary

# Phase 9 — operational extension entities
analytics.document_summary
analytics.schedule_summary
analytics.signal_summary
analytics.channel_summary
analytics.territory_summary

# Phase 10 — domain-native entities
analytics.animal_summary
analytics.plot_summary
analytics.observation_summary
```

---

## Frontend patterns

### React Query — standard list page
```javascript
const qc = useQueryClient();

const { data = [], isLoading } = useQuery({
  queryKey:       ["entity-key", companyId],
  queryFn:        () => listFn(ncClient.entities.EntityName),
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
ncClient.entities.Person.create({
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
  entityFetchFn={() => listFn(ncClient.entities.Person)}
  onImport={async (row) => ncClient.entities.Person.create({
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

## Idjwi (Layer 3)

### Architecture
```python
# Idjwi owns the request lifecycle; an advisor is optional.
scope = authorize_scope(tenant, organization, operational_unit, user)
context = idjwi_core.load_context(scope)
plan = idjwi_core.plan(objective, context)

if plan.requires_advisor:
    proposal = advisor_router.advise(plan.bounded_request())
    plan = idjwi_core.validate(proposal, context, policies=scope.policies)

return idjwi_core.respond_or_act(plan, approvals=scope.approvals)
```

Provider SDK calls and model identifiers belong only in advisor adapters. The
Idjwi request lifecycle must not depend on Anthropic, OpenAI, Codex, or any other
single provider.

### System prompt — built at runtime, never hardcoded
```python
def build_system_prompt(company_id: str) -> str:
    ctx = get_operator_context(company_id)   # reads Enterprise record
    return f"You are an advisor to Idjwi for {ctx['name']}..."
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
# Layer 1 — Supabase (authoritative data store)
SUPABASE_URL                 Supabase project URL (https://<ref>.supabase.co)
SUPABASE_SERVICE_ROLE_KEY    Service-role key for server-side queries (bypasses RLS)

# Frontend (Vite build)
VITE_SUPABASE_URL            Same as SUPABASE_URL — exposed to browser via vite
VITE_SUPABASE_ANON_KEY       Anon/public key — used by browser client (RLS enforced)
VITE_DATA_LAYER              Set to "supabase" to activate Supabase mode (default: supabase)

# Layer 2 — python_layer (datamart)
DATABASE_URL
CRON_SECRET
API_KEY

# Layer 3 — intelligence
ANTHROPIC_API_KEY             # optional Anthropic advisor
OPENAI_API_KEY                # optional OpenAI/Codex advisor
SENDGRID_API_KEY
WHATSAPP_TOKEN
WHATSAPP_PHONE_ID
NETWORK_ADMIN_KEY
```

All new settings.py fields must be `Optional[str] = None` so missing variables never crash startup.

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
- Query Supabase entities directly for analytics stat card values when python_layer is available
- Show 0 or empty on any stat card, chart, or ML feature if Supabase entities have data
- Build any data-reading feature without a Supabase entity fallback
- Create a new entity when any of the 15 canonical entities covers the use case
- Create a new entity solely because the label is different — use MasterDataOption subtypes instead
- Change entity schema when only the import config needs updating
- Return a plain array from a validate function
- Trust company_id from user input in the copilot
- Use a custom dropdown where TaxonomySelect should be used
- Hardcode industry-specific terminology in shared components
- Hardcode any client name (BrightStar, BRIGHTSTAR, etc.) anywhere in code
- Filter ETL by a single company_id — ETL loads ALL tenants, isolation is at READ time
- Add a COMPANY_ID environment variable to scope ETL to one tenant
- Suggest any Railway variable or config that assumes a single client
- Add an app to APP_REGISTRY without declaring its `backend` and `ontologyObjects` array

### Idjwi documentation sync rule (ALWAYS)

**`python_layer/copilot/docs/newsconseen_docs.md` is the single source of truth for
Idjwi product knowledge loaded by the legacy copilot module.** The file is loaded
fresh on every Idjwi request — no
redeploy, no cache flush required.

**Rule: whenever any of the following change, update `newsconseen_docs.md` to match:**
- CLAUDE.md (architecture, entities, phases, rules)
- ARCHITECTURE.md (schema, entity fields, ontology)
- A new phase is completed (add it to the phase table)
- A new API endpoint is added (add it to the Key API Endpoints section)
- A new agent, connector, alert type, or ML model is added
- Any troubleshooting knowledge is learned (add to Common Troubleshooting table)

Failure to keep `newsconseen_docs.md` in sync means Idjwi gives stale or wrong
answers about Newsconseen's own features — the most visible form of product regression.

### Always
- Trigger ETL after every entity mutation
- Use ^...$ anchors in mapping rules, specific before general
- Pass company_id from currentUser
- Use staleTime:0 + refetchOnMount:always on list pages
- Add entityFetchFn to every BulkImportDialog
- Make new settings.py fields Optional[str] = None
- Implement three-tier fallback (analytics → raw → Supabase live) in every data-reading feature
- Use PostgreSQL for analytics acceleration and clean data export — never as the sole data source
- Keep DataModels.jsx and ObjectExplorer.jsx as accurate technical/imagery references (see rule below)
- Declare `backend` + `ontologyObjects` for every app added to APP_REGISTRY (see Applications rule below)
- Add every new PostgreSQL table to etl/setup.py or enrichment/setup.py so it pre-exists from startup (see Datamart DDL rule below)
- Add every new column on an existing table as `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in the same setup.py file — a CREATE TABLE change alone is not enough and will crash live deployments

### Applications — ontology and datamart as backend (RULE)

Every application in APP_REGISTRY is a purpose-built operational interface. All applications
must be backed by the Newsconseen data infrastructure — never by an independent database,
external API, or bespoke backend:

**Two and only two backend modes:**

| Backend | Layer | When to use | Data path |
|---------|-------|-------------|-----------|
| `ontology` | Layer 1 — Supabase entities | Write-heavy apps: forms, intake, data entry, mutations | Reads/writes via ncClient proxy (Supabase) with company_id stamped on every record |
| `datamart` | Layer 2 — python_layer | Read-heavy apps: dashboards, reports, analytics views | Reads python_layer endpoints with three-tier fallback (analytics → raw → Supabase live) |

**Rules:**
- Every entry in APP_REGISTRY must declare `backend: "ontology"` or `backend: "datamart"`
- Every entry in APP_REGISTRY must declare an `ontologyObjects` array listing which of the
  15 canonical entities the app reads or writes — this is the architectural contract.
  Valid values: Person, Enterprise, Product, Task, Transaction, Relationship, Address,
  Document, Schedule, Signal, Channel, Territory, Animal, Plot, Observation.
- Ontology-backed apps must always stamp `company_id: currentUser?.company_id` on every
  created or updated record — never allow tenant bleed
- Datamart-backed apps must implement three-tier fallback (analytics → raw → Supabase live)
  and never show empty if Supabase has data
- Applications must never hardcode industry-specific labels — use MasterDataOption /
  TaxonomySelect for any field that varies by operator (person_subtype, task_type, etc.)
- Streamlit-generated apps are datamart-backed only — they read from python_layer and
  never write directly to Supabase
- Config-rendered React apps can be either backend — ontology for forms, datamart for views

**When adding a new app:**
1. Add to APP_REGISTRY with `backend` field and `ontologyObjects` array
2. If ontology-backed: implement company_id scoping and ETL trigger after mutations
3. If datamart-backed: implement three-tier fallback

### Datamart DDL — pre-create all tables AND evolve columns at startup (RULE)

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

**Two DDL files — both require a `_DDL` list AND a `_MIGRATIONS` list:**

| File | Covers | Both lists required |
|------|--------|-------------------|
| `python_layer/etl/setup.py` → `ensure_all_analytics_tables(engine)` | All `raw.*` and `analytics.*` tables: 17 raw (9 core + 5 Phase 9 + 3 Phase 10), 17 core analytics, 11 enhanced analytics, `copilot_memory` | ✅ |
| `python_layer/enrichment/setup.py` → `ensure_enrichment_tables(engine)` | All 5 `analytics.*_enrichment` tables | ✅ |

Both files are called in `app.py` lifespan on every startup. Both must run `_DDL` first, then `_MIGRATIONS`.

**Critical distinction — two different startup operations, both required:**

| Operation | SQL | What it handles |
|-----------|-----|-----------------|
| Table creation | `CREATE TABLE IF NOT EXISTS` | New deployments where the table doesn't exist yet |
| Column evolution | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | Existing deployments where the table exists but is missing new columns |

`CREATE TABLE IF NOT EXISTS` is a **no-op on existing tables**. If a column is added to the
DDL definition but the table already exists in the live database, the column is never added.
The ETL writer then crashes with "column does not exist" — blocking health checks and all
downstream features. This is the schema mismatch failure mode (encountered with `product_enrichment.domain_data`).

**Checklist when adding a new column to any existing table:**
```
□ Add column inside the CREATE TABLE IF NOT EXISTS block          (covers new deployments)
□ Add ALTER TABLE ... ADD COLUMN IF NOT EXISTS to _MIGRATIONS     (covers live deployments)
□ Both changes go in the same setup.py file, same commit
□ Update DataModels.jsx to reflect the new column
```

**Checklist when adding a brand-new table:**
```
□ Add CREATE TABLE IF NOT EXISTS to the _DDL list                 (covers all deployments)
□ No ALTER needed — the table doesn't exist on any deployment yet
□ Update DataModels.jsx to reflect the new table
```

**Pattern — new column on existing table:**
```python
# etl/setup.py or enrichment/setup.py

# Step 1: add to CREATE TABLE (new deployments)
_MY_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS analytics.my_table (
    company_id   TEXT,
    new_column   TEXT,   -- ← add here
    loaded_at    TIMESTAMP
)
"""

# Step 2: add to _MIGRATIONS (live deployments — always required for existing tables)
_MIGRATIONS = [
    # ... existing migrations ...
    "ALTER TABLE analytics.my_table ADD COLUMN IF NOT EXISTS new_column TEXT",
]
```

**Pattern — brand-new table:**
```python
# Step 1 only: add to _DDL list (no ALTER needed)
_DDL = [
    """
    CREATE TABLE IF NOT EXISTS analytics.my_new_table (
        company_id    TEXT,
        snapshot_date DATE,
        loaded_at     TIMESTAMP
    )
    """,
]
```

**Rules:**
- Every `CREATE TABLE IF NOT EXISTS` added to any python_layer file must also be added to
  `etl/setup.py` or `enrichment/setup.py` so it pre-exists from startup
- Every new column on an existing table requires a matching
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `_MIGRATIONS` — without it, live deployments
  crash on the next ETL run with "column does not exist"
- Both `_DDL` and `_MIGRATIONS` must be run in `ensure_*()` on every startup
- All columns must be nullable — startup DDL creates empty shells, not schema-enforced tables
- After adding a new table or column, update DataModels.jsx to match (see rule below)
- Never rely on `to_sql()` as the sole mechanism for table creation
- **When a deployment fails with "column does not exist"**: immediate unblock is
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` in the Railway Postgres console,
  then add it to `_MIGRATIONS` in setup.py so it never recurs

### DataModels and ObjectExplorer — living technical references (RULE)

**DataModels.jsx** must always be an accurate, up-to-date technical reference of the actual
PostgreSQL schema and system architecture as it exists in the codebase:
- **Ontology view**: all 15 canonical entities + MasterDataOption, open data APIs, analytics pipeline.
  Update this view whenever a new entity, field, or relationship is added to ARCHITECTURE.md.
- **PostgreSQL view**: actual raw.*, analytics.*, audit.* table schemas sourced from real DDL
  in the python_layer (agent_memory.py, approval_gate.py, copilot/queries.py, audit/routes.py).
  Update this view whenever a new CREATE TABLE is added to any python_layer file.
- **API Catalogue**: all FastAPI routers and their key endpoints.
  Update this view whenever a new router is mounted in app.py.

**ObjectExplorer.jsx** shows the 7 core canonical entities (Person, Enterprise, Product, Task,
Transaction, Relationship, Address) as the primary operational graph. The 8 extension entities
(Phase 9 + Phase 10) are not shown in ObjectExplorer — they are visible as list pages in the
sidebar. ObjectExplorer renders the core graph with live record counts; do not add the extension
entities to the 3D/schema/live graph without explicit confirmation.

Rule: DataModels = "what does the architecture look like technically right now?"
      ObjectExplorer = "what data does this operator have in the 7 core entities right now?"

When adding a new phase, database table, or API router:
1. Update DataModels.jsx to include the new table/endpoint
2. Only update ObjectExplorer if adding a core-entity (Person/Enterprise/Product/Task/Transaction/Relationship/Address) feature

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
Phase 1  Core OS          ✅ All 7 core entities, forms, lists, taxonomy
Phase 2  Connectors       ✅ 35 connectors, 9 categories, full connect flow UI
Phase 3A Idjwi            ✅ Core tools, memory, grounded answers, legacy copilot API
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
Phase 8  Audit Trail      ✅ Immutable change log across all 7 core entities
Phase A  Enrichment       ✅ Universal ontology enrichment — phone/email/geocoding/FX/barcode/company registration
Phase B  Enrichment       ✅ Domain-specific enrichment — medications, food, vehicles, chemicals, devices, software, NPI
Phase C  Enrichment       ✅ Compliance & risk — OFAC SDN sanctions, World Bank WGI, GDELT news, AML flags
Phase D  Enrichment       ✅ Scoring & synthesis — entity_scores, relationship/task enrichment (7/7 core entities), get_entity_risk_report copilot tool
Phase E  Enrichment       ✅ Predictive & temporal — spend_trend, churn_probability, CLV segment (person); revenue_trend, payment_behavior, avg_days_to_pay (enterprise); demand_trend, stockout_risk, days_of_stock, demand_forecast_30d (product); is_recurring, recurrence_count, seasonal_flag, days_since_prior_tx (transaction)
Phase 9  Ontology Expand  ✅ 5 operational extension entities (Document, Schedule, Signal, Channel, Territory) + ETL + analytics tables + copilot tools + frontend pages
Phase 10 Domain-Native    ✅ 3 domain-native entities (Animal, Plot, Observation) + ETL + analytics tables + agricultural APIs (SoilGrids, FAOSTAT, NASA POWER) + copilot tools + frontend pages
Phase 11 Spatial Engine   ✅ Map Explorer → Spatial Intelligence: /postgis/spatial-pins (multi-layer unified pin feed), /postgis/spatial-density (heatmap, adjustable grid), /postgis/coverage-analysis (boundary coverage %); MapView rebuilt with Pins/Clusters/Density/Boundaries modes + entity layer toggles
```

---

## Current state (as of 2026-04-15)

All Phases 1–8, Enrichment Phases A–E, Production Infra, Onboarding flow, BI Export, Multi-tenant Admin UI, and Security hardening are implemented and deployed.

```
COMPLETED
  ✅ All 7 core entities with forms, lists, bulk import, taxonomy
  ✅ ETL pipeline — all 9 entities, multi-tenant, three-tier fallback
  ✅ Idjwi — core tools, session memory, grounded answers, advisor adapter
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
Build Phase 8 — Audit Trail: a python_layer /audit endpoint that reads from Supabase
entity change history, stores to PostgreSQL audit.change_log, and a Settings > Audit Trail
tab in the frontend with date/entity/user filters and CSV export.
```
