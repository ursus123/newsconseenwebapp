from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from etl import (
    tasks,
    transactions,
    services,
    enterprises,
    people,
    products,
)
from etl.load import load_dataframe

from schemas.tasks import TaskSummary
from schemas.transactions import TransactionSummary
from schemas.services import ServiceSummary
from schemas.enterprises import EnterpriseSummary
from schemas.people import PeopleSummary
from schemas.products import ProductSummary

app = FastAPI(
    title="Newsconseen Analytics Layer",
    description="Python ETL + Analytics microservice for Newsconseen",
    version="1.0.0",
)

# -------------------------------------------------
# CORS (adjust origins as needed for Base44 / UI)
# -------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------------------------------
# Health check
# -------------------------------------------------
@app.get("/")
def root():
    return {"status": "ok", "service": "newsconseen-python-layer"}


# -------------------------------------------------
# TASKS
# -------------------------------------------------
@app.get("/task-summary", response_model=list[TaskSummary])
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
        result = load_dataframe(summary, "task_summary")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# TRANSACTIONS
# -------------------------------------------------
@app.get("/transaction-summary", response_model=list[TransactionSummary])
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
        result = load_dataframe(summary, "transaction_summary")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# SERVICES
# -------------------------------------------------
@app.get("/service-summary", response_model=list[ServiceSummary])
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
        result = load_dataframe(summary, "service_summary")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# ENTERPRISES
# -------------------------------------------------
@app.get("/enterprise-summary", response_model=list[EnterpriseSummary])
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
        result = load_dataframe(summary, "enterprise_summary")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# PEOPLE
# -------------------------------------------------
@app.get("/people-summary", response_model=list[PeopleSummary])
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
        result = load_dataframe(summary, "people_summary")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# PRODUCTS
# -------------------------------------------------
@app.get("/product-summary", response_model=list[ProductSummary])
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
        result = load_dataframe(summary, "product_summary")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
