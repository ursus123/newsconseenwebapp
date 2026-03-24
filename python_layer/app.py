import logging
from contextlib import asynccontextmanager
from typing import List, Optional

import pandas as pd
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from etl import enterprises, geospatial, people, products, services, tasks, transactions
from etl.load import load_dataframe, load_dataframe_replace
from open_data.medication_routes import router as medication_router
from schemas import (
    EnterpriseSummary,
    PeopleSummary,
    ProductSummary,
    ServiceSummary,
    TaskSummary,
    TransactionSummary,
)

logger = logging.getLogger(__name__)


# ----------------------------------------------------------
# Startup / shutdown lifecycle
# ----------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs once on startup before the first request is served.
    - Warms the Railway DB connection
    - Creates the analytics schema if it does not exist
    - Logs DB availability so Railway logs show connection status
    """
    from database import ensure_analytics_schema, get_engine_safe

    engine = get_engine_safe()
    if engine:
        try:
            ensure_analytics_schema(engine)
            logger.info("startup: Railway PostgreSQL connected, analytics schema ready")
        except Exception as e:
            logger.warning("startup: analytics schema creation failed: %s", e)
    else:
        logger.warning(
            "startup: DATABASE_URL not set — Railway analytics store unavailable. "
            "ETL load endpoints will fail until DATABASE_URL is configured."
        )
    yield


# ----------------------------------------------------------
# FastAPI app
# ----------------------------------------------------------
app = FastAPI(
    title="Newsconseen Analytics Layer",
    description=(
        "Python ETL + Analytics microservice for Newsconseen. "
        "Extracts from Base44, transforms into summary DataFrames, "
        "loads time-series snapshots into Railway PostgreSQL."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(medication_router)


# ----------------------------------------------------------
# Shared helpers
# ----------------------------------------------------------
def filter_by_company(df: pd.DataFrame, company_id: Optional[str]) -> pd.DataFrame:
    """
    Filter a DataFrame by company_id if provided.
    Super admin passes no company_id and gets all data.
    """
    if not company_id:
        return df
    if "company_id" not in df.columns:
        return df
    return df[df["company_id"] == company_id].copy()


def safe_sample(df: pd.DataFrame) -> dict:
    """
    Return a debug-friendly dict with column names, row count,
    and the first 2 rows with NaN replaced by None.
    """
    sample = (
        df.head(2)
        .where(df.head(2).notna(), None)
        .to_dict(orient="records")
    )
    return {
        "columns":   list(df.columns),
        "row_count": len(df),
        "sample":    sample,
    }


# ----------------------------------------------------------
# Health check
# ----------------------------------------------------------
@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "service": "newsconseen-python-layer", "version": "2.0.0"}


@app.get("/health", tags=["Health"])
def health():
    """
    Full health check — reports FastAPI status and Railway DB connectivity.
    Used by Railway's health check configuration.
    """
    from database import get_engine_safe
    from sqlalchemy import text

    db_status = "unavailable"
    engine = get_engine_safe()

    if engine:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_status = "connected"
        except Exception as e:
            db_status = f"error: {e}"

    return {
        "status":    "ok" if db_status == "connected" else "degraded",
        "api":       "ok",
        "database":  db_status,
    }


# ----------------------------------------------------------
# Cron endpoint — Railway scheduled ETL trigger
# ----------------------------------------------------------
@app.post("/cron/etl-all", tags=["Cron"])
def cron_etl_all(x_cron_secret: str = Header(None)):
    """
    Triggered by Railway cron job on schedule:
        Nightly:  0 0 * * *  (midnight UTC)
        Weekly:   0 6 * * 1  (Monday 6am UTC)

    Protected by X-Cron-Secret header — must match CRON_SECRET env var.
    Runs all six entity ETLs plus geospatial in sequence.
    Returns per-entity status so Railway logs show exactly what succeeded
    or failed on each run.

    Geospatial uses load_dataframe_replace (reference table, no time series).
    All other entities use load_dataframe (append snapshot, preserve history).
    """
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=403, detail="Unauthorized")

    results = {}

    # -- Six core entity ETLs (time-series append) --
    entity_map = {
        "tasks":        (tasks.extract_tasks,               tasks.transform_tasks),
        "transactions": (transactions.extract_transactions,  transactions.transform_transactions),
        "services":     (services.extract_services,          services.transform_services),
        "enterprises":  (enterprises.extract_enterprises,    enterprises.transform_enterprises),
        "people":       (people.extract_people,              people.transform_people),
        "products":     (products.extract_products,          products.transform_products),
    }

    for entity, (extract_fn, transform_fn) in entity_map.items():
        try:
            df = extract_fn()
            summary = transform_fn(df)
            result = load_dataframe(summary, f"{entity}_summary")
            results[entity] = result
            logger.info("cron: %s ETL complete — %s", entity, result)
        except Exception as e:
            results[entity] = {"status": "error", "detail": str(e)}
            logger.error("cron: %s ETL failed — %s", entity, e)

    # -- Geospatial (reference table replace, not append) --
    try:
        df = geospatial.extract_geospatial()
        summary = geospatial.transform_geospatial(df)
        result = load_dataframe_replace(summary, "geospatial_summary")
        results["geospatial"] = result
        logger.info("cron: geospatial ETL complete — %s", result)
    except Exception as e:
        results["geospatial"] = {"status": "error", "detail": str(e)}
        logger.error("cron: geospatial ETL failed — %s", e)

    success_count = sum(1 for r in results.values() if r.get("status") == "success")
    total = len(results)

    return {
        "cron_run":     True,
        "success":      success_count,
        "total":        total,
        "all_success":  success_count == total,
        "results":      results,
    }


# ----------------------------------------------------------
# DEBUG endpoints — raw extract inspection
# ----------------------------------------------------------
@app.get("/debug/enterprises", tags=["Debug"])
def debug_enterprises(company_id: Optional[str] = Query(None)):
    try:
        df = enterprises.extract_enterprises()
        return safe_sample(filter_by_company(df, company_id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/debug/tasks", tags=["Debug"])
def debug_tasks(company_id: Optional[str] = Query(None)):
    try:
        df = tasks.extract_tasks()
        return safe_sample(filter_by_company(df, company_id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/debug/people", tags=["Debug"])
def debug_people(company_id: Optional[str] = Query(None)):
    try:
        df = people.extract_people()
        return safe_sample(filter_by_company(df, company_id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/debug/transactions", tags=["Debug"])
def debug_transactions(company_id: Optional[str] = Query(None)):
    try:
        df = transactions.extract_transactions()
        return safe_sample(filter_by_company(df, company_id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/debug/services", tags=["Debug"])
def debug_services(company_id: Optional[str] = Query(None)):
    try:
        df = services.extract_services()
        return safe_sample(filter_by_company(df, company_id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/debug/products", tags=["Debug"])
def debug_products(company_id: Optional[str] = Query(None)):
    try:
        df = products.extract_products()
        return safe_sample(filter_by_company(df, company_id))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------
# TASKS
# ----------------------------------------------------------
@app.get("/task-summary", response_model=List[TaskSummary], tags=["ETL"])
def get_task_summary(company_id: Optional[str] = Query(None)):
    try:
        df = tasks.extract_tasks()
        df = filter_by_company(df, company_id)
        summary = tasks.transform_tasks(df)
        return summary.where(summary.notna(), None).to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/load/task-summary", tags=["ETL"])
def load_task_summary(company_id: Optional[str] = Query(None)):
    try:
        df = tasks.extract_tasks()
        df = filter_by_company(df, company_id)
        summary = tasks.transform_tasks(df)
        result = load_dataframe(summary, "task_summary", company_id=company_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------
# TRANSACTIONS
# ----------------------------------------------------------
@app.get("/transaction-summary", response_model=List[TransactionSummary], tags=["ETL"])
def get_transaction_summary(company_id: Optional[str] = Query(None)):
    try:
        df = transactions.extract_transactions()
        df = filter_by_company(df, company_id)
        summary = transactions.transform_transactions(df)
        return summary.where(summary.notna(), None).to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/load/transaction-summary", tags=["ETL"])
def load_transaction_summary(company_id: Optional[str] = Query(None)):
    try:
        df = transactions.extract_transactions()
        df = filter_by_company(df, company_id)
        summary = transactions.transform_transactions(df)
        result = load_dataframe(summary, "transaction_summary", company_id=company_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------
# SERVICES
# ----------------------------------------------------------
@app.get("/service-summary", response_model=List[ServiceSummary], tags=["ETL"])
def get_service_summary(company_id: Optional[str] = Query(None)):
    try:
        df = services.extract_services()
        df = filter_by_company(df, company_id)
        summary = services.transform_services(df)
        return summary.where(summary.notna(), None).to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/load/service-summary", tags=["ETL"])
def load_service_summary(company_id: Optional[str] = Query(None)):
    try:
        df = services.extract_services()
        df = filter_by_company(df, company_id)
        summary = services.transform_services(df)
        result = load_dataframe(summary, "service_summary", company_id=company_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------
# ENTERPRISES
# ----------------------------------------------------------
@app.get("/enterprise-summary", response_model=List[EnterpriseSummary], tags=["ETL"])
def get_enterprise_summary(company_id: Optional[str] = Query(None)):
    try:
        df = enterprises.extract_enterprises()
        df = filter_by_company(df, company_id)
        summary = enterprises.transform_enterprises(df)
        return summary.where(summary.notna(), None).to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/load/enterprise-summary", tags=["ETL"])
def load_enterprise_summary(company_id: Optional[str] = Query(None)):
    try:
        df = enterprises.extract_enterprises()
        df = filter_by_company(df, company_id)
        summary = enterprises.transform_enterprises(df)
        result = load_dataframe(summary, "enterprise_summary", company_id=company_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------
# PEOPLE
# ----------------------------------------------------------
@app.get("/people-summary", response_model=List[PeopleSummary], tags=["ETL"])
def get_people_summary(company_id: Optional[str] = Query(None)):
    try:
        df = people.extract_people()
        df = filter_by_company(df, company_id)
        summary = people.transform_people(df)
        return summary.where(summary.notna(), None).to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/load/people-summary", tags=["ETL"])
def load_people_summary(company_id: Optional[str] = Query(None)):
    try:
        df = people.extract_people()
        df = filter_by_company(df, company_id)
        summary = people.transform_people(df)
        result = load_dataframe(summary, "people_summary", company_id=company_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------
# PRODUCTS
# ----------------------------------------------------------
@app.get("/product-summary", response_model=List[ProductSummary], tags=["ETL"])
def get_product_summary(company_id: Optional[str] = Query(None)):
    try:
        df = products.extract_products()
        df = filter_by_company(df, company_id)
        summary = products.transform_products(df)
        return summary.where(summary.notna(), None).to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/load/product-summary", tags=["ETL"])
def load_product_summary(company_id: Optional[str] = Query(None)):
    try:
        df = products.extract_products()
        df = filter_by_company(df, company_id)
        summary = products.transform_products(df)
        result = load_dataframe(summary, "product_summary", company_id=company_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------
# GEOSPATIAL
# ----------------------------------------------------------
@app.get("/geospatial-summary", tags=["ETL"])
def get_geospatial_summary(company_id: Optional[str] = Query(None)):
    try:
        df = geospatial.extract_geospatial()
        df = filter_by_company(df, company_id)
        summary = geospatial.transform_geospatial(df)
        return summary.where(summary.notna(), None).to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/load/geospatial-summary", tags=["ETL"])
def load_geospatial_summary(company_id: Optional[str] = Query(None)):
    """
    Geospatial uses load_dataframe_replace — reference table, no time series.
    Calling this replaces the entire geospatial_summary table.
    """
    try:
        df = geospatial.extract_geospatial()
        df = filter_by_company(df, company_id)
        summary = geospatial.transform_geospatial(df)
        result = load_dataframe_replace(summary, "geospatial_summary")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
