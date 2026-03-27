# ==============================================================
# Wave Mobile Money Connector — Sprint 2
# ==============================================================
# Wave is the leading mobile money platform in Francophone
# West Africa: Senegal, Côte d'Ivoire, Mali, Burkina Faso,
# Guinea, Uganda, and Cameroon.
#
# Wave provides an API for business accounts:
# https://docs.wave.com/
#
# Transaction types:
#   CASH_IN          → product_sale
#   CASH_OUT         → other_expense
#   SEND_MONEY       → other_expense (sent) / service_fee (received)
#   MERCHANT_PAYMENT → product_sale (received) / supply_purchase (sent)
#   INTERNATIONAL    → other_expense
# ==============================================================

import io
import logging
import re
from datetime import datetime
from typing import Any, Optional

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

WAVE_API_BASE = "https://api.wave.com/v1"

WAVE_TYPE_MAP = {
    "cash_in":            "product_sale",
    "cash_out":           "other_expense",
    "send_money_in":      "service_fee",
    "send_money_out":     "other_expense",
    "merchant_payment_in":"product_sale",
    "merchant_payment_out":"supply_purchase",
    "international_out":  "other_expense",
    "reversal_in":        "refund_received",
    "reversal_out":       "refund_issued",
    "fee":                "other_expense",
}


class WavePayConnector(BaseConnector):
    """
    Wave Mobile Money connector.

    credentials must contain ONE of:
        # Method A — Statement CSV
        file_content:   bytes
        file_name:      str

        # Method B — Wave API
        api_key:        str  — Wave API key (Bearer token)
        business_id:    str  — Wave business account ID

    Optional:
        currency:       str  — XOF (default), UGX, XAF
        business_name:  str
    """

    def extract(self) -> list[dict[str, Any]]:
        if self.credentials.get("file_content"):
            return self._extract_from_statement()
        elif self.credentials.get("api_key"):
            return self._extract_from_api()
        else:
            logger.error("WavePayConnector: no credentials provided")
            return []

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        transactions  = []
        people        = []
        known_parties = set()

        for i, raw in enumerate(raw_records):
            try:
                amount = raw.get("amount", 0)
                if not amount or float(amount) == 0:
                    continue

                transactions.append(self.scope({
                    "transaction_type": raw.get("transaction_type", "other_expense"),
                    "amount":           abs(float(amount)),
                    "status":           "posted",
                    "transaction_date": raw.get("transaction_date"),
                    "reference":        raw.get("reference"),
                    "description":      raw.get("description", "")[:200],
                    "currency":         raw.get("currency", "XOF"),
                    "source":           "wave",
                    "external_id":      raw.get("external_id"),
                    "direction":        raw.get("direction", "out"),
                }))

                party = raw.get("_party_name", "").strip()
                if party and party not in known_parties:
                    known_parties.add(party)
                    parts = party.split()
                    people.append(self.scope({
                        "first_name":    parts[0] if parts else party,
                        "last_name":     " ".join(parts[1:]) if len(parts) > 1 else "—",
                        "person_type":   "contact",
                        "person_subtype":"Raw Material Supplier",
                        "phone":         raw.get("_party_phone", ""),
                        "status":        "active",
                        "internal_notes":"Auto-created from Wave statement import",
                        "external_id":   raw.get("_party_phone", "") or party,
                    }))

            except Exception as e:
                self.run_stats["failed"] += 1
                logger.warning("WavePayConnector: failed row %d — %s", i, e)

        return {
            "transactions": transactions,
            "people":       people,
            "relationships":[], "enterprises":[], "products":[],
        }

    def _extract_from_statement(self) -> list[dict]:
        try:
            import pandas as pd
        except ImportError:
            logger.error("WavePayConnector: pandas not installed")
            return []

        file_content = self.credentials["file_content"]
        file_name    = self.credentials.get("file_name", "wave_statement.csv")
        ext          = file_name.rsplit(".", 1)[-1].lower()

        try:
            buf = io.BytesIO(
                file_content if isinstance(file_content, bytes)
                else file_content.encode()
            )

            if ext in ("xlsx", "xls"):
                df = pd.read_excel(buf, dtype=str)
            else:
                # Wave exports may use semicolons (French locale)
                for sep in [",", ";"]:
                    try:
                        buf.seek(0)
                        df = pd.read_csv(buf, sep=sep, dtype=str, encoding="utf-8-sig")
                        if len(df.columns) > 2:
                            break
                    except Exception:
                        continue

            df.columns = [c.lower().strip() for c in df.columns]
            df = df.where(df.notna(), None)

            records = []
            for _, row in df.iterrows():
                r = row.to_dict()

                # Wave CSV columns: date, id, type, amount, fee, balance, name, phone
                amount_str = r.get("amount") or r.get("montant") or r.get("valeur")
                if not amount_str:
                    continue

                try:
                    amount = float(re.sub(r"[^\d.-]", "", str(amount_str)))
                except ValueError:
                    continue

                type_raw  = (r.get("type") or r.get("transaction type") or r.get("type de transaction") or "").lower()
                direction = "in" if amount > 0 else "out"
                tx_type   = WAVE_TYPE_MAP.get(f"{type_raw}_{direction}", "other_expense")

                date_str   = r.get("date") or r.get("date de transaction") or r.get("created at")
                ref        = r.get("id") or r.get("reference") or r.get("transaction id")
                party_name = r.get("name") or r.get("nom") or r.get("counterparty") or ""
                party_phone= r.get("phone") or r.get("téléphone") or r.get("numero") or ""

                records.append({
                    "amount":           abs(amount),
                    "direction":        direction,
                    "transaction_type": tx_type,
                    "transaction_date": self._parse_date(date_str),
                    "reference":        ref,
                    "description":      type_raw[:200],
                    "currency":         self.credentials.get("currency", "XOF"),
                    "external_id":      ref,
                    "_party_name":      party_name.title(),
                    "_party_phone":     party_phone,
                })

            logger.info("WavePayConnector: parsed %d transactions", len(records))
            return records

        except Exception as e:
            logger.error("WavePayConnector._extract_from_statement: %s", e)
            return []

    def _extract_from_api(self) -> list[dict]:
        api_key     = self.credentials.get("api_key", "")
        business_id = self.credentials.get("business_id", "")

        try:
            # Verify API connection
            resp = requests.get(
                f"{WAVE_API_BASE}/business/{business_id}",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=15,
            )
            resp.raise_for_status()
            logger.info("WavePayConnector: API connected for business %s", business_id)

            # Fetch recent transactions
            tx_resp = requests.get(
                f"{WAVE_API_BASE}/business/{business_id}/transactions",
                headers={"Authorization": f"Bearer {api_key}"},
                params={"limit": 500},
                timeout=15,
            )
            tx_resp.raise_for_status()
            data = tx_resp.json()
            raw_txs = data.get("transactions", data.get("items", []))

            records = []
            for tx in raw_txs:
                amount = float(tx.get("amount", 0))
                if not amount:
                    continue

                tx_type_raw = tx.get("type", "").lower()
                direction   = "in" if amount > 0 else "out"
                tx_type     = WAVE_TYPE_MAP.get(f"{tx_type_raw}_{direction}", "other_expense")

                records.append({
                    "amount":           abs(amount),
                    "direction":        direction,
                    "transaction_type": tx_type,
                    "transaction_date": tx.get("created_at") or tx.get("timestamp"),
                    "reference":        tx.get("id"),
                    "description":      tx.get("description", "")[:200],
                    "currency":         tx.get("currency", "XOF"),
                    "external_id":      tx.get("id"),
                    "_party_name":      (tx.get("counterparty") or {}).get("name", ""),
                    "_party_phone":     (tx.get("counterparty") or {}).get("mobile", ""),
                })

            logger.info("WavePayConnector: fetched %d transactions from API", len(records))
            return records

        except Exception as e:
            logger.error("WavePayConnector._extract_from_api: %s", e)
            return []

    def _parse_date(self, date_str: Optional[str]) -> Optional[str]:
        if not date_str:
            return None
        for fmt in [
            "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S",
            "%d/%m/%Y %H:%M", "%Y-%m-%d", "%d-%m-%Y",
        ]:
            try:
                return datetime.strptime(date_str.strip(), fmt).isoformat()
            except ValueError:
                continue
        return date_str
