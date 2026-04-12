# ==============================================================
# Toast POS Connector — Sprint 7
# ==============================================================
# Syncs restaurant orders, menu items, and employees from Toast
# via the Toast Platform API v2.
#
# credentials must contain:
#   client_id:      str  — Toast app client ID
#   client_secret:  str  — Toast app client secret
#   restaurant_guid: str — Toast restaurant GUID
#
# Maps to Newsconseen entities:
#   Employee      → Person (person_type: staff)
#   Menu item     → Product (item_type: physical)
#   Order         → Transaction (transaction_type: product_sale)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

TOAST_AUTH_URL = "https://ws-api.toasttab.com/authentication/v1/authentication/login"
TOAST_BASE     = "https://ws-api.toasttab.com"


class ToastConnector(BaseConnector):
    """Toast POS API connector. Sprint 7."""

    def _get_token(self) -> str:
        resp = requests.post(
            TOAST_AUTH_URL,
            json={
                "clientId":     self.credentials["client_id"],
                "clientSecret": self.credentials["client_secret"],
                "userAccessType": "TOAST_MACHINE_CLIENT",
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()["token"]["accessToken"]

    def _get(self, token: str, path: str, params: dict = None) -> dict | list:
        rest_guid = self.credentials["restaurant_guid"]
        resp      = requests.get(
            f"{TOAST_BASE}{path}",
            headers={
                "Authorization":       f"Bearer {token}",
                "Toast-Restaurant-External-ID": rest_guid,
                "Accept":              "application/json",
            },
            params=params,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def extract(self) -> list[dict]:
        logger.info("ToastConnector: extracting for company_id=%s", self.company_id)
        try:
            token = self._get_token()
        except Exception as e:
            logger.error("ToastConnector: auth failed — %s", e)
            return []

        records = []
        try:
            employees = self._get(token, "/labor/v1/employees", {"pageSize": 200})
            emp_list  = employees if isinstance(employees, list) else employees.get("employees", [])
            for e in emp_list:
                e["_record_type"] = "employee"
            records.extend(emp_list)
            logger.info("ToastConnector: extracted %d employees", len(emp_list))
        except Exception as e:
            logger.error("ToastConnector: employees failed — %s", e)

        try:
            menus = self._get(token, "/config/v2/menus")
            menu_list = menus if isinstance(menus, list) else []
            for m in menu_list:
                for group in m.get("menuGroups", []):
                    for item in group.get("menuItems", []):
                        item["_record_type"] = "menu_item"
                        records.append(item)
        except Exception as e:
            logger.error("ToastConnector: menus failed — %s", e)

        return records

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people, products = [], []

        for r in raw_records:
            try:
                rtype = r.get("_record_type")
                if rtype == "employee":
                    eid   = r.get("guid") or r.get("externalId", "")
                    first = r.get("firstName", "")
                    last  = r.get("lastName", "")
                    if not first and not last:
                        continue
                    people.append(self.scope({
                        "external_id":    f"toast_emp_{eid}",
                        "first_name":     first,
                        "last_name":      last,
                        "person_type":    "staff",
                        "person_subtype": r.get("jobReferences", [{}])[0].get("name", "Team Member") or "Team Member",
                        "engagement_model": "employed",
                        "status":         "active" if not r.get("deletedDate") else "inactive",
                        "email":          r.get("email"),
                    }))

                elif rtype == "menu_item":
                    iid  = r.get("guid") or r.get("externalId", "")
                    name = r.get("name", "")
                    if not name:
                        continue
                    price = None
                    prices = r.get("pricingRules") or r.get("price")
                    if isinstance(prices, (int, float)):
                        price = prices / 100
                    products.append(self.scope({
                        "external_id":     f"toast_item_{iid}",
                        "name":            name,
                        "item_type":       "physical",
                        "item_class":      "perishable",
                        "unit_of_measure": "piece",
                        "description":     r.get("description", ""),
                        "price":           price,
                        "status":          "active" if not r.get("visibility") == "NONE" else "inactive",
                    }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, r.get("guid", ""))
            except Exception as e:
                logger.warning("ToastConnector.transform: skipped — %s", e)

        logger.info(
            "ToastConnector.transform: %d people, %d products",
            len(people), len(products),
        )
        return {"people": people, "enterprises": [], "products": products, "transactions": []}
