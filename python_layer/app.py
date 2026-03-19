from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import pandas as pd
import numpy as np

from etl import (
    tasks,
    transactions,
    services,
    enterprises,
    people,
    products,
)
from etl.load import load_dataframe
from open_data.medication_routes import router as medication_router

app = FastAPI(
    title="Newsconseen Analytics Layer",
    description="Python ETL + Analytics microservice for Newsconseen",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------
# Open Data Routers
# -------------------------------------------------
app.include_router(medication_router)


def safe_sample(df: pd.DataFrame) -> dict:
    sample = df.head(2).replace({np.nan: None}).to_dict(orient="records")
    return {"columns": list(df.columns), "row_count": len(df), "sample": sample}


def filter_by_company(df: pd.DataFrame, company_id: Optional[str]) -> pd.DataFrame:
    """
    Filter a DataFrame by company_id if provided.
    If company_id is None or not in columns, return df unchanged.
    Super admin passes no company_id and gets all data.
    """
    if not company_id:
        return df
    if "company_id" not in df.columns:
        return df
    return df[df["company_id"] == company_id].copy()


# -------------------------------------------------
# Health check
# -------------------------------------------------
@app.get("/")
def root():
    return {"status": "ok", "service": "newsconseen-python-layer"}


# -------------------------------------------------
# DEBUG endpoints
# -------------------------------------------------
@app.get("/debug/enterprises")
def debug_enterprises(company_id: Optional[str] = Query(None)):
    try:
        df = enterprises.extract_enterprises()
        df = filter_by_company(df, company_id)
        return safe_sample(df)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug/tasks")
def debug_tasks(company_id: Optional[str] = Query(None)):
    try:
        df = tasks.extract_tasks()
        df = filter_by_company(df, company_id)
        return safe_sample(df)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug/people")
def debug_people(company_id: Optional[str] = Query(None)):
    try:
        df = people.extract_people()
        df = filter_by_company(df, company_id)
        return safe_sample(df)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug/transactions")
def debug_transactions(company_id: Optional[str] = Query(None)):
    try:
        df = transactions.extract_transactions()
        df = filter_by_company(df, company_id)
        return safe_sample(df)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug/services")
def debug_services(company_id: Optional[str] = Query(None)):
    try:
        df = services.extract_services()
        df = filter_by_company(df, company_id)
        return safe_sample(df)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug/products")
def debug_products(company_id: Optional[str] = Query(None)):
    try:
        df = products.extract_products()
        df = filter_by_company(df, company_id)
        return safe_sample(df)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# TASKS
# -------------------------------------------------
@app.get("/task-summary")
def get_task_summary(company_id: Optional[str] = Query(None)):
    try:
        df = tasks.extract_tasks()
        df = filter_by_company(df, company_id)
        summary = tasks.transform_tasks(df)
        return summary.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load/task-summary")
def load_task_summary(company_id: Optional[str] = Query(None)):
    try:
        df = tasks.extract_tasks()
        df = filter_by_company(df, company_id)
        summary = tasks.transform_tasks(df)
        table = f"task_summary_{company_id}" if company_id else "task_summary"
        result = load_dataframe(summary, table)
        result["company_id"] = company_id
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# TRANSACTIONS
# -------------------------------------------------
@app.get("/transaction-summary")
def get_transaction_summary(company_id: Optional[str] = Query(None)):
    try:
        df = transactions.extract_transactions()
        df = filter_by_company(df, company_id)
        summary = transactions.transform_transactions(df)
        return summary.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load/transaction-summary")
def load_transaction_summary(company_id: Optional[str] = Query(None)):
    try:
        df = transactions.extract_transactions()
        df = filter_by_company(df, company_id)
        summary = transactions.transform_transactions(df)
        table = f"transaction_summary_{company_id}" if company_id else "transaction_summary"
        result = load_dataframe(summary, table)
        result["company_id"] = company_id
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# SERVICES
# -------------------------------------------------
@app.get("/service-summary")
def get_service_summary(company_id: Optional[str] = Query(None)):
    try:
        df = services.extract_services()
        df = filter_by_company(df, company_id)
        summary = services.transform_services(df)
        return summary.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load/service-summary")
def load_service_summary(company_id: Optional[str] = Query(None)):
    try:
        df = services.extract_services()
        df = filter_by_company(df, company_id)
        summary = services.transform_services(df)
        table = f"service_summary_{company_id}" if company_id else "service_summary"
        result = load_dataframe(summary, table)
        result["company_id"] = company_id
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# ENTERPRISES
# -------------------------------------------------
@app.get("/enterprise-summary")
def get_enterprise_summary(company_id: Optional[str] = Query(None)):
    try:
        df = enterprises.extract_enterprises()
        df = filter_by_company(df, company_id)
        summary = enterprises.transform_enterprises(df)
        return summary.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load/enterprise-summary")
def load_enterprise_summary(company_id: Optional[str] = Query(None)):
    try:
        df = enterprises.extract_enterprises()
        df = filter_by_company(df, company_id)
        summary = enterprises.transform_enterprises(df)
        table = f"enterprise_summary_{company_id}" if company_id else "enterprise_summary"
        result = load_dataframe(summary, table)
        result["company_id"] = company_id
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# PEOPLE
# -------------------------------------------------
@app.get("/people-summary")
def get_people_summary(company_id: Optional[str] = Query(None)):
    try:
        df = people.extract_people()
        df = filter_by_company(df, company_id)
        summary = people.transform_people(df)
        return summary.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load/people-summary")
def load_people_summary(company_id: Optional[str] = Query(None)):
    try:
        df = people.extract_people()
        df = filter_by_company(df, company_id)
        summary = people.transform_people(df)
        table = f"people_summary_{company_id}" if company_id else "people_summary"
        result = load_dataframe(summary, table)
        result["company_id"] = company_id
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# PRODUCTS
# -------------------------------------------------
@app.get("/product-summary")
def get_product_summary(company_id: Optional[str] = Query(None)):
    try:
        df = products.extract_products()
        df = filter_by_company(df, company_id)
        summary = products.transform_products(df)
        return summary.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load/product-summary")
def load_product_summary(company_id: Optional[str] = Query(None)):
    try:
        df = products.extract_products()
        df = filter_by_company(df, company_id)
        summary = products.transform_products(df)
        table = f"product_summary_{company_id}" if company_id else "product_summary"
        result = load_dataframe(summary, table)
        result["company_id"] = company_id
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))