📘 Newsconseen Python Layer — Analytics & ETL Microservice
The Newsconseen Python Layer is a modular analytics engine that powers the Newsconseen platform. It provides:

Extract–Transform–Load (ETL) pipelines

A FastAPI microservice

Airflow DAG orchestration

Superset‑ready analytics tables

Optional geospatial enrichment

Clean, auditable, regulator‑friendly outputs

This layer integrates operational data from Base44, transforms it into analytics summaries, and loads it into a dedicated analytics database for dashboards and reporting.

🏗️ Architecture Overview
Code
Base44 → Python ETL → Airflow → Analytics DB → Superset → Base44 UI
Components inside python_layer/:
