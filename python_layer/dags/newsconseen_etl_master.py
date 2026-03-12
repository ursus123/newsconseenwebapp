from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime
from python_layer.etl import tasks, transactions, services, enterprises, people
from python_layer.etl.load import load_dataframe


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


with DAG(
    dag_id="newsconseen_etl_master",
    start_date=datetime(2024, 1, 1),
    schedule_interval="@daily",
    catchup=False,
    tags=["newsconseen", "etl"],
):

    task_summary = PythonOperator(
        task_id="task_summary",
        python_callable=run_task_summary
    )

    transaction_summary = PythonOperator(
        task_id="transaction_summary",
        python_callable=run_transaction_summary
    )

    service_summary = PythonOperator(
        task_id="service_summary",
        python_callable=run_service_summary
    )

    enterprise_summary = PythonOperator(
        task_id="enterprise_summary",
        python_callable=run_enterprise_summary
    )

    people_summary = PythonOperator(
        task_id="people_summary",
        python_callable=run_people_summary
    )

    # Run in sequence (can be parallel if you prefer)
    task_summary >> transaction_summary >> service_summary >> enterprise_summary >> people_summary
