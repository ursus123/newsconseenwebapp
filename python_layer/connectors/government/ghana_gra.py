# ==============================================================
# Ghana GRA Connector — Sprint 8
# ==============================================================
# Validates business registration via the Ghana Revenue Authority
# (GRA) TIN Verification Service API.
#
# credentials must contain:
#   api_key:     str  — GRA API subscription key
#   target_tin:  str  — TIN to validate (or list of TINs)
#
# Maps to Newsconseen entities:
#   Registered entity → Enterprise (enterprise_type: commercial)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

GRA_BASE = "https://tinverification.gra.gov.gh/api"

ENTITY_TYPE_MAP = {
    "INDIVIDUAL":           ("commercial", "headquarters"),
    "COMPANY":              ("commercial", "headquarters"),
    "PARTNERSHIP":          ("commercial", "headquarters"),
    "TRUST":                ("trust",      "headquarters"),
    "NON_PROFIT":           ("nonprofit",  "headquarters"),
    "GOVERNMENT_AGENCY":    ("government", "headquarters"),
}


class GhanaGraConnector(BaseConnector):
    """Ghana GRA TIN Verification connector. Sprint 8."""

    def _headers(self) -> dict:
        return {
            "Ocp-Apim-Subscription-Key": self.credentials["api_key"],
            "Accept": "application/json",
        }

    def extract(self) -> list[dict]:
        logger.info("GhanaGraConnector: extracting for company_id=%s", self.company_id)
        tins = self.credentials.get("target_tin", "")
        if isinstance(tins, str):
            tins = [t.strip() for t in tins.split(",") if t.strip()]
        if not tins:
            logger.warning("GhanaGraConnector: no target_tin in credentials")
            return []

        records = []
        for tin in tins:
            try:
                resp = requests.get(
                    f"{GRA_BASE}/tin/verify",
                    headers=self._headers(),
                    params={"tin": tin},
                    timeout=15,
                )
                if resp.ok:
                    data = resp.json()
                    data["_queried_tin"] = tin
                    records.append(data)
                else:
                    logger.warning("GhanaGraConnector: TIN %s returned %d", tin, resp.status_code)
            except Exception as e:
                logger.error("GhanaGraConnector: failed for TIN %s — %s", tin, e)

        logger.info("GhanaGraConnector: extracted %d records", len(records))
        return records

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        enterprises = []

        for r in raw_records:
            try:
                tin  = r.get("tin") or r.get("_queried_tin", "")
                name = r.get("name") or r.get("entityName", "")
                if not name:
                    continue

                raw_type = (r.get("entityType") or "COMPANY").upper().replace(" ", "_")
                etype, tier = ENTITY_TYPE_MAP.get(raw_type, ("commercial", "headquarters"))

                enterprises.append(self.scope({
                    "external_id":      f"ghana_gra_{tin}",
                    "name":             name,
                    "enterprise_type":  etype,
                    "enterprise_tier":  tier,
                    "tax_id":           tin,
                    "operating_status": "open" if r.get("active") else "closed",
                    "status":           "active" if r.get("active") else "inactive",
                }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, r.get("_queried_tin", ""))
            except Exception as e:
                logger.warning("GhanaGraConnector.transform: skipped — %s", e)

        logger.info("GhanaGraConnector.transform: %d enterprises", len(enterprises))
        return {"people": [], "enterprises": enterprises, "products": [], "transactions": []}
