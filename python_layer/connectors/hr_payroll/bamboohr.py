# ==============================================================
# BambooHR Connector — Sprint 3
# ==============================================================
# Syncs employees from BambooHR via the BambooHR REST API.
# Uses HTTP Basic Auth: API key as username, "x" as password.
#
# credentials must contain:
#   api_key:        str  — BambooHR API key
#   subdomain:      str  — company subdomain (e.g. "acme" for acme.bamboohr.com)
#
# Maps to Newsconseen entities:
#   Employee → Person (person_type: staff)
#   Department → Enterprise (enterprise_type: commercial, tier: department)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)


class BambooHRConnector(BaseConnector):
    """BambooHR REST API connector. Sprint 3."""

    FIELDS = (
        "id,firstName,lastName,jobTitle,department,division,"
        "employmentHistoryStatus,workEmail,mobilePhone,hireDate,"
        "terminationDate,employeeNumber,location"
    )

    def _base_url(self) -> str:
        subdomain = self.credentials["subdomain"]
        return f"https://api.bamboohr.com/api/gateway.php/{subdomain}/v1"

    def _auth(self):
        return (self.credentials["api_key"], "x")

    def extract(self) -> list[dict]:
        logger.info("BambooHRConnector: extracting for company_id=%s", self.company_id)
        try:
            resp = requests.get(
                f"{self._base_url()}/employees/directory",
                auth=self._auth(),
                headers={"Accept": "application/json"},
                timeout=30,
            )
            resp.raise_for_status()
            employees = resp.json().get("employees", [])
            logger.info("BambooHRConnector: extracted %d employees", len(employees))
            return employees
        except Exception as e:
            logger.error("BambooHRConnector.extract failed — %s", e)
            return []

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people, enterprises = [], []
        seen_depts = set()

        for emp in raw_records:
            try:
                eid   = str(emp.get("id", ""))
                first = emp.get("firstName", "")
                last  = emp.get("lastName", "")
                if not first and not last:
                    continue

                status_raw = (emp.get("employmentHistoryStatus") or "Active").lower()
                status     = "active" if "active" in status_raw else "inactive"
                dept       = emp.get("department", "")

                people.append(self.scope({
                    "external_id":      f"bamboohr_{eid}",
                    "first_name":       first,
                    "last_name":        last,
                    "person_type":      "staff",
                    "person_subtype":   emp.get("jobTitle", "Employee") or "Employee",
                    "engagement_model": "employed",
                    "status":           status,
                    "email":            emp.get("workEmail"),
                    "phone":            emp.get("mobilePhone"),
                }))

                if dept and dept not in seen_depts:
                    seen_depts.add(dept)
                    enterprises.append(self.scope({
                        "external_id":      f"bamboohr_dept_{dept.lower().replace(' ', '_')}",
                        "name":             dept,
                        "enterprise_type":  "commercial",
                        "enterprise_tier":  "department",
                        "operating_status": "open",
                        "status":           "active",
                    }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, emp.get("id", ""))
            except Exception as e:
                logger.warning("BambooHRConnector.transform: skipped — %s", e)

        logger.info(
            "BambooHRConnector.transform: %d people, %d departments",
            len(people), len(enterprises),
        )
        return {"people": people, "enterprises": enterprises, "products": [], "transactions": []}
