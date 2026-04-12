# ==============================================================
# Xero Connector — Sprint 4
# ==============================================================
# Syncs financial records from Xero via the Xero API 2.0
# (OAuth 2.0 PKCE with tenant ID header).
#
# credentials must contain:
#   access_token:  str  — Xero OAuth 2.0 access token
#   tenant_id:     str  — Xero tenant/organisation ID
#
# Maps to Newsconseen entities:
#   Contact  → Person (client or contact)
#   Invoice  → Transaction (sales_invoice / purchase_invoice)
#   Item     → Product
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

XERO_BASE = "https://api.xero.com/api.xro/2.0"


class XeroConnector(BaseConnector):
    """Xero API connector. Sprint 4."""

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.credentials['access_token']}",
            "Xero-Tenant-Id": self.credentials["tenant_id"],
            "Accept": "application/json",
        }

    def _get(self, path: str, params: dict = None) -> dict:
        resp = requests.get(
            f"{XERO_BASE}/{path}",
            headers=self._headers(),
            params=params,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def _paginate(self, path: str, key: str, page_size: int = 100) -> list[dict]:
        records, page = [], 1
        while True:
            data  = self._get(path, {"page": page, "pageSize": page_size})
            batch = data.get(key, [])
            if not batch:
                break
            records.extend(batch)
            if len(batch) < page_size:
                break
            page += 1
        return records

    def extract(self) -> list[dict]:
        logger.info("XeroConnector: extracting for company_id=%s", self.company_id)
        records = []
        for path, key, rtype in [
            ("Contacts", "Contacts", "contact"),
            ("Invoices", "Invoices", "invoice"),
            ("Items", "Items", "item"),
        ]:
            try:
                batch = self._paginate(path, key)
                for r in batch:
                    r["_record_type"] = rtype
                records.extend(batch)
                logger.info("XeroConnector: extracted %d %s", len(batch), path)
            except Exception as e:
                logger.error("XeroConnector: %s failed — %s", path, e)
        return records

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people, products, transactions = [], [], []

        for r in raw_records:
            try:
                rtype = r.get("_record_type")
                rid   = r.get("ContactID") or r.get("InvoiceID") or r.get("ItemID", "")

                if rtype == "contact":
                    name  = r.get("Name", "")
                    fname = r.get("FirstName", "")
                    lname = r.get("LastName", "")
                    if not fname and not lname:
                        parts = name.split(" ", 1)
                        fname = parts[0]
                        lname = parts[1] if len(parts) > 1 else ""
                    if not name:
                        continue
                    is_customer = r.get("IsCustomer", False)
                    is_supplier = r.get("IsSupplier", False)
                    ptype   = "client" if is_customer else ("contact" if is_supplier else "contact")
                    emails  = r.get("EmailAddress", "")
                    phones  = (r.get("Phones") or [{}])[0].get("PhoneNumber", "")
                    people.append(self.scope({
                        "external_id":    f"xero_contact_{rid}",
                        "first_name":     fname or name,
                        "last_name":      lname,
                        "person_type":    ptype,
                        "person_subtype": "Customer" if is_customer else "Supplier",
                        "status":         "active" if r.get("ContactStatus") == "ACTIVE" else "inactive",
                        "email":          emails or None,
                        "phone":          phones or None,
                    }))

                elif rtype == "item":
                    name = r.get("Name", "")
                    if not name:
                        continue
                    products.append(self.scope({
                        "external_id":     f"xero_item_{rid}",
                        "name":            name,
                        "item_type":       "physical",
                        "item_class":      "unrestricted",
                        "unit_of_measure": "piece",
                        "price":           r.get("SalesDetails", {}).get("UnitPrice"),
                        "status":          "active" if r.get("IsTrackedAsInventory") or r.get("IsSold") else "inactive",
                    }))

                elif rtype == "invoice":
                    inv_type = r.get("Type", "ACCREC")
                    tx_type  = "sales_invoice" if inv_type == "ACCREC" else "purchase_invoice"
                    transactions.append(self.scope({
                        "external_id":      f"xero_inv_{rid}",
                        "transaction_type": tx_type,
                        "amount":           r.get("Total", 0),
                        "currency":         r.get("CurrencyCode", "USD"),
                        "transaction_date": r.get("Date", "").replace("/Date(", "").replace(")/", "")[:10] if r.get("Date") else None,
                        "reference":        r.get("InvoiceNumber"),
                        "status":           r.get("Status", "").lower(),
                    }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, str(rid))
            except Exception as e:
                logger.warning("XeroConnector.transform: skipped — %s", e)

        logger.info(
            "XeroConnector.transform: %d people, %d products, %d transactions",
            len(people), len(products), len(transactions),
        )
        return {"people": people, "enterprises": [], "products": products, "transactions": transactions}
