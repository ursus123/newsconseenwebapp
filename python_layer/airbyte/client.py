# ==============================================================
# Airbyte API Client
# ==============================================================
# Wraps the Airbyte REST API v1.
#
# Configure in Railway:
#   AIRBYTE_API_URL       — e.g. http://localhost:8000 (self-hosted)
#                           or https://api.airbyte.com (cloud)
#   AIRBYTE_API_KEY       — Airbyte Cloud API key (or Basic auth for self-hosted)
#   AIRBYTE_WORKSPACE_ID  — your Airbyte workspace ID
# ==============================================================

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


class AirbyteClient:
    """
    Thin client for the Airbyte REST API.

    Supports both Airbyte Cloud (api.airbyte.com) and
    self-hosted Airbyte (localhost:8000 or Railway service).
    """

    def __init__(self):
        self.api_url      = os.getenv("AIRBYTE_API_URL", "").rstrip("/")
        self.api_key      = os.getenv("AIRBYTE_API_KEY", "")
        self.workspace_id = os.getenv("AIRBYTE_WORKSPACE_ID", "")

    @property
    def _available(self) -> bool:
        return bool(self.api_url)

    @property
    def _headers(self) -> dict:
        h = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def _get(self, path: str, params: dict = None) -> dict:
        import requests
        url = f"{self.api_url}{path}"
        resp = requests.get(url, headers=self._headers, params=params or {}, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, body: dict = None) -> dict:
        import requests
        url = f"{self.api_url}{path}"
        resp = requests.post(url, headers=self._headers, json=body or {}, timeout=15)
        resp.raise_for_status()
        return resp.json()

    # ── Workspace ────────────────────────────────────────────────────────────

    def list_workspaces(self) -> list:
        return self._get("/v1/workspaces").get("workspaces", [])

    # ── Sources ──────────────────────────────────────────────────────────────

    def list_sources(self) -> list:
        params = {"workspaceId": self.workspace_id} if self.workspace_id else {}
        return self._get("/v1/sources", params).get("sources", [])

    def get_source(self, source_id: str) -> dict:
        return self._get(f"/v1/sources/{source_id}")

    def list_source_definitions(self) -> list:
        return self._get("/v1/source_definitions").get("sourceDefinitions", [])

    # ── Destinations ─────────────────────────────────────────────────────────

    def list_destinations(self) -> list:
        params = {"workspaceId": self.workspace_id} if self.workspace_id else {}
        return self._get("/v1/destinations", params).get("destinations", [])

    # ── Connections ──────────────────────────────────────────────────────────

    def list_connections(self) -> list:
        params = {"workspaceId": self.workspace_id} if self.workspace_id else {}
        return self._get("/v1/connections", params).get("connections", [])

    def get_connection(self, connection_id: str) -> dict:
        return self._get(f"/v1/connections/{connection_id}")

    # ── Jobs (sync control) ──────────────────────────────────────────────────

    def trigger_sync(self, connection_id: str) -> dict:
        """Trigger a manual sync for a connection. Returns job details."""
        return self._post("/v1/jobs", {
            "connectionId": connection_id,
            "jobType":      "sync",
        })

    def trigger_reset(self, connection_id: str) -> dict:
        """Reset (full re-sync) a connection."""
        return self._post("/v1/jobs", {
            "connectionId": connection_id,
            "jobType":      "reset_connection",
        })

    def get_job(self, job_id: str) -> dict:
        return self._get(f"/v1/jobs/{job_id}")

    def list_jobs(self, connection_id: str, limit: int = 10) -> list:
        return self._get("/v1/jobs", {
            "connectionId": connection_id,
            "limit":        limit,
        }).get("jobs", [])

    # ── Streams ──────────────────────────────────────────────────────────────

    def get_stream_schema(self, source_id: str) -> dict:
        """Discover the schema of all streams for a source."""
        return self._post("/v1/sources/discover_schema", {"sourceId": source_id})

    # ── Health ───────────────────────────────────────────────────────────────

    def health(self) -> dict:
        """Check if the Airbyte API is reachable."""
        if not self._available:
            return {"ok": False, "reason": "AIRBYTE_API_URL not set"}
        try:
            self._get("/v1/health")
            return {"ok": True, "api_url": self.api_url}
        except Exception as e:
            return {"ok": False, "reason": str(e)}
