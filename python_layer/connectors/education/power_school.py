# ==============================================================
# PowerSchool Connector — Sprint 6
# ==============================================================
# Syncs students, staff, and enrollment from PowerSchool via the
# PowerSchool REST API (OAuth 2.0 client credentials).
#
# credentials must contain:
#   client_id:     str  — PowerSchool plugin client ID
#   client_secret: str  — PowerSchool plugin client secret
#   base_url:      str  — PowerSchool server URL
#                         e.g. https://district.powerschool.com
#
# Maps to Newsconseen entities:
#   Student → Person (person_type: client, subtype: Student)
#   Staff   → Person (person_type: staff, subtype: Teacher)
#   School  → Enterprise (enterprise_type: nonprofit, tier: branch)
# ==============================================================

import logging
import base64

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)


class PowerSchoolConnector(BaseConnector):
    """PowerSchool API connector. Sprint 6."""

    def _get_token(self) -> str:
        creds   = base64.b64encode(
            f"{self.credentials['client_id']}:{self.credentials['client_secret']}".encode()
        ).decode()
        base    = self.credentials["base_url"].rstrip("/")
        resp    = requests.post(
            f"{base}/oauth/access_token",
            headers={
                "Authorization": f"Basic {creds}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "client_credentials"},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["access_token"]

    def _get(self, token: str, path: str, params: dict = None) -> dict:
        base = self.credentials["base_url"].rstrip("/")
        resp = requests.get(
            f"{base}{path}",
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
        logger.info("PowerSchoolConnector: extracting for company_id=%s", self.company_id)
        try:
            token   = self._get_token()
        except Exception as e:
            logger.error("PowerSchoolConnector: auth failed — %s", e)
            return []

        records = []
        try:
            data = self._get(token, "/ws/v1/district/student",
                             {"pagesize": 500, "expansions": "contact_info"})
            students = data.get("students", {}).get("student", [])
            for s in students:
                s["_record_type"] = "student"
            records.extend(students)
            logger.info("PowerSchoolConnector: extracted %d students", len(students))
        except Exception as e:
            logger.error("PowerSchoolConnector: students failed — %s", e)

        try:
            data  = self._get(token, "/ws/v1/district/staff",
                              {"pagesize": 500})
            staff = data.get("staff", {}).get("staff_member", [])
            for s in staff:
                s["_record_type"] = "staff"
            records.extend(staff)
            logger.info("PowerSchoolConnector: extracted %d staff", len(staff))
        except Exception as e:
            logger.error("PowerSchoolConnector: staff failed — %s", e)

        return records

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people = []

        for r in raw_records:
            try:
                rtype = r.get("_record_type", "student")
                if rtype == "student":
                    sid   = str(r.get("id") or r.get("local_id", ""))
                    name  = r.get("name", {})
                    first = name.get("first_name", "") or r.get("first_name", "")
                    last  = name.get("last_name", "") or r.get("last_name", "")
                    if not first and not last:
                        continue
                    contact = r.get("contact_info") or {}
                    people.append(self.scope({
                        "external_id":    f"ps_student_{sid}",
                        "first_name":     first,
                        "last_name":      last,
                        "person_type":    "client",
                        "person_subtype": "Student",
                        "engagement_model": "enrolled",
                        "status":         "active" if r.get("enroll_status") == 0 else "inactive",
                        "email":          contact.get("email"),
                        "phone":          contact.get("phone"),
                    }))
                else:
                    sid   = str(r.get("id") or r.get("local_id", ""))
                    name  = r.get("name", {})
                    first = name.get("first_name", "") or r.get("first_name", "")
                    last  = name.get("last_name", "") or r.get("last_name", "")
                    if not first and not last:
                        continue
                    people.append(self.scope({
                        "external_id":    f"ps_staff_{sid}",
                        "first_name":     first,
                        "last_name":      last,
                        "person_type":    "staff",
                        "person_subtype": r.get("title", "Teacher") or "Teacher",
                        "engagement_model": "employed",
                        "status":         "active",
                        "email":          r.get("email"),
                    }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, r.get("id", ""))
            except Exception as e:
                logger.warning("PowerSchoolConnector.transform: skipped — %s", e)

        logger.info("PowerSchoolConnector.transform: %d people", len(people))
        return {"people": people, "enterprises": [], "products": [], "transactions": []}
