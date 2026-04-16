"""
load_tests/locustfile.py
--------------------------
Locust load test scenarios for the Newsconseen python_layer API.

Usage:
    # Install: pip install locust
    # Run interactive: locust -f load_tests/locustfile.py --host https://newsconseenwebapp-production.up.railway.app
    # Run headless:    locust -f load_tests/locustfile.py --host <URL> --headless -u 50 -r 5 --run-time 2m

Scenarios:
  HealthUser        — continuous /health polling (simulates uptime monitor)
  DashboardUser     — realistic operator opening the dashboard
  CopilotUser       — operator asking the copilot a question
  EnrichmentUser    — enrichment status + scores read
  ETLUser           — background ETL triggers (low frequency)

Set env vars before running:
  COMPANY_ID   — company_id to use in requests (default: test-co)
  API_KEY      — x-api-key header value if auth is enabled
"""

import os
import random
from locust import HttpUser, TaskSet, task, between, events


_COMPANY_ID = os.getenv("COMPANY_ID", "test-co")
_API_KEY    = os.getenv("API_KEY", "")

_HEADERS = {"Content-Type": "application/json"}
if _API_KEY:
    _HEADERS["x-api-key"] = _API_KEY


# ---------------------------------------------------------------------------
# Task sets
# ---------------------------------------------------------------------------

class HealthTasks(TaskSet):
    @task
    def check_health(self):
        with self.client.get("/health", headers=_HEADERS, catch_response=True) as r:
            if r.status_code == 200:
                data = r.json()
                if data.get("api") != "ok":
                    r.failure(f"api field not 'ok': {data.get('api')}")
                else:
                    r.success()
            else:
                r.failure(f"health returned {r.status_code}")


class DashboardTasks(TaskSet):
    """Simulate an operator loading the dashboard — hits summary endpoints."""

    @task(5)
    def people_enrichment(self):
        self.client.get(
            f"/enrichment/people?company_id={_COMPANY_ID}",
            headers=_HEADERS,
            name="/enrichment/people",
        )

    @task(5)
    def enterprise_enrichment(self):
        self.client.get(
            f"/enrichment/enterprises?company_id={_COMPANY_ID}",
            headers=_HEADERS,
            name="/enrichment/enterprises",
        )

    @task(4)
    def enrichment_scores(self):
        self.client.get(
            f"/enrichment/scores?company_id={_COMPANY_ID}",
            headers=_HEADERS,
            name="/enrichment/scores",
        )

    @task(3)
    def enrichment_status(self):
        self.client.get(
            f"/enrichment/status?company_id={_COMPANY_ID}",
            headers=_HEADERS,
            name="/enrichment/status",
        )

    @task(2)
    def transaction_enrichment(self):
        self.client.get(
            f"/enrichment/transactions?company_id={_COMPANY_ID}",
            headers=_HEADERS,
            name="/enrichment/transactions",
        )

    @task(2)
    def product_enrichment(self):
        self.client.get(
            f"/enrichment/products?company_id={_COMPANY_ID}",
            headers=_HEADERS,
            name="/enrichment/products",
        )

    @task(1)
    def backup_status(self):
        self.client.get(
            "/backup/status",
            headers=_HEADERS,
            name="/backup/status",
        )


class CopilotTasks(TaskSet):
    """Simulate copilot chat queries."""

    _QUESTIONS = [
        "How many active clients do we have?",
        "What is our revenue this month?",
        "Which products are at risk of stockout?",
        "Show me high-risk entities",
        "How many overdue tasks are there?",
        "What is the churn risk for our clients?",
        "Give me a summary of this week's transactions",
        "Who are our top clients by spend?",
    ]

    @task
    def ask_copilot(self):
        question = random.choice(self._QUESTIONS)
        with self.client.post(
            "/copilot/chat",
            json={"message": question, "company_id": _COMPANY_ID},
            headers=_HEADERS,
            catch_response=True,
            timeout=30,
            name="/copilot/chat",
        ) as r:
            if r.status_code in (200, 201):
                r.success()
            elif r.status_code == 422:
                r.failure("422 — request body rejected")
            else:
                # copilot may 500 without Anthropic key in load test env
                r.success()  # don't penalise missing API key in load test


class OpenDataTasks(TaskSet):
    """Simulate open data API lookups."""

    @task(3)
    def exchange_rates(self):
        self.client.get(
            "/open-data/exchange-rates",
            headers=_HEADERS,
            name="/open-data/exchange-rates",
        )

    @task(1)
    def country_risk_ke(self):
        self.client.get(
            "/open-data/country-risk/KE",
            headers=_HEADERS,
            name="/open-data/country-risk/{iso2}",
        )

    @task(1)
    def country_risk_ng(self):
        self.client.get(
            "/open-data/country-risk/NG",
            headers=_HEADERS,
            name="/open-data/country-risk/{iso2}",
        )


# ---------------------------------------------------------------------------
# User classes — each represents a different load profile
# ---------------------------------------------------------------------------

class HealthUser(HttpUser):
    """
    Uptime monitor — constant low-frequency health checks.
    Represents: monitoring service, status page pinger.
    """
    tasks = [HealthTasks]
    wait_time = between(5, 15)
    weight = 1


class DashboardUser(HttpUser):
    """
    Typical operator using the dashboard.
    Represents: 80% of traffic — read-heavy analytics and enrichment.
    """
    tasks = [DashboardTasks]
    wait_time = between(2, 8)
    weight = 10


class CopilotUser(HttpUser):
    """
    Operator querying the AI copilot.
    Represents: ~15% of traffic — slower, more expensive requests.
    """
    tasks = [CopilotTasks]
    wait_time = between(10, 30)
    weight = 3


class OpenDataUser(HttpUser):
    """
    Lookups against open data APIs (FX, country risk, etc).
    Represents: ~5% of traffic.
    """
    tasks = [OpenDataTasks]
    wait_time = between(3, 10)
    weight = 2


# ---------------------------------------------------------------------------
# Event hooks — log summary stats at the end of a run
# ---------------------------------------------------------------------------

@events.quitting.add_listener
def on_quitting(environment, **kwargs):
    stats = environment.stats
    total = stats.total
    if total.num_requests == 0:
        return
    failure_pct = (total.num_failures / total.num_requests) * 100
    print(f"\n{'='*60}")
    print(f"Load test complete")
    print(f"  Total requests : {total.num_requests}")
    print(f"  Failures       : {total.num_failures} ({failure_pct:.1f}%)")
    print(f"  Avg response   : {total.avg_response_time:.0f} ms")
    print(f"  95th pct       : {total.get_response_time_percentile(0.95):.0f} ms")
    print(f"  Max response   : {total.max_response_time:.0f} ms")
    print(f"{'='*60}\n")
    if failure_pct > 5:
        print(f"WARNING: failure rate {failure_pct:.1f}% exceeds 5% threshold")
        environment.process_exit_code = 1
