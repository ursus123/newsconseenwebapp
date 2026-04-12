# ==============================================================
# OpenMRS Connector — Sprint 5
# ==============================================================
# Syncs patients, encounters, and drug orders from OpenMRS via
# the OpenMRS REST API v1 (Basic Auth).
#
# credentials must contain:
#   base_url:   str  — OpenMRS instance URL (e.g. https://demo.openmrs.org/openmrs)
#   username:   str  — OpenMRS user with data access
#   password:   str  — OpenMRS password
#
# Maps to Newsconseen entities:
#   Patient     → Person (person_type: client)
#   Drug order  → Product (item_type: physical, item_class: controlled)
#   Visit       → Transaction (transaction_type: service_rendered)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

GENDER_MAP = {"M": "male", "F": "female", "O": "other", "U": "unknown"}


class OpenMrsConnector(BaseConnector):
    """OpenMRS REST API connector. Sprint 5."""

    def _auth(self):
        return (self.credentials["username"], self.credentials["password"])

    def _base(self) -> str:
        return self.credentials["base_url"].rstrip("/")

    def _get(self, path: str, params: dict = None) -> dict | list:
        resp = requests.get(
            f"{self._base()}/ws/rest/v1{path}",
            auth=self._auth(),
            headers={"Accept": "application/json"},
            params=params,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def _paginate(self, path: str, rep: str = "default") -> list[dict]:
        records, start = [], 0
        limit = 100
        while True:
            data  = self._get(path, {"v": rep, "startIndex": start, "limit": limit})
            batch = data.get("results", [])
            if not batch:
                break
            records.extend(batch)
            if not data.get("links") or len(batch) < limit:
                break
            start += limit
        return records

    def extract(self) -> list[dict]:
        logger.info("OpenMrsConnector: extracting for company_id=%s", self.company_id)
        try:
            patients = self._paginate("/patient", "full")
            logger.info("OpenMrsConnector: extracted %d patients", len(patients))
            return patients
        except Exception as e:
            logger.error("OpenMrsConnector.extract failed — %s", e)
            return []

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people = []

        for pt in raw_records:
            try:
                uid  = pt.get("uuid", "")
                pers = pt.get("person") or {}
                if not pers:
                    continue

                disp  = pers.get("display", "")
                parts = disp.split(" ", 1) if disp else ["", ""]
                first = parts[0]
                last  = parts[1] if len(parts) > 1 else ""

                attrs = {a.get("attributeType", {}).get("display", ""): a.get("value", "")
                         for a in (pers.get("attributes") or [])}

                people.append(self.scope({
                    "external_id":    f"openmrs_{uid}",
                    "first_name":     first,
                    "last_name":      last,
                    "person_type":    "client",
                    "person_subtype": "Patient",
                    "status":         "active" if not pers.get("voided") else "inactive",
                    "gender":         GENDER_MAP.get(pers.get("gender", ""), "unknown"),
                    "date_of_birth":  pers.get("birthdate"),
                    "phone":          attrs.get("Telephone Number"),
                }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, pt.get("uuid", ""))
            except Exception as e:
                logger.warning("OpenMrsConnector.transform: skipped — %s", e)

        logger.info("OpenMrsConnector.transform: %d people", len(people))
        return {"people": people, "enterprises": [], "products": [], "transactions": []}
