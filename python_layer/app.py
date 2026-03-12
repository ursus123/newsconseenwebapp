from fastapi import FastAPI
from etl import tasks, transactions, services, enterprises, people

app = FastAPI(
    title="Newsconseen Analytics Layer",
    description="Python ETL + Analytics microservice for Newsconseen",
    version="1.0.0",
)


@app.get("/")
def root():
    return {"status": "ok", "service": "newsconseen-python-layer"}


# ---- TASKS ----
@app.get("/task-summary")
def task_summary():
    df = tasks.extract_tasks()
    summary = tasks.transform_tasks(df)
    return summary.to_dict(orient="records")


# ---- TRANSACTIONS ----
@app.get("/transaction-summary")
def transaction_summary():
    df = transactions.extract_transactions()
    summary = transactions.transform_transactions(df)
    return summary.to_dict(orient="records")


# ---- SERVICES ----
@app.get("/service-summary")
def service_summary():
    df = services.extract_services()
    summary = services.transform_services(df)
    return summary.to_dict(orient="records")


# ---- ENTERPRISES ----
@app.get("/enterprise-summary")
def enterprise_summary():
    df = enterprises.extract_enterprises()
    summary = enterprises.transform_enterprises(df)
    return summary.to_dict(orient="records")


# ---- PEOPLE ----
@app.get("/people-summary")
def people_summary():
    df = people.extract_people()
    summary = people.transform_people(df)
    return summary.to_dict(orient="records")
