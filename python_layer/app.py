import logging
from contextlib import asynccontextmanager
from typing import List, Optional

import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Config — from config package (backward compatible with old config.py)
from config import settings
from database import ensure_analytics_schema, get_engine_safe

# ETL modules
from etl import (
    addresses,
    enterprises,
    geospatial,
    people,
    products,
    relationships,
    services,
    tasks,
    transactions,
)
from etl.load import load_dataframe, load_dataframe_replace, load_raw

# Schemas
from schemas import (
    AddressSummary,
    EnterpriseSummary,
    PeopleSummary,
    ProductSummary,
    RelationshipSummary,
    ServiceSummary,
    TaskSummary,
    TransactionSummary,
)

# ML and Open Data (existing)
from ml.routes import router as ml_router
from open_data import ALL_ROUTERS

# Phase 2 — Connector infrastructure
from connectors.routes import router as connectors_router

# Phase 3A — Operational Copilot
from copilot.routes import router as copilot_router

# Phase 3B — Proactive Alerts
from alerts.routes import router as alerts_router

# Phase 3C — Network Intelligence
from network.routes import router as network_router

# Webhook — event-driven ETL triggers (taxonomy changes, etc.)
from webhook.routes import router as webhook_router

# n8n Workflow Automation integration
from n8n.routes import router as n8n_router
from n8n.emitter import emit_etl_complete

# Airbyte data integration
from airbyte.routes import router as airbyte_router

# pgvector semantic search
from pgvector_ext.routes import router as pgvector_router

# PostGIS spatial intelligence
from postgis.routes import router as postgis_router

# Market Intelligence Layer
try:
    from market.routes import router as market_router
    _market_ok = True
except Exception as _market_err:
    market_router = None
    _market_ok = False
    logger.warning("market layer import failed — disabled: %s", _market_err)

# Phase 4 — Kinetic Layer (write-back + audit log)
try:
    from kinetic.routes import router as kinetic_router
    _kinetic_ok = True
except Exception as _kinetic_err:
    kinetic_router = None
    _kinetic_ok = False
    logger.warning("kinetic layer import failed — disabled: %s", _kinetic_err)

# Phase 4 — Agentic AI Framework
try:
    from agents.routes import router as agents_router, setup_agent_tables
    _agents_ok = True
except Exception as _agents_err:
    agents_router = None
    setup_agent_tables = None
    _agents_ok = False
    logger.warning("agents layer import failed — disabled: %s", _agents_err)

logger = logging.getLogger(__name__)


# ----------------------------------------------------------
# Lifespan — runs on startup
# ----------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = get_engine_safe()
    if engine:
        try:
            ensure_analytics_schema(engine)
            logger.info("Startup: Railway PostgreSQL connected → analytics schema ready")
        except Exception as e:
            logger.warning("Startup: Failed to create analytics schema: %s", e)

        # Enable pgvector extension + embeddings table (silent if already exists)
        try:
            from pgvector_ext.setup import ensure_pgvector
            ensure_pgvector(engine)
            logger.info("Startup: pgvector extension ready")
        except Exception as e:
            logger.warning("Startup: pgvector setup skipped — %s", e)

        # Enable PostGIS extension + spatial columns (silent if already exists)
        try:
            from postgis.setup import ensure_postgis
            ensure_postgis(engine)
            logger.info("Startup: PostGIS extension ready")
        except Exception as e:
            logger.warning("Startup: PostGIS setup skipped — %s", e)

        # Phase 4 — Agent tables (approval gate, memory, market intelligence)
        if setup_agent_tables:
            try:
                setup_agent_tables(engine)
                logger.info("Startup: Agent tables ready")
            except Exception as e:
                logger.warning("Startup: Agent table setup skipped — %s", e)
    else:
        logger.warning("Startup: DATABASE_URL not set — analytics store unavailable")
    yield


# ----------------------------------------------------------
# FastAPI App — v4.0.0
# ----------------------------------------------------------
app = FastAPI(
    title="Newsconseen — Autonomous SME Operating System",
    description=(
        "**The Autonomous SME Operating System.**\n\n"
        "Layer 1 — Enterprise OS: Base44 master data (Person, Enterprise, Product)\n"
        "Layer 2 — Deployable Datamart: ETL pipeline, PostgreSQL, FastAPI\n"
        "Layer 3 — Foundry Intelligence: Copilot + Alerts + Network Intelligence\n"
        "Layer 4 — Agentic AI: 8 autonomous agents, multi-LLM orchestration, "
        "approval gate, agent memory, deep market research\n\n"
        "One system. Any industry. Runs itself."
    ),
    version="4.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # must be False when allow_origins=["*"] — browser rejects wildcard+credentials
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------
# API Key middleware — enforced only when API_KEY is set
# Allows: /, /health, /docs, /openapi.json, /redoc (always)
# Allows: /load/*, /cron/* (use x-cron-secret instead)
# ----------------------------------------------------------
_PUBLIC_PATHS = {
    "/", "/health", "/docs", "/openapi.json", "/redoc",
    "/copilot/status", "/alerts/status", "/network/status",
    "/webhook/etl-status",
}
_CRON_PREFIXES = ("/load/", "/cron/", "/webhook/")


@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    expected = settings.api_key
    if not expected:
        return await call_next(request)

    # Always pass CORS preflight through — the api_key header is never
    # sent in OPTIONS requests, so blocking them breaks CORS for all POSTs.
    if request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    if path in _PUBLIC_PATHS or any(path.startswith(p) for p in _CRON_PREFIXES):
        return await call_next(request)

    provided = request.headers.get("x-api-key", "")
    if provided != expected:
        return JSONResponse(
            status_code=401,
            content={"detail": "Missing or invalid x-api-key header"},
        )
    return await call_next(request)

# ----------------------------------------------------------
# Mount all routers
# ----------------------------------------------------------

# Open Data routers (existing)
for router in ALL_ROUTERS:
    app.include_router(router)

# ML (existing)
app.include_router(ml_router)

# Phase 2 — Connectors
app.include_router(connectors_router)

# Phase 3A — Operational Copilot
app.include_router(copilot_router)

# Phase 3B — Proactive Alerts
app.include_router(alerts_router)

# Phase 3C — Network Intelligence
app.include_router(network_router)

# Webhook — event-driven ETL triggers
app.include_router(webhook_router)

# n8n Workflow Automation
app.include_router(n8n_router)

# Airbyte data integration
app.include_router(airbyte_router)

# pgvector semantic search
app.include_router(pgvector_router)

# PostGIS spatial intelligence
app.include_router(postgis_router)

# Market Intelligence
if _market_ok and market_router is not None:
    app.include_router(market_router)

# Public Data Connectors (CMS, DEA/NPPES, State Pharmacy Board)
try:
    from connectors.public_data.routes import router as public_data_router
    app.include_router(public_data_router)
except Exception as _pd_err:
    import logging as _logging
    _logging.getLogger(__name__).warning("Public data connectors not loaded: %s", _pd_err)

# Phase 4 — Kinetic Layer
if _kinetic_ok and kinetic_router is not None:
    app.include_router(kinetic_router)

# Phase 4 — Agentic AI Framework
if _agents_ok and agents_router is not None:
    app.include_router(agents_router)


# ----------------------------------------------------------
# Helper Functions
# ----------------------------------------------------------
def filter_by_company(df: pd.DataFrame, company_id: Optional[str]) -> pd.DataFrame:
    if not company_id or "company_id" not in df.columns:
        return df
    return df[df["company_id"] == company_id].copy()


def safe_sample(df: pd.DataFrame) -> dict:
    if df.empty:
        return {"columns": list(df.columns), "row_count": 0, "sample": []}
    sample = df.head(2).where(df.head(2).notna(), None).to_dict(orient="records")
    return {"columns": list(df.columns), "row_count": len(df), "sample": sample}


def _check_cron_secret(secret: Optional[str]) -> None:
    """
    Validate x-cron-secret header on load/* endpoints.
    Permissive by default — logs invalid secrets but does not block,
    so the Connectors UI can trigger ETL without the header.
    To enforce strictly, change the return to raise.
    """
    if settings.cron_secret and secret and secret != settings.cron_secret:
        raise HTTPException(status_code=403, detail="Invalid cron secret")


# ----------------------------------------------------------
# Superset Guest Token — scoped to company_id via RLS
# ----------------------------------------------------------
class SupersetTokenRequest(BaseModel):
    dashboard_id: str
    company_id:   str

@app.post("/superset/guest-token", tags=["Superset"])
def superset_guest_token(req: SupersetTokenRequest):
    """
    Generate a short-lived Superset guest token scoped to the caller's company_id.

    The token is passed to @superset-ui/embedded-sdk on the frontend.
    Superset enforces the RLS filter — the embedded dashboard can only
    query data WHERE company_id = <req.company_id>.

    Requirements:
      SUPERSET_URL      — your Superset instance URL (e.g. https://superset.railway.app)
      SUPERSET_USERNAME — admin username for token generation
      SUPERSET_PASSWORD — admin password for token generation

    Superset config (superset_config.py):
      FEATURE_FLAGS = {"EMBEDDED_SUPERSET": True}
      CORS settings must include your frontend domain.
    """
    import os, requests as http_requests

    superset_url = os.getenv("SUPERSET_URL", "").rstrip("/")
    username     = os.getenv("SUPERSET_USERNAME", "admin")
    password     = os.getenv("SUPERSET_PASSWORD", "")

    if not superset_url:
        raise HTTPException(
            status_code=503,
            detail="SUPERSET_URL not configured. Add it to Railway environment variables.",
        )

    try:
        # Step 1: get CSRF token + session cookie
        login_res = http_requests.post(
            f"{superset_url}/api/v1/security/login",
            json={"username": username, "password": password,
                  "provider": "db", "refresh": True},
            timeout=10,
        )
        login_res.raise_for_status()
        access_token = login_res.json()["access_token"]

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type":  "application/json",
        }

        # Step 2: get guest token with RLS filter for company_id
        guest_res = http_requests.post(
            f"{superset_url}/api/v1/security/guest_token/",
            json={
                "user":      {"username": f"guest_{req.company_id}", "first_name": "Guest", "last_name": "User"},
                "resources": [{"type": "dashboard", "id": req.dashboard_id}],
                "rls":       [{"clause": f"company_id = '{req.company_id}'"}],
            },
            headers=headers,
            timeout=10,
        )
        guest_res.raise_for_status()
        return {"token": guest_res.json()["token"]}

    except http_requests.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Superset API error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Guest token failed: {e}")


# ----------------------------------------------------------
# Health & Status
# ----------------------------------------------------------
@app.get("/", tags=["Health"])
def root():
    return {
        "status":  "ok",
        "service": "newsconseen-python-layer",
        "version": "4.0.3",
        "mantra":  "The SME version of Palantir Foundry",
        "layers": {
            "layer_1": "Enterprise OS — Base44 master data",
            "layer_2": "Deployable Datamart — ETL + PostgreSQL + FastAPI",
            "layer_3": "Foundry Intelligence — Copilot + Alerts + Network",
        },
    }


@app.get("/health", tags=["Health"])
def health():
    import os
    from sqlalchemy import text

    db_status = "unavailable"
    engine    = get_engine_safe()
    if engine:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_status = "connected"
        except Exception as e:
            db_status = f"error: {str(e)[:100]}"

    copilot_backend = os.getenv("COPILOT_BACKEND", "")
    copilot_key_set = bool(
        os.getenv("ANTHROPIC_API_KEY") or
        os.getenv("OPENAI_API_KEY")
    )
    backend_display = {
        "anthropic": "claude",
        "claude":    "claude",
        "openai":    "openai",
    }.get(copilot_backend, copilot_backend)

    return {
        "status":   "ok" if db_status == "connected" else "degraded",
        "version":  "4.0.2",
        "api":      "ok",
        "database": db_status,

        # Layer 2
        "etl_enabled":        True,
        "ml_enabled":         os.getenv("ML_ENABLED", "false").lower() == "true",
        "open_data_enabled":  True,
        "connectors_enabled": True,

        # Layer 3A — Copilot
        "copilot_enabled":  bool(copilot_backend and copilot_key_set),
        "copilot_backend":  backend_display or "not configured",

        # Layer 3B — Alerts
        "alerts_enabled": True,
        "alert_channels": {
            "email":    bool(os.getenv("SENDGRID_API_KEY") or os.getenv("SMTP_HOST")),
            "whatsapp": bool(os.getenv("WHATSAPP_PHONE_NUMBER_ID") and os.getenv("WHATSAPP_ACCESS_TOKEN")),
            "sms":      bool(
                (os.getenv("AT_API_KEY") and os.getenv("AT_USERNAME")) or
                (os.getenv("TWILIO_ACCOUNT_SID") and os.getenv("TWILIO_AUTH_TOKEN"))
            ),
        },

        # Layer 3C — Network
        "network_enabled": True,
    }


# ----------------------------------------------------------
# Cron — Full ETL pipeline (protected)
# ----------------------------------------------------------
@app.post("/cron/etl-all", tags=["Cron"])
def cron_etl_all(x_cron_secret: str = Header(None)):
    # Permissive auth: only reject a non-empty wrong secret.
    # An empty / missing header is allowed so the Pipelines UI
    # can trigger ETL without exposing CRON_SECRET in the frontend bundle.
    _check_cron_secret(x_cron_secret)

    entity_map = {
        "tasks":         (tasks.extract_tasks,                tasks.transform_tasks),
        "transactions":  (transactions.extract_transactions,   transactions.transform_transactions),
        "services":      (services.extract_services,           services.transform_services),
        "enterprises":   (enterprises.extract_enterprises,     enterprises.transform_enterprises),
        "people":        (people.extract_people,               people.transform_people),
        "products":      (products.extract_products,           products.transform_products),
        "addresses":     (addresses.extract_addresses,         addresses.transform_addresses),
        "relationships": (relationships.extract_relationships,  relationships.transform_relationships),
    }

    # ── Step 1: Extract all entities in PARALLEL ──────────────────────────────
    # All Base44 fetches are independent HTTP calls — fire them simultaneously.
    # ThreadPoolExecutor: threads bypass Python's GIL for I/O-bound work.
    # max_workers=8 matches number of entities — each gets its own thread.
    # Wall-clock time drops from (sum of all fetches) → (slowest single fetch).
    raw_data: dict[str, pd.DataFrame] = {}

    def _extract_one(name, extract_fn):
        """Extract one entity and write to raw table. Returns (name, df)."""
        try:
            df = extract_fn()
        except Exception as e:
            logger.error("Cron: %s extract failed — %s", name, e)
            return name, pd.DataFrame()
        try:
            load_raw(df, name)
            logger.info("Cron: raw.%s — %d records written", name, len(df))
        except Exception as e:
            logger.warning(
                "Cron: raw.%s write failed (data still in memory for transform) — %s",
                name, e,
            )
        return name, df

    with ThreadPoolExecutor(max_workers=8, thread_name_prefix="etl-extract") as pool:
        futures = {
            pool.submit(_extract_one, name, extract_fn): name
            for name, (extract_fn, _) in entity_map.items()
        }
        for future in as_completed(futures):
            name, df = future.result()
            raw_data[name] = df

    logger.info("Cron: parallel extract complete — %d entities loaded", len(raw_data))

    # ── Step 2: Discover all company_ids from ALL entity extracts ────────────
    # Robust multi-tenant discovery: scan every raw DataFrame for a company_id
    # column, collect the union of all distinct values.  Enterprises is the
    # canonical source but any entity that carries company_id will do.
    # This means a single-entity failure (e.g. enterprises raw write crashed)
    # cannot prevent the ETL from running for the other tenants.
    all_company_ids: set = set()
    for name, df in raw_data.items():
        if "company_id" in df.columns:
            ids = df["company_id"].dropna().unique().tolist()
            if ids:
                logger.info("Cron: found %d company_id(s) in raw.%s: %s", len(ids), name, ids)
                all_company_ids.update(ids)

    company_ids = list(all_company_ids)
    if not company_ids:
        logger.warning(
            "Cron: no company_ids found in ANY entity extract — "
            "running once without company_id scoping. "
            "Analytics rows will have NULL company_id and will NOT be queryable by the copilot. "
            "Check that Base44 entity records include a company_id field."
        )
        company_ids = [None]

    logger.info("Cron: %d company_id(s) discovered: %s", len(company_ids), company_ids)

    # ── Step 3: Transform + load analytics summaries — parallel per entity ────
    # Entities are independent — people_summary doesn't depend on task_summary.
    # Run one thread per entity, each iterating its own company list.
    # DB writes use separate connections per thread (SQLAlchemy pool handles this).
    results: dict = {}
    results_lock = __import__("threading").Lock()

    def _transform_entity(name, transform_fn):
        """Transform + load one entity across all companies. Returns (name, result)."""
        entity_result = {}
        for company_id in company_ids:
            try:
                filtered = filter_by_company(raw_data.get(name, pd.DataFrame()), company_id)
                summary  = transform_fn(filtered)
                r        = load_dataframe(summary, f"{name}_summary", company_id=company_id)
                if not entity_result or r.get("status") == "error":
                    entity_result = r
                elif r.get("status") == "success":
                    entity_result["rows_loaded"] = (
                        entity_result.get("rows_loaded", 0) + r.get("rows_loaded", 0)
                    )
            except Exception as e:
                entity_result = {"status": "error", "detail": str(e)}
                logger.error("Cron: %s summary failed (company_id=%s) — %s", name, company_id, e)
        return name, entity_result

    with ThreadPoolExecutor(max_workers=8, thread_name_prefix="etl-transform") as pool:
        futures = {
            pool.submit(_transform_entity, name, transform_fn): name
            for name, (_, transform_fn) in entity_map.items()
        }
        for future in as_completed(futures):
            name, entity_result = future.result()
            with results_lock:
                results[name] = entity_result

    logger.info("Cron: parallel transform complete — %d entities", len(results))

    # ── Step 4: Geospatial (company-agnostic spatial clustering) ─────────────
    try:
        geo_raw = geospatial.extract_geospatial()
    except Exception as e:
        results["geospatial"] = {"status": "error", "detail": f"extract failed: {e}"}
        logger.error("Cron: geospatial extract failed — %s", e)
        geo_raw = pd.DataFrame()

    if not geo_raw.empty:
        try:
            load_raw(geo_raw, "geospatial")
        except Exception as e:
            logger.warning("Cron: raw.geospatial write failed — %s", e)

        try:
            geo_summary = geospatial.transform_geospatial(geo_raw)
            results["geospatial"] = load_dataframe_replace(geo_summary, "geospatial_summary")
            # Backfill PostGIS geom column after every geospatial ETL write
            _geo_engine = get_engine_safe()
            if _geo_engine:
                try:
                    from sqlalchemy import text as _sqlt
                    with _geo_engine.connect() as _conn:
                        _upd = _conn.execute(_sqlt("""
                            UPDATE analytics.geospatial_summary
                            SET geom = ST_SetSRID(
                                ST_MakePoint(longitude::float, latitude::float),
                                4326
                            )::geography
                            WHERE latitude IS NOT NULL
                              AND longitude IS NOT NULL
                              AND geom IS NULL;
                        """))
                        _conn.commit()
                    results["geospatial"]["postgis_geom_updated"] = _upd.rowcount
                except Exception as _ge:
                    results["geospatial"]["postgis_geom_updated"] = f"skipped ({_ge})"
        except Exception as e:
            results["geospatial"] = {"status": "error", "detail": str(e)}
            logger.error("Cron: geospatial transform/load failed — %s", e)

    success_count = sum(1 for r in results.values() if r.get("status") == "success")

    # Notify n8n of ETL completion (fire-and-forget, never blocks response)
    emit_etl_complete(results, company_ids)

    return {
        "cron_run":    True,
        "version":     "4.0.3",
        "companies":   len(company_ids),
        "raw_stored":  list(raw_data.keys()),
        "success":     success_count,
        "total":       len(results),
        "all_success": success_count == len(results),
        "results":     results,
    }


# ----------------------------------------------------------
# Raw data stats — how many records are stored per entity
# ----------------------------------------------------------
@app.get("/raw/stats", tags=["Raw"])
def raw_stats():
    """
    Returns row counts for every table in the raw schema.
    Use this to verify the python_layer has captured the same
    number of records as Base44. If counts differ, check ETL logs.
    """
    from database import get_engine_safe
    from sqlalchemy import text as sqlt

    engine = get_engine_safe()
    if not engine:
        return {"error": "no database"}

    with engine.connect() as conn:
        rows = conn.execute(sqlt("""
            SELECT table_name,
                   (xpath('/row/c/text()',
                     query_to_xml(
                       format('SELECT COUNT(*) AS c FROM raw.%%I', table_name),
                       FALSE, TRUE, ''
                     )
                   ))[1]::TEXT::BIGINT AS row_count
            FROM information_schema.tables
            WHERE table_schema = 'raw'
            ORDER BY table_name
        """)).fetchall()
    return {
        "schema": "raw",
        "tables": {r[0]: r[1] for r in rows},
        "note":   "Counts should match Base44 entity totals. Re-run ETL if they differ.",
    }


@app.get("/raw/{entity}", tags=["Raw"])
def raw_entity_sample(
    entity:     str,
    company_id: Optional[str] = Query(None),
    limit:      int           = Query(100, le=1000),
):
    """
    Return up to 1000 raw records for an entity from the raw schema.
    Useful for ML feature inspection, data validation, and debugging.
    Entities: people, enterprises, products, tasks, transactions,
              services, relationships, addresses, geospatial
    """
    from database import get_engine_safe
    from sqlalchemy import text as sqlt

    allowed = {
        "people", "enterprises", "products", "tasks", "transactions",
        "services", "relationships", "addresses", "geospatial",
    }
    if entity not in allowed:
        raise HTTPException(status_code=404, detail=f"Unknown entity '{entity}'. Allowed: {sorted(allowed)}")

    engine = get_engine_safe()
    if not engine:
        return {"error": "no database"}

    where = "WHERE company_id = :cid" if company_id else ""
    params = {"limit": limit}
    if company_id:
        params["cid"] = company_id

    with engine.connect() as conn:
        result = conn.execute(sqlt(
            f"SELECT * FROM raw.{entity} {where} LIMIT :limit"
        ), params)
        cols = result.keys()
        rows = [dict(zip(cols, row)) for row in result.fetchall()]

    return {
        "entity":     entity,
        "company_id": company_id,
        "count":      len(rows),
        "columns":    list(cols),
        "data":       rows,
    }


# ----------------------------------------------------------
# Debug — analytics table contents (temporary, remove after diagnosis)
# ----------------------------------------------------------
@app.get("/debug/analytics/people", tags=["Debug"])
def debug_analytics_people():
    """Show what is actually stored in analytics.people_summary."""
    from database import get_engine_safe
    from sqlalchemy import text as sqlt
    engine = get_engine_safe()
    if not engine:
        return {"error": "no database"}
    with engine.connect() as conn:
        rows = conn.execute(sqlt(
            "SELECT company_id, person_type, status, people_count, active_count "
            "FROM analytics.people_summary ORDER BY snapshot_date DESC LIMIT 30"
        )).fetchall()
    return {"rows": [dict(r) for r in rows], "count": len(rows)}


# ----------------------------------------------------------
# Debug Endpoints — raw extraction snapshots
# ----------------------------------------------------------
@app.get("/debug/enterprises",   tags=["Debug"])
def debug_enterprises(company_id: Optional[str] = Query(None)):
    return safe_sample(filter_by_company(enterprises.extract_enterprises(), company_id))


@app.get("/debug/tasks",         tags=["Debug"])
def debug_tasks(company_id: Optional[str] = Query(None)):
    return safe_sample(filter_by_company(tasks.extract_tasks(), company_id))


@app.get("/debug/people",        tags=["Debug"])
def debug_people(company_id: Optional[str] = Query(None)):
    return safe_sample(filter_by_company(people.extract_people(), company_id))


@app.get("/debug/transactions",  tags=["Debug"])
def debug_transactions(company_id: Optional[str] = Query(None)):
    return safe_sample(filter_by_company(transactions.extract_transactions(), company_id))


@app.get("/debug/products",      tags=["Debug"])
def debug_products(company_id: Optional[str] = Query(None)):
    return safe_sample(filter_by_company(products.extract_products(), company_id))


@app.get("/debug/addresses",     tags=["Debug"])
def debug_addresses(company_id: Optional[str] = Query(None)):
    return safe_sample(filter_by_company(addresses.extract_addresses(), company_id))


@app.get("/debug/relationships",  tags=["Debug"])
def debug_relationships(company_id: Optional[str] = Query(None)):
    return safe_sample(filter_by_company(relationships.extract_relationships(), company_id))


# ----------------------------------------------------------
# Analytics Summary Endpoints — Layer 2
# GET  = read from Base44 → transform → return JSON
# POST /load/* = ETL write to PostgreSQL (triggered by mutations)
# ----------------------------------------------------------

# ── People ────────────────────────────────────────────────

@app.get("/people-summary", response_model=List[PeopleSummary], tags=["ETL"])
def get_people_summary(company_id: Optional[str] = Query(None)):
    df      = filter_by_company(people.extract_people(), company_id)
    summary = people.transform_people(df)
    rel_df  = relationships.extract_relationships()
    summary = people.enrich_people_enterprise(summary, rel_df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/people-summary", tags=["ETL"])
def load_people_summary(
    company_id:     Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    df      = filter_by_company(people.extract_people(), company_id)
    summary = people.transform_people(df)
    rel_df  = relationships.extract_relationships()
    summary = people.enrich_people_enterprise(summary, rel_df)
    return load_dataframe(summary, "people_summary", company_id=company_id)


# ── Enterprises ───────────────────────────────────────────

@app.get("/enterprise-summary", response_model=List[EnterpriseSummary], tags=["ETL"])
def get_enterprise_summary(company_id: Optional[str] = Query(None)):
    df      = filter_by_company(enterprises.extract_enterprises(), company_id)
    summary = enterprises.transform_enterprises(df)
    # Enrich with coordinates from linked addresses via enterprise_address relationships
    rel_df  = relationships.extract_relationships()
    addr_df = addresses.extract_addresses()
    summary = enterprises.enrich_enterprise_coords(summary, rel_df, addr_df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/enterprise-summary", tags=["ETL"])
def load_enterprise_summary(
    company_id:     Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    df      = filter_by_company(enterprises.extract_enterprises(), company_id)
    summary = enterprises.transform_enterprises(df)
    rel_df  = relationships.extract_relationships()
    addr_df = addresses.extract_addresses()
    summary = enterprises.enrich_enterprise_coords(summary, rel_df, addr_df)
    return load_dataframe(summary, "enterprise_summary", company_id=company_id)


# ── Transactions ──────────────────────────────────────────

@app.get("/transaction-summary", response_model=List[TransactionSummary], tags=["ETL"])
def get_transaction_summary(company_id: Optional[str] = Query(None)):
    df      = filter_by_company(transactions.extract_transactions(), company_id)
    summary = transactions.transform_transactions(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/transaction-summary", tags=["ETL"])
def load_transaction_summary(
    company_id:     Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    df = filter_by_company(transactions.extract_transactions(), company_id)
    return load_dataframe(transactions.transform_transactions(df), "transaction_summary", company_id=company_id)


# ── Products ──────────────────────────────────────────────

@app.get("/product-summary", response_model=List[ProductSummary], tags=["ETL"])
def get_product_summary(company_id: Optional[str] = Query(None)):
    df      = filter_by_company(products.extract_products(), company_id)
    summary = products.transform_products(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/product-summary", tags=["ETL"])
def load_product_summary(
    company_id:     Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    df = filter_by_company(products.extract_products(), company_id)
    return load_dataframe(products.transform_products(df), "product_summary", company_id=company_id)


# ── Tasks ─────────────────────────────────────────────────

@app.get("/task-summary", response_model=List[TaskSummary], tags=["ETL"])
def get_task_summary(company_id: Optional[str] = Query(None)):
    df      = filter_by_company(tasks.extract_tasks(), company_id)
    summary = tasks.transform_tasks(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/task-summary", tags=["ETL"])
def load_task_summary(
    company_id:     Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    df = filter_by_company(tasks.extract_tasks(), company_id)
    return load_dataframe(tasks.transform_tasks(df), "task_summary", company_id=company_id)


# ── Services ──────────────────────────────────────────────

@app.get("/service-summary", response_model=List[ServiceSummary], tags=["ETL"])
def get_service_summary(company_id: Optional[str] = Query(None)):
    df      = filter_by_company(services.extract_services(), company_id)
    summary = services.transform_services(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


# ── Addresses ─────────────────────────────────────────────

@app.get("/address-summary", response_model=List[AddressSummary], tags=["ETL"])
def get_address_summary(company_id: Optional[str] = Query(None)):
    df      = filter_by_company(addresses.extract_addresses(), company_id)
    summary = addresses.transform_addresses(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/address-summary", tags=["ETL"])
def load_address_summary(
    company_id:     Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    df = filter_by_company(addresses.extract_addresses(), company_id)
    return load_dataframe(addresses.transform_addresses(df), "address_summary", company_id=company_id)


# ── Relationships ─────────────────────────────────────────

@app.get("/relationship-summary", response_model=List[RelationshipSummary], tags=["ETL"])
def get_relationship_summary(
    company_id:  Optional[str] = Query(None),
    category:    Optional[str] = Query(None),
    active_only: bool = Query(False),
):
    df      = filter_by_company(relationships.extract_relationships(), company_id)
    summary = relationships.transform_relationships(df)

    if category and "relationship_category" in summary.columns:
        summary = summary[summary["relationship_category"] == category]
    if active_only and "is_active" in summary.columns:
        summary = summary[summary["is_active"] == True]  # noqa: E712

    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/relationship-summary", tags=["ETL"])
def load_relationship_summary(
    company_id:     Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    df = filter_by_company(relationships.extract_relationships(), company_id)
    return load_dataframe(relationships.transform_relationships(df), "relationship_summary", company_id=company_id)


# ── Geospatial ────────────────────────────────────────────

@app.get("/geospatial-summary", tags=["ETL"])
def get_geospatial_summary(company_id: Optional[str] = Query(None)):
    df      = filter_by_company(geospatial.extract_geospatial(), company_id)
    summary = geospatial.transform_geospatial(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/geospatial-summary", tags=["ETL"])
def load_geospatial_summary(
    company_id:     Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    df = filter_by_company(geospatial.extract_geospatial(), company_id)
    result = load_dataframe_replace(geospatial.transform_geospatial(df), "geospatial_summary")

    # Backfill PostGIS geometry column from lat/lng after every write
    engine = get_engine_safe()
    if engine:
        try:
            from sqlalchemy import text as sqlt
            with engine.connect() as conn:
                updated = conn.execute(sqlt("""
                    UPDATE analytics.geospatial_summary
                    SET geom = ST_SetSRID(
                        ST_MakePoint(longitude::float, latitude::float),
                        4326
                    )::geography
                    WHERE latitude IS NOT NULL
                      AND longitude IS NOT NULL
                      AND geom IS NULL;
                """))
                conn.commit()
            result["postgis_geom_updated"] = updated.rowcount
        except Exception as _e:
            result["postgis_geom_updated"] = f"skipped ({_e})"

    return result
