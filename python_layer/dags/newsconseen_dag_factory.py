import logging
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

from python_layer.etl import tasks, transactions, services, enterprises, people
from python_layer.etl import geospatial
from python_layer.etl.load import load_dataframe


# ---------------------------------------------------------
# Logging
# ---------------------------------------------------------
logger = logging.getLogger(__name__)


# ---------------------------------------------------------
# ENTITY CONFIGURATION
# ---------------------------------------------------------
ENTITY_CONFIG = {
    "tasks": (tasks.extract_tasks, tasks.transform_tasks),
    "transactions": (transactions.extract_transactions, transactions.transform_transactions),
    "services": (services.extract_services, services.transform_services),
    "enterprises": (enterprises.extract_enterprises, enterprises.transform_enterprises),
    "people": (people.extract_people, people.transform_people),
    "geospatial": (geospatial.extract, geospatial.transform),
}


# ---------------------------------------------------------
# ETL WRAPPER
# ---------------------------------------------------------
def make_etl_callable(extract_fn, transform_fn, table_name):
    """
    Returns a callable function that Airflow can run.
    """
    def _etl():
        logger.info(f"Starting ETL for {table_name}")
        df = extract_fn()
        summary = transform_fn(df)
        load_dataframe(summary, table_name)
        logger.info(f"Completed ETL for {table_name}")

    return _etl


# ---------------------------------------------------------
# DEFAULT ARGS
# ---------------------------------------------------------
default_args = {
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}


# ---------------------------------------------------------
# DAG FACTORY
# ---------------------------------------------------------
for entity, (extract_fn, transform_fn) in ENTITY_CONFIG.items():

    dag = DAG(
        dag_id=f"{entity}_etl",
        start_date=datetime(2024, 1, 1),
        schedule_interval="@daily",
        catchup=False,
        default_args=default_args,
        tags=["newsconseen", entity],
    )

    PythonOperator(
        task_id=f"{entity}_summary",
        python_callable=make_etl_callable(
            extract_fn,
            transform_fn,
            f"{entity}_summary"
        ),
        dag=dag,
    )

    # Register DAG in Airflow
    globals()[f"{entity}_etl"] = dag
