# ==============================================================
# Stripe Connector — Sprint 2
# ==============================================================
# Syncs Stripe payment data to Newsconseen via Stripe API.
# Handles charges, refunds, payouts, and customer records.
#
# Maps to:
#   Transaction — charges, refunds, payouts
#   Person      — customers as clients
#   Relationship— customer ↔ enterprise
#
# Stripe API docs: https://stripe.com/docs/api
# Requires: Secret Key (sk_live_... or sk_test_...)
# ==============================================================

import logging
from datetime import datetime, timezone
from typing import Any, Optional

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

STRIPE_API_BASE = "https://api.stripe.com/v1"

STRIPE_TYPE_MAP = {
    "charge":          "product_sale",
    "refund":          "refund_issued",
    "payout":          "other_expense",
    "payment":         "product_sale",
    "payment_refund":  "refund_issued",
    "adjustment":      "other_expense",
    "stripe_fee":      "other_expense",
    "application_fee": "other_expense",
    "transfer":        "other_expense",
}


class StripeConnector(BaseConnector):
    """
    Stripe payments connector.

    credentials must contain:
        api_key:        str  — Stripe secret key (sk_live_... or sk_test_...)

    Optional:
        limit:          int  — max charges to fetch (default 100, max 100 per page)
        created_after:  str  — ISO date to filter charges after
        business_name:  str  — enterprise name for relationships
        currency:       str  — filter by currency (e.g. "usd", "kes")
    """

    STRIPE_HEADERS = {}

    def __init__(self, company_id, credentials, mappings):
        super().__init__(company_id, credentials, mappings)
        self.STRIPE_HEADERS = {
            "Authorization": f"Bearer {credentials.get('api_key', '')}",
            "Stripe-Version": "2023-10-16",
        }

    def extract(self) -> list[dict[str, Any]]:
        if not self.credentials.get("api_key"):
            logger.error("StripeConnector: no api_key in credentials")
            return []

        charges    = self._fetch_charges()
        payouts    = self._fetch_payouts()
        customers  = self._fetch_customers()

        # Index customers by ID for enrichment
        self._customer_index = {c["id"]: c for c in customers}

        logger.info(
            "StripeConnector: extracted %d charges, %d payouts, %d customers",
            len(charges), len(payouts), len(customers),
        )

        # Tag each record with its type for transform routing
        tagged = []
        for c in charges:
            c["_record_type"] = "charge"
            tagged.append(c)
        for p in payouts:
            p["_record_type"] = "payout"
            tagged.append(p)

        return tagged

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        transactions  = []
        people        = []
        relationships = []
        known_customers = set()

        for i, raw in enumerate(raw_records):
            try:
                record_type = raw.get("_record_type", "charge")

                if record_type == "charge":
                    tx = self._transform_charge(raw)
                    if tx:
                        transactions.append(self.scope(tx))

                    # Create customer as Person (client)
                    customer_id = raw.get("customer")
                    if customer_id and customer_id not in known_customers:
                        known_customers.add(customer_id)
                        customer_data = self._customer_index.get(customer_id, {})
                        person = self._transform_customer(customer_data, customer_id)
                        if person:
                            people.append(self.scope(person))
                            if self.credentials.get("business_name"):
                                relationships.append(self.scope({
                                    "relationship_type": "person_enterprise",
                                    "person_name":       person.get("preferred_name", ""),
                                    "enterprise_name":   self.credentials["business_name"],
                                    "role":              "Customer",
                                    "status":            "active",
                                }))

                elif record_type == "payout":
                    tx = self._transform_payout(raw)
                    if tx:
                        transactions.append(self.scope(tx))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, str(i))
                self.run_stats["skipped"] += 1
            except Exception as e:
                self.run_stats["failed"] += 1
                logger.warning("StripeConnector: failed record %d — %s", i, e)

        logger.info(
            "StripeConnector.transform: %d transactions, %d customers",
            len(transactions), len(people),
        )

        return {
            "transactions":  transactions,
            "people":        people,
            "relationships": relationships,
            "enterprises":   [],
            "products":      [],
        }

    # ----------------------------------------------------------
    # Stripe API fetchers
    # ----------------------------------------------------------

    def _fetch_charges(self) -> list[dict]:
        """Fetch charges (payments received) from Stripe."""
        params = {
            "limit": min(self.credentials.get("limit", 100), 100),
            "expand[]": "data.customer",
        }

        created_after = self.credentials.get("created_after")
        if created_after:
            try:
                ts = int(datetime.fromisoformat(created_after).timestamp())
                params["created[gte]"] = ts
            except ValueError:
                pass

        currency = self.credentials.get("currency")
        if currency:
            params["currency"] = currency.lower()

        return self._paginate(f"{STRIPE_API_BASE}/charges", params)

    def _fetch_payouts(self) -> list[dict]:
        """Fetch payouts (transfers to bank) from Stripe."""
        params = {"limit": 100}
        return self._paginate(f"{STRIPE_API_BASE}/payouts", params)

    def _fetch_customers(self) -> list[dict]:
        """Fetch customer records from Stripe."""
        params = {"limit": 100}
        return self._paginate(f"{STRIPE_API_BASE}/customers", params)

    def _paginate(self, url: str, params: dict) -> list[dict]:
        """Paginate through Stripe API list endpoint."""
        all_records = []
        starting_after = None

        while True:
            if starting_after:
                params["starting_after"] = starting_after

            try:
                resp = requests.get(
                    url,
                    headers=self.STRIPE_HEADERS,
                    params=params,
                    timeout=15,
                )
                resp.raise_for_status()
                data = resp.json()
            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 401:
                    logger.error("StripeConnector: invalid API key")
                else:
                    logger.error("StripeConnector: API error %s — %s", url, e)
                break
            except Exception as e:
                logger.error("StripeConnector: fetch failed %s — %s", url, e)
                break

            records = data.get("data", [])
            all_records.extend(records)

            if not data.get("has_more") or not records:
                break

            starting_after = records[-1]["id"]

            # Safety limit — prevent runaway pagination
            if len(all_records) >= 10000:
                logger.warning("StripeConnector: hit 10,000 record limit")
                break

        return all_records

    # ----------------------------------------------------------
    # Transform helpers
    # ----------------------------------------------------------

    def _transform_charge(self, charge: dict) -> Optional[dict]:
        """Map a Stripe charge to Transaction entity."""
        amount_cents = charge.get("amount", 0)
        if not amount_cents:
            return None

        amount    = amount_cents / 100  # Stripe amounts are in cents
        currency  = charge.get("currency", "usd").upper()
        status    = charge.get("status", "")
        captured  = charge.get("captured", False)

        # Only include succeeded and captured charges
        if status != "succeeded" or not captured:
            self.run_stats["skipped"] += 1
            return None

        # Check if it's a refund
        amount_refunded = (charge.get("amount_refunded", 0) or 0) / 100
        net_amount = amount - amount_refunded

        tx_type = "refund_issued" if amount_refunded == amount else "product_sale"

        # Convert Unix timestamp to ISO
        created = charge.get("created")
        tx_date = (
            datetime.fromtimestamp(created, tz=timezone.utc).isoformat()
            if created else None
        )

        return {
            "transaction_type":  tx_type,
            "amount":            net_amount,
            "status":            "posted",
            "transaction_date":  tx_date,
            "reference":         charge.get("id"),
            "description":       (charge.get("description") or charge.get("statement_descriptor") or "")[:200],
            "currency":          currency,
            "source":            "stripe",
            "external_id":       charge.get("id"),
            "direction":         "in",
            "payment_method":    charge.get("payment_method_details", {}).get("type", ""),
        }

    def _transform_payout(self, payout: dict) -> Optional[dict]:
        """Map a Stripe payout to Transaction entity."""
        amount_cents = payout.get("amount", 0)
        if not amount_cents:
            return None

        if payout.get("status") not in ("paid", "in_transit"):
            self.run_stats["skipped"] += 1
            return None

        amount   = amount_cents / 100
        currency = payout.get("currency", "usd").upper()
        created  = payout.get("created")
        tx_date  = (
            datetime.fromtimestamp(created, tz=timezone.utc).isoformat()
            if created else None
        )

        return {
            "transaction_type":  "other_expense",
            "amount":            amount,
            "status":            "posted",
            "transaction_date":  tx_date,
            "reference":         payout.get("id"),
            "description":       f"Stripe payout — {payout.get('description', '')}",
            "currency":          currency,
            "source":            "stripe",
            "external_id":       payout.get("id"),
            "direction":         "out",
        }

    def _transform_customer(self, customer: dict, customer_id: str) -> Optional[dict]:
        """Map a Stripe customer to Person (client) entity."""
        if not customer:
            return None

        name  = customer.get("name") or ""
        email = customer.get("email") or ""
        phone = customer.get("phone") or ""

        if not name and not email:
            return None

        parts = name.strip().split() if name else []
        display = name or email

        return {
            "first_name":    parts[0] if parts else display,
            "last_name":     " ".join(parts[1:]) if len(parts) > 1 else "—",
            "preferred_name":name or email,
            "person_type":   "client",
            "person_subtype":"Individual Consumer",
            "email":         email,
            "phone":         phone,
            "status":        "active",
            "external_id":   customer_id,
            "internal_notes":"Auto-created from Stripe sync",
        }
