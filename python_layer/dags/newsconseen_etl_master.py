import sys

# Make etl modules importable inside Airflow container
sys.path.insert(0, '/opt/airflow/dags')

from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime
from etl import tasks, transactions, services, enterprises, people, products
from etl import geospatial
from etl.load import load_dataframe


def run_task_summary():
    df = tasks.extract_tasks()
    summary = tasks.transform_tasks(df)
    load_dataframe(summary, "task_summary")


def run_transaction_summary():
    df = transactions.extract_transactions()
    summary = transactions.transform_transactions(df)
    load_dataframe(summary, "transaction_summary")


def run_service_summary():
    df = services.extract_services()
    summary = services.transform_services(df)
    load_dataframe(summary, "service_summary")


def run_enterprise_summary():
    df = enterprises.extract_enterprises()
    summary = enterprises.transform_enterprises(df)
    load_dataframe(summary, "enterprise_summary")


def run_people_summary():
    df = people.extract_people()
    summary = people.transform_people(df)
    load_dataframe(summary, "people_summary")


def run_product_summary():
    df = products.extract_products()
    summary = products.transform_products(df)
    load_dataframe(summary, "product_summary")


def run_geospatial_summary():
    df = geospatial.extract()
    summary = geospatial.transform(df)
    load_dataframe(summary, "geospatial_summary")


with DAG(
    dag_id="newsconseen_etl_master",
    start_date=datetime(2024, 1, 1),
    schedule_interval="@daily",
    catchup=False,
    tags=["newsconseen", "etl"],
):
    t1 = PythonOperator(task_id="task_summary", python_callable=run_task_summary)
    t2 = PythonOperator(task_id="transaction_summary", python_callable=run_transaction_summary)
    t3 = PythonOperator(task_id="service_summary", python_callable=run_service_summary)
    t4 = PythonOperator(task_id="enterprise_summary", python_callable=run_enterprise_summary)
    t5 = PythonOperator(task_id="people_summary", python_callable=run_people_summary)
    t6 = PythonOperator(task_id="product_summary", python_callable=run_product_summary)
    t7 = PythonOperator(task_id="geospatial_summary", python_callable=run_geospatial_summary)

    t1 >> t2 >> t3 >> t4 >> [t5, t6, t7]