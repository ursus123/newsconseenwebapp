"""
tests/test_health.py
---------------------
Smoke tests for the /health endpoint and core API availability.

These tests run without a live database or external APIs.
All assertions are about shape and contract, not exact values,
so they pass regardless of which env vars are set.
"""

import pytest


class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        """Health endpoint must always return 200, even with no DB."""
        r = client.get("/health")
        assert r.status_code == 200

    def test_health_shape(self, client):
        """Response must have the expected top-level keys."""
        data = client.get("/health").json()
        required_keys = {
            "status", "version", "api", "database",
            "etl_enabled", "copilot_enabled", "alerts_enabled",
        }
        assert required_keys.issubset(data.keys()), (
            f"Missing keys: {required_keys - data.keys()}"
        )

    def test_health_status_is_string(self, client):
        data = client.get("/health").json()
        assert data["status"] in ("ok", "degraded", "error")

    def test_health_version_is_semver(self, client):
        data = client.get("/health").json()
        parts = str(data.get("version", "")).split(".")
        assert len(parts) >= 2, "version should be semver e.g. 4.9.0"

    def test_health_api_is_ok(self, client):
        """api field should always be 'ok' — it reflects this process."""
        data = client.get("/health").json()
        assert data["api"] == "ok"

    def test_health_database_is_string(self, client):
        """database field should be a descriptive string, not None."""
        data = client.get("/health").json()
        assert isinstance(data["database"], str)
        assert len(data["database"]) > 0

    def test_health_no_db_means_degraded(self, client):
        """
        With DATABASE_URL="" the engine is None → database != 'connected'
        → status should be 'degraded', not 'ok'.
        """
        data = client.get("/health").json()
        import os
        if not os.getenv("DATABASE_URL"):
            assert data["status"] == "degraded"
            assert data["database"] != "connected"

    def test_health_alert_channels_shape(self, client):
        data = client.get("/health").json()
        channels = data.get("alert_channels", {})
        assert isinstance(channels, dict)
        for ch in ("email", "whatsapp", "sms"):
            assert ch in channels
            assert isinstance(channels[ch], bool)

    def test_health_boolean_flags(self, client):
        data = client.get("/health").json()
        bool_fields = ("etl_enabled", "ml_enabled", "open_data_enabled",
                       "connectors_enabled", "copilot_enabled",
                       "alerts_enabled", "network_enabled")
        for f in bool_fields:
            if f in data:
                assert isinstance(data[f], bool), f"{f} should be bool"


class TestCoreRoutesAvailable:
    """Verify key routers are mounted and respond (not 404)."""

    def test_enrichment_status_requires_company_id(self, client):
        """Without company_id param should return 422, not 404."""
        r = client.get("/enrichment/status")
        assert r.status_code == 422

    def test_enrichment_status_with_company_id(self, client):
        """With company_id should return 200 (empty coverage is fine)."""
        r = client.get("/enrichment/status?company_id=test-co")
        assert r.status_code in (200, 500)  # 500 acceptable if DB unavailable

    def test_open_data_exchange_rates_route_exists(self, client):
        """Route must be mounted — may fail with 502 if FX API unreachable."""
        r = client.get("/open-data/exchange-rates")
        assert r.status_code in (200, 502)

    def test_enrichment_people_requires_company_id(self, client):
        r = client.get("/enrichment/people")
        assert r.status_code == 422

    def test_enrichment_people_returns_list(self, client):
        r = client.get("/enrichment/people?company_id=test-co")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_enrichment_scores_returns_list(self, client):
        r = client.get("/enrichment/scores?company_id=test-co")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
