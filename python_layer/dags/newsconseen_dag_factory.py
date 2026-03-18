import sys
import os

# Make etl modules importable inside Airflow container
sys.path.insert(0, '/opt/airflow/dags')

from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime
from etl import tasks, transactions, services, enterprises, people, products
from etl import geospatial
from etl.load import load_dataframe


# -----------------------------------------
# ENTITY CONFIGURATION
# -----------------------------------------
ENTITY_CONFIG = {
    "tasks":        (tasks.extract_tasks,               tasks.transform_tasks),
    "transactions": (transactions.extract_transactions,  transactions.transform_transactions),
    "services":     (services.extract_services,          services.transform_services),
    "enterprises":  (enterprises.extract_enterprises,    enterprises.transform_enterprises),
    "people":       (people.extract_people,              people.transform_people),
    "products":     (products.extract_products,          products.transform_products),
    "geospatial":   (geospatial.extract,                 geospatial.transform),
}


# -----------------------------------------
# ETL WRAPPER
# -----------------------------------------
def make_etl_callable(extract_fn, transform_fn, table_name):
    def _etl():
        df = extract_fn()
        summary = transform_fn(df)
        load_dataframe(summary, table_name)
    return _etl


# -----------------------------------------
# DAG FACTORY
# -----------------------------------------
for entity, (extract_fn, transform_fn) in ENTITY_CONFIG.items():

    dag = DAG(
        dag_id=f"{entity}_etl",
        start_date=datetime(2024, 1, 1),
        schedule_interval="@daily",
        catchup=False,
        tags=["newsconseen", entity],
    )

    PythonOperator(
        task_id=f"{entity}_summary",
        python_callable=make_etl_callable(
            extract_fn,
            transform_fn,
            f"{entity}_summary",
        ),
        dag=dag,
    )

    globals()[f"{entity}_etl"] = dag