# Demo Company Seeder

Use the demo seeder when you need realistic company data without touching real
customer records.

```powershell
npm run seed:demo -- --dry-run
npm run seed:demo
```

It creates five deterministic demo tenants:

- Newsconseen Demo Clinic
- Newsconseen Demo Farm
- Newsconseen Demo Retail Shop
- Newsconseen Demo School
- Newsconseen Demo NGO

Each tenant gets connected ontology data across enterprises, people, products,
services, addresses, relationships, tasks, transactions, documents, schedules,
signals, territories, risks, opportunities, recommendations, insights, and metric
definitions. The farm also gets plots, animals, and observations. The school
uses tuition/supply_purchase transactions and a nonprofit enterprise_type; the
NGO uses grant/donation transactions, a volunteer-type person, and a Kenya-based
location to exercise those parts of the ontology.

Required environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional environment:

- `DATABASE_URL` seeds Idjwi company memories into `analytics.idjwi_memory`.
- `PYTHON_LAYER_URL` or `RAILWAY_URL` triggers `/load/*` analytics refresh calls.
- `CRON_SECRET` is sent as `x-cron-secret` when the analytics refresh is protected.

Useful variants:

```powershell
npm run seed:demo -- --only clinic
npm run seed:demo -- --only farm
npm run seed:demo -- --only retail
npm run seed:demo -- --only school
npm run seed:demo -- --only ngo
npm run seed:demo -- --skip-etl
```

The script uses stable IDs, so rerunning the same command updates the same demo
records instead of creating duplicates.
