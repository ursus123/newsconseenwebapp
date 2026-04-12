# ==============================================================
# Shopify Connector — Sprint 7
# ==============================================================
# Syncs orders, products, and customers from Shopify via the
# Shopify Admin REST API 2024-01 (API key / access token auth).
#
# credentials must contain:
#   shop_domain:   str  — e.g. mystore.myshopify.com
#   access_token:  str  — Shopify Admin API access token
#
# Maps to Newsconseen entities:
#   Customer → Person (person_type: client)
#   Product  → Product (item_type: physical or digital)
#   Order    → Transaction (transaction_type: product_sale)
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

API_VERSION = "2024-01"


class ShopifyConnector(BaseConnector):
    """Shopify Admin REST API connector. Sprint 7."""

    def _base(self) -> str:
        domain = self.credentials["shop_domain"].rstrip("/")
        return f"https://{domain}/admin/api/{API_VERSION}"

    def _headers(self) -> dict:
        return {
            "X-Shopify-Access-Token": self.credentials["access_token"],
            "Accept": "application/json",
        }

    def _paginate(self, path: str, key: str, params: dict = None) -> list[dict]:
        url     = f"{self._base()}{path}.json"
        records = []
        while url:
            resp = requests.get(url, headers=self._headers(),
                                params=params, timeout=30)
            resp.raise_for_status()
            records.extend(resp.json().get(key, []))
            # Shopify cursor pagination via Link header
            url    = None
            params = None
            links  = resp.headers.get("Link", "")
            for part in links.split(","):
                if 'rel="next"' in part:
                    url = part.split(";")[0].strip().strip("<>")
                    break
        return records

    def extract(self) -> list[dict]:
        logger.info("ShopifyConnector: extracting for company_id=%s", self.company_id)
        records = []
        try:
            customers = self._paginate("/customers", "customers", {"limit": 250})
            for c in customers:
                c["_record_type"] = "customer"
            records.extend(customers)
            logger.info("ShopifyConnector: extracted %d customers", len(customers))
        except Exception as e:
            logger.error("ShopifyConnector: customers failed — %s", e)
        try:
            products = self._paginate("/products", "products", {"limit": 250})
            for p in products:
                p["_record_type"] = "product"
            records.extend(products)
            logger.info("ShopifyConnector: extracted %d products", len(products))
        except Exception as e:
            logger.error("ShopifyConnector: products failed — %s", e)
        return records

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people, products = [], []

        for r in raw_records:
            try:
                rtype = r.get("_record_type")
                if rtype == "customer":
                    cid   = str(r.get("id", ""))
                    first = r.get("first_name", "")
                    last  = r.get("last_name", "")
                    if not first and not last:
                        continue
                    people.append(self.scope({
                        "external_id":    f"shopify_cust_{cid}",
                        "first_name":     first,
                        "last_name":      last,
                        "person_type":    "client",
                        "person_subtype": "Customer",
                        "status":         "active" if r.get("state") == "enabled" else "inactive",
                        "email":          r.get("email"),
                        "phone":          r.get("phone"),
                    }))

                elif rtype == "product":
                    pid  = str(r.get("id", ""))
                    name = r.get("title", "")
                    if not name:
                        continue
                    ptype = "digital" if r.get("product_type", "").lower() in (
                        "digital", "ebook", "download", "software"
                    ) else "physical"
                    variants = r.get("variants", [{}])
                    price    = None
                    if variants:
                        try:
                            price = float(variants[0].get("price", 0))
                        except (ValueError, TypeError):
                            pass
                    products.append(self.scope({
                        "external_id":     f"shopify_prod_{pid}",
                        "name":            name,
                        "item_type":       ptype,
                        "item_class":      "unrestricted",
                        "unit_of_measure": "piece",
                        "description":     r.get("body_html", "")[:500] if r.get("body_html") else "",
                        "price":           price,
                        "status":          "active" if r.get("status") == "active" else "inactive",
                    }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, str(r.get("id", "")))
            except Exception as e:
                logger.warning("ShopifyConnector.transform: skipped — %s", e)

        logger.info(
            "ShopifyConnector.transform: %d people, %d products",
            len(people), len(products),
        )
        return {"people": people, "enterprises": [], "products": products, "transactions": []}
