# ==============================================================
# MTN Mobile Money Connector — Sprint 2
# ==============================================================
# Ingests MTN MoMo transaction data via:
#   Method A — Statement CSV/Excel upload (operator download)
#   Method B — MTN MoMo API v1.0 (automatic sync)
#
# Geography: Uganda, Ghana, Côte d'Ivoire, Cameroon,
#            Rwanda, Zambia, Benin, Congo
#
# MTN MoMo API docs: https://momodeveloper.mtn.com/
# Sandbox: https://sandbox.momodeveloper.mtn.com
#
# Transaction type mapping:
#   TRANSFER         → service_fee (received) / other_expense (sent)
#   PAYMENT          → product_sale (received) / supply_purchase (sent)
#   WITHDRAWAL       → other_expense
#   DEPOSIT          → product_sale
#   REFUND           → refund_received / refund_issued
# ==============================================================

import io
import logging
import re
from datetime import datetime
from typing import Any, Optional

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

MOMO_SANDBOX = "https://sandbox.momodeveloper.mtn.com"
MOMO_PROD    = "https://proxy.momoapi.mtn.com"

MOMO_TYPE_MAP = {
    "transfer_in":    "service_fee",
    "transfer_out":   "other_expense",
    "payment_in":     "product_sale",
    "payment_out":    "supply_purchase",
    "withdrawal":     "other_expense",
    "deposit":        "product_sale",
    "refund_in":      "refund_received",
    "refund_out":     "refund_issued",
    "airtime":        "other_expense",
    "merchant":       "supply_purchase",
}

# MTN statement CSV columns vary by country
AMOUNT_COLS   = {"amount", "value", "transaction amount", "amt"}
DATE_COLS     = {"date", "transaction date", "time", "created on"}
TYPE_COLS     = {"type", "transaction type", "description", "narration"}
STATUS_COLS   = {"status", "transaction status", "state"}
REF_COLS      = {"reference", "transaction id", "ref", "external id", "id"}
PARTY_COLS    = {"party", "counterparty", "sender", "receiver", "name", "from", "to"}
PHONE_COLS    = {"phone", "msisdn", "mobile", "number", "party msisdn"}


class MtnConnector(BaseConnector):
    """
    MTN Mobile Money connector.

    credentials must contain ONE of:
        # Method A — Statement upload
        file_content:   bytes  — CSV or Excel file content
        file_name:      str

        # Method B — MTN MoMo API
        subscription_key:  str  — Ocp-Apim-Subscription-Key
        api_user:          str  — X-Reference-Id (UUID)
        api_key:           str  — API Key
        product:           str  — "collection" or "disbursement"
        environment:       str  — "sandbox" or "production"
        target_environment:str  — e.g. "mtnuganda", "mtnghana"

    Optional:
        currency:          str  — ISO currency code (UGX, GHS, XOF, etc.)
        business_name:     str  — enterprise name
    """

    def extract(self) -> list[dict[str, Any]]:
        if self.credentials.get("file_content"):
            return self._extract_from_statement()
        elif self.credentials.get("subscription_key"):
            return self._extract_from_api()
        else:
            logger.error("MtnConnector.extract: no credentials provided")
            return []

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        transactions  = []
        people        = []
        relationships = []
        known_parties = set()

        for i, raw in enumerate(raw_records):
            try:
                tx = self._transform_transaction(raw, i)
                if tx:
                    transactions.append(self.scope(tx))

                party      = raw.get("_party_name", "").strip()
                party_phone= raw.get("_party_phone", "").strip()

                if party and party not in known_parties:
                    known_parties.add(party)
                    person = self._make_party_person(party, party_phone)
                    if person:
                        people.append(self.scope(person))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, str(i))
                self.run_stats["skipped"] += 1
            except Exception as e:
                self.run_stats["failed"] += 1
                logger.warning("MtnConnector: failed row %d — %s", i, e)

        logger.info(
            "MtnConnector.transform: %d transactions, %d new contacts",
            len(transactions), len(people),
        )
        return {
            "transactions": transactions,
            "people":       people,
            "relationships":relationships,
            "enterprises":  [],
            "products":     [],
        }

    def _extract_from_statement(self) -> list[dict]:
        try:
            import pandas as pd
        except ImportError:
            logger.error("MtnConnector: pandas not installed")
            return []

        file_content = self.credentials["file_content"]
        file_name    = self.credentials.get("file_name", "mtn_statement.csv")
        ext          = file_name.rsplit(".", 1)[-1].lower()

        try:
            buf = io.BytesIO(
                file_content if isinstance(file_content, bytes)
                else file_content.encode()
            )

            if ext in ("xlsx", "xls"):
                df = pd.read_excel(buf, dtype=str)
            else:
                df = pd.read_csv(buf, dtype=str, encoding="utf-8-sig")

            df.columns = [c.lower().strip() for c in df.columns]
            df = df.where(df.notna(), None)

            records = []
            for _, row in df.iterrows():
                record = self._normalize_row(row.to_dict())
                if record:
                    records.append(record)

            logger.info(
                "MtnConnector: parsed %d transactions from %s", len(records), file_name
            )
            return records

        except Exception as e:
            logger.error("MtnConnector._extract_from_statement: %s", e)
            return []

    def _normalize_row(self, row: dict) -> Optional[dict]:
        def find(aliases):
            for a in aliases:
                if a in row and row[a]:
                    return str(row[a]).strip()
            return None

        amount_str = find(AMOUNT_COLS)
        if not amount_str:
            return None

        try:
            amount = float(re.sub(r"[^\d.-]", "", amount_str))
        except ValueError:
            return None

        if amount == 0:
            return None

        type_str    = (find(TYPE_COLS) or "").lower()
        direction   = "in" if amount > 0 else "out"
        tx_type     = self._map_type(type_str, direction)
        date_str    = find(DATE_COLS)
        ref         = find(REF_COLS)
        party_raw   = find(PARTY_COLS) or ""
        phone       = find(PHONE_COLS) or ""

        party_name, party_phone = self._parse_party(party_raw, phone)

        return {
            "reference":         ref,
            "transaction_date":  self._parse_date(date_str),
            "amount":            abs(amount),
            "direction":         direction,
            "transaction_type":  tx_type,
            "description":       type_str,
            "currency":          self.credentials.get("currency", "UGX"),
            "status":            "completed",
            "external_id":       ref,
            "_party_name":       party_name,
            "_party_phone":      party_phone,
        }

    def _extract_from_api(self) -> list[dict]:
        """
        MTN MoMo API extraction.
        Pulls account balance and recent transaction history.
        """
        sub_key  = self.credentials.get("subscription_key", "")
        api_user = self.credentials.get("api_user", "")
        api_key  = self.credentials.get("api_key", "")
        product  = self.credentials.get("product", "collection")
        env      = self.credentials.get("environment", "sandbox")
        target   = self.credentials.get("target_environment", "sandbox")

        base = MOMO_SANDBOX if env == "sandbox" else MOMO_PROD

        # Get bearer token
        try:
            import base64
            creds_b64 = base64.b64encode(f"{api_user}:{api_key}".encode()).decode()
            resp = requests.post(
                f"{base}/{product}/token/",
                headers={
                    "Authorization":             f"Basic {creds_b64}",
                    "Ocp-Apim-Subscription-Key": sub_key,
                },
                timeout=15,
            )
            resp.raise_for_status()
            token = resp.json().get("access_token")
        except Exception as e:
            logger.error("MtnConnector: API auth failed — %s", e)
            return []

        # Get account balance (confirms connection)
        try:
            bal_resp = requests.get(
                f"{base}/{product}/v1_0/account/balance",
                headers={
                    "Authorization":             f"Bearer {token}",
                    "Ocp-Apim-Subscription-Key": sub_key,
                    "X-Target-Environment":      target,
                },
                timeout=15,
            )
            balance = bal_resp.json()
            logger.info(
                "MtnConnector: API connected — balance %s %s",
                balance.get("availableBalance"), balance.get("currency"),
            )
        except Exception as e:
            logger.warning("MtnConnector: balance check failed — %s", e)

        # MTN MoMo v1 does not provide a transaction history endpoint
        # Transaction history requires webhook registration (similar to M-Pesa)
        logger.info(
            "MtnConnector: MTN MoMo API connected. "
            "For historical transactions use statement CSV upload. "
            "Real-time transactions require webhook configuration."
        )
        return []

    def _map_type(self, type_str: str, direction: str) -> str:
        for pattern, tx_type in MOMO_TYPE_MAP.items():
            if pattern.replace("_in", "").replace("_out", "") in type_str:
                suffix = "_in" if direction == "in" else "_out"
                mapped = MOMO_TYPE_MAP.get(
                    pattern.replace("_in", "").replace("_out", "") + suffix
                )
                if mapped:
                    return mapped
        return "service_fee" if direction == "in" else "other_expense"

    def _parse_party(self, party_raw: str, phone: str) -> tuple[str, str]:
        if not party_raw:
            return "", phone
        # Clean up name
        name = re.sub(r"\d{9,}", "", party_raw).strip().title()
        # Extract phone from party_raw if not already found
        if not phone:
            match = re.search(r"\d{9,12}", party_raw)
            if match:
                phone = match.group(0)
        return name or party_raw.title(), phone

    def _parse_date(self, date_str: Optional[str]) -> Optional[str]:
        if not date_str:
            return None
        formats = [
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%d/%m/%Y %H:%M",
            "%d-%m-%Y %H:%M:%S",
            "%Y-%m-%d",
        ]
        for fmt in formats:
            try:
                return datetime.strptime(date_str.strip(), fmt).isoformat()
            except ValueError:
                continue
        return date_str

    def _transform_transaction(self, raw: dict, idx: int) -> Optional[dict]:
        amount = raw.get("amount", 0)
        if not amount or float(amount) == 0:
            return None
        return {
            "transaction_type": raw.get("transaction_type", "other_expense"),
            "amount":           float(amount),
            "status":           "posted",
            "transaction_date": raw.get("transaction_date"),
            "reference":        raw.get("reference"),
            "description":      raw.get("description", "")[:200],
            "currency":         raw.get("currency", "UGX"),
            "source":           "mtn_momo",
            "external_id":      raw.get("external_id"),
            "direction":        raw.get("direction", "out"),
        }

    def _make_party_person(self, name: str, phone: str) -> Optional[dict]:
        if not name or len(name) < 2:
            return None
        parts = name.strip().split()
        return {
            "first_name":    parts[0],
            "last_name":     " ".join(parts[1:]) or "—",
            "person_type":   "contact",
            "person_subtype":"Raw Material Supplier",
            "phone":         phone,
            "status":        "active",
            "internal_notes":"Auto-created from MTN MoMo statement import",
            "external_id":   phone or name,
        }
