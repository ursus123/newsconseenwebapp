# ==============================================================
# ADP Connector — Sprint 3
# ==============================================================
# Syncs employee records from ADP Workforce Now via ADP
# Marketplace API v2 using OAuth 2.0 client credentials.
#
# credentials must contain:
#   client_id:          str  — ADP Marketplace app client ID
#   client_secret:      str  — ADP Marketplace app client secret
#   adp_company_oid:    str  — ADP organisation OID (optional filter)
#
# Maps to Newsconseen entities:
#   Worker     → Person (person_type: staff)
#   Department → Enterprise (enterprise_type: commercial, tier: department)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

ADP_BASE        = "https://api.adp.com"
ADP_AUTH_URL    = "https://accounts.adp.com/auth/oauth/v2/token"
ADP_WORKERS_URL = "/hr/v2/workers"


class AdpConnector(BaseConnector):
    """ADP Workforce Now API connector. Sprint 3."""

    def _get_token(self) -> str:
        resp = requests.post(
            ADP_AUTH_URL,
            data={"grant_type": "client_credentials"},
            auth=(
                self.credentials["client_id"],
                self.credentials["client_secret"],
            ),
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["access_token"]

    def _paginate(self, token: str, url: str) -> list[dict]:
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }
        records, skip, limit = [], 0, 100
        while True:
            resp = requests.get(
                f"{ADP_BASE}{url}",
                headers=headers,
                params={"$top": limit, "$skip": skip},
                timeout=30,
            )
            if resp.status_code == 404:
                break
            resp.raise_for_status()
            data  = resp.json()
            batch = data.get("workers") or []
            if not batch:
                break
            records.extend(batch)
            if len(batch) < limit:
                break
            skip += limit
        return records

    def extract(self) -> list[dict]:
        logger.info("AdpConnector: extracting for company_id=%s", self.company_id)
        try:
            token = self._get_token()
        except Exception as e:
            logger.error("AdpConnector: auth failed — %s", e)
            return []
        workers = self._paginate(token, ADP_WORKERS_URL)
        logger.info("AdpConnector: extracted %d workers", len(workers))
        return workers

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people, enterprises = [], []
        seen_depts = set()

        for w in raw_records:
            try:
                pid  = w.get("associateOID") or (w.get("workerID") or {}).get("idValue", "")
                name = (w.get("person") or {}).get("legalName") or {}
                first, last = name.get("givenName", ""), name.get("familyName1", "")
                if not first and not last:
                    continue

                work  = (w.get("workAssignments") or [{}])[0]
                dept  = (work.get("homeOrganizationalUnits") or [{}])[0].get(
                    "nameCode", {}
                ).get("longName", "")
                title = (work.get("jobTitle") or "").strip() or "Employee"
                is_term = (work.get("workerTypeCode") or {}).get("codeValue") == "T"
                status  = "inactive" if is_term else "active"

                emails = [
                    c.get("emailAddress", "")
                    for c in ((w.get("person") or {}).get("emails") or [])
                    if c.get("emailAddress")
                ]
                phones = [
                    c.get("formattedNumber", "")
                    for c in ((w.get("person") or {}).get("phones") or [])
                    if c.get("formattedNumber")
                ]

                people.append(self.scope({
                    "external_id":      f"adp_{pid}",
                    "first_name":       first,
                    "last_name":        last,
                    "person_type":      "staff",
                    "person_subtype":   title,
                    "engagement_model": "employed",
                    "status":           status,
                    "email":            emails[0] if emails else None,
                    "phone":            phones[0] if phones else None,
                }))

                if dept and dept not in seen_depts:
                    seen_depts.add(dept)
                    enterprises.append(self.scope({
                        "external_id":      f"adp_dept_{dept.lower().replace(' ', '_')}",
                        "name":             dept,
                        "enterprise_type":  "commercial",
                        "enterprise_tier":  "department",
                        "operating_status": "open",
                        "status":           "active",
                    }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, w.get("associateOID", ""))
            except Exception as e:
                logger.warning("AdpConnector.transform: skipped — %s", e)

        logger.info(
            "AdpConnector.transform: %d people, %d departments",
            len(people), len(enterprises),
        )
        return {"people": people, "enterprises": enterprises, "products": [], "transactions": []}
