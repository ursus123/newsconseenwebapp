# ==============================================================
# Wave Accounting Connector — Sprint 4
# ==============================================================
# Syncs financial records from Wave (wave.com) via the Wave
# GraphQL API (OAuth 2.0).
#
# Note: Wave Accounting is distinct from Wave mobile money
# (Senegal/CI). This connector targets the Wave accounting
# SaaS product used in North America and parts of Africa.
#
# credentials must contain:
#   access_token:  str  — Wave OAuth 2.0 access token
#   business_id:   str  — Wave business ID
#
# Maps to Newsconseen entities:
#   Customer → Person (person_type: client)
#   Vendor   → Person (person_type: contact)
#   Invoice  → Transaction (transaction_type: sales_invoice)
#   Product  → Product
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

WAVE_GRAPHQL = "https://gql.waveapps.com/graphql/public"

CUSTOMERS_QUERY = """
query($businessId: ID!, $page: Int!, $pageSize: Int!) {
  business(id: $businessId) {
    customers(page: $page, pageSize: $pageSize) {
      edges { node { id name email currency { code } phone } }
      pageInfo { currentPage totalPages }
    }
  }
}
"""

PRODUCTS_QUERY = """
query($businessId: ID!, $page: Int!, $pageSize: Int!) {
  business(id: $businessId) {
    products(page: $page, pageSize: $pageSize) {
      edges { node { id name description isSold unitPrice { value } } }
      pageInfo { currentPage totalPages }
    }
  }
}
"""


class WaveAccountingConnector(BaseConnector):
    """Wave Accounting GraphQL API connector. Sprint 4."""

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.credentials['access_token']}",
            "Content-Type": "application/json",
        }

    def _gql(self, query: str, variables: dict) -> dict:
        resp = requests.post(
            WAVE_GRAPHQL,
            headers=self._headers(),
            json={"query": query, "variables": variables},
            timeout=30,
        )
        resp.raise_for_status()
        result = resp.json()
        if "errors" in result:
            raise ValueError(str(result["errors"]))
        return result.get("data", {})

    def _paginate_gql(self, query: str, path: list[str], rtype: str) -> list[dict]:
        biz_id  = self.credentials["business_id"]
        records = []
        page, page_size = 1, 100
        while True:
            data  = self._gql(query, {"businessId": biz_id, "page": page, "pageSize": page_size})
            node  = data
            for key in path:
                node = node.get(key, {})
            edges     = node.get("edges", [])
            page_info = node.get("pageInfo", {})
            for edge in edges:
                n = edge.get("node", {})
                n["_record_type"] = rtype
                records.append(n)
            if page >= page_info.get("totalPages", 1):
                break
            page += 1
        return records

    def extract(self) -> list[dict]:
        logger.info("WaveAccountingConnector: extracting for company_id=%s", self.company_id)
        records = []
        try:
            customers = self._paginate_gql(CUSTOMERS_QUERY, ["business", "customers"], "customer")
            records.extend(customers)
            logger.info("WaveAccountingConnector: extracted %d customers", len(customers))
        except Exception as e:
            logger.error("WaveAccountingConnector: customers failed — %s", e)
        try:
            products = self._paginate_gql(PRODUCTS_QUERY, ["business", "products"], "product")
            records.extend(products)
            logger.info("WaveAccountingConnector: extracted %d products", len(products))
        except Exception as e:
            logger.error("WaveAccountingConnector: products failed — %s", e)
        return records

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people, products = [], []

        for r in raw_records:
            try:
                rtype = r.get("_record_type")
                rid   = r.get("id", "")

                if rtype == "customer":
                    name  = r.get("name", "")
                    if not name:
                        continue
                    parts = name.split(" ", 1)
                    first = parts[0]
                    last  = parts[1] if len(parts) > 1 else ""
                    people.append(self.scope({
                        "external_id":    f"wave_acct_cust_{rid}",
                        "first_name":     first,
                        "last_name":      last,
                        "person_type":    "client",
                        "person_subtype": "Customer",
                        "status":         "active",
                        "email":          r.get("email"),
                        "phone":          r.get("phone"),
                    }))

                elif rtype == "product":
                    name = r.get("name", "")
                    if not name:
                        continue
                    price = (r.get("unitPrice") or {}).get("value")
                    products.append(self.scope({
                        "external_id":     f"wave_acct_prod_{rid}",
                        "name":            name,
                        "item_type":       "service_package" if not r.get("isSold") else "physical",
                        "item_class":      "unrestricted",
                        "unit_of_measure": "piece",
                        "description":     r.get("description", ""),
                        "price":           float(price) if price else None,
                        "status":          "active",
                    }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, str(rid))
            except Exception as e:
                logger.warning("WaveAccountingConnector.transform: skipped — %s", e)

        logger.info(
            "WaveAccountingConnector.transform: %d people, %d products",
            len(people), len(products),
        )
        return {"people": people, "enterprises": [], "products": products, "transactions": []}
