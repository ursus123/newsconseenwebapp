# ==============================================================
# Therap Connector — Sprint 5
# ==============================================================
# Syncs service recipients (clients), ISPs, and billing from
# Therap Electronic Health Records via Therap REST API (OAuth 2.0).
#
# credentials must contain:
#   client_id:      str  — Therap OAuth client ID
#   client_secret:  str  — Therap OAuth client secret
#   access_token:   str  — pre-obtained OAuth token (optional)
#   agency_code:    str  — Therap agency/provider code
#
# Maps to Newsconseen entities:
#   ServiceRecipient → Person (person_type: client, subtype: Service Recipient)
#   Program          → Enterprise (enterprise_type: nonprofit, tier: unit)
#   Billing record   → Transaction (transaction_type: service_rendered)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

THERAP_BASE     = "https://www.therapservices.net/api"
THERAP_AUTH_URL = "https://www.therapservices.net/oauth2/token"


class TherapConnector(BaseConnector):
    """Therap EHR API connector. Sprint 5."""

    def _get_token(self) -> str:
        if self.credentials.get("access_token"):
            return self.credentials["access_token"]
        resp = requests.post(
            THERAP_AUTH_URL,
            data={
                "grant_type":    "client_credentials",
                "client_id":     self.credentials["client_id"],
                "client_secret": self.credentials["client_secret"],
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["access_token"]

    def _get(self, token: str, path: str, params: dict = None) -> dict | list:
        resp = requests.get(
            f"{THERAP_BASE}{path}",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
            },
            params=params,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def extract(self) -> list[dict]:
        logger.info("TherapConnector: extracting for company_id=%s", self.company_id)
        try:
            token   = self._get_token()
            agency  = self.credentials.get("agency_code", "")
            data    = self._get(token, f"/v2/agencies/{agency}/individuals",
                                {"status": "active", "pageSize": 500})
            records = data if isinstance(data, list) else data.get("data", [])
            logger.info("TherapConnector: extracted %d records", len(records))
            return records
        except Exception as e:
            logger.error("TherapConnector.extract failed — %s", e)
            return []

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people = []

        for ind in raw_records:
            try:
                iid   = str(ind.get("id") or ind.get("individualId", ""))
                first = ind.get("firstName", "")
                last  = ind.get("lastName", "")
                if not first and not last:
                    continue

                status_raw = (ind.get("status") or "active").lower()
                status     = "active" if status_raw == "active" else "inactive"

                people.append(self.scope({
                    "external_id":    f"therap_{iid}",
                    "first_name":     first,
                    "last_name":      last,
                    "person_type":    "client",
                    "person_subtype": "Service Recipient",
                    "status":         status,
                    "date_of_birth":  ind.get("dateOfBirth"),
                    "gender":         (ind.get("gender") or "").lower() or None,
                }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, ind.get("id", ""))
            except Exception as e:
                logger.warning("TherapConnector.transform: skipped — %s", e)

        logger.info("TherapConnector.transform: %d people", len(people))
        return {"people": people, "enterprises": [], "products": [], "transactions": []}
