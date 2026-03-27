# ==============================================================
# Bank Statement Connector — Sprint 2
# ==============================================================
# Universal bank statement importer.
# Handles three formats that virtually every bank supports:
#
#   CSV  — most common export format
#   OFX  — Open Financial Exchange (used by most Western banks)
#   QIF  — Quicken Interchange Format (older but still common)
#
# Maps to:
#   Transaction — all statement entries
#
# Column detection is intelligent — works with any bank's
# CSV format regardless of column naming conventions.
# ==============================================================

import io
import logging
import re
from datetime import datetime
from typing import Any, Optional

from connectors.base import BaseConnector, UnmappedValueError

logger = logging.getLogger(__name__)

# Common bank CSV column patterns
BANK_DATE_COLS   = {"date", "transaction date", "posted date", "value date",
                    "booking date", "trade date", "effective date"}
BANK_DESC_COLS   = {"description", "details", "narration", "memo", "reference",
                    "transaction description", "particulars", "payee", "narrative"}
BANK_AMOUNT_COLS = {"amount", "value", "transaction amount", "debit/credit",
                    "net amount", "credit", "debit"}
BANK_CREDIT_COLS = {"credit", "deposit", "money in", "inflow", "credit amount"}
BANK_DEBIT_COLS  = {"debit", "withdrawal", "money out", "outflow", "debit amount"}
BANK_BALANCE_COLS= {"balance", "running balance", "closing balance", "available balance"}
BANK_REF_COLS    = {"reference", "ref", "transaction id", "transaction ref",
                    "cheque no", "check no", "folio no", "seq"}

# Keywords for transaction type classification
TYPE_KEYWORDS = {
    "product_sale":       ["sale", "payment received", "credit", "receipt"],
    "service_fee":        ["fee received", "service income", "service credit"],
    "payroll":            ["salary", "payroll", "wages", "pay slip"],
    "rent_expense":       ["rent", "lease", "tenancy"],
    "utility_expense":    ["electricity", "water", "power", "utility", "kplc", "nawasco"],
    "supply_purchase":    ["purchase", "buy", "supplier", "vendor", "goods"],
    "contractor_payment": ["contractor", "freelance", "consultant fee"],
    "tax_payment":        ["kra", "tax", "revenue", "duty", "vat"],
    "other_expense":      ["withdrawal", "transfer out", "debit", "payment"],
    "refund_received":    ["refund", "reversal credit", "chargeback credit"],
    "refund_issued":      ["refund issued", "reversal debit", "chargeback"],
}


class BankStatementConnector(BaseConnector):
    """
    Universal bank statement connector.
    Handles CSV, OFX, and QIF bank export formats.

    credentials must contain:
        file_content:   bytes  — statement file content
        file_name:      str    — original filename (used to detect format)

    Optional:
        currency:       str  — ISO currency code (default: USD)
        bank_name:      str  — bank name for display
        account_name:   str  — account holder name
        date_format:    str  — override date format if auto-detection fails
    """

    def extract(self) -> list[dict[str, Any]]:
        file_content = self.credentials.get("file_content")
        file_name    = self.credentials.get("file_name", "statement.csv")

        if not file_content:
            logger.error("BankStatementConnector: no file_content in credentials")
            return []

        ext = file_name.rsplit(".", 1)[-1].lower()

        if ext == "ofx" or ext == "qfx":
            return self._extract_ofx(file_content)
        elif ext == "qif":
            return self._extract_qif(file_content)
        else:
            return self._extract_csv(file_content, file_name)

    def transform(self, raw_records: list[dict]) -> dict[str, list]:
        transactions = []

        for i, raw in enumerate(raw_records):
            try:
                amount = raw.get("amount", 0)
                if not amount or float(amount) == 0:
                    continue

                transactions.append(self.scope({
                    "transaction_type":  raw.get("transaction_type", "other_expense"),
                    "amount":            abs(float(amount)),
                    "status":            "posted",
                    "transaction_date":  raw.get("transaction_date"),
                    "reference":         raw.get("reference"),
                    "description":       raw.get("description", "")[:200],
                    "currency":          raw.get("currency", "USD"),
                    "source":            f"bank_statement_{self.credentials.get('bank_name', 'unknown').lower().replace(' ', '_')}",
                    "external_id":       raw.get("external_id"),
                    "direction":         raw.get("direction", "out"),
                    "balance_after":     raw.get("balance"),
                }))

            except Exception as e:
                self.run_stats["failed"] += 1
                logger.warning("BankStatementConnector: failed row %d — %s", i, e)

        logger.info(
            "BankStatementConnector.transform: %d transactions from %s",
            len(transactions),
            self.credentials.get("bank_name", "bank"),
        )

        return {
            "transactions": transactions,
            "people": [], "relationships": [],
            "enterprises": [], "products": [],
        }

    # ----------------------------------------------------------
    # Format extractors
    # ----------------------------------------------------------

    def _extract_csv(self, file_content: bytes, file_name: str) -> list[dict]:
        """Parse bank statement CSV."""
        try:
            import pandas as pd
        except ImportError:
            logger.error("BankStatementConnector: pandas not installed")
            return []

        try:
            buf = io.BytesIO(
                file_content if isinstance(file_content, bytes)
                else file_content.encode()
            )

            # Try multiple separators and encodings
            df = None
            for sep in [",", ";", "\t", "|"]:
                for encoding in ["utf-8-sig", "utf-8", "latin-1"]:
                    try:
                        buf.seek(0)
                        test_df = pd.read_csv(buf, sep=sep, dtype=str, encoding=encoding)
                        if len(test_df.columns) >= 3:
                            df = test_df
                            break
                    except Exception:
                        continue
                if df is not None:
                    break

            if df is None:
                logger.error("BankStatementConnector: could not parse CSV")
                return []

            df.columns = [c.lower().strip() for c in df.columns]
            df = df.where(df.notna(), None)

            records = []
            for _, row in df.iterrows():
                r = row.to_dict()
                record = self._normalize_csv_row(r)
                if record:
                    records.append(record)

            logger.info(
                "BankStatementConnector: parsed %d rows from CSV %s",
                len(records), file_name,
            )
            return records

        except Exception as e:
            logger.error("BankStatementConnector._extract_csv: %s", e)
            return []

    def _extract_ofx(self, file_content: bytes) -> list[dict]:
        """Parse OFX/QFX bank statement."""
        try:
            content = file_content.decode("utf-8", errors="replace")
            records = []

            # OFX is SGML/XML — parse STMTTRN blocks
            tx_blocks = re.findall(
                r"<STMTTRN>(.*?)</STMTTRN>",
                content, re.DOTALL
            )

            for block in tx_blocks:
                def get_tag(tag: str) -> str:
                    match = re.search(f"<{tag}>(.*?)(?:<|$)", block, re.DOTALL)
                    return match.group(1).strip() if match else ""

                trntype = get_tag("TRNTYPE").lower()
                dtposted= get_tag("DTPOSTED")
                amount  = get_tag("TRNAMT")
                name    = get_tag("NAME") or get_tag("MEMO")
                fitid   = get_tag("FITID")
                memo    = get_tag("MEMO")

                try:
                    amt = float(amount) if amount else 0
                except ValueError:
                    continue

                if not amt:
                    continue

                # Parse OFX date format YYYYMMDDHHMMSS
                tx_date = None
                if dtposted:
                    try:
                        tx_date = datetime.strptime(
                            dtposted[:8], "%Y%m%d"
                        ).isoformat()
                    except ValueError:
                        tx_date = dtposted

                direction = "in" if amt > 0 else "out"
                tx_type   = self._classify_type(
                    f"{trntype} {name} {memo}", direction
                )

                records.append({
                    "amount":           abs(amt),
                    "direction":        direction,
                    "transaction_type": tx_type,
                    "transaction_date": tx_date,
                    "description":      f"{name} {memo}".strip()[:200],
                    "reference":        fitid,
                    "currency":         self.credentials.get("currency", "USD"),
                    "external_id":      fitid,
                })

            logger.info(
                "BankStatementConnector: parsed %d transactions from OFX", len(records)
            )
            return records

        except Exception as e:
            logger.error("BankStatementConnector._extract_ofx: %s", e)
            return []

    def _extract_qif(self, file_content: bytes) -> list[dict]:
        """Parse QIF (Quicken Interchange Format) bank statement."""
        try:
            content = file_content.decode("utf-8", errors="replace")
            records = []

            current = {}
            for line in content.split("\n"):
                line = line.strip()
                if not line:
                    continue

                if line == "^":
                    # End of transaction record
                    if "amount" in current:
                        records.append(current)
                    current = {}
                elif line[0] == "D":
                    current["transaction_date"] = self._parse_qif_date(line[1:])
                elif line[0] == "T":
                    try:
                        amt_str = line[1:].replace(",", "").strip()
                        current["amount"] = float(amt_str)
                        current["direction"] = "in" if current["amount"] >= 0 else "out"
                    except ValueError:
                        pass
                elif line[0] == "P":
                    current["description"] = line[1:][:200]
                elif line[0] == "N":
                    current["reference"] = line[1:]
                elif line[0] == "M":
                    current["memo"] = line[1:]

            # Process last record
            if "amount" in current:
                records.append(current)

            # Classify and clean
            result = []
            for r in records:
                desc = f"{r.get('description', '')} {r.get('memo', '')}"
                direction = r.get("direction", "out")
                r["transaction_type"] = self._classify_type(desc, direction)
                r["currency"]         = self.credentials.get("currency", "USD")
                r["external_id"]      = r.get("reference")
                result.append(r)

            logger.info(
                "BankStatementConnector: parsed %d transactions from QIF", len(result)
            )
            return result

        except Exception as e:
            logger.error("BankStatementConnector._extract_qif: %s", e)
            return []

    # ----------------------------------------------------------
    # CSV normalization helpers
    # ----------------------------------------------------------

    def _normalize_csv_row(self, row: dict) -> Optional[dict]:
        """Normalize a raw CSV row to standard transaction dict."""
        def find(aliases: set) -> Optional[str]:
            for a in aliases:
                if a in row and row[a]:
                    return str(row[a]).strip()
            return None

        date_str = find(BANK_DATE_COLS)
        desc     = find(BANK_DESC_COLS) or ""
        ref      = find(BANK_REF_COLS)
        balance  = find(BANK_BALANCE_COLS)

        # Try combined amount column first
        amount_str = find(BANK_AMOUNT_COLS)
        credit_str = find(BANK_CREDIT_COLS)
        debit_str  = find(BANK_DEBIT_COLS)

        amount    = 0.0
        direction = "out"

        if amount_str:
            try:
                amount = float(re.sub(r"[^\d.-]", "", amount_str))
                direction = "in" if amount > 0 else "out"
                amount = abs(amount)
            except ValueError:
                pass
        elif credit_str or debit_str:
            credit = self._parse_amount(credit_str)
            debit  = self._parse_amount(debit_str)
            if credit:
                amount, direction = credit, "in"
            elif debit:
                amount, direction = debit, "out"

        if not amount:
            return None

        tx_type = self._classify_type(desc, direction)

        return {
            "amount":           amount,
            "direction":        direction,
            "transaction_type": tx_type,
            "transaction_date": self._parse_date(date_str),
            "description":      desc[:200],
            "reference":        ref,
            "balance":          self._parse_amount(balance),
            "currency":         self.credentials.get("currency", "USD"),
            "external_id":      ref or f"{date_str}_{amount}",
        }

    def _classify_type(self, description: str, direction: str) -> str:
        """Classify transaction type from description text."""
        desc_lower = description.lower()
        for tx_type, keywords in TYPE_KEYWORDS.items():
            for kw in keywords:
                if kw in desc_lower:
                    return tx_type
        return "service_fee" if direction == "in" else "other_expense"

    def _parse_amount(self, val: Optional[str]) -> float:
        if not val:
            return 0.0
        try:
            return abs(float(re.sub(r"[^\d.-]", "", str(val))))
        except ValueError:
            return 0.0

    def _parse_date(self, date_str: Optional[str]) -> Optional[str]:
        if not date_str:
            return None

        # Try operator-specified format first
        custom_fmt = self.credentials.get("date_format")
        if custom_fmt:
            try:
                return datetime.strptime(date_str.strip(), custom_fmt).isoformat()
            except ValueError:
                pass

        formats = [
            "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y",
            "%d-%m-%Y", "%Y/%m/%d",
            "%d %b %Y", "%d %B %Y",
            "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M",
            "%m/%d/%Y %H:%M:%S",
        ]
        for fmt in formats:
            try:
                return datetime.strptime(date_str.strip(), fmt).isoformat()
            except ValueError:
                continue
        return date_str

    def _parse_qif_date(self, date_str: str) -> Optional[str]:
        """Parse QIF date formats (MM/DD/YYYY or MM/DD/YY)."""
        for fmt in ["%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y", "%Y-%m-%d"]:
            try:
                return datetime.strptime(date_str.strip(), fmt).isoformat()
            except ValueError:
                continue
        return date_str
