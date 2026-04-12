# ==============================================================
# Square Connector — Sprint 7
# ==============================================================
# Syncs sales, inventory, and customers from Square POS via the
# Square Connect API v2 (OAuth 2.0 access token).
#
# credentials must contain:
#   access_token:   str  — Square OAuth access token
#   location_id:    str  — Square location ID (optional, all locations if omitted)
#
# Maps to Newsconseen entities:
#   Customer → Person (person_type: client)
#   Item     → Product (item_type: physical or service_package)
#   Order    → Transaction (transaction_type: product_sale or service_rendered)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

SQUARE_BASE = "https://connect.squareup.com/v2"

SQUARE_CATEGORY_MAP = {
    "FOOD_AND_BEV":  "physical",
    "SERVICES":      "service_package",
    "DIGITAL":       "digital",
    "GIFT_CARD":     "financial_instrument",
}


class SquareConnector(BaseConnector):
    """Square POS API connector. Sprint 7."""

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.credentials['access_token']}",
            "Content-Type":  "application/json",
            "Accept":        "application/json",
            "Square-Version": "2024-01-17",
        }

    def _post(self, path: str, body: dict) -> dict:
        resp = requests.post(
            f"{SQUARE_BASE}{path}",
            headers=self._headers(),
            json=body,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def _get(self, path: str, params: dict = None) -> dict:
        resp = requests.get(
            f"{SQUARE_BASE}{path}",
            headers=self._headers(),
            params=params,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def _paginate_post(self, path: str, body: dict, result_key: str) -> list[dict]:
        records, cursor = [], None
        while True:
            if cursor:
                body["cursor"] = cursor
            data    = self._post(path, body)
            batch   = data.get(result_key, [])
            records.extend(batch)
            cursor  = data.get("cursor")
            if not cursor:
                break
        return records

    def extract(self) -> list[dict]:
        logger.info("SquareConnector: extracting for company_id=%s", self.company_id)
        records = []

        try:
            customers = self._paginate_post(
                "/customers/search",
                {"limit": 100},
                "customers",
            )
            for c in customers:
                c["_record_type"] = "customer"
            records.extend(customers)
            logger.info("SquareConnector: extracted %d customers", len(customers))
        except Exception as e:
            logger.error("SquareConnector: customers failed — %s", e)

        try:
            items = self._paginate_post(
                "/catalog/search",
                {"object_types": ["ITEM"], "limit": 100},
                "objects",
            )
            for it in items:
                it["_record_type"] = "item"
            records.extend(items)
            logger.info("SquareConnector: extracted %d items", len(items))
        except Exception as e:
            logger.error("SquareConnector: catalog failed — %s", e)

        return records

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people, products = [], []

        for r in raw_records:
            try:
                rtype = r.get("_record_type")
                if rtype == "customer":
                    cid   = r.get("id", "")
                    first = r.get("given_name", "")
                    last  = r.get("family_name", "")
                    if not first and not last:
                        continue
                    people.append(self.scope({
                        "external_id":    f"square_cust_{cid}",
                        "first_name":     first,
                        "last_name":      last,
                        "person_type":    "client",
                        "person_subtype": "Customer",
                        "status":         "active",
                        "email":          r.get("email_address"),
                        "phone":          r.get("phone_number"),
                    }))

                elif rtype == "item":
                    iid  = r.get("id", "")
                    item = r.get("item_data", {})
                    name = item.get("name", "")
                    if not name:
                        continue
                    cat   = item.get("product_type", "REGULAR")
                    itype = SQUARE_CATEGORY_MAP.get(cat, "physical")
                    variations = item.get("variations", [])
                    price = None
                    if variations:
                        price_money = variations[0].get("item_variation_data", {}).get("price_money", {})
                        if price_money:
                            price = price_money.get("amount", 0) / 100
                    products.append(self.scope({
                        "external_id":   f"square_item_{iid}",
                        "name":          name,
                        "item_type":     itype,
                        "item_class":    "unrestricted",
                        "unit_of_measure": "piece",
                        "description":   item.get("description", ""),
                        "price":         price,
                        "status":        "active",
                    }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, r.get("id", ""))
            except Exception as e:
                logger.warning("SquareConnector.transform: skipped — %s", e)

        logger.info(
            "SquareConnector.transform: %d people, %d products",
            len(people), len(products),
        )
        return {"people": people, "enterprises": [], "products": products, "transactions": []}
