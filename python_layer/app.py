import logging
from contextlib import asynccontextmanager
from typing import List, Optional

import pandas as pd
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

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
from etl.load import load_dataframe, load_dataframe_replace

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
    else:
        logger.warning("Startup: DATABASE_URL not set — analytics store unavailable")
    yield


# ----------------------------------------------------------
# FastAPI App — v4.0.0
# ----------------------------------------------------------
app = FastAPI(
    title="Newsconseen OS — Analytics & Intelligence Layer",
    description=(
        "The SME version of Palantir Foundry.\n\n"
        "Layer 1 — Enterprise OS: Base44 master data (Person, Enterprise, Product)\n"
        "Layer 2 — Deployable Datamart: ETL pipeline, PostgreSQL, FastAPI\n"
        "Layer 3 — Foundry Intelligence: Copilot + Alerts + Network Intelligence\n\n"
        "One system. Any industry. Deploy in hours."
    ),
    version="4.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
# Health & Status
# ----------------------------------------------------------
@app.get("/", tags=["Health"])
def root():
    return {
        "status":  "ok",
        "service": "newsconseen-python-layer",
        "version": "4.0.0",
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
        os.getenv("DASHSCOPE_API_KEY") or
        os.getenv("ANTHROPIC_API_KEY") or
        os.getenv("OPENAI_API_KEY")
    )
    backend_display = {
        "qwen":      "qwen",
        "anthropic": "claude",
        "claude":    "claude",
        "openai":    "openai",
    }.get(copilot_backend, copilot_backend)

    return {
        "status":   "ok" if db_status == "connected" else "degraded",
        "version":  "4.0.1",
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
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=403, detail="Unauthorized")

    results  = {}
    entity_map = {
        "tasks":         (tasks.extract_tasks,               tasks.transform_tasks),
        "transactions":  (transactions.extract_transactions,  transactions.transform_transactions),
        "services":      (services.extract_services,          services.transform_services),
        "enterprises":   (enterprises.extract_enterprises,    enterprises.transform_enterprises),
        "people":        (people.extract_people,              people.transform_people),
        "products":      (products.extract_products,          products.transform_products),
        "addresses":     (addresses.extract_addresses,        addresses.transform_addresses),
        "relationships": (relationships.extract_relationships, relationships.transform_relationships),
    }

    for name, (extract_fn, transform_fn) in entity_map.items():
        try:
            raw     = extract_fn()
            summary = transform_fn(raw)
            results[name] = load_dataframe(summary, f"{name}_summary")
        except Exception as e:
            results[name] = {"status": "error", "detail": str(e)}
            logger.error("Cron: %s ETL failed — %s", name, e)

    try:
        raw     = geospatial.extract_geospatial()
        summary = geospatial.transform_geospatial(raw)
        results["geospatial"] = load_dataframe_replace(summary, "geospatial_summary")
    except Exception as e:
        results["geospatial"] = {"status": "error", "detail": str(e)}

    success_count = sum(1 for r in results.values() if r.get("status") == "success")
    return {
        "cron_run":    True,
        "version":     "4.0.0",
        "success":     success_count,
        "total":       len(results),
        "all_success": success_count == len(results),
        "results":     results,
    }


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
    df = filter_by_company(people.extract_people(), company_id)
    return people.transform_people(df).where(
        people.transform_people(df).notna(), None
    ).to_dict(orient="records")


@app.post("/load/people-summary", tags=["ETL"])
def load_people_summary(
    company_id:     Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    df = filter_by_company(people.extract_people(), company_id)
    return load_dataframe(people.transform_people(df), "people_summary", company_id=company_id)


# ── Enterprises ───────────────────────────────────────────

@app.get("/enterprise-summary", response_model=List[EnterpriseSummary], tags=["ETL"])
def get_enterprise_summary(company_id: Optional[str] = Query(None)):
    df      = filter_by_company(enterprises.extract_enterprises(), company_id)
    summary = enterprises.transform_enterprises(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/enterprise-summary", tags=["ETL"])
def load_enterprise_summary(
    company_id:     Optional[str] = Query(None),
    x_cron_secret: str = Header(None),
):
    _check_cron_secret(x_cron_secret)
    df = filter_by_company(enterprises.extract_enterprises(), company_id)
    return load_dataframe(enterprises.transform_enterprises(df), "enterprise_summary", company_id=company_id)


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
    return load_dataframe_replace(geospatial.transform_geospatial(df), "geospatial_summary")
