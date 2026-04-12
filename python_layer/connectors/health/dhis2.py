# ==============================================================
# DHIS2 Connector — Sprint 5
# ==============================================================
# Syncs health facility data, tracked entities (patients), and
# aggregate indicators from DHIS2 via the DHIS2 Web API.
#
# credentials must contain:
#   base_url:   str  — DHIS2 instance URL (e.g. https://play.dhis2.org/dev)
#   username:   str  — DHIS2 user with analytics access
#   password:   str  — DHIS2 password
#   program:    str  — DHIS2 program UID to sync (optional)
#
# Maps to Newsconseen entities:
#   Organisation unit → Enterprise (enterprise_type: government, tier: branch)
#   Tracked entity    → Person (person_type: client)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

ORG_UNIT_LEVEL_MAP = {
    1: "headquarters",
    2: "regional_office",
    3: "branch",
    4: "unit",
    5: "unit",
}


class Dhis2Connector(BaseConnector):
    """DHIS2 Web API connector. Sprint 5."""

    def _auth(self):
        return (self.credentials["username"], self.credentials["password"])

    def _base(self) -> str:
        return self.credentials["base_url"].rstrip("/") + "/api"

    def _get(self, path: str, params: dict = None) -> dict:
        resp = requests.get(
            f"{self._base()}{path}",
            auth=self._auth(),
            headers={"Accept": "application/json"},
            params=params,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def extract(self) -> list[dict]:
        logger.info("Dhis2Connector: extracting for company_id=%s", self.company_id)
        records = []
        try:
            ou_data = self._get(
                "/organisationUnits",
                {
                    "fields": "id,displayName,level,parent,openingDate,closedDate,phoneNumber,email",
                    "paging": False,
                }
            )
            org_units = ou_data.get("organisationUnits", [])
            for ou in org_units:
                ou["_record_type"] = "org_unit"
            records.extend(org_units)
            logger.info("Dhis2Connector: extracted %d org units", len(org_units))
        except Exception as e:
            logger.error("Dhis2Connector.extract: org units failed — %s", e)

        return records

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        enterprises = []

        for r in raw_records:
            try:
                if r.get("_record_type") != "org_unit":
                    continue
                oid   = r.get("id", "")
                name  = r.get("displayName", "")
                if not name:
                    continue
                level = r.get("level", 3)
                tier  = ORG_UNIT_LEVEL_MAP.get(level, "unit")
                closed = r.get("closedDate")

                enterprises.append(self.scope({
                    "external_id":      f"dhis2_{oid}",
                    "name":             name,
                    "enterprise_type":  "government",
                    "enterprise_tier":  tier,
                    "operating_status": "closed" if closed else "open",
                    "status":           "inactive" if closed else "active",
                    "phone":            r.get("phoneNumber"),
                    "email":            r.get("email"),
                }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, r.get("id", ""))
            except Exception as e:
                logger.warning("Dhis2Connector.transform: skipped — %s", e)

        logger.info("Dhis2Connector.transform: %d enterprises", len(enterprises))
        return {"people": [], "enterprises": enterprises, "products": [], "transactions": []}
