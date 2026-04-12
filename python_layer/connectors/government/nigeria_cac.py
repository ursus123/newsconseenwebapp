# ==============================================================
# Nigeria CAC Connector — Sprint 8
# ==============================================================
# Validates business registration via the Nigeria Corporate
# Affairs Commission (CAC) Public Search API.
#
# credentials must contain:
#   api_key:      str  — CAC API key (from CAC developer portal)
#   target_rc:    str  — RC number(s) to validate (comma-separated)
#
# Maps to Newsconseen entities:
#   Registered company → Enterprise (enterprise_type: commercial)
#   Director           → Person (person_type: contact)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

CAC_BASE = "https://search.cac.gov.ng/home/api/v1"

COMPANY_TYPE_MAP = {
    "PRIVATE LIMITED COMPANY":  ("commercial", "headquarters"),
    "PUBLIC LIMITED COMPANY":   ("commercial", "headquarters"),
    "BUSINESS NAME":            ("commercial", "headquarters"),
    "INCORPORATED TRUSTEE":     ("nonprofit",  "headquarters"),
    "LIMITED LIABILITY PARTNERSHIP": ("commercial", "headquarters"),
}


class NigeriaCacConnector(BaseConnector):
    """Nigeria CAC Public Search API connector. Sprint 8."""

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.credentials['api_key']}",
            "Accept": "application/json",
        }

    def extract(self) -> list[dict]:
        logger.info("NigeriaCacConnector: extracting for company_id=%s", self.company_id)
        rcs = self.credentials.get("target_rc", "")
        if isinstance(rcs, str):
            rcs = [r.strip() for r in rcs.split(",") if r.strip()]
        if not rcs:
            logger.warning("NigeriaCacConnector: no target_rc in credentials")
            return []

        records = []
        for rc in rcs:
            try:
                resp = requests.get(
                    f"{CAC_BASE}/company/{rc}",
                    headers=self._headers(),
                    timeout=15,
                )
                if resp.ok:
                    data = resp.json()
                    data["_queried_rc"] = rc
                    records.append(data)
                else:
                    logger.warning("NigeriaCacConnector: RC %s returned %d", rc, resp.status_code)
            except Exception as e:
                logger.error("NigeriaCacConnector: failed for RC %s — %s", rc, e)

        logger.info("NigeriaCacConnector: extracted %d records", len(records))
        return records

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        enterprises, people = [], []

        for r in raw_records:
            try:
                rc   = r.get("rcNumber") or r.get("_queried_rc", "")
                name = r.get("companyName") or r.get("name", "")
                if not name:
                    continue

                raw_type = (r.get("companyType") or "PRIVATE LIMITED COMPANY").upper()
                etype, tier = COMPANY_TYPE_MAP.get(raw_type, ("commercial", "headquarters"))
                status_raw  = (r.get("status") or "ACTIVE").upper()

                enterprises.append(self.scope({
                    "external_id":      f"nigeria_cac_{rc}",
                    "name":             name,
                    "enterprise_type":  etype,
                    "enterprise_tier":  tier,
                    "tax_id":           rc,
                    "operating_status": "open" if status_raw == "ACTIVE" else "closed",
                    "status":           "active" if status_raw == "ACTIVE" else "inactive",
                    "address":          r.get("address"),
                }))

                # directors
                for d in r.get("directors") or []:
                    fname = d.get("firstname", "") or d.get("firstName", "")
                    lname = d.get("surname", "") or d.get("lastName", "")
                    if not fname and not lname:
                        continue
                    did = d.get("id") or d.get("directorId", "")
                    people.append(self.scope({
                        "external_id":    f"nigeria_cac_dir_{did}",
                        "first_name":     fname,
                        "last_name":      lname,
                        "person_type":    "contact",
                        "person_subtype": "Director",
                        "status":         "active",
                    }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, r.get("_queried_rc", ""))
            except Exception as e:
                logger.warning("NigeriaCacConnector.transform: skipped — %s", e)

        logger.info(
            "NigeriaCacConnector.transform: %d enterprises, %d people",
            len(enterprises), len(people),
        )
        return {"people": people, "enterprises": enterprises, "products": [], "transactions": []}
