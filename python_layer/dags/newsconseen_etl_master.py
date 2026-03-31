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
# Task functions
# One function per entity. Snapshot entities use load_dataframe
# (append). Reference entities use load_dataframe_replace.
#
# ORDER DEPENDENCY:
#   addresses must run before geospatial — geospatial reads
#   coordinates from address_summary to avoid re-geocoding.
#   relationships must run after enterprises and people so
#   the join backbone has fresh entity data to reference.
# ----------------------------------------------------------

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


def run_address_summary():
    df = addresses.extract_addresses()
    summary = addresses.transform_addresses(df)
    load_dataframe(summary, "address_summary")


def run_relationship_summary():
    df = relationships.extract_relationships()
    summary = relationships.transform_relationships(df)
    load_dataframe(summary, "relationship_summary")


def run_geospatial_summary():
    """
    Geospatial uses load_dataframe_replace — reference table,
    no time-series dimension. Must run AFTER addresses so it
    can pull coordinates from address_summary.
    """
    df = geospatial.extract_geospatial()
    summary = geospatial.transform_geospatial(df)
    load_dataframe_replace(summary, "geospatial_summary")


# ----------------------------------------------------------
# Master DAG
#
# Execution order:
#
#   t1 (tasks)                           — independent
#   t2 (transactions)                    — independent
#   t3 (services)                        — independent
#   t4 (enterprises) ─┐
#   t5 (people)      ─┤─► t8 (relationships)
#   t6 (products)    ─┤
#   t7 (addresses)   ─┼─► t8 (relationships)
#                    └──► t9 (geospatial)
#   t4 (enterprises) ────► t9 (geospatial)
#
# Rationale:
#   - tasks, transactions, services have no downstream deps — run freely
#   - relationships (t8) waits for enterprises, people, products, addresses
#     so all entity summaries are from the same generation before the
#     relationship join backbone is written
#   - geospatial (t9) waits for addresses (coordinates in address_summary)
#     AND enterprises (entity data read from same Base44 source) so that
#     geospatial_summary reflects a consistent snapshot
# ----------------------------------------------------------

with DAG(
    dag_id="newsconseen_etl_master",
    start_date=datetime(2024, 1, 1),
    schedule_interval="@daily",
    catchup=False,
    tags=["newsconseen", "etl"],
    description=(
        "Nightly ETL pipeline for all Newsconseen entities. "
        "Runs extract → transform → load for all 9 entities "
        "with correct dependency ordering."
    ),
):
    t1 = PythonOperator(task_id="task_summary",         python_callable=run_task_summary)
    t2 = PythonOperator(task_id="transaction_summary",  python_callable=run_transaction_summary)
    t3 = PythonOperator(task_id="service_summary",      python_callable=run_service_summary)
    t4 = PythonOperator(task_id="enterprise_summary",   python_callable=run_enterprise_summary)
    t5 = PythonOperator(task_id="people_summary",       python_callable=run_people_summary)
    t6 = PythonOperator(task_id="product_summary",      python_callable=run_product_summary)
    t7 = PythonOperator(task_id="address_summary",      python_callable=run_address_summary)
    t8 = PythonOperator(task_id="relationship_summary", python_callable=run_relationship_summary)
    t9 = PythonOperator(task_id="geospatial_summary",   python_callable=run_geospatial_summary)

    [t4, t5, t6, t7] >> t8
    [t4, t7] >> t9

    # tasks, transactions, services, products have no dependencies
    # they run independently alongside the above
