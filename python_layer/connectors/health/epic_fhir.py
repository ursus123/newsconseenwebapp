# ==============================================================
# Epic FHIR Connector — Sprint 5
# ==============================================================
# Syncs patients and encounters from Epic EHR via the FHIR R4 API
# (SMART on FHIR OAuth 2.0).
#
# credentials must contain:
#   fhir_base_url:  str  — Epic FHIR base URL
#                          e.g. https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
#   access_token:   str  — SMART on FHIR access token
#
# Maps to Newsconseen entities:
#   Patient     → Person (person_type: client, subtype: Patient)
#   Practitioner → Person (person_type: staff, subtype: Clinician)
#   Organization → Enterprise (enterprise_type: commercial, tier: branch)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

GENDER_MAP = {"male": "male", "female": "female", "other": "other", "unknown": "unknown"}


class EpicFhirConnector(BaseConnector):
    """Epic FHIR R4 API connector. Sprint 5."""

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.credentials['access_token']}",
            "Accept": "application/fhir+json",
        }

    def _fhir_search(self, resource: str, params: dict = None) -> list[dict]:
        base    = self.credentials["fhir_base_url"].rstrip("/")
        records = []
        url     = f"{base}/{resource}"
        while url:
            resp = requests.get(url, headers=self._headers(), params=params, timeout=30)
            resp.raise_for_status()
            bundle = resp.json()
            for entry in bundle.get("entry", []):
                records.append(entry.get("resource", {}))
            # follow next page link
            url    = None
            params = None
            for link in bundle.get("link", []):
                if link.get("relation") == "next":
                    url = link["url"]
                    break
        return records

    def extract(self) -> list[dict]:
        logger.info("EpicFhirConnector: extracting for company_id=%s", self.company_id)
        try:
            patients = self._fhir_search("Patient", {"_count": 100, "active": "true"})
            logger.info("EpicFhirConnector: extracted %d patients", len(patients))
            return patients
        except Exception as e:
            logger.error("EpicFhirConnector.extract failed — %s", e)
            return []

    def _name(self, name_list: list) -> tuple[str, str]:
        for n in name_list or []:
            if n.get("use") in ("official", "usual", None):
                given  = " ".join(n.get("given") or [])
                family = n.get("family", "")
                return given, family
        return "", ""

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people = []

        for pt in raw_records:
            try:
                if pt.get("resourceType") != "Patient":
                    continue
                fhir_id = pt.get("id", "")
                first, last = self._name(pt.get("name"))
                if not first and not last:
                    continue

                telecoms = pt.get("telecom") or []
                phone = next((t["value"] for t in telecoms if t.get("system") == "phone"), None)
                email = next((t["value"] for t in telecoms if t.get("system") == "email"), None)

                people.append(self.scope({
                    "external_id":    f"epic_{fhir_id}",
                    "first_name":     first,
                    "last_name":      last,
                    "person_type":    "client",
                    "person_subtype": "Patient",
                    "status":         "active" if pt.get("active", True) else "inactive",
                    "gender":         GENDER_MAP.get(pt.get("gender", ""), "unknown"),
                    "date_of_birth":  pt.get("birthDate"),
                    "phone":          phone,
                    "email":          email,
                }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, pt.get("id", ""))
            except Exception as e:
                logger.warning("EpicFhirConnector.transform: skipped — %s", e)

        logger.info("EpicFhirConnector.transform: %d people", len(people))
        return {"people": people, "enterprises": [], "products": [], "transactions": []}
