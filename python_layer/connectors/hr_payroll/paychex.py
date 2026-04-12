# ==============================================================
# Paychex Connector — Sprint 3
# ==============================================================
# Syncs employees from Paychex Flex via Paychex Developer API
# (OAuth 2.0 client credentials or pre-obtained access token).
#
# credentials must contain:
#   client_id:           str  — Paychex app client ID
#   client_secret:       str  — Paychex app client secret
#   access_token:        str  — pre-obtained token (optional)
#   paychex_company_id:  str  — Paychex company ID (UUID)
#
# Maps to Newsconseen entities:
#   Worker → Person (person_type: staff)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

PAYCHEX_BASE     = "https://api.paychex.com"
PAYCHEX_AUTH_URL = "https://api.paychex.com/auth/oauth/v2/token"


class PaychexConnector(BaseConnector):
    """Paychex Flex API connector. Sprint 3."""

    def _get_token(self) -> str:
        if self.credentials.get("access_token"):
            return self.credentials["access_token"]
        resp = requests.post(
            PAYCHEX_AUTH_URL,
            data={"grant_type": "client_credentials"},
            auth=(
                self.credentials["client_id"],
                self.credentials["client_secret"],
            ),
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["access_token"]

    def extract(self) -> list[dict]:
        logger.info("PaychexConnector: extracting for company_id=%s", self.company_id)
        paychex_co = self.credentials.get("paychex_company_id", "")
        if not paychex_co:
            logger.error("PaychexConnector: paychex_company_id not in credentials")
            return []
        try:
            token = self._get_token()
            resp  = requests.get(
                f"{PAYCHEX_BASE}/companies/{paychex_co}/workers",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                },
                params={"page[size]": 200},
                timeout=30,
            )
            resp.raise_for_status()
            workers = resp.json().get("content", [])
            logger.info("PaychexConnector: extracted %d workers", len(workers))
            return workers
        except Exception as e:
            logger.error("PaychexConnector.extract failed — %s", e)
            return []

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people = []

        for w in raw_records:
            try:
                wid   = w.get("workerId", "")
                name  = w.get("name", {})
                first = name.get("firstName", "")
                last  = name.get("lastName", "")
                if not first and not last:
                    continue

                emp_type   = w.get("employmentType", "COMMON_LAW_EMPLOYEE").upper()
                eng_map    = {
                    "COMMON_LAW_EMPLOYEE": "employed",
                    "INDEPENDENT_CONTRACTOR": "contracted",
                }
                status_raw = w.get("workerStatus", {}).get("statusType", "ACTIVE")
                status     = "active" if status_raw == "ACTIVE" else "inactive"
                comms      = w.get("communications", [])
                email = next((c["dialData"] for c in comms if c.get("type") == "EMAIL"), None)
                phone = next((c["dialData"] for c in comms if c.get("type") == "PHONE"), None)

                people.append(self.scope({
                    "external_id":      f"paychex_{wid}",
                    "first_name":       first,
                    "last_name":        last,
                    "person_type":      "staff",
                    "person_subtype":   w.get("job", {}).get("title", "Employee") or "Employee",
                    "engagement_model": eng_map.get(emp_type, "employed"),
                    "status":           status,
                    "email":            email,
                    "phone":            phone,
                }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, w.get("workerId", ""))
            except Exception as e:
                logger.warning("PaychexConnector.transform: skipped — %s", e)

        logger.info("PaychexConnector.transform: %d people", len(people))
        return {"people": people, "enterprises": [], "products": [], "transactions": []}
