# ==============================================================
# Google Classroom Connector — Sprint 6
# ==============================================================
# Syncs students, teachers, and courses from Google Classroom via
# the Google Classroom API v1 (OAuth 2.0 access token).
#
# credentials must contain:
#   access_token:  str  — Google OAuth 2.0 access token
#                         (scope: https://www.googleapis.com/auth/classroom.rosters.readonly)
#
# Maps to Newsconseen entities:
#   Student → Person (person_type: client, subtype: Student)
#   Teacher → Person (person_type: staff, subtype: Teacher)
#   Course  → Enterprise (enterprise_type: nonprofit, tier: unit)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

CLASSROOM_BASE = "https://classroom.googleapis.com/v1"


class GoogleClassroomConnector(BaseConnector):
    """Google Classroom API v1 connector. Sprint 6."""

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.credentials['access_token']}",
            "Accept": "application/json",
        }

    def _paginate(self, url: str, key: str, params: dict = None) -> list[dict]:
        records, token = [], None
        while True:
            p    = {**(params or {}), "pageSize": 100}
            if token:
                p["pageToken"] = token
            resp = requests.get(url, headers=self._headers(), params=p, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            records.extend(data.get(key, []))
            token = data.get("nextPageToken")
            if not token:
                break
        return records

    def extract(self) -> list[dict]:
        logger.info("GoogleClassroomConnector: extracting for company_id=%s", self.company_id)
        records = []
        try:
            courses = self._paginate(f"{CLASSROOM_BASE}/courses", "courses",
                                     {"courseStates": "ACTIVE"})
            for course in courses:
                cid = course["id"]
                try:
                    students = self._paginate(
                        f"{CLASSROOM_BASE}/courses/{cid}/students", "students"
                    )
                    for s in students:
                        s["_record_type"] = "student"
                        s["_course_id"]   = cid
                    records.extend(students)
                    teachers = self._paginate(
                        f"{CLASSROOM_BASE}/courses/{cid}/teachers", "teachers"
                    )
                    for t in teachers:
                        t["_record_type"] = "teacher"
                        t["_course_id"]   = cid
                    records.extend(teachers)
                except Exception:
                    pass
            logger.info("GoogleClassroomConnector: extracted %d roster entries", len(records))
        except Exception as e:
            logger.error("GoogleClassroomConnector.extract failed — %s", e)
        return records

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people = []
        seen   = set()

        for r in raw_records:
            try:
                rtype   = r.get("_record_type", "student")
                profile = r.get("profile") or {}
                uid     = profile.get("id") or r.get("userId", "")
                if uid in seen:
                    continue
                seen.add(uid)

                name  = profile.get("name", {})
                first = name.get("givenName", "")
                last  = name.get("familyName", "")
                if not first and not last:
                    continue

                email = profile.get("emailAddress")
                people.append(self.scope({
                    "external_id":    f"gclassroom_{uid}",
                    "first_name":     first,
                    "last_name":      last,
                    "person_type":    "client" if rtype == "student" else "staff",
                    "person_subtype": "Student" if rtype == "student" else "Teacher",
                    "engagement_model": "enrolled" if rtype == "student" else "employed",
                    "status":         "active",
                    "email":          email,
                }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, r.get("userId", ""))
            except Exception as e:
                logger.warning("GoogleClassroomConnector.transform: skipped — %s", e)

        logger.info("GoogleClassroomConnector.transform: %d people", len(people))
        return {"people": people, "enterprises": [], "products": [], "transactions": []}
