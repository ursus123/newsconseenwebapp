# Base44 removal baseline

**Frozen:** 2026-07-28
**Baseline commit:** `65c7455`
**Purpose:** Preserve verified localhost behavior while each Base44 capability is
replaced by a governed Newsconseen capability.

## Runtime baseline

- `http://127.0.0.1:5173/CompanyGraphHome`: HTTP 200
- `http://127.0.0.1:8001/health`: HTTP 200
- Supabase frontend/backend project alignment: passed
- Authorized Company Graph endpoint benchmark: all defined endpoint targets met
- Local backup: completed
- Structural restore drill: passed
- Full restore drill: blocked until `RESTORE_TEST_DATABASE_URL` is configured

## Test baseline

- Company Graph backend release suite: 94 passed
- Company Graph frontend contract suite: 6 passed
- Accessibility suite: 6 passed
- Complete Python collection: 256 tests
- Pre-migration full-suite defect: empty-email validation omitted the
  `email_format_valid` key. Stage A corrected the response contract before the
  frontend data boundary changed.

## Core workflows to preserve

1. Supabase sign-in, session refresh, sign-out and profile/tenant resolution.
2. Canonical CRUD for people, enterprises, tasks, transactions, products,
   services, relationships and addresses.
3. Company Graph overview, search, neighborhood, evidence and corrections.
4. Idjwi Core questions, explicit intents, citations and advisor truth.
5. Imports, mappings and ETL from canonical operational records.
6. File uploads and document extraction.
7. Notifications and alerts.
8. Governed workflow and agent actions.
9. Administrator, manager, technician and worker surfaces.

## Migration checklist

- [x] Freeze baseline commit and runtime evidence.
- [x] Record performance evidence and backup state.
- [x] Define the replacement capability map.
- [x] Remove the frontend entity/authentication data-layer switch.
- [x] Fail closed when a frontend entity has no Supabase mapping.
- [ ] Replace uploads with governed Supabase Storage.
- [ ] Replace document extraction and generic LLM integrations.
- [ ] Replace backend live fallbacks and writes.
- [ ] Replace connectors, imports, workflows, alerts and agents.
- [ ] Remove packages, Vite plugin, environment variables and serverless code.
- [ ] Prove zero active Base44 network traffic.
- [ ] Cut DNS only after staging acceptance.
