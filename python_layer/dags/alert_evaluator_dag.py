import sys
sys.path.insert(0, '/opt/airflow/dags')

from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime


def run_alert_evaluation():
    from alerts.evaluator import run_all_companies
    result = run_all_companies(dry_run=False)
    print(
        f"Alert evaluation complete: "
        f"{result.get('companies', 0)} companies · "
        f"{result.get('total_alerts', 0)} alerts · "
        f"{result.get('total_sent', 0)} notifications sent"
    )
    return result


with DAG(
    dag_id="alert_evaluator",
    start_date=datetime(2024, 1, 1),
    schedule_interval="0 */4 * * *",   # every 4 hours
    catchup=False,
    tags=["newsconseen", "alerts", "notifications"],
    description=(
        "Evaluates all alert rules against analytics data and sends "
        "notifications to recipients via WhatsApp, email, and SMS."
    ),
):
    PythonOperator(
        task_id="evaluate_and_notify",
        python_callable=run_alert_evaluation,
    )
