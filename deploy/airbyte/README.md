# Airbyte on Railway

Airbyte is deployed via Railway's one-click template — no Dockerfile needed.

## Deploy steps

1. Railway → **New** → **Template** → search **"Airbyte"**
2. Click **Deploy**
3. Wait ~3 minutes for Airbyte to initialise
4. Open the generated Railway URL — log in with the credentials you set

## Connect to Newsconseen

### Source — Base44 REST API
1. Airbyte UI → **Sources** → **+ New source** → search **"HTTP Request"** (or use the Generic REST API connector)
2. Base URL: `https://app.base44.com/api/apps/<YOUR_APP_ID>/entities`
3. Auth: Bearer token → `BASE44_API_KEY`
4. Streams: `people`, `enterprises`, `products`, `tasks`, `transactions`

### Destination — Newsconseen PostgreSQL
1. Airbyte UI → **Destinations** → **+ New destination** → **PostgreSQL**
2. Connection string: value of `NEWSCONSEEN_DB_URL` (python_layer DATABASE_URL)
3. Schema: `raw` (Airbyte writes raw records; python_layer ETL promotes to `analytics.*`)
4. Sync mode: **Full refresh + overwrite** or **Incremental append**

### Connection schedule
- Set sync to run **every 1 hour** — this keeps `raw.*` tables fresh
- python_layer `/cron/etl-all` promotes `raw.*` → `analytics.*` on its own schedule

## Environment variables

See [railway.env.example](railway.env.example) for all variables to set
in the Railway Airbyte service.
