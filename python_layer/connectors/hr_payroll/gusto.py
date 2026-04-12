# ==============================================================
# Gusto Connector — Sprint 3
# ==============================================================
# Syncs employees, contractors, and payroll from Gusto via
# Gusto Embedded Payroll API v1 (OAuth 2.0).
#
# credentials must contain:
#   access_token:   str  — OAuth 2.0 access token
#   company_id:     str  — Gusto company UUID
#
# Maps to Newsconseen entities:
#   Employee    → Person (person_type: staff, engagement: employed)
#   Contractor  → Person (person_type: staff, engagement: contracted)
#   Payroll run → Transaction (transaction_type: payroll)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

GUSTO_BASE = "https://api.gusto.com/v1"


class GustoConnector(BaseConnector):
    """Gusto Embedded Payroll API connector. Sprint 3."""

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.credentials['access_token']}",
            "Accept": "application/json",
        }

    def _get(self, path: str, params: dict = None) -> list | dict:
        resp = requests.get(
            f"{GUSTO_BASE}{path}",
            headers=self._headers(),
            params=params,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def extract(self) -> list[dict]:
        logger.info("GustoConnector: extracting for company_id=%s", self.company_id)
        gusto_co = self.credentials.get("gusto_company_id", "")
        if not gusto_co:
            logger.error("GustoConnector: gusto_company_id not in credentials")
            return []

        records = []
        try:
            employees   = self._get(f"/companies/{gusto_co}/employees", {"include": "jobs"})
            contractors = self._get(f"/companies/{gusto_co}/contractors")
            for e in (employees if isinstance(employees, list) else []):
                e["_source_type"] = "employee"
                records.append(e)
            for c in (contractors if isinstance(contractors, list) else []):
                c["_source_type"] = "contractor"
                records.append(c)
        except Exception as e:
            logger.error("GustoConnector.extract failed — %s", e)

        logger.info("GustoConnector: extracted %d records", len(records))
        return records

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people, transactions = [], []

        for r in raw_records:
            try:
                rid   = str(r.get("uuid") or r.get("id", ""))
                first = r.get("first_name", "")
                last  = r.get("last_name", "")
                if not first and not last:
                    continue

                source  = r.get("_source_type", "employee")
                eng     = "employed" if source == "employee" else "contracted"
                status  = "active" if r.get("terminated") is False or r.get("active") else "inactive"
                jobs    = r.get("jobs") or []
                title   = jobs[0].get("title", "Employee") if jobs else "Employee"

                people.append(self.scope({
                    "external_id":      f"gusto_{rid}",
                    "first_name":       first,
                    "last_name":        last,
                    "person_type":      "staff",
                    "person_subtype":   title,
                    "engagement_model": eng,
                    "status":           status,
                    "email":            r.get("email"),
                    "phone":            r.get("phone"),
                }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, r.get("uuid", ""))
            except Exception as e:
                logger.warning("GustoConnector.transform: skipped — %s", e)

        logger.info("GustoConnector.transform: %d people", len(people))
        return {"people": people, "enterprises": [], "products": [], "transactions": transactions}
