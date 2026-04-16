"""
tests/conftest.py
------------------
Shared pytest fixtures for python_layer tests.

Strategy: tests run without Railway/PostgreSQL/Base44 credentials.
  - FastAPI app is mounted in-process via TestClient (no network)
  - Database engine is mocked to None (exercises Base44 fallback paths)
  - External HTTP calls are patched at the requests/httpx level
  - Enrichment modules that call external APIs are monkey-patched

Run:
    cd python_layer
    pytest tests/ -v --tb=short
"""

import os
import sys
import pytest

# ── Ensure python_layer is on the path ───────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Stub mandatory env vars before any imports load Settings
_ENV_STUBS = {
    "BASE44_API_KEY":          "test-key",
    "BASE44_PEOPLE_URL":       "https://stub.example.com/people",
    "BASE44_ENTERPRISES_URL":  "https://stub.example.com/enterprises",
    "BASE44_PRODUCTS_URL":     "https://stub.example.com/products",
    "BASE44_TASKS_URL":        "https://stub.example.com/tasks",
    "BASE44_TRANSACTIONS_URL": "https://stub.example.com/transactions",
    "BASE44_SERVICES_URL":     "https://stub.example.com/services",
    "DATABASE_URL":            "",   # empty → get_engine_safe returns None
    "CRON_SECRET":             "test-secret",
    "ANTHROPIC_API_KEY":       "test-anthropic-key",
    "API_KEY":                 "",   # no auth gate in tests
}
for k, v in _ENV_STUBS.items():
    os.environ.setdefault(k, v)


# ── FastAPI test client ───────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def client():
    """
    In-process TestClient for the full FastAPI app.
    Database is unavailable (DATABASE_URL="") so all endpoints fall back
    to Base44 stubs or return graceful empty responses.
    """
    from fastapi.testclient import TestClient

    # Patch get_engine_safe to always return None so no DB is required
    import database
    database._engine = None

    from app import app
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# ── Minimal DataFrames for unit tests ────────────────────────────────────────
@pytest.fixture
def sample_people_df():
    import pandas as pd
    return pd.DataFrame([
        {
            "id": "p1", "company_id": "c1",
            "full_name": "Alice Wanjiru",
            "person_type": "client",
            "phone": "+254712345678",
            "email": "alice@example.com",
            "country": "KE",
        },
        {
            "id": "p2", "company_id": "c1",
            "full_name": "Bob Omondi",
            "person_type": "staff",
            "phone": "invalid",
            "email": "not-an-email",
            "country": "KE",
        },
    ])


@pytest.fixture
def sample_transactions_df():
    import pandas as pd
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    return pd.DataFrame([
        {
            "id": "t1", "company_id": "c1",
            "person_id": "p1",
            "amount": 500.0, "currency": "USD",
            "transaction_type": "sale",
            "status": "completed",
            "created_date": (now - timedelta(days=5)).isoformat(),
        },
        {
            "id": "t2", "company_id": "c1",
            "person_id": "p1",
            "amount": 500.0, "currency": "USD",
            "transaction_type": "sale",
            "status": "completed",
            "created_date": (now - timedelta(days=35)).isoformat(),
        },
        {
            "id": "t3", "company_id": "c1",
            "person_id": "p2",
            "amount": 9500.0, "currency": "USD",  # just_below_limit AML flag
            "transaction_type": "sale",
            "status": "completed",
            "created_date": (now - timedelta(days=2)).isoformat(),
        },
    ])


@pytest.fixture
def sample_products_df():
    import pandas as pd
    return pd.DataFrame([
        {
            "id": "prod1", "company_id": "c1",
            "item_name": "Paracetamol 500mg",
            "item_type": "physical",
            "item_class": "controlled",
            "price": 2.50, "currency": "USD",
            "stock_quantity": 100,
        },
    ])


@pytest.fixture
def sample_enterprises_df():
    import pandas as pd
    return pd.DataFrame([
        {
            "id": "e1", "company_id": "c1",
            "enterprise_name": "Acme Health Ltd",
            "enterprise_type": "commercial",
            "country": "KE",
        },
    ])
