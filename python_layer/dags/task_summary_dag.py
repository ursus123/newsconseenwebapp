from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime
from python_layer.etl import tasks
from python_layer.etl.load import load_dataframe


def run_task_summary():
    df = tasks.extract_tasks()
    summary = tasks.transform_tasks(df)
    load_dataframe(summary, "task_summary")


with DAG(
    dag_id="task_summary_etl",
    start_date=datetime(2024, 1, 1),
    schedule_interval="@daily",
    catchup=False,
    tags=["newsconseen", "tasks"],
):

    PythonOperator(
        task_id="task_summary",
        python_callable=run_task_summary
    )
