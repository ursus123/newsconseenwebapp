# ==============================================================
# Airtel Money Connector — Sprint 2
# ==============================================================
# Ingests Airtel Money transactions via statement CSV upload.
# Geography: Kenya, Uganda, Tanzania, Zambia, Rwanda,
#            Malawi, Madagascar, Niger, Chad, Congo, Gabon
#
# Airtel Money API is available for business accounts
# but requires in-country registration. Statement CSV
# upload is the recommended method for most operators.
# ==============================================================

import io
import logging
import re
from datetime import datetime
from typing import Any, Optional

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

AIRTEL_TYPE_MAP = {
    "received":       "service_fee",
    "sent":           "other_expense",
    "payment":        "product_sale",
    "merchant":       "supply_purchase",
    "withdrawal":     "other_expense",
    "deposit":        "product_sale",
    "reversal":       "refund_received",
    "airtime":        "other_expense",
    "bundle":         "other_expense",
}


class AirtelConnector(BaseConnector):
    """
    Airtel Money connector — statement CSV upload.

    credentials:
        file_content: bytes
        file_name:    str
        currency:     str  — e.g. "KES", "UGX", "TZS"
        business_name:str  — optional
    """

    def extract(self) -> list[dict[str, Any]]:
        if not self.credentials.get("file_content"):
            logger.error("AirtelConnector: no file_content in credentials")
            return []

        try:
            import pandas as pd
        except ImportError:
            logger.error("AirtelConnector: pandas not installed")
            return []

        file_content = self.credentials["file_content"]
        file_name    = self.credentials.get("file_name", "airtel_statement.csv")
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
                r = row.to_dict()
                # Find amount — positive = received, negative = sent
                amount = None
                for col in ["amount", "value", "credit", "debit", "transaction amount"]:
                    if col in r and r[col]:
                        try:
                            amount = float(re.sub(r"[^\d.-]", "", str(r[col])))
                            break
                        except ValueError:
                            continue

                if not amount:
                    continue

                # Find date
                date_str = None
                for col in ["date", "transaction date", "time", "created"]:
                    if col in r and r[col]:
                        date_str = str(r[col])
                        break

                # Find type
                type_str = ""
                for col in ["type", "transaction type", "description", "narration"]:
                    if col in r and r[col]:
                        type_str = str(r[col]).lower()
                        break

                tx_type = "service_fee" if amount > 0 else "other_expense"
                for pattern, mapped in AIRTEL_TYPE_MAP.items():
                    if pattern in type_str:
                        tx_type = mapped
                        break

                # Find reference
                ref = None
                for col in ["reference", "transaction id", "ref", "id"]:
                    if col in r and r[col]:
                        ref = str(r[col])
                        break

                records.append({
                    "amount":           abs(amount),
                    "direction":        "in" if amount > 0 else "out",
                    "transaction_type": tx_type,
                    "transaction_date": self._parse_date(date_str),
                    "reference":        ref,
                    "description":      type_str[:200],
                    "currency":         self.credentials.get("currency", "KES"),
                    "external_id":      ref,
                })

            logger.info(
                "AirtelConnector: parsed %d transactions from %s",
                len(records), file_name
            )
            return records

        except Exception as e:
            logger.error("AirtelConnector.extract: %s", e)
            return []

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        transactions = []
        for i, raw in enumerate(raw_records):
            try:
                if raw.get("amount", 0):
                    transactions.append(self.scope({
                        "transaction_type": raw.get("transaction_type", "other_expense"),
                        "amount":           float(raw["amount"]),
                        "status":           "posted",
                        "transaction_date": raw.get("transaction_date"),
                        "reference":        raw.get("reference"),
                        "description":      raw.get("description", "")[:200],
                        "currency":         raw.get("currency", "KES"),
                        "source":           "airtel_money",
                        "external_id":      raw.get("external_id"),
                        "direction":        raw.get("direction", "out"),
                    }))
            except Exception as e:
                logger.warning("AirtelConnector: failed row %d — %s", i, e)
                self.run_stats["failed"] += 1

        return {
            "transactions": transactions,
            "people": [], "relationships": [],
            "enterprises": [], "products": [],
        }

    def _parse_date(self, date_str: Optional[str]) -> Optional[str]:
        if not date_str:
            return None
        for fmt in ["%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%d", "%d-%m-%Y"]:
            try:
                return datetime.strptime(date_str.strip(), fmt).isoformat()
            except ValueError:
                continue
        return date_str
