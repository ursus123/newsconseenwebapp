# ==============================================================
# Sage Connector — Sprint 4
# ==============================================================
# Syncs financial records from Sage Business Cloud Accounting
# via the Sage Accounting API v3.1 (OAuth 2.0).
#
# credentials must contain:
#   access_token:  str  — Sage OAuth 2.0 access token
#
# Maps to Newsconseen entities:
#   Contact     → Person (client or contact)
#   SalesInvoice → Transaction (transaction_type: sales_invoice)
#   Product      → Product
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

SAGE_BASE = "https://api.accounting.sage.com/v3.1"


class SageConnector(BaseConnector):
    """Sage Business Cloud Accounting API connector. Sprint 4."""

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.credentials['access_token']}",
            "Accept": "application/json",
        }

    def _paginate(self, path: str, key: str = "$items") -> list[dict]:
        url     = f"{SAGE_BASE}{path}"
        records, page = [], 1
        per_page = 200
        while True:
            resp = requests.get(
                url,
                headers=self._headers(),
                params={"$page": page, "$pagesize": per_page},
                timeout=30,
            )
            resp.raise_for_status()
            data  = resp.json()
            batch = data.get(key) or data if isinstance(data, list) else []
            if not batch:
                break
            records.extend(batch)
            if len(batch) < per_page:
                break
            page += 1
        return records

    def extract(self) -> list[dict]:
        logger.info("SageConnector: extracting for company_id=%s", self.company_id)
        records = []
        for path, key, rtype in [
            ("/contacts", "$items", "contact"),
            ("/sales_invoices", "$items", "invoice"),
            ("/products", "$items", "product"),
        ]:
            try:
                batch = self._paginate(path, key)
                for r in batch:
                    r["_record_type"] = rtype
                records.extend(batch)
                logger.info("SageConnector: extracted %d %s", len(batch), rtype)
            except Exception as e:
                logger.error("SageConnector: %s failed — %s", rtype, e)
        return records

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people, products, transactions = [], [], []

        for r in raw_records:
            try:
                rtype = r.get("_record_type")
                rid   = r.get("id", "")

                if rtype == "contact":
                    name  = r.get("name", "") or r.get("display_name", "")
                    if not name:
                        continue
                    parts = name.split(" ", 1)
                    first = parts[0]
                    last  = parts[1] if len(parts) > 1 else ""
                    is_customer = r.get("is_customer") or r.get("contact_type_ids", [])
                    ptype = "client" if is_customer else "contact"
                    people.append(self.scope({
                        "external_id":    f"sage_contact_{rid}",
                        "first_name":     first,
                        "last_name":      last,
                        "person_type":    ptype,
                        "person_subtype": "Customer" if ptype == "client" else "Supplier",
                        "status":         "active" if r.get("status", {}).get("id") == "ACTIVE" else "inactive",
                        "email":          r.get("email"),
                        "phone":          r.get("main_phone_number", {}).get("number"),
                    }))

                elif rtype == "product":
                    name = r.get("description", "") or r.get("item_code", "")
                    if not name:
                        continue
                    products.append(self.scope({
                        "external_id":     f"sage_prod_{rid}",
                        "name":            name,
                        "item_type":       "service_package" if r.get("product_type") == "SERVICE" else "physical",
                        "item_class":      "unrestricted",
                        "unit_of_measure": "piece",
                        "price":           r.get("sales_price"),
                        "status":          "active",
                    }))

                elif rtype == "invoice":
                    transactions.append(self.scope({
                        "external_id":      f"sage_inv_{rid}",
                        "transaction_type": "sales_invoice",
                        "amount":           r.get("total_amount"),
                        "currency":         r.get("currency", {}).get("id", "USD"),
                        "transaction_date": r.get("date"),
                        "reference":        r.get("invoice_number"),
                        "status":           r.get("status", {}).get("id", "").lower(),
                    }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, str(rid))
            except Exception as e:
                logger.warning("SageConnector.transform: skipped — %s", e)

        logger.info(
            "SageConnector.transform: %d people, %d products, %d transactions",
            len(people), len(products), len(transactions),
        )
        return {"people": people, "enterprises": [], "products": products, "transactions": transactions}
