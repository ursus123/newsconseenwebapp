import logging
from contextlib import asynccontextmanager
from typing import List, Optional

import pandas as pd
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# Config — now from config package (backward compatible)
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

# ML and Open Data
from ml.routes import router as ml_router
from open_data import ALL_ROUTERS

# Connectors — Phase 2
from connectors.routes import router as connectors_router

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
# FastAPI App
# ----------------------------------------------------------
app = FastAPI(
    title="Newsconseen Analytics Layer",
    description=(
        "ETL, ML, Open Data, and Connector intelligence service for Newsconseen. "
        "The SME version of Palantir Foundry."
    ),
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
for router in ALL_ROUTERS:
    app.include_router(router)

app.include_router(ml_router)
app.include_router(connectors_router)


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


# ----------------------------------------------------------
# Health & Status
# ----------------------------------------------------------
@app.get("/", tags=["Health"])
def root():
    return {
        "status": "ok",
        "service": "newsconseen-python-layer",
        "version": "3.0.0",
        "mantra": "The SME version of Palantir Foundry",
    }


@app.get("/health", tags=["Health"])
def health():
    from sqlalchemy import text
    db_status = "unavailable"
    engine = get_engine_safe()
    if engine:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_status = "connected"
        except Exception as e:
            db_status = f"error: {str(e)[:100]}"
    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "api": "ok",
        "database": db_status,
        "ml_enabled": True,
        "open_data_enabled": True,
        "connectors_enabled": True,
    }


# ----------------------------------------------------------
# Cron — Nightly ETL Trigger (protected)
# ----------------------------------------------------------
@app.post("/cron/etl-all", tags=["Cron"])
def cron_etl_all(x_cron_secret: str = Header(None)):
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=403, detail="Unauthorized")

    results = {}

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
            raw = extract_fn()
            summary = transform_fn(raw)
            result = load_dataframe(summary, f"{name}_summary")
            results[name] = result
        except Exception as e:
            results[name] = {"status": "error", "detail": str(e)}
            logger.error("Cron: %s ETL failed — %s", name, e)

    try:
        raw = geospatial.extract_geospatial()
        summary = geospatial.transform_geospatial(raw)
        results["geospatial"] = load_dataframe_replace(summary, "geospatial_summary")
    except Exception as e:
        results["geospatial"] = {"status": "error", "detail": str(e)}

    success_count = sum(1 for r in results.values() if r.get("status") == "success")
    return {
        "cron_run": True,
        "success": success_count,
        "total": len(results),
        "all_success": success_count == len(results),
        "results": results,
    }


# ----------------------------------------------------------
# Debug Endpoints
# ----------------------------------------------------------
@app.get("/debug/enterprises", tags=["Debug"])
def debug_enterprises(company_id: Optional[str] = Query(None)):
    df = enterprises.extract_enterprises()
    return safe_sample(filter_by_company(df, company_id))


@app.get("/debug/tasks", tags=["Debug"])
def debug_tasks(company_id: Optional[str] = Query(None)):
    df = tasks.extract_tasks()
    return safe_sample(filter_by_company(df, company_id))


@app.get("/debug/people", tags=["Debug"])
def debug_people(company_id: Optional[str] = Query(None)):
    df = people.extract_people()
    return safe_sample(filter_by_company(df, company_id))


@app.get("/debug/transactions", tags=["Debug"])
def debug_transactions(company_id: Optional[str] = Query(None)):
    df = transactions.extract_transactions()
    return safe_sample(filter_by_company(df, company_id))


@app.get("/debug/products", tags=["Debug"])
def debug_products(company_id: Optional[str] = Query(None)):
    df = products.extract_products()
    return safe_sample(filter_by_company(df, company_id))


@app.get("/debug/addresses", tags=["Debug"])
def debug_addresses(company_id: Optional[str] = Query(None)):
    df = addresses.extract_addresses()
    return safe_sample(filter_by_company(df, company_id))


@app.get("/debug/relationships", tags=["Debug"])
def debug_relationships(company_id: Optional[str] = Query(None)):
    df = relationships.extract_relationships()
    return safe_sample(filter_by_company(df, company_id))


# ----------------------------------------------------------
# Summary Endpoints
# ----------------------------------------------------------
@app.get("/task-summary", response_model=List[TaskSummary], tags=["ETL"])
def get_task_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(tasks.extract_tasks(), company_id)
    summary = tasks.transform_tasks(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/task-summary", tags=["ETL"])
def load_task_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(tasks.extract_tasks(), company_id)
    return load_dataframe(tasks.transform_tasks(df), "task_summary", company_id=company_id)


@app.get("/transaction-summary", response_model=List[TransactionSummary], tags=["ETL"])
def get_transaction_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(transactions.extract_transactions(), company_id)
    summary = transactions.transform_transactions(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/transaction-summary", tags=["ETL"])
def load_transaction_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(transactions.extract_transactions(), company_id)
    return load_dataframe(transactions.transform_transactions(df), "transaction_summary", company_id=company_id)


@app.get("/people-summary", response_model=List[PeopleSummary], tags=["ETL"])
def get_people_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(people.extract_people(), company_id)
    summary = people.transform_people(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/people-summary", tags=["ETL"])
def load_people_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(people.extract_people(), company_id)
    return load_dataframe(people.transform_people(df), "people_summary", company_id=company_id)


@app.get("/product-summary", response_model=List[ProductSummary], tags=["ETL"])
def get_product_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(products.extract_products(), company_id)
    summary = products.transform_products(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/product-summary", tags=["ETL"])
def load_product_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(products.extract_products(), company_id)
    return load_dataframe(products.transform_products(df), "product_summary", company_id=company_id)


@app.get("/service-summary", response_model=List[ServiceSummary], tags=["ETL"])
def get_service_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(services.extract_services(), company_id)
    summary = services.transform_services(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.get("/enterprise-summary", response_model=List[EnterpriseSummary], tags=["ETL"])
def get_enterprise_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(enterprises.extract_enterprises(), company_id)
    summary = enterprises.transform_enterprises(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/enterprise-summary", tags=["ETL"])
def load_enterprise_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(enterprises.extract_enterprises(), company_id)
    return load_dataframe(enterprises.transform_enterprises(df), "enterprise_summary", company_id=company_id)


@app.get("/address-summary", response_model=List[AddressSummary], tags=["ETL"])
def get_address_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(addresses.extract_addresses(), company_id)
    summary = addresses.transform_addresses(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/address-summary", tags=["ETL"])
def load_address_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(addresses.extract_addresses(), company_id)
    return load_dataframe(addresses.transform_addresses(df), "address_summary", company_id=company_id)


@app.get("/relationship-summary", response_model=List[RelationshipSummary], tags=["ETL"])
def get_relationship_summary(
    company_id:  Optional[str] = Query(None),
    category:    Optional[str] = Query(None),
    active_only: bool = Query(False),
):
    df = filter_by_company(relationships.extract_relationships(), company_id)
    summary = relationships.transform_relationships(df)
    if category and "relationship_category" in summary.columns:
        summary = summary[summary["relationship_category"] == category]
    if active_only and "is_active" in summary.columns:
        summary = summary[summary["is_active"] == True]
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/relationship-summary", tags=["ETL"])
def load_relationship_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(relationships.extract_relationships(), company_id)
    return load_dataframe(relationships.transform_relationships(df), "relationship_summary", company_id=company_id)


@app.get("/geospatial-summary", tags=["ETL"])
def get_geospatial_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(geospatial.extract_geospatial(), company_id)
    summary = geospatial.transform_geospatial(df)
    return summary.where(summary.notna(), None).to_dict(orient="records")


@app.post("/load/geospatial-summary", tags=["ETL"])
def load_geospatial_summary(company_id: Optional[str] = Query(None)):
    df = filter_by_company(geospatial.extract_geospatial(), company_id)
    return load_dataframe_replace(geospatial.transform_geospatial(df), "geospatial_summary")
