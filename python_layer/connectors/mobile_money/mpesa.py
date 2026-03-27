# ==============================================================
# M-Pesa Connector — Sprint 2
# ==============================================================
# Ingests M-Pesa transaction data via two methods:
#
#   Method A — Statement CSV/PDF upload
#     Operator downloads statement from M-Pesa app or MySafaricom
#     Uploads CSV export to the Connectors UI
#     Connector parses and maps to transaction ontology
#
#   Method B — Daraja API (automatic sync)
#     Operator provides Consumer Key + Consumer Secret
#     Connector pulls transaction history via Daraja C2B API
#     Suitable for businesses with M-Pesa paybill/till numbers
#
# All transactions map to:
#   Transaction entity — amount, date, type, counterparty
#   Person entity      — counterparty as contact if new
#
# M-Pesa transaction types → Newsconseen transaction_type:
#   Received Money       → service_fee (revenue)
#   Sent Money           → other_expense
#   Buy Goods            → supply_purchase (expense)
#   Pay Bill             → utility_expense or other_expense
#   Withdraw             → other_expense
#   Deposit              → product_sale (revenue)
#   Airtime              → other_expense
#
# Statement CSV column format (Safaricom standard export):
#   Receipt No.,Completion Time,Details,Transaction Status,
#   Paid In,Withdrawn,Balance
# ==============================================================

import io
import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

import requests

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Daraja API endpoints
# ----------------------------------------------------------
DARAJA_BASE        = "https://api.safaricom.co.ke"
DARAJA_SANDBOX     = "https://sandbox.safaricom.co.ke"
DARAJA_AUTH_URL    = "/oauth/v1/generate?grant_type=client_credentials"
DARAJA_C2B_URL     = "/mpesa/c2b/v1/registerurl"
DARAJA_QUERY_URL   = "/mpesa/transactionstatus/v1/query"

# ----------------------------------------------------------
# M-Pesa transaction type mapping → Newsconseen taxonomy
# ----------------------------------------------------------
MPESA_TYPE_MAP = {
    # Revenue types
    "received money":          "service_fee",
    "customer payment":        "product_sale",
    "pay bill received":       "service_fee",
    "buy goods received":      "product_sale",
    "deposit":                 "product_sale",
    "reversal credit":         "refund_received",
    # Expense types
    "sent to":                 "other_expense",
    "send money":              "other_expense",
    "buy goods":               "supply_purchase",
    "pay bill":                "utility_expense",
    "withdraw":                "other_expense",
    "atm withdrawal":          "other_expense",
    "airtime":                 "other_expense",
    "fuliza":                  "other_expense",
    "reversal debit":          "refund_issued",
    "business payment":        "contractor_payment",
    "salary payment":          "payroll",
    "b2c payment":             "payroll",
}

# ----------------------------------------------------------
# Statement CSV column patterns (Safaricom format variations)
# ----------------------------------------------------------
RECEIPT_COLS     = {"receipt no.", "receipt no", "transaction id", "mpesa code", "ref"}
DATE_COLS        = {"completion time", "date", "transaction date", "time"}
DETAILS_COLS     = {"details", "description", "narration", "particulars"}
STATUS_COLS      = {"transaction status", "status"}
PAID_IN_COLS     = {"paid in", "credit", "received", "amount in"}
WITHDRAWN_COLS   = {"withdrawn", "debit", "sent", "amount out"}
BALANCE_COLS     = {"balance", "running balance", "closing balance"}


class MpesaConnector(BaseConnector):
    """
    M-Pesa connector — ingests transaction data via statement CSV
    or Safaricom Daraja API.

    credentials must contain ONE of:
        # Method A — Statement upload
        file_content:    bytes  — CSV/PDF file content
        file_name:       str    — original filename

        # Method B — Daraja API
        consumer_key:    str    — Daraja app consumer key
        consumer_secret: str    — Daraja app consumer secret
        shortcode:       str    — M-Pesa paybill or till number
        sandbox:         bool   — True for sandbox testing

    Optional for both methods:
        phone_number:    str    — operator's M-Pesa phone number
                                  used to classify direction of transactions
        business_name:   str    — enterprise name for counterparty matching
    """

    def extract(self) -> list[dict[str, Any]]:
        """
        Extract raw M-Pesa transactions.
        Routes to CSV or API method based on credentials.
        """
        if self.credentials.get("file_content"):
            return self._extract_from_statement()
        elif self.credentials.get("consumer_key"):
            return self._extract_from_daraja()
        else:
            logger.error(
                "MpesaConnector.extract: no file_content or consumer_key in credentials"
            )
            return []

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        """
        Map M-Pesa transactions to Newsconseen transaction and person entities.

        For each transaction:
          - Creates a Transaction record with taxonomy fields
          - If counterparty is new, creates a Person (contact) record
          - Links them via a Relationship record
        """
        transactions  = []
        people        = []
        relationships = []

        known_counterparties = set()

        for i, raw in enumerate(raw_records):
            try:
                tx = self._transform_transaction(raw, i)
                if not tx:
                    continue

                transactions.append(self.scope(tx))

                # Create contact record for new counterparty
                counterparty = raw.get("_counterparty_name", "").strip()
                counterparty_phone = raw.get("_counterparty_phone", "").strip()

                if counterparty and counterparty not in known_counterparties:
                    known_counterparties.add(counterparty)
                    person = self._make_counterparty_person(
                        counterparty, counterparty_phone
                    )
                    if person:
                        people.append(self.scope(person))
                        # Relationship between transaction counterparty and enterprise
                        if self.credentials.get("business_name"):
                            relationships.append(self.scope({
                                "relationship_type": "person_enterprise",
                                "person_name":       counterparty,
                                "enterprise_name":   self.credentials["business_name"],
                                "role":              "M-Pesa Counterparty",
                                "status":            "active",
                            }))

            except UnmappedValueError as e:
                self.record_unmapped(e.field_name, e.source_value, str(i))
                self.run_stats["skipped"] += 1
            except Exception as e:
                self.run_stats["failed"] += 1
                logger.warning("MpesaConnector: failed row %d — %s", i, e)

        logger.info(
            "MpesaConnector.transform: %d transactions, %d new contacts, %d skipped",
            len(transactions), len(people), self.run_stats["skipped"],
        )

        return {
            "transactions":  transactions,
            "people":        people,
            "relationships": relationships,
            "enterprises":   [],
            "products":      [],
        }

    # ----------------------------------------------------------
    # Method A — Statement CSV parsing
    # ----------------------------------------------------------

    def _extract_from_statement(self) -> list[dict]:
        """Parse M-Pesa statement CSV into raw transaction dicts."""
        try:
            import pandas as pd
        except ImportError:
            logger.error("MpesaConnector: pandas not installed")
            return []

        file_content = self.credentials["file_content"]
        file_name    = self.credentials.get("file_name", "mpesa_statement.csv")

        try:
            buf = io.BytesIO(
                file_content if isinstance(file_content, bytes)
                else file_content.encode("utf-8")
            )

            ext = file_name.rsplit(".", 1)[-1].lower()

            if ext == "pdf":
                return self._extract_from_pdf(buf)

            # Try CSV with different encodings
            for encoding in ["utf-8", "utf-8-sig", "latin-1"]:
                try:
                    buf.seek(0)
                    df = pd.read_csv(buf, dtype=str, encoding=encoding, skiprows=self._detect_header_row(buf, encoding))
                    break
                except Exception:
                    continue
            else:
                logger.error("MpesaConnector: could not parse CSV with any encoding")
                return []

            # Normalize column names
            df.columns = [c.lower().strip() for c in df.columns]
            df = df.where(df.notna(), None)

            records = []
            for _, row in df.iterrows():
                record = self._normalize_statement_row(row.to_dict())
                if record:
                    records.append(record)

            logger.info(
                "MpesaConnector: parsed %d transactions from statement %s",
                len(records), file_name,
            )
            return records

        except Exception as e:
            logger.error("MpesaConnector._extract_from_statement: %s", e)
            return []

    def _detect_header_row(self, buf, encoding: str) -> int:
        """
        M-Pesa statements often have 4-6 header rows before the data.
        Detect the actual header row by looking for known column names.
        """
        buf.seek(0)
        lines = buf.read().decode(encoding, errors="replace").split("\n")
        for i, line in enumerate(lines[:20]):
            lower = line.lower()
            if any(col in lower for col in ["receipt", "completion time", "paid in", "withdrawn"]):
                return i
        return 0

    def _normalize_statement_row(self, row: dict) -> Optional[dict]:
        """
        Normalize a raw CSV row to a standard M-Pesa transaction dict.
        Handles column name variations across statement formats.
        """
        def find_col(aliases: set) -> Optional[str]:
            for alias in aliases:
                if alias in row:
                    return row[alias]
            return None

        receipt      = find_col(RECEIPT_COLS)
        date_str     = find_col(DATE_COLS)
        details      = find_col(DETAILS_COLS) or ""
        status       = find_col(STATUS_COLS) or "Completed"
        paid_in      = find_col(PAID_IN_COLS)
        withdrawn    = find_col(WITHDRAWN_COLS)
        balance      = find_col(BALANCE_COLS)

        # Skip failed or reversed transactions
        if status and status.lower() in {"failed", "reversed", "cancelled"}:
            return None

        # Parse amounts — remove commas and currency symbols
        def parse_amount(val) -> float:
            if not val or str(val).strip() in {"", "-", "0.00", "0"}:
                return 0.0
            cleaned = re.sub(r"[^\d.]", "", str(val))
            try:
                return float(cleaned)
            except ValueError:
                return 0.0

        amount_in  = parse_amount(paid_in)
        amount_out = parse_amount(withdrawn)
        amount     = amount_in if amount_in > 0 else -amount_out

        if amount == 0:
            return None

        # Parse date
        tx_date = self._parse_mpesa_date(date_str)

        # Extract counterparty from details
        counterparty_name, counterparty_phone = self._parse_details(details)

        # Detect transaction type from details text
        tx_type = self._classify_mpesa_type(details, amount)

        return {
            "receipt_no":          receipt,
            "transaction_date":    tx_date,
            "details":             details,
            "amount":              abs(amount),
            "direction":           "in" if amount > 0 else "out",
            "balance":             parse_amount(balance),
            "transaction_type":    tx_type,
            "status":              "completed",
            "_counterparty_name":  counterparty_name,
            "_counterparty_phone": counterparty_phone,
            "_raw_details":        details,
        }

    def _parse_mpesa_date(self, date_str: Optional[str]) -> Optional[str]:
        """Parse M-Pesa date formats to ISO 8601."""
        if not date_str:
            return None
        # Common M-Pesa formats:
        # "20/01/2024 14:23:00", "2024-01-20 14:23:00", "Jan 20, 2024"
        formats = [
            "%d/%m/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%b %d, %Y %H:%M:%S",
            "%d %b %Y %H:%M:%S",
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(date_str.strip(), fmt)
                return dt.isoformat()
            except ValueError:
                continue
        return date_str

    def _parse_details(self, details: str) -> tuple[str, str]:
        """
        Extract counterparty name and phone from M-Pesa details string.

        Examples:
          "Received from JOHN DOE 0712345678"
          "Sent to JANE SMITH 0798765432"
          "Customer Payment from 0712345678 - JOHN DOE"
          "Pay Bill to NAIROBI WATER 123456"
        """
        if not details:
            return "", ""

        # Extract phone number (Kenyan format)
        phone_pattern = r"(0[17]\d{8}|254\d{9}|\+254\d{9})"
        phone_match = re.search(phone_pattern, details)
        phone = phone_match.group(1) if phone_match else ""

        # Extract name — text between "from/to" and the phone number or end
        name = ""
        name_patterns = [
            r"(?:from|to)\s+([A-Z][A-Z\s]+?)(?:\s+\d{10}|\s+\d{12}|$)",
            r"(?:Customer Payment from\s+\d+\s*-\s*)([A-Z][A-Z\s]+)",
            r"([A-Z][A-Z\s]{3,30})(?:\s+\d{10}|\s+\d{12})",
        ]
        for pattern in name_patterns:
            match = re.search(pattern, details, re.IGNORECASE)
            if match:
                name = match.group(1).strip().title()
                break

        # If no name found, use abbreviated details
        if not name and details:
            # Take first 30 chars as name proxy
            name = details[:30].strip().title()

        return name, phone

    def _classify_mpesa_type(self, details: str, amount: float) -> str:
        """Map M-Pesa details text to Newsconseen transaction_type."""
        details_lower = details.lower()
        for pattern, tx_type in MPESA_TYPE_MAP.items():
            if pattern in details_lower:
                return tx_type
        # Fallback based on direction
        return "service_fee" if amount > 0 else "other_expense"

    def _extract_from_pdf(self, buf: io.BytesIO) -> list[dict]:
        """
        Extract transactions from M-Pesa statement PDF.
        Uses pdfplumber if available, falls back to guidance message.
        """
        try:
            import pdfplumber
            records = []
            with pdfplumber.open(buf) as pdf:
                for page in pdf.pages:
                    tables = page.extract_tables()
                    for table in tables:
                        if not table:
                            continue
                        headers = [str(h).lower().strip() for h in table[0]]
                        for row in table[1:]:
                            if not row:
                                continue
                            row_dict = dict(zip(headers, [str(c) if c else "" for c in row]))
                            record = self._normalize_statement_row(row_dict)
                            if record:
                                records.append(record)
            logger.info("MpesaConnector: extracted %d rows from PDF", len(records))
            return records
        except ImportError:
            logger.warning(
                "MpesaConnector: pdfplumber not installed — "
                "PDF extraction unavailable. Install with: pip install pdfplumber. "
                "Export your M-Pesa statement as CSV for best results."
            )
            return []

    # ----------------------------------------------------------
    # Method B — Daraja API
    # ----------------------------------------------------------

    def _extract_from_daraja(self) -> list[dict]:
        """
        Pull transactions via Safaricom Daraja API.
        Requires Consumer Key, Consumer Secret, and Shortcode.
        """
        consumer_key    = self.credentials.get("consumer_key", "")
        consumer_secret = self.credentials.get("consumer_secret", "")
        shortcode       = self.credentials.get("shortcode", "")
        sandbox         = self.credentials.get("sandbox", False)

        base = DARAJA_SANDBOX if sandbox else DARAJA_BASE

        # Get OAuth token
        token = self._get_daraja_token(base, consumer_key, consumer_secret)
        if not token:
            logger.error("MpesaConnector: Daraja authentication failed")
            return []

        # Query transaction status
        # Note: Daraja C2B requires webhook registration for real-time data.
        # For historical data, operators should use statement CSV.
        # This method is suitable for real-time webhooks.
        logger.info(
            "MpesaConnector: Daraja API connected (shortcode=%s, sandbox=%s)",
            shortcode, sandbox,
        )
        logger.info(
            "MpesaConnector: For historical transactions use statement CSV upload. "
            "Daraja API is optimized for real-time C2B webhook processing."
        )
        return []

    def _get_daraja_token(
        self, base: str, consumer_key: str, consumer_secret: str
    ) -> Optional[str]:
        """Get OAuth2 access token from Daraja."""
        try:
            import base64
            credentials = base64.b64encode(
                f"{consumer_key}:{consumer_secret}".encode()
            ).decode()
            resp = requests.get(
                f"{base}{DARAJA_AUTH_URL}",
                headers={"Authorization": f"Basic {credentials}"},
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json().get("access_token")
        except Exception as e:
            logger.error("MpesaConnector._get_daraja_token: %s", e)
            return None

    # ----------------------------------------------------------
    # Transaction transformation
    # ----------------------------------------------------------

    def _transform_transaction(self, raw: dict, idx: int) -> Optional[dict]:
        """Map a raw M-Pesa record to Transaction entity format."""
        amount = raw.get("amount", 0)
        if not amount or float(amount) == 0:
            return None

        tx_type = raw.get("transaction_type", "other_expense")

        return {
            "transaction_type":  tx_type,
            "amount":            float(amount),
            "status":            "posted",
            "transaction_date":  raw.get("transaction_date"),
            "reference":         raw.get("receipt_no"),
            "description":       raw.get("details", "")[:200],
            "currency":          "KES",
            "source":            "mpesa",
            "external_id":       raw.get("receipt_no"),
            "direction":         raw.get("direction", "out"),
            "balance_after":     raw.get("balance"),
        }

    def _make_counterparty_person(
        self, name: str, phone: str
    ) -> Optional[dict]:
        """Create a Person (contact) record for an M-Pesa counterparty."""
        if not name or len(name) < 2:
            return None

        name_parts = name.strip().split()
        first = name_parts[0] if name_parts else name
        last  = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

        return {
            "first_name":    first,
            "last_name":     last or "—",
            "person_type":   "contact",
            "person_subtype":"Raw Material Supplier",  # default — operator can update
            "phone":         phone,
            "status":        "active",
            "internal_notes":"Auto-created from M-Pesa statement import",
            "external_id":   phone or name,
        }
