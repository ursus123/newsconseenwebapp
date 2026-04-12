# ==============================================================
# QuickBooks Online Connector — Sprint 4
# ==============================================================
# Syncs invoices, payments, vendors, and customers from QuickBooks
# Online via the Intuit QBO REST API v3 (OAuth 2.0).
#
# credentials must contain:
#   access_token:   str  — QBO OAuth 2.0 access token
#   realm_id:       str  — QBO company/realm ID
#   minor_version:  int  — API minor version (default: 65)
#
# Maps to Newsconseen entities:
#   Customer → Person (person_type: client)
#   Vendor   → Person (person_type: contact)
#   Invoice  → Transaction (transaction_type: sales_invoice)
#   Payment  → Transaction (transaction_type: payment_received)
#   Item     → Product
# ==============================================================

import logging

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

QBO_BASE = "https://quickbooks.api.intuit.com/v3/company"

INVOICE_STATUS_MAP = {
    "Paid":     "payment_received",
    "Pending":  "sales_invoice",
    "Closed":   "sales_invoice",
    "Voided":   "sales_invoice",
}


class QuickBooksConnector(BaseConnector):
    """QuickBooks Online API v3 connector. Sprint 4."""

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.credentials['access_token']}",
            "Accept": "application/json",
        }

    def _query(self, entity: str, fields: str = "*") -> list[dict]:
        realm_id = self.credentials["realm_id"]
        minor    = self.credentials.get("minor_version", 65)
        records, start = [], 1
        page = 100
        while True:
            q    = f"SELECT {fields} FROM {entity} STARTPOSITION {start} MAXRESULTS {page}"
            resp = requests.get(
                f"{QBO_BASE}/{realm_id}/query",
                headers=self._headers(),
                params={"query": q, "minorversion": minor},
                timeout=30,
            )
            resp.raise_for_status()
            qr    = resp.json().get("QueryResponse", {})
            batch = qr.get(entity, [])
            if not batch:
                break
            records.extend(batch)
            if len(batch) < page:
                break
            start += page
        return records

    def extract(self) -> list[dict]:
        logger.info("QuickBooksConnector: extracting for company_id=%s", self.company_id)
        records = []
        for entity, rtype in [
            ("Customer", "customer"), ("Vendor", "vendor"),
            ("Invoice", "invoice"), ("Item", "item"),
        ]:
            try:
                batch = self._query(entity)
                for r in batch:
                    r["_record_type"] = rtype
                records.extend(batch)
                logger.info("QuickBooksConnector: extracted %d %s", len(batch), entity)
            except Exception as e:
                logger.error("QuickBooksConnector: %s failed — %s", entity, e)
        return records

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        people, products, transactions = [], [], []

        for r in raw_records:
            try:
                rtype = r.get("_record_type")
                rid   = r.get("Id", "")

                if rtype in ("customer", "vendor"):
                    full  = r.get("DisplayName") or r.get("FullyQualifiedName", "")
                    parts = full.split(" ", 1) if full else ["", ""]
                    first = parts[0]
                    last  = parts[1] if len(parts) > 1 else ""
                    if not full:
                        continue
                    ptype = "client" if rtype == "customer" else "contact"
                    email = (r.get("PrimaryEmailAddr") or {}).get("Address")
                    phone = (r.get("PrimaryPhone") or {}).get("FreeFormNumber")
                    people.append(self.scope({
                        "external_id":    f"qbo_{rtype}_{rid}",
                        "first_name":     first,
                        "last_name":      last,
                        "person_type":    ptype,
                        "person_subtype": "Customer" if rtype == "customer" else "Vendor",
                        "status":         "active" if r.get("Active", True) else "inactive",
                        "email":          email,
                        "phone":          phone,
                    }))

                elif rtype == "item":
                    name = r.get("Name", "")
                    if not name:
                        continue
                    itype = "service_package" if r.get("Type") == "Service" else "physical"
                    products.append(self.scope({
                        "external_id":     f"qbo_item_{rid}",
                        "name":            name,
                        "item_type":       itype,
                        "item_class":      "unrestricted",
                        "unit_of_measure": "piece",
                        "price":           r.get("UnitPrice"),
                        "status":          "active" if r.get("Active", True) else "inactive",
                    }))

                elif rtype == "invoice":
                    amount    = r.get("TotalAmt", 0)
                    tx_status = r.get("EmailStatus", "")
                    tx_type   = INVOICE_STATUS_MAP.get(
                        r.get("Balance") == 0 and "Paid" or "Pending", "sales_invoice"
                    )
                    transactions.append(self.scope({
                        "external_id":       f"qbo_invoice_{rid}",
                        "transaction_type":  tx_type,
                        "amount":            amount,
                        "currency":          (r.get("CurrencyRef") or {}).get("value", "USD"),
                        "transaction_date":  r.get("TxnDate"),
                        "reference":         r.get("DocNumber"),
                        "status":            "paid" if r.get("Balance") == 0 else "unpaid",
                    }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, r.get("Id", ""))
            except Exception as e:
                logger.warning("QuickBooksConnector.transform: skipped — %s", e)

        logger.info(
            "QuickBooksConnector.transform: %d people, %d products, %d transactions",
            len(people), len(products), len(transactions),
        )
        return {"people": people, "enterprises": [], "products": products, "transactions": transactions}
