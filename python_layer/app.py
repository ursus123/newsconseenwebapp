import logging
from contextlib import asynccontextmanager
from typing import List, Optional

# ----------------------------------------------------------
# Logging configuration — keep Railway log volume under control.
# Third-party libraries (uvicorn access, sqlalchemy, apscheduler)
# are noisy at INFO; cap them at WARNING so only actionable
# messages reach the log stream (Railway limit: 500 logs/sec).
# ----------------------------------------------------------
logging.basicConfig(level=logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("apscheduler").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# Keep the application's own loggers at INFO so startup/ETL events are visible.
logging.getLogger("app").setLevel(logging.INFO)
logging.getLogger("etl").setLevel(logging.INFO)

logger = logging.getLogger(__name__)

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

        # Phase 8 — Audit Trail table (immutable change log)
        try:
            from audit.routes import ensure_audit_table
            ensure_audit_table(engine)
        except Exception as e:
            logger.warning("Startup: Audit table setup skipped — %s", e)

        # Phase A+B — Enrichment tables (created empty; populated by enrichment engine)
        try:
            from enrichment.setup import ensure_enrichment_tables
            ensure_enrichment_tables(engine)
        except Exception as e:
            logger.warning("Startup: Enrichment table setup skipped — %s", e)

        # Pre-create all analytics.* and raw.* tables so they appear in
        # DataModels and are queryable before the first ETL run
        try:
            from etl.setup import ensure_all_analytics_tables
            ensure_all_analytics_tables(engine)
        except Exception as e:
            logger.warning("Startup: Analytics table setup skipped — %s", e)

        # Connector schedules + run_log tables (survives redeploys)
        try:
            from connectors.routes import _ensure_schedule_tables, _get_schedule_store
            _ensure_schedule_tables()
            loaded = _get_schedule_store()
            logger.info("Startup: connector schedules ready — %d schedule(s) loaded", len(loaded))
        except Exception as e:
            logger.warning("Startup: Connector schedule tables skipped — %s", e)
    else:
        logger.warning("Startup: DATABASE_URL not set — analytics store unavailable")

    # ----------------------------------------------------------
    # ETL scheduler — runs /cron/etl-all every 5 minutes
    # Keeps analytics tables fresh without relying on frontend
    # mutation triggers or manual Railway cron jobs.
    # ----------------------------------------------------------
    scheduler = None
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        import threading

        def _run_etl_background():
            """Run the full ETL pipeline in a background thread."""
            try:
                import requests as _req
                _req.post(
                    "http://localhost:8000/cron/etl-all",
                    headers={"x-cron-secret": settings.cron_secret or ""},
                    timeout=300,
                )
                logger.info("Scheduler: ETL cycle complete")
            except Exception as _e:
                logger.warning("Scheduler: ETL cycle failed — %s", _e)

        scheduler = BackgroundScheduler(daemon=True)
        scheduler.add_job(
            _run_etl_background,
            trigger="interval",
            minutes=5,
            id="etl_all",
            max_instances=1,          # never overlap; skip if previous run is still going
            misfire_grace_time=60,    # tolerate up to 60s latency before skipping
        )
        scheduler.start()
        logger.info("Startup: ETL scheduler started — running every 5 minutes")
    except Exception as _sched_err:
        logger.warning("Startup: ETL scheduler failed to start — %s", _sched_err)

    yield

    # Shutdown
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Shutdown: ETL scheduler stopped")


# ----------------------------------------------------------
# FastAPI App — v4.1.0
# ----------------------------------------------------------
app = FastAPI(
    title="Newsconseen — Autonomous SME Operating System",
    description=(
        "**The Autonomous SME Operating System.**\n\n"
        "Layer 1 — Enterprise OS: Base44 master data (Person, Enterprise, Product)\n"
        "Layer 2 — Deployable Datamart: ETL pipeline, PostgreSQL, FastAPI\n"
        "Layer 3 — Autonomous Intelligence: Copilot + Alerts + Network Intelligence\n"
        "Layer 4 — Agentic AI: 8 autonomous agents, multi-LLM orchestration, "
        "approval gate, agent memory, deep market research\n\n"
        "One system. Any industry. Runs itself."
    ),
    version="4.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security headers — stamps HSTS, CSP, X-Frame-Options, etc. on every response
try:
    from security.headers import SecurityHeadersMiddleware
    app.add_middleware(SecurityHeadersMiddleware)
    logger.info("Startup: security headers middleware enabled")
except Exception as _sec_hdr_err:
    logger.warning("Security headers middleware not loaded — %s", _sec_hdr_err)

# Rate limiting — per-IP sliding window on sensitive endpoints
try:
    from security.ratelimit import RateLimitMiddleware
    app.add_middleware(RateLimitMiddleware)
    logger.info("Startup: rate limit middleware enabled")
except Exception as _rl_err:
    logger.warning("Rate limit middleware not loaded — %s", _rl_err)

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


_CORS_HEADERS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
    "Access-Control-Allow-Headers": "x-api-key, x-cron-secret, Content-Type, Authorization, Accept, X-Requested-With",
    "Access-Control-Max-Age":       "86400",
}


@app.middleware("http")
async def cors_and_auth_middleware(request: Request, call_next):
    # Always handle OPTIONS preflight immediately with explicit CORS headers.
    if request.method == "OPTIONS":
        from fastapi.responses import Response as _Resp
        return _Resp(status_code=200, headers=_CORS_HEADERS)

    # Check API key (skip if API_KEY not configured)
    expected = settings.api_key
    if expected:
        path = request.url.path
        if path not in _PUBLIC_PATHS and not any(path.startswith(p) for p in _CRON_PREFIXES):
            provided = request.headers.get("x-api-key", "")
            if provided != expected:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Missing or invalid x-api-key header"},
                    headers={"Access-Control-Allow-Origin": "*"},
                )

    response = await call_next(request)

    # Stamp every response with CORS headers so the browser never blocks it.
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    response.headers["Access-Control-Allow-Headers"] = "x-api-key, x-cron-secret, Content-Type, Authorization, Accept, X-Requested-With"
    return response

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

# Phase 8 — Audit Trail
try:
    from audit.routes import router as audit_router
    app.include_router(audit_router)
    logger.info("Audit trail router loaded")
except Exception as _audit_err:
    logger.warning("Audit trail router failed to load — %s", _audit_err)

# Phase 9 — Workflow Engine
try:
    from workflows.routes import router as workflows_router
    app.include_router(workflows_router)
    logger.info("Workflow engine router loaded")
except Exception as _wf_err:
    logger.warning("Workflow engine router failed to load — %s", _wf_err)

# Tenant Onboarding Automation
try:
    from onboarding.routes import router as onboarding_router
    app.include_router(onboarding_router)
    logger.info("Onboarding automation router loaded")
except Exception as _ob_err:
    logger.warning("Onboarding automation router failed to load — %s", _ob_err)

# Data Quality Monitoring
try:
    from dataquality.routes import router as dataquality_router
    app.include_router(dataquality_router)
    logger.info("Data quality monitoring router loaded")
except Exception as _dq_err:
    logger.warning("Data quality monitoring router failed to load — %s", _dq_err)

# Scheduled Report Delivery
try:
    from reports.routes import router as reports_router
    app.include_router(reports_router)
    logger.info("Report delivery router loaded")
except Exception as _rep_err:
    logger.warning("Report delivery router failed to load — %s", _rep_err)

# Auto-Remediation Engine
try:
    from autotask.routes import router as autotask_router
    app.include_router(autotask_router)
    logger.info("Auto-remediation router loaded")
except Exception as _at_err:
    logger.warning("Auto-remediation router failed to load — %s", _at_err)

# Anomaly Detection
try:
    from anomaly.routes import router as anomaly_router
    app.include_router(anomaly_router)
    logger.info("Anomaly detection router loaded")
except Exception as _anom_err:
    logger.warning("Anomaly detection router failed to load — %s", _anom_err)

# KPI Goal Tracking
try:
    from goals.routes import router as goals_router
    app.include_router(goals_router)
    logger.info("KPI goal tracking router loaded")
except Exception as _goals_err:
    logger.warning("KPI goal tracking router failed to load — %s", _goals_err)

# Phase 12 — Live Data Feeds (inbound webhooks)
try:
    from ingest.routes import router as ingest_router
    app.include_router(ingest_router)
    logger.info("Ingest (live data feeds) router loaded")
except Exception as _ingest_err:
    logger.warning("Ingest router failed to load — %s", _ingest_err)

# Phase A — Universal Ontology Enrichment
try:
    from enrichment.routes import router as enrichment_router
    app.include_router(enrichment_router)
    logger.info("Enrichment router loaded")
except Exception as _enr_err:
    logger.warning("Enrichment router failed to load — %s", _enr_err)

# Production Infra — Backup system
try:
    from backup.routes import router as backup_router
    app.include_router(backup_router)
    logger.info("Backup router loaded")
except Exception as _bkp_err:
    logger.warning("Backup router failed to load — %s", _bkp_err)

# BI Export — Power BI / Tableau / CSV downloads
try:
    from bi.routes import router as bi_router
    app.include_router(bi_router)
    logger.info("BI export router loaded")
except Exception as _bi_err:
    logger.warning("BI export router failed to load — %s", _bi_err)

# Platform Admin — multi-tenant management
try:
    from admin.routes import router as admin_router
    app.include_router(admin_router)
    logger.info("Platform admin router loaded")
except Exception as _adm_err:
    logger.warning("Platform admin router failed to load — %s", _adm_err)

# Security — 2FA, OAuth2, compliance evidence, rate limit stats
try:
    from security.routes import router as security_router
    app.include_router(security_router)
    logger.info("Security router loaded")
except Exception as _sec_err:
    logger.warning("Security router failed to load — %s", _sec_err)


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
        "version": "4.9.0",
        "mantra":  "The Autonomous SME Operating System",
        "layers": {
            "layer_1": "Enterprise OS — Base44 master data",
            "layer_2": "Deployable Datamart — ETL + PostgreSQL + FastAPI",
            "layer_3": "Autonomous Intelligence — Copilot + Alerts + Network",
            "layer_4": "Agentic AI — 8 agents, orchestrator, approval gate, agent memory",
        },
    }


@app.get("/health", tags=["Health"])
def health():
    import os
    import time
    from sqlalchemy import text

    t_start = time.monotonic()

    # ── Database connectivity ─────────────────────────────────────────────────
    db_status        = "unavailable"
    db_latency_ms    = None
    analytics_tables = {}
    last_etl_at      = None
    last_backup_at   = None

    engine = get_engine_safe()
    if engine:
        try:
            t0 = time.monotonic()
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_latency_ms = round((time.monotonic() - t0) * 1000, 1)
            db_status = "connected"

            # Row counts for core analytics tables (non-blocking best-effort)
            try:
                with engine.connect() as conn:
                    for tbl in ("people_summary", "enterprise_summary",
                                "product_summary", "transaction_summary",
                                "task_summary"):
                        try:
                            n = conn.execute(
                                text(f"SELECT COUNT(*) FROM analytics.{tbl}")
                            ).scalar()
                            analytics_tables[tbl] = int(n or 0)
                        except Exception:
                            analytics_tables[tbl] = None
            except Exception:
                pass

            # Last ETL timestamp
            try:
                with engine.connect() as conn:
                    row = conn.execute(
                        text("""
                            SELECT MAX(loaded_at)
                            FROM analytics.people_summary
                        """)
                    ).scalar()
                    if row:
                        last_etl_at = str(row)
            except Exception:
                pass

            # Last backup timestamp
            try:
                with engine.connect() as conn:
                    row = conn.execute(
                        text("""
                            SELECT started_at FROM analytics.backup_log
                            WHERE status = 'success'
                            ORDER BY started_at DESC LIMIT 1
                        """)
                    ).scalar()
                    if row:
                        last_backup_at = str(row)
            except Exception:
                pass

        except Exception as e:
            db_status = f"error: {str(e)[:100]}"

    # ── Copilot ───────────────────────────────────────────────────────────────
    copilot_backend = os.getenv("COPILOT_BACKEND", "")
    copilot_key_set = bool(
        os.getenv("ANTHROPIC_API_KEY") or os.getenv("OPENAI_API_KEY")
    )
    backend_display = {
        "anthropic": "claude", "claude": "claude", "openai": "openai",
    }.get(copilot_backend, copilot_backend)

    # ── Backup config ─────────────────────────────────────────────────────────
    backup_configured = bool(os.getenv("BACKUP_S3_BUCKET"))

    # ── Response time ─────────────────────────────────────────────────────────
    health_latency_ms = round((time.monotonic() - t_start) * 1000, 1)

    return {
        "status":             "ok" if db_status == "connected" else "degraded",
        "version":            "4.9.0",
        "api":                "ok",
        "health_latency_ms":  health_latency_ms,

        # Layer 2 — database
        "database":           db_status,
        "db_latency_ms":      db_latency_ms,
        "analytics_tables":   analytics_tables,
        "last_etl_at":        last_etl_at,

        # Layer 2 — feature flags
        "etl_enabled":        True,
        "ml_enabled":         os.getenv("ML_ENABLED", "false").lower() == "true",
        "open_data_enabled":  True,
        "connectors_enabled": True,

        # Layer 3A — Copilot
        "copilot_enabled":    bool(copilot_backend and copilot_key_set),
        "copilot_backend":    backend_display or "not configured",

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

        # Production infra
        "backup_configured":  backup_configured,
        "last_backup_at":     last_backup_at,
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
            # Skip analytics write for null company_id — records already in raw.*
            # These are records created without a tenant tag (e.g. super_admin setup
            # records). They must not pollute analytics tables with unscoped rows.
            if company_id is None:
                logger.info(
                    "Cron: skipping analytics.%s_summary for null company_id "
                    "(records already in raw.%s)",
                    name, name,
                )
                if not entity_result:
                    entity_result = {
                        "status": "skipped",
                        "reason": "null company_id — raw write only",
                        "rows_loaded": 0,
                    }
                continue
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

    # Run scheduled workflows — fire any that are due
    scheduled_result = {}
    try:
        from workflows.routes import run_scheduled_workflows
        scheduled_result = run_scheduled_workflows()
        logger.info("cron: scheduled workflows evaluated=%s triggered=%s",
                    scheduled_result.get("evaluated", 0), scheduled_result.get("triggered", 0))
    except Exception as _sched_err:
        logger.warning("cron: scheduled workflow runner failed — %s", _sched_err)

    # Run scheduled connector syncs — keeps external data fresh automatically
    connector_sync_result = {}
    try:
        from connectors.routes import run_scheduled_connectors
        connector_sync_result = run_scheduled_connectors()
        logger.info("cron: scheduled connectors evaluated=%s triggered=%s",
                    connector_sync_result.get("evaluated", 0),
                    connector_sync_result.get("triggered", 0))
    except Exception as _conn_err:
        logger.warning("cron: scheduled connector runner failed — %s", _conn_err)

    # Data quality evaluation — runs after ETL so raw.* tables are fresh
    dq_result = {}
    try:
        from dataquality.routes import run_quality_for_all_companies
        dq_result = run_quality_for_all_companies(list(company_ids))
        logger.info("cron: data quality evaluated=%s", dq_result.get("evaluated", 0))
    except Exception as _dq_err:
        logger.warning("cron: data quality runner failed — %s", _dq_err)

    # Scheduled report delivery — sends due digests after fresh data is available
    digest_result = {}
    try:
        from reports.routes import run_scheduled_digests
        digest_result = run_scheduled_digests(list(company_ids))
        logger.info("cron: report digests sent=%s", digest_result.get("sent", 0))
    except Exception as _rep_err:
        logger.warning("cron: report digest runner failed — %s", _rep_err)

    # Auto-remediation — create tasks for detected issues (runs after fresh DQ data)
    autotask_result = {}
    try:
        from autotask.routes import run_autotasks
        autotask_result = run_autotasks(list(company_ids))
        logger.info(
            "cron: auto-remediation tasks_created=%s",
            autotask_result.get("tasks_created", 0),
        )
    except Exception as _at_err:
        logger.warning("cron: auto-remediation runner failed — %s", _at_err)

    # Anomaly detection — statistical outlier scan across all companies
    anomaly_result = {}
    try:
        from anomaly.routes import run_anomaly_detection
        anomaly_result = run_anomaly_detection(list(company_ids))
        logger.info(
            "cron: anomaly detection evaluated=%s total_anomalies=%s",
            anomaly_result.get("evaluated", 0),
            anomaly_result.get("total_anomalies", 0),
        )
    except Exception as _anom_err:
        logger.warning("cron: anomaly detection failed — %s", _anom_err)

    # KPI goal tracking — re-evaluate progress against all company goals
    goals_result = {}
    try:
        from goals.routes import run_goal_tracking
        goals_result = run_goal_tracking(list(company_ids))
        logger.info(
            "cron: goal tracking tracked=%s total_behind=%s",
            goals_result.get("tracked", 0),
            goals_result.get("total_behind", 0),
        )
    except Exception as _goals_err:
        logger.warning("cron: goal tracking failed — %s", _goals_err)

    # ── Step 5: Enhanced analytics tables — built from in-memory raw_data ────
    # These run after the core entity transforms so raw_data is fully populated.
    # They use load_dataframe_replace (full snapshot each run, not appended).
    enhanced_result = {}
    try:
        from etl.monthly_kpis import transform_monthly_kpis
        from etl.entity_index import transform_entity_index
        from etl.company_scorecard import transform_company_scorecard

        _ppl  = raw_data.get("people",        pd.DataFrame())
        _txs  = raw_data.get("transactions",   pd.DataFrame())
        _tsks = raw_data.get("tasks",          pd.DataFrame())
        _ents = raw_data.get("enterprises",    pd.DataFrame())
        _prds = raw_data.get("products",       pd.DataFrame())
        _rels = raw_data.get("relationships",  pd.DataFrame())

        # monthly_kpis
        try:
            _kpi_df = transform_monthly_kpis(_ppl, _txs, _tsks)
            enhanced_result["monthly_kpis"] = load_dataframe_replace(_kpi_df, "monthly_kpis")
            logger.info("cron: monthly_kpis — %d rows", len(_kpi_df))
        except Exception as _e:
            enhanced_result["monthly_kpis"] = {"status": "error", "detail": str(_e)}
            logger.warning("cron: monthly_kpis failed — %s", _e)

        # entity_index
        try:
            _idx_df = transform_entity_index(_ppl)
            enhanced_result["entity_index"] = load_dataframe_replace(_idx_df, "entity_index")
            logger.info("cron: entity_index — %d rows", len(_idx_df))
        except Exception as _e:
            enhanced_result["entity_index"] = {"status": "error", "detail": str(_e)}
            logger.warning("cron: entity_index failed — %s", _e)

        # company_scorecard
        try:
            _sc_df = transform_company_scorecard(_ppl, _ents, _txs, _tsks, _prds)
            enhanced_result["company_scorecard"] = load_dataframe_replace(_sc_df, "company_scorecard")
            logger.info("cron: company_scorecard — %d rows", len(_sc_df))
        except Exception as _e:
            enhanced_result["company_scorecard"] = {"status": "error", "detail": str(_e)}
            logger.warning("cron: company_scorecard failed — %s", _e)

        # ── Deep analytics intelligence tables ────────────────────────────────
        # kpi_summary — cross-entity one-row-per-company business snapshot
        try:
            from etl.kpi_summary import transform_kpi_summary
            _ks_df = transform_kpi_summary(_ppl, _txs, _tsks, _prds, _ents, _rels)
            enhanced_result["kpi_summary"] = load_dataframe_replace(_ks_df, "kpi_summary")
            logger.info("cron: kpi_summary — %d company rows", len(_ks_df))
        except Exception as _e:
            enhanced_result["kpi_summary"] = {"status": "error", "detail": str(_e)}
            logger.warning("cron: kpi_summary failed — %s", _e)

        # client_value — RFM, CLV, churn risk per client
        try:
            from etl.client_value import transform_client_value
            _cv_df = transform_client_value(_ppl, _txs, _rels)
            enhanced_result["client_value"] = load_dataframe_replace(_cv_df, "client_value")
            logger.info("cron: client_value — %d client rows", len(_cv_df))
        except Exception as _e:
            enhanced_result["client_value"] = {"status": "error", "detail": str(_e)}
            logger.warning("cron: client_value failed — %s", _e)

        # staff_performance — throughput, SLA, utilization per staff
        try:
            from etl.staff_performance import transform_staff_performance
            _sp_df = transform_staff_performance(_ppl, _tsks, _rels)
            enhanced_result["staff_performance"] = load_dataframe_replace(_sp_df, "staff_performance")
            logger.info("cron: staff_performance — %d staff rows", len(_sp_df))
        except Exception as _e:
            enhanced_result["staff_performance"] = {"status": "error", "detail": str(_e)}
            logger.warning("cron: staff_performance failed — %s", _e)

        # ar_aging — accounts receivable aging + summary
        try:
            from etl.ar_aging import transform_ar_aging
            _ar_detail, _ar_summary = transform_ar_aging(_txs)
            enhanced_result["ar_aging"]         = load_dataframe_replace(_ar_detail,  "ar_aging")
            enhanced_result["ar_aging_summary"] = load_dataframe_replace(_ar_summary, "ar_aging_summary")
            logger.info("cron: ar_aging — %d invoices, %d companies", len(_ar_detail), len(_ar_summary))
        except Exception as _e:
            enhanced_result["ar_aging"] = {"status": "error", "detail": str(_e)}
            logger.warning("cron: ar_aging failed — %s", _e)

        # product_velocity — stock coverage, sell-through, dead stock
        try:
            from etl.product_velocity import transform_product_velocity
            _pv_df = transform_product_velocity(_prds, _txs)
            enhanced_result["product_velocity"] = load_dataframe_replace(_pv_df, "product_velocity")
            logger.info("cron: product_velocity — %d product rows", len(_pv_df))
        except Exception as _e:
            enhanced_result["product_velocity"] = {"status": "error", "detail": str(_e)}
            logger.warning("cron: product_velocity failed — %s", _e)

        # network_summary — cross-branch KPI comparison per enterprise
        try:
            from etl.network_summary import transform_network_summary
            _ns_df = transform_network_summary(_ents, _ppl, _txs, _tsks, _prds, _rels)
            enhanced_result["network_summary"] = load_dataframe_replace(_ns_df, "network_summary")
            logger.info("cron: network_summary — %d enterprise rows", len(_ns_df))
        except Exception as _e:
            enhanced_result["network_summary"] = {"status": "error", "detail": str(_e)}
            logger.warning("cron: network_summary failed — %s", _e)

        # concentration_risk — HHI revenue/client/staff per company
        try:
            from etl.concentration_risk import transform_concentration_risk
            _cr_df = transform_concentration_risk(_ppl, _txs, _ents)
            enhanced_result["concentration_risk"] = load_dataframe_replace(_cr_df, "concentration_risk")
            logger.info("cron: concentration_risk — %d company rows", len(_cr_df))
        except Exception as _e:
            enhanced_result["concentration_risk"] = {"status": "error", "detail": str(_e)}
            logger.warning("cron: concentration_risk failed — %s", _e)

    except Exception as _enh_err:
        logger.warning("cron: enhanced analytics step failed — %s", _enh_err)
        enhanced_result = {"status": "error", "detail": str(_enh_err)}

    # ML model predictions — runs last so raw tables are fully populated
    ml_result = {}
    try:
        from ml.routes import run_ml_models
        ml_result = run_ml_models(list(company_ids))
        logger.info(
            "cron: ML models status=%s companies_with_predictions=%s",
            ml_result.get("status"),
            ml_result.get("companies_with_predictions", 0),
        )
    except Exception as _ml_err:
        logger.warning("cron: ML models failed — %s", _ml_err)

    # ── Step 6: Phase A enrichment — per-company for all companies ───────────
    all_enrich_result = {}
    try:
        from enrichment.engine import run_enrichment
        for _cid in company_ids:
            _e_raw = {
                "people":       filter_by_company(raw_data.get("people",       pd.DataFrame()), _cid),
                "enterprises":  filter_by_company(raw_data.get("enterprises",  pd.DataFrame()), _cid),
                "products":     filter_by_company(raw_data.get("products",     pd.DataFrame()), _cid),
                "transactions": filter_by_company(raw_data.get("transactions", pd.DataFrame()), _cid),
                "addresses":    filter_by_company(raw_data.get("addresses",    pd.DataFrame()), _cid),
            }
            all_enrich_result[_cid] = run_enrichment(_e_raw, _cid)
        logger.info("cron: enrichment complete — %d companies", len(all_enrich_result))
    except Exception as _enr_err:
        all_enrich_result = {"status": "error", "detail": str(_enr_err)}
        logger.warning("cron: enrichment failed — %s", _enr_err)

    return {
        "cron_run":               True,
        "version":                "5.0.0",
        "companies":              len(company_ids),
        "raw_stored":             list(raw_data.keys()),
        "success":                success_count,
        "total":                  len(results),
        "all_success":            success_count == len(results),
        "results":                results,
        "scheduled_connectors":   connector_sync_result,
        "data_quality":           dq_result,
        "report_digests":         digest_result,
        "auto_remediation":       autotask_result,
        "anomaly_detection":      anomaly_result,
        "goal_tracking":          goals_result,
        "enhanced_analytics":     enhanced_result,
        "ml_predictions":         ml_result,
        "enrichment":             all_enrich_result,
    }


# ----------------------------------------------------------
# Cron — Scoped ETL refresh for a single company (org admin)
# ----------------------------------------------------------
@app.post("/cron/etl-company", tags=["Cron"])
def cron_etl_company(
    company_id: str = Query(..., description="Tenant company_id to refresh"),
    x_cron_secret: str = Header(None),
):
    """
    Scoped ETL refresh for a single company/tenant.

    Called by org admins via the 'Refresh My Data' button in Pipelines.jsx.
    Extracts all Base44 data (no server-side filter is available — Base44
    returns all records on every call), then filters in-memory to the caller's
    company_id before transforming and writing to analytics tables.

    Raw tables (raw.*) always receive the full extract — this is correct
    behaviour because raw.* is a global mirror of Base44. Analytics tables
    (analytics.*) only receive rows matching the caller's company_id.

    Returns row counts and status scoped to the caller's company only.
    """
    _check_cron_secret(x_cron_secret)

    company_id = (company_id or "").strip()
    if not company_id:
        raise HTTPException(status_code=400, detail="company_id is required and must not be empty")

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

    # ── Step 1: Extract all entities in parallel ──────────────────────────────
    raw_data: dict[str, pd.DataFrame] = {}

    def _extract_one(name, extract_fn):
        try:
            df = extract_fn()
        except Exception as e:
            logger.error("ETL-company: %s extract failed — %s", name, e)
            return name, pd.DataFrame()
        try:
            load_raw(df, name)
            logger.info("ETL-company: raw.%s — %d records written", name, len(df))
        except Exception as e:
            logger.warning("ETL-company: raw.%s write failed — %s", name, e)
        return name, df

    with ThreadPoolExecutor(max_workers=8, thread_name_prefix="etl-co-extract") as pool:
        futures = {
            pool.submit(_extract_one, name, extract_fn): name
            for name, (extract_fn, _) in entity_map.items()
        }
        for future in as_completed(futures):
            name, df = future.result()
            raw_data[name] = df

    logger.info("ETL-company: parallel extract complete — company_id=%s", company_id)

    # ── Step 2: Verify this company has records ────────────────────────────────
    has_data = any(
        "company_id" in df.columns and (df["company_id"] == company_id).any()
        for df in raw_data.values()
        if not df.empty
    )
    if not has_data:
        logger.warning(
            "ETL-company: no records found for company_id=%s — analytics not updated",
            company_id,
        )
        return {
            "status":     "no_data",
            "company_id": company_id,
            "detail":     (
                "No records found for this company_id in Base44. "
                "Check that company_id is set correctly on your records."
            ),
            "raw_stored": list(raw_data.keys()),
        }

    # ── Step 3: Transform + load analytics — this company only ───────────────
    results: dict = {}

    def _transform_one(name, transform_fn):
        try:
            filtered = filter_by_company(raw_data.get(name, pd.DataFrame()), company_id)
            summary  = transform_fn(filtered)
            r        = load_dataframe(summary, f"{name}_summary", company_id=company_id)
            return name, r
        except Exception as e:
            logger.error(
                "ETL-company: %s summary failed (company_id=%s) — %s",
                name, company_id, e,
            )
            return name, {"status": "error", "detail": str(e)}

    with ThreadPoolExecutor(max_workers=8, thread_name_prefix="etl-co-transform") as pool:
        futures = {
            pool.submit(_transform_one, name, transform_fn): name
            for name, (_, transform_fn) in entity_map.items()
        }
        for future in as_completed(futures):
            name, r = future.result()
            results[name] = r

    # ── Step 4: Enhanced analytics for this company ───────────────────────────
    enhanced_result = {}
    try:
        from etl.monthly_kpis import transform_monthly_kpis
        from etl.entity_index import transform_entity_index
        from etl.company_scorecard import transform_company_scorecard

        _ppl  = filter_by_company(raw_data.get("people",       pd.DataFrame()), company_id)
        _txs  = filter_by_company(raw_data.get("transactions",  pd.DataFrame()), company_id)
        _tsks = filter_by_company(raw_data.get("tasks",         pd.DataFrame()), company_id)
        _ents = filter_by_company(raw_data.get("enterprises",   pd.DataFrame()), company_id)
        _prds = filter_by_company(raw_data.get("products",      pd.DataFrame()), company_id)

        try:
            _kpi_df = transform_monthly_kpis(_ppl, _txs, _tsks)
            enhanced_result["monthly_kpis"] = load_dataframe_replace(_kpi_df, "monthly_kpis")
        except Exception as _e:
            enhanced_result["monthly_kpis"] = {"status": "error", "detail": str(_e)}
            logger.warning("ETL-company: monthly_kpis failed — %s", _e)

        try:
            _idx_df = transform_entity_index(_ppl)
            enhanced_result["entity_index"] = load_dataframe_replace(_idx_df, "entity_index")
        except Exception as _e:
            enhanced_result["entity_index"] = {"status": "error", "detail": str(_e)}
            logger.warning("ETL-company: entity_index failed — %s", _e)

        try:
            _sc_df = transform_company_scorecard(_ppl, _ents, _txs, _tsks, _prds)
            enhanced_result["company_scorecard"] = load_dataframe_replace(_sc_df, "company_scorecard")
        except Exception as _e:
            enhanced_result["company_scorecard"] = {"status": "error", "detail": str(_e)}
            logger.warning("ETL-company: company_scorecard failed — %s", _e)

        _rels = filter_by_company(raw_data.get("relationships", pd.DataFrame()), company_id)

        try:
            from etl.kpi_summary import transform_kpi_summary
            _ks_df = transform_kpi_summary(_ppl, _txs, _tsks, _prds, _ents, _rels)
            enhanced_result["kpi_summary"] = load_dataframe_replace(_ks_df, "kpi_summary")
        except Exception as _e:
            enhanced_result["kpi_summary"] = {"status": "error", "detail": str(_e)}
            logger.warning("ETL-company: kpi_summary failed — %s", _e)

        try:
            from etl.client_value import transform_client_value
            _cv_df = transform_client_value(_ppl, _txs, _rels)
            enhanced_result["client_value"] = load_dataframe_replace(_cv_df, "client_value")
        except Exception as _e:
            enhanced_result["client_value"] = {"status": "error", "detail": str(_e)}
            logger.warning("ETL-company: client_value failed — %s", _e)

        try:
            from etl.staff_performance import transform_staff_performance
            _sp_df = transform_staff_performance(_ppl, _tsks, _rels)
            enhanced_result["staff_performance"] = load_dataframe_replace(_sp_df, "staff_performance")
        except Exception as _e:
            enhanced_result["staff_performance"] = {"status": "error", "detail": str(_e)}
            logger.warning("ETL-company: staff_performance failed — %s", _e)

        try:
            from etl.ar_aging import transform_ar_aging
            _ar_detail, _ar_summary = transform_ar_aging(_txs)
            enhanced_result["ar_aging"]         = load_dataframe_replace(_ar_detail,  "ar_aging")
            enhanced_result["ar_aging_summary"] = load_dataframe_replace(_ar_summary, "ar_aging_summary")
        except Exception as _e:
            enhanced_result["ar_aging"] = {"status": "error", "detail": str(_e)}
            logger.warning("ETL-company: ar_aging failed — %s", _e)

        try:
            from etl.product_velocity import transform_product_velocity
            _pv_df = transform_product_velocity(_prds, _txs)
            enhanced_result["product_velocity"] = load_dataframe_replace(_pv_df, "product_velocity")
        except Exception as _e:
            enhanced_result["product_velocity"] = {"status": "error", "detail": str(_e)}
            logger.warning("ETL-company: product_velocity failed — %s", _e)

        try:
            from etl.network_summary import transform_network_summary
            _ns_df = transform_network_summary(_ents, _ppl, _txs, _tsks, _prds, _rels)
            enhanced_result["network_summary"] = load_dataframe_replace(_ns_df, "network_summary")
        except Exception as _e:
            enhanced_result["network_summary"] = {"status": "error", "detail": str(_e)}
            logger.warning("ETL-company: network_summary failed — %s", _e)

        try:
            from etl.concentration_risk import transform_concentration_risk
            _cr_df = transform_concentration_risk(_ppl, _txs, _ents)
            enhanced_result["concentration_risk"] = load_dataframe_replace(_cr_df, "concentration_risk")
        except Exception as _e:
            enhanced_result["concentration_risk"] = {"status": "error", "detail": str(_e)}
            logger.warning("ETL-company: concentration_risk failed — %s", _e)

    except Exception as _enh_err:
        enhanced_result = {"status": "error", "detail": str(_enh_err)}
        logger.warning("ETL-company: enhanced analytics failed — %s", _enh_err)

    # ── Step 5: Phase A enrichment — geocode, phone, email, company reg, FX ──
    enrich_result = {}
    try:
        from enrichment.engine import run_enrichment
        _addrs = filter_by_company(raw_data.get("addresses", pd.DataFrame()), company_id)
        _enrich_raw = {
            "people":       _ppl,
            "enterprises":  _ents,
            "products":     _prds,
            "transactions": _txs,
            "addresses":    _addrs,
        }
        enrich_result = run_enrichment(_enrich_raw, company_id)
        logger.info("ETL-company: enrichment complete — %s", enrich_result)
    except Exception as _enr_err:
        enrich_result = {"status": "error", "detail": str(_enr_err)}
        logger.warning("ETL-company: enrichment failed — %s", _enr_err)

    success_count = sum(1 for r in results.values() if r.get("status") == "success")

    return {
        "cron_run":           True,
        "version":            "5.0.0",
        "company_id":         company_id,
        "scoped":             True,
        "success":            success_count,
        "total":              len(results),
        "all_success":        success_count == len(results),
        "results":            results,
        "enhanced_analytics": enhanced_result,
        "enrichment":         enrich_result,
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
    # Convert all NaN/NA/NaT values to None so Pydantic can serialize the
    # response without raising "Input should be a valid string" errors on
    # fields like enterprise_id that arrive as float NaN from groupby.
    import math
    records = summary.where(summary.notna(), other=None).to_dict(orient="records")
    cleaned = [
        {
            k: (None if (v is not None and isinstance(v, float) and math.isnan(v)) else v)
            for k, v in row.items()
        }
        for row in records
    ]
    return cleaned


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


# ── Intelligence analytics — GET + POST load endpoints ────────────────────────

# KPI Summary ────────────────────────────────────────────────────────────────

@app.get("/analytics/kpi-summary", tags=["Analytics"])
def get_kpi_summary(company_id: Optional[str] = Query(None)):
    """Cross-entity business snapshot — one row per company."""
    from database import get_engine_safe
    engine = get_engine_safe()
    if engine:
        try:
            df = pd.read_sql("SELECT * FROM analytics.kpi_summary", engine)
            if not df.empty:
                if company_id:
                    df = df[df["company_id"] == company_id]
                return df.where(df.notna(), None).to_dict(orient="records")
        except Exception:
            pass
    # Fallback: recompute live
    _ppl  = filter_by_company(people.extract_people(),               company_id)
    _txs  = filter_by_company(transactions.extract_transactions(),   company_id)
    _tsks = filter_by_company(tasks.extract_tasks(),                 company_id)
    _prds = filter_by_company(products.extract_products(),           company_id)
    _ents = filter_by_company(enterprises.extract_enterprises(),     company_id)
    _rels = filter_by_company(relationships.extract_relationships(), company_id)
    from etl.kpi_summary import transform_kpi_summary
    df = transform_kpi_summary(_ppl, _txs, _tsks, _prds, _ents, _rels)
    return df.where(df.notna(), None).to_dict(orient="records")


@app.post("/load/kpi-summary", tags=["ETL"])
def load_kpi_summary(
    company_id:    Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    _ppl  = filter_by_company(people.extract_people(),               company_id)
    _txs  = filter_by_company(transactions.extract_transactions(),   company_id)
    _tsks = filter_by_company(tasks.extract_tasks(),                 company_id)
    _prds = filter_by_company(products.extract_products(),           company_id)
    _ents = filter_by_company(enterprises.extract_enterprises(),     company_id)
    _rels = filter_by_company(relationships.extract_relationships(), company_id)
    from etl.kpi_summary import transform_kpi_summary
    return load_dataframe_replace(transform_kpi_summary(_ppl, _txs, _tsks, _prds, _ents, _rels), "kpi_summary")


# Client Value ────────────────────────────────────────────────────────────────

@app.get("/analytics/client-value", tags=["Analytics"])
def get_client_value(company_id: Optional[str] = Query(None)):
    """RFM + CLV + churn risk per client."""
    from database import get_engine_safe
    engine = get_engine_safe()
    if engine:
        try:
            df = pd.read_sql("SELECT * FROM analytics.client_value", engine)
            if not df.empty:
                if company_id:
                    df = df[df["company_id"] == company_id]
                return df.where(df.notna(), None).to_dict(orient="records")
        except Exception:
            pass
    _ppl  = filter_by_company(people.extract_people(),               company_id)
    _txs  = filter_by_company(transactions.extract_transactions(),   company_id)
    _rels = filter_by_company(relationships.extract_relationships(), company_id)
    from etl.client_value import transform_client_value
    df = transform_client_value(_ppl, _txs, _rels)
    return df.where(df.notna(), None).to_dict(orient="records")


@app.post("/load/client-value", tags=["ETL"])
def load_client_value(
    company_id:    Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    _ppl  = filter_by_company(people.extract_people(),               company_id)
    _txs  = filter_by_company(transactions.extract_transactions(),   company_id)
    _rels = filter_by_company(relationships.extract_relationships(), company_id)
    from etl.client_value import transform_client_value
    return load_dataframe_replace(transform_client_value(_ppl, _txs, _rels), "client_value")


# Staff Performance ────────────────────────────────────────────────────────────

@app.get("/analytics/staff-performance", tags=["Analytics"])
def get_staff_performance(company_id: Optional[str] = Query(None)):
    """Task throughput, SLA breach rate, workload score per staff member."""
    from database import get_engine_safe
    engine = get_engine_safe()
    if engine:
        try:
            df = pd.read_sql("SELECT * FROM analytics.staff_performance", engine)
            if not df.empty:
                if company_id:
                    df = df[df["company_id"] == company_id]
                return df.where(df.notna(), None).to_dict(orient="records")
        except Exception:
            pass
    _ppl  = filter_by_company(people.extract_people(),               company_id)
    _tsks = filter_by_company(tasks.extract_tasks(),                 company_id)
    _rels = filter_by_company(relationships.extract_relationships(), company_id)
    from etl.staff_performance import transform_staff_performance
    df = transform_staff_performance(_ppl, _tsks, _rels)
    return df.where(df.notna(), None).to_dict(orient="records")


@app.post("/load/staff-performance", tags=["ETL"])
def load_staff_performance(
    company_id:    Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    _ppl  = filter_by_company(people.extract_people(),               company_id)
    _tsks = filter_by_company(tasks.extract_tasks(),                 company_id)
    _rels = filter_by_company(relationships.extract_relationships(), company_id)
    from etl.staff_performance import transform_staff_performance
    return load_dataframe_replace(transform_staff_performance(_ppl, _tsks, _rels), "staff_performance")


# AR Aging ────────────────────────────────────────────────────────────────────

@app.get("/analytics/ar-aging", tags=["Analytics"])
def get_ar_aging(company_id: Optional[str] = Query(None)):
    """Accounts receivable aging detail — one row per unpaid invoice."""
    from database import get_engine_safe
    engine = get_engine_safe()
    if engine:
        try:
            df = pd.read_sql("SELECT * FROM analytics.ar_aging", engine)
            if not df.empty:
                if company_id:
                    df = df[df["company_id"] == company_id]
                return df.where(df.notna(), None).to_dict(orient="records")
        except Exception:
            pass
    _txs = filter_by_company(transactions.extract_transactions(), company_id)
    from etl.ar_aging import transform_ar_aging
    detail, _ = transform_ar_aging(_txs)
    return detail.where(detail.notna(), None).to_dict(orient="records")


@app.get("/analytics/ar-aging-summary", tags=["Analytics"])
def get_ar_aging_summary(company_id: Optional[str] = Query(None)):
    """AR aging bucket totals per company."""
    from database import get_engine_safe
    engine = get_engine_safe()
    if engine:
        try:
            df = pd.read_sql("SELECT * FROM analytics.ar_aging_summary", engine)
            if not df.empty:
                if company_id:
                    df = df[df["company_id"] == company_id]
                return df.where(df.notna(), None).to_dict(orient="records")
        except Exception:
            pass
    _txs = filter_by_company(transactions.extract_transactions(), company_id)
    from etl.ar_aging import transform_ar_aging
    _, summary = transform_ar_aging(_txs)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/ar-aging", tags=["ETL"])
def load_ar_aging(
    company_id:    Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    _txs = filter_by_company(transactions.extract_transactions(), company_id)
    from etl.ar_aging import transform_ar_aging
    detail, summary = transform_ar_aging(_txs)
    r1 = load_dataframe_replace(detail,  "ar_aging")
    r2 = load_dataframe_replace(summary, "ar_aging_summary")
    return {"ar_aging": r1, "ar_aging_summary": r2}


# Product Velocity ────────────────────────────────────────────────────────────

@app.get("/analytics/product-velocity", tags=["Analytics"])
def get_product_velocity(company_id: Optional[str] = Query(None)):
    """Stock coverage, sell-through velocity, dead stock per product."""
    from database import get_engine_safe
    engine = get_engine_safe()
    if engine:
        try:
            df = pd.read_sql("SELECT * FROM analytics.product_velocity", engine)
            if not df.empty:
                if company_id:
                    df = df[df["company_id"] == company_id]
                return df.where(df.notna(), None).to_dict(orient="records")
        except Exception:
            pass
    _prds = filter_by_company(products.extract_products(),         company_id)
    _txs  = filter_by_company(transactions.extract_transactions(), company_id)
    from etl.product_velocity import transform_product_velocity
    df = transform_product_velocity(_prds, _txs)
    return df.where(df.notna(), None).to_dict(orient="records")


@app.post("/load/product-velocity", tags=["ETL"])
def load_product_velocity(
    company_id:    Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    _prds = filter_by_company(products.extract_products(),         company_id)
    _txs  = filter_by_company(transactions.extract_transactions(), company_id)
    from etl.product_velocity import transform_product_velocity
    return load_dataframe_replace(transform_product_velocity(_prds, _txs), "product_velocity")


# Network Summary ─────────────────────────────────────────────────────────────

@app.get("/analytics/network-summary", tags=["Analytics"])
def get_network_summary(company_id: Optional[str] = Query(None)):
    """Cross-branch performance comparison — one row per enterprise."""
    from database import get_engine_safe
    engine = get_engine_safe()
    if engine:
        try:
            df = pd.read_sql("SELECT * FROM analytics.network_summary", engine)
            if not df.empty:
                if company_id:
                    df = df[df["company_id"] == company_id]
                return df.where(df.notna(), None).to_dict(orient="records")
        except Exception:
            pass
    _ents = filter_by_company(enterprises.extract_enterprises(),     company_id)
    _ppl  = filter_by_company(people.extract_people(),               company_id)
    _txs  = filter_by_company(transactions.extract_transactions(),   company_id)
    _tsks = filter_by_company(tasks.extract_tasks(),                 company_id)
    _prds = filter_by_company(products.extract_products(),           company_id)
    _rels = filter_by_company(relationships.extract_relationships(), company_id)
    from etl.network_summary import transform_network_summary
    df = transform_network_summary(_ents, _ppl, _txs, _tsks, _prds, _rels)
    return df.where(df.notna(), None).to_dict(orient="records")


@app.post("/load/network-summary", tags=["ETL"])
def load_network_summary(
    company_id:    Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    _ents = filter_by_company(enterprises.extract_enterprises(),     company_id)
    _ppl  = filter_by_company(people.extract_people(),               company_id)
    _txs  = filter_by_company(transactions.extract_transactions(),   company_id)
    _tsks = filter_by_company(tasks.extract_tasks(),                 company_id)
    _prds = filter_by_company(products.extract_products(),           company_id)
    _rels = filter_by_company(relationships.extract_relationships(), company_id)
    from etl.network_summary import transform_network_summary
    return load_dataframe_replace(
        transform_network_summary(_ents, _ppl, _txs, _tsks, _prds, _rels), "network_summary"
    )


# Concentration Risk ──────────────────────────────────────────────────────────

@app.get("/analytics/concentration-risk", tags=["Analytics"])
def get_concentration_risk(company_id: Optional[str] = Query(None)):
    """Revenue, client, and staff HHI concentration risk per company."""
    from database import get_engine_safe
    engine = get_engine_safe()
    if engine:
        try:
            df = pd.read_sql("SELECT * FROM analytics.concentration_risk", engine)
            if not df.empty:
                if company_id:
                    df = df[df["company_id"] == company_id]
                return df.where(df.notna(), None).to_dict(orient="records")
        except Exception:
            pass
    _ppl  = filter_by_company(people.extract_people(),             company_id)
    _txs  = filter_by_company(transactions.extract_transactions(), company_id)
    _ents = filter_by_company(enterprises.extract_enterprises(),   company_id)
    from etl.concentration_risk import transform_concentration_risk
    df = transform_concentration_risk(_ppl, _txs, _ents)
    return df.where(df.notna(), None).to_dict(orient="records")


@app.post("/load/concentration-risk", tags=["ETL"])
def load_concentration_risk(
    company_id:    Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    _ppl  = filter_by_company(people.extract_people(),             company_id)
    _txs  = filter_by_company(transactions.extract_transactions(), company_id)
    _ents = filter_by_company(enterprises.extract_enterprises(),   company_id)
    from etl.concentration_risk import transform_concentration_risk
    return load_dataframe_replace(transform_concentration_risk(_ppl, _txs, _ents), "concentration_risk")
