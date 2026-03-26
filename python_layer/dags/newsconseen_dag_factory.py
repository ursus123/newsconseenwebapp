import sys

# Make etl modules importable inside Airflow container
sys.path.insert(0, '/opt/airflow/dags')

from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime

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


# ----------------------------------------------------------
# ENTITY CONFIGURATION
#
# Two categories:
#   snapshot  — time-series append via load_dataframe()
#               one row per group per day, history preserved
#   reference — full replace via load_dataframe_replace()
#               no time dimension, latest state only
# ----------------------------------------------------------

SNAPSHOT_ENTITIES = {
    "tasks":         (tasks.extract_tasks,               tasks.transform_tasks),
    "transactions":  (transactions.extract_transactions,  transactions.transform_transactions),
    "services":      (services.extract_services,          services.transform_services),
    "enterprises":   (enterprises.extract_enterprises,    enterprises.transform_enterprises),
    "people":        (people.extract_people,              people.transform_people),
    "products":      (products.extract_products,          products.transform_products),
    "addresses":     (addresses.extract_addresses,        addresses.transform_addresses),
    "relationships": (relationships.extract_relationships, relationships.transform_relationships),
}

REFERENCE_ENTITIES = {
    "geospatial": (geospatial.extract_geospatial, geospatial.transform_geospatial),
}


# ----------------------------------------------------------
# ETL WRAPPERS
# ----------------------------------------------------------

def make_snapshot_callable(extract_fn, transform_fn, table_name):
    """Wrapper for time-series snapshot entities."""
    def _etl():
        df = extract_fn()
        summary = transform_fn(df)
        load_dataframe(summary, table_name)
    return _etl


def make_reference_callable(extract_fn, transform_fn, table_name):
    """Wrapper for reference table entities — replace, not append."""
    def _etl():
        df = extract_fn()
        summary = transform_fn(df)
        load_dataframe_replace(summary, table_name)
    return _etl


# ----------------------------------------------------------
# DAG FACTORY — one DAG per entity
# Each entity gets its own independently schedulable DAG.
# Use these for per-entity debugging or manual reruns.
# For the full nightly pipeline, use newsconseen_etl_master.
# ----------------------------------------------------------

for entity, (extract_fn, transform_fn) in SNAPSHOT_ENTITIES.items():
    dag = DAG(
        dag_id=f"{entity}_etl",
        start_date=datetime(2024, 1, 1),
        schedule_interval="@daily",
        catchup=False,
        tags=["newsconseen", entity],
    )

    PythonOperator(
        task_id=f"{entity}_summary",
        python_callable=make_snapshot_callable(
            extract_fn, transform_fn, f"{entity}_summary"
        ),
        dag=dag,
    )

    globals()[f"{entity}_etl"] = dag


for entity, (extract_fn, transform_fn) in REFERENCE_ENTITIES.items():
    dag = DAG(
        dag_id=f"{entity}_etl",
        start_date=datetime(2024, 1, 1),
        schedule_interval="@daily",
        catchup=False,
        tags=["newsconseen", entity],
    )

    PythonOperator(
        task_id=f"{entity}_summary",
        python_callable=make_reference_callable(
            extract_fn, transform_fn, f"{entity}_summary"
        ),
        dag=dag,
    )

    globals()[f"{entity}_etl"] = dag
