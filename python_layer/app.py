from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
def debug_enterprises():
    try:
        return safe_sample(enterprises.extract_enterprises())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug/tasks")
def debug_tasks():
    try:
        return safe_sample(tasks.extract_tasks())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug/people")
def debug_people():
    try:
        return safe_sample(people.extract_people())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug/transactions")
def debug_transactions():
    try:
        return safe_sample(transactions.extract_transactions())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug/services")
def debug_services():
    try:
        return safe_sample(services.extract_services())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/debug/products")
def debug_products():
    try:
        return safe_sample(products.extract_products())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# TASKS
# -------------------------------------------------
@app.get("/task-summary")
def get_task_summary():
    try:
        df = tasks.extract_tasks()
        summary = tasks.transform_tasks(df)
        return summary.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load/task-summary")
def load_task_summary():
    try:
        df = tasks.extract_tasks()
        summary = tasks.transform_tasks(df)
        return load_dataframe(summary, "task_summary")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# TRANSACTIONS
# -------------------------------------------------
@app.get("/transaction-summary")
def get_transaction_summary():
    try:
        df = transactions.extract_transactions()
        summary = transactions.transform_transactions(df)
        return summary.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load/transaction-summary")
def load_transaction_summary():
    try:
        df = transactions.extract_transactions()
        summary = transactions.transform_transactions(df)
        return load_dataframe(summary, "transaction_summary")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# SERVICES
# -------------------------------------------------
@app.get("/service-summary")
def get_service_summary():
    try:
        df = services.extract_services()
        summary = services.transform_services(df)
        return summary.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load/service-summary")
def load_service_summary():
    try:
        df = services.extract_services()
        summary = services.transform_services(df)
        return load_dataframe(summary, "service_summary")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# ENTERPRISES
# -------------------------------------------------
@app.get("/enterprise-summary")
def get_enterprise_summary():
    try:
        df = enterprises.extract_enterprises()
        summary = enterprises.transform_enterprises(df)
        return summary.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load/enterprise-summary")
def load_enterprise_summary():
    try:
        df = enterprises.extract_enterprises()
        summary = enterprises.transform_enterprises(df)
        return load_dataframe(summary, "enterprise_summary")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# PEOPLE
# -------------------------------------------------
@app.get("/people-summary")
def get_people_summary():
    try:
        df = people.extract_people()
        summary = people.transform_people(df)
        return summary.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load/people-summary")
def load_people_summary():
    try:
        df = people.extract_people()
        summary = people.transform_people(df)
        return load_dataframe(summary, "people_summary")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# PRODUCTS
# -------------------------------------------------
@app.get("/product-summary")
def get_product_summary():
    try:
        df = products.extract_products()
        summary = products.transform_products(df)
        return summary.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/load/product-summary")
def load_product_summary():
    try:
        df = products.extract_products()
        summary = products.transform_products(df)
        return load_dataframe(summary, "product_summary")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))