# ==============================================================
# Canvas LMS Connector — Sprint 6
# ==============================================================
# Syncs students, courses, and assignments from Canvas via the
# Canvas REST API (API token auth).
#
# credentials must contain:
#   api_token:    str  — Canvas API token
#   base_url:     str  — Canvas instance URL
#                        e.g. https://canvas.instructure.com
#   account_id:   str  — Canvas account ID (default: 1)
#
# Maps to Newsconseen entities:
#   User (student) → Person (person_type: client, subtype: Student)
#   User (teacher) → Person (person_type: staff, subtype: Teacher)
#   Course         → Enterprise (enterprise_type: nonprofit, tier: unit)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)


class CanvasConnector(BaseConnector):
    """Canvas LMS API connector. Sprint 6."""

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.credentials['api_token']}",
            "Accept": "application/json",
        }

    def _base(self) -> str:
        return self.credentials["base_url"].rstrip("/") + "/api/v1"

    def _paginate(self, path: str, params: dict = None) -> list[dict]:
        url     = f"{self._base()}{path}"
        records = []
        while url:
            resp = requests.get(
                url, headers=self._headers(), params=params, timeout=30
            )
            resp.raise_for_status()
            batch = resp.json()
            if isinstance(batch, list):
                records.extend(batch)
            # Canvas uses Link header for pagination
            url    = None
            params = None
            links  = resp.headers.get("Link", "")
            for part in links.split(","):
                if 'rel="next"' in part:
                    url = part.split(";")[0].strip().strip("<>")
                    break
        return records

    def extract(self) -> list[dict]:
        logger.info("CanvasConnector: extracting for company_id=%s", self.company_id)
        account_id = self.credentials.get("account_id", 1)
        records    = []
        try:
            users = self._paginate(
                f"/accounts/{account_id}/users",
                {"per_page": 100, "include[]": "enrollments"},
            )
            records.extend(users)
            logger.info("CanvasConnector: extracted %d users", len(users))
        except Exception as e:
            logger.error("CanvasConnector.extract failed — %s", e)
        return records

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people = []

        for u in raw_records:
            try:
                uid   = str(u.get("id", ""))
                name  = u.get("name", "")
                parts = name.split(" ", 1) if name else ["", ""]
                first = parts[0]
                last  = parts[1] if len(parts) > 1 else ""
                if not first and not last:
                    continue

                enrollments = u.get("enrollments") or []
                roles = {e.get("type", "") for e in enrollments}
                if "TeacherEnrollment" in roles or "TaEnrollment" in roles:
                    p_type, p_subtype = "staff", "Teacher"
                else:
                    p_type, p_subtype = "client", "Student"

                people.append(self.scope({
                    "external_id":    f"canvas_{uid}",
                    "first_name":     first,
                    "last_name":      last,
                    "person_type":    p_type,
                    "person_subtype": p_subtype,
                    "engagement_model": "enrolled" if p_type == "client" else "employed",
                    "status":         "active",
                    "email":          u.get("login_id") or u.get("email"),
                }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, u.get("id", ""))
            except Exception as e:
                logger.warning("CanvasConnector.transform: skipped — %s", e)

        logger.info("CanvasConnector.transform: %d people", len(people))
        return {"people": people, "enterprises": [], "products": [], "transactions": []}
