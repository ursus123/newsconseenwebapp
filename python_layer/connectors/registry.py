# ==============================================================
# Newsconseen Connector Registry
# ==============================================================
# Maps connector_id strings to connector classes.
# Used by the API endpoints and the Connectors UI to
# instantiate connectors by name.
#
# Sprint delivery status:
#   ✅ Sprint 1 — File connectors (Excel, CSV, Google Sheets, PDF, JSON)
#   🔲 Sprint 2 — Mobile money (M-Pesa, MTN, Airtel, Wave, Stripe)
#   🔲 Sprint 3 — HR/Payroll (ADP, Paychex, BambooHR, Gusto)
#   🔲 Sprint 4 — Accounting (QuickBooks, Wave, Xero, Sage)
#   🔲 Sprint 5 — Health/EHR (OpenMRS, Therap, Epic FHIR)
#   🔲 Sprint 6 — Education (PowerSchool, Canvas, Google Classroom)
#   🔲 Sprint 7 — POS (Square, Shopify, Toast)
#   🔲 Sprint 8 — Government (KRA, Ghana GRA, Nigeria CAC)
# ==============================================================

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from connectors.base import BaseConnector

logger = logging.getLogger(__name__)

# ----------------------------------------------------------
# Connector metadata — used by the UI to display available connectors
# ----------------------------------------------------------
CONNECTOR_CATALOG = {
    # ── Sprint 1 — File connectors ────────────────────────
    "excel": {
        "id":          "excel",
        "name":        "Excel / CSV Import",
        "category":    "file",
        "description": "Import people, enterprises, or items from any Excel or CSV file",
        "sprint":      1,
        "status":      "available",
        "auth_type":   "file_upload",
        "entities":    ["people", "enterprises", "products"],
        "icon":        "table",
    },
    "csv": {
        "id":          "csv",
        "name":        "CSV Import",
        "category":    "file",
        "description": "Import from CSV — same as Excel connector",
        "sprint":      1,
        "status":      "available",
        "auth_type":   "file_upload",
        "entities":    ["people", "enterprises", "products"],
        "icon":        "file-text",
    },
    "google_sheets": {
        "id":          "google_sheets",
        "name":        "Google Sheets",
        "category":    "file",
        "description": "Sync from a Google Sheet — live or snapshot",
        "sprint":      1,
        "status":      "available",
        "auth_type":   "oauth",
        "entities":    ["people", "enterprises", "products"],
        "icon":        "grid",
    },
    "json_xml": {
        "id":          "json_xml",
        "name":        "JSON / XML Import",
        "category":    "file",
        "description": "Import from any JSON or XML data export",
        "sprint":      1,
        "status":      "available",
        "auth_type":   "file_upload",
        "entities":    ["people", "enterprises", "products"],
        "icon":        "code",
    },

    # ── Sprint 2 — Mobile money ───────────────────────────
    "mpesa": {
        "id":          "mpesa",
        "name":        "M-Pesa",
        "category":    "mobile_money",
        "description": "Ingest M-Pesa transaction statements via CSV or Safaricom Daraja API",
        "sprint":      2,
        "status":      "available",
        "auth_type":   "api_key",
        "entities":    ["transactions", "people"],
        "icon":        "smartphone",
    },
    "mtn_momo": {
        "id":          "mtn_momo",
        "name":        "MTN Mobile Money",
        "category":    "mobile_money",
        "description": "Ingest MTN MoMo transaction data via CSV or MoMo API",
        "sprint":      2,
        "status":      "available",
        "auth_type":   "api_key",
        "entities":    ["transactions", "people"],
        "icon":        "smartphone",
    },
    "airtel_money": {
        "id":          "airtel_money",
        "name":        "Airtel Money",
        "category":    "mobile_money",
        "description": "Ingest Airtel Money transaction data via CSV (Kenya, Uganda, Tanzania)",
        "sprint":      2,
        "status":      "available",
        "auth_type":   "api_key",
        "entities":    ["transactions", "people"],
        "icon":        "smartphone",
    },
    "wave": {
        "id":          "wave",
        "name":        "Wave",
        "category":    "mobile_money",
        "description": "Ingest Wave mobile money transactions (Senegal, Côte d'Ivoire) via CSV or API",
        "sprint":      2,
        "status":      "available",
        "auth_type":   "api_key",
        "entities":    ["transactions", "people"],
        "icon":        "smartphone",
    },
    "stripe": {
        "id":          "stripe",
        "name":        "Stripe",
        "category":    "mobile_money",
        "description": "Sync Stripe payment transactions and customers via Stripe API",
        "sprint":      2,
        "status":      "available",
        "auth_type":   "api_key",
        "entities":    ["transactions", "people"],
        "icon":        "credit-card",
    },
    "bank_statement": {
        "id":          "bank_statement",
        "name":        "Bank Statement (Universal)",
        "category":    "mobile_money",
        "description": "Import any bank statement in CSV, OFX, or QIF format — auto-detects layout",
        "sprint":      2,
        "status":      "available",
        "auth_type":   "file_upload",
        "entities":    ["transactions"],
        "icon":        "landmark",
    },

    # ── Sprint 3 — HR/Payroll ─────────────────────────────
    "adp": {
        "id":          "adp",
        "name":        "ADP",
        "category":    "hr_payroll",
        "description": "Sync employees, payroll runs, and departments from ADP",
        "sprint":      3,
        "status":      "coming_soon",
        "auth_type":   "oauth",
        "entities":    ["people", "transactions"],
        "icon":        "users",
    },
    "paychex": {
        "id":          "paychex",
        "name":        "Paychex",
        "category":    "hr_payroll",
        "description": "Sync employees, payroll, and time-attendance from Paychex",
        "sprint":      3,
        "status":      "coming_soon",
        "auth_type":   "oauth",
        "entities":    ["people", "transactions"],
        "icon":        "users",
    },
    "bamboohr": {
        "id":          "bamboohr",
        "name":        "BambooHR",
        "category":    "hr_payroll",
        "description": "Sync employee records and org chart from BambooHR",
        "sprint":      3,
        "status":      "coming_soon",
        "auth_type":   "api_key",
        "entities":    ["people"],
        "icon":        "users",
    },
    "gusto": {
        "id":          "gusto",
        "name":        "Gusto",
        "category":    "hr_payroll",
        "description": "Sync employees, contractors, and payroll from Gusto",
        "sprint":      3,
        "status":      "coming_soon",
        "auth_type":   "oauth",
        "entities":    ["people", "transactions"],
        "icon":        "users",
    },

    # ── Sprint 4 — Accounting ─────────────────────────────
    "quickbooks": {
        "id":          "quickbooks",
        "name":        "QuickBooks Online",
        "category":    "accounting",
        "description": "Sync invoices, payments, vendors, and customers from QuickBooks",
        "sprint":      4,
        "status":      "coming_soon",
        "auth_type":   "oauth",
        "entities":    ["transactions", "people", "products"],
        "icon":        "dollar-sign",
    },
    "wave_accounting": {
        "id":          "wave_accounting",
        "name":        "Wave Accounting",
        "category":    "accounting",
        "description": "Sync financial records from Wave (popular in Africa)",
        "sprint":      4,
        "status":      "coming_soon",
        "auth_type":   "oauth",
        "entities":    ["transactions", "people", "products"],
        "icon":        "dollar-sign",
    },
    "xero": {
        "id":          "xero",
        "name":        "Xero",
        "category":    "accounting",
        "description": "Sync financial records from Xero",
        "sprint":      4,
        "status":      "coming_soon",
        "auth_type":   "oauth",
        "entities":    ["transactions", "people", "products"],
        "icon":        "dollar-sign",
    },
    "sage": {
        "id":          "sage",
        "name":        "Sage",
        "category":    "accounting",
        "description": "Sync financial records from Sage",
        "sprint":      4,
        "status":      "coming_soon",
        "auth_type":   "oauth",
        "entities":    ["transactions", "people", "products"],
        "icon":        "dollar-sign",
    },

    # ── Sprint 5 — Health/EHR ─────────────────────────────
    "openmrs": {
        "id":          "openmrs",
        "name":        "OpenMRS",
        "category":    "health",
        "description": "Sync patients, visits, and drug orders from OpenMRS",
        "sprint":      5,
        "status":      "coming_soon",
        "auth_type":   "api_key",
        "entities":    ["people", "products", "transactions"],
        "icon":        "heart",
    },
    "therap": {
        "id":          "therap",
        "name":        "Therap",
        "category":    "health",
        "description": "Sync service recipients, ISPs, goals, and billing from Therap",
        "sprint":      5,
        "status":      "coming_soon",
        "auth_type":   "oauth",
        "entities":    ["people", "transactions"],
        "icon":        "heart",
    },
    "epic_fhir": {
        "id":          "epic_fhir",
        "name":        "Epic (FHIR)",
        "category":    "health",
        "description": "Sync patients, encounters, and medications from Epic via FHIR",
        "sprint":      5,
        "status":      "coming_soon",
        "auth_type":   "oauth",
        "entities":    ["people", "products", "transactions"],
        "icon":        "heart",
    },
    "dhis2": {
        "id":          "dhis2",
        "name":        "DHIS2",
        "category":    "health",
        "description": "Sync health facility data and aggregate indicators from DHIS2",
        "sprint":      5,
        "status":      "coming_soon",
        "auth_type":   "api_key",
        "entities":    ["enterprises"],
        "icon":        "heart",
    },

    # ── Sprint 6 — Education ──────────────────────────────
    "google_classroom": {
        "id":          "google_classroom",
        "name":        "Google Classroom",
        "category":    "education",
        "description": "Sync students, teachers, classes, and assignments",
        "sprint":      6,
        "status":      "coming_soon",
        "auth_type":   "oauth",
        "entities":    ["people", "enterprises"],
        "icon":        "book",
    },
    "powerschool": {
        "id":          "powerschool",
        "name":        "PowerSchool",
        "category":    "education",
        "description": "Sync students, staff, enrollment, and attendance from PowerSchool",
        "sprint":      6,
        "status":      "coming_soon",
        "auth_type":   "oauth",
        "entities":    ["people", "enterprises"],
        "icon":        "book",
    },
    "canvas": {
        "id":          "canvas",
        "name":        "Canvas LMS",
        "category":    "education",
        "description": "Sync students, courses, and assignments from Canvas",
        "sprint":      6,
        "status":      "coming_soon",
        "auth_type":   "api_key",
        "entities":    ["people", "enterprises"],
        "icon":        "book",
    },

    # ── Sprint 7 — POS ────────────────────────────────────
    "square": {
        "id":          "square",
        "name":        "Square",
        "category":    "pos",
        "description": "Sync sales, inventory, and customers from Square POS",
        "sprint":      7,
        "status":      "coming_soon",
        "auth_type":   "oauth",
        "entities":    ["transactions", "products", "people"],
        "icon":        "shopping-cart",
    },
    "shopify": {
        "id":          "shopify",
        "name":        "Shopify",
        "category":    "pos",
        "description": "Sync orders, products, and customers from Shopify",
        "sprint":      7,
        "status":      "coming_soon",
        "auth_type":   "oauth",
        "entities":    ["transactions", "products", "people"],
        "icon":        "shopping-cart",
    },
    "toast": {
        "id":          "toast",
        "name":        "Toast POS",
        "category":    "pos",
        "description": "Sync restaurant orders, menu items, and staff from Toast",
        "sprint":      7,
        "status":      "coming_soon",
        "auth_type":   "oauth",
        "entities":    ["transactions", "products", "people"],
        "icon":        "shopping-cart",
    },

    # ── Database / Data Warehouse connectors ─────────────
    "postgresql_db": {
        "id":          "postgresql_db",
        "name":        "PostgreSQL",
        "category":    "database",
        "description": "Connect to any PostgreSQL database — on-prem, cloud, or local",
        "sprint":      1,
        "status":      "available",
        "auth_type":   "connection_string",
        "entities":    ["people", "enterprises", "products", "transactions", "tasks"],
        "icon":        "database",
    },
    "mysql_db": {
        "id":          "mysql_db",
        "name":        "MySQL / MariaDB",
        "category":    "database",
        "description": "Connect to MySQL or MariaDB — any version, any host",
        "sprint":      1,
        "status":      "available",
        "auth_type":   "connection_string",
        "entities":    ["people", "enterprises", "products", "transactions", "tasks"],
        "icon":        "database",
    },
    "aws_rds": {
        "id":          "aws_rds",
        "name":        "AWS RDS / Aurora",
        "category":    "database",
        "description": "Connect to Amazon RDS or Aurora (PostgreSQL or MySQL engine)",
        "sprint":      1,
        "status":      "available",
        "auth_type":   "connection_string",
        "entities":    ["people", "enterprises", "products", "transactions", "tasks"],
        "icon":        "cloud",
    },
    "mssql_db": {
        "id":          "mssql_db",
        "name":        "SQL Server / Azure SQL",
        "category":    "database",
        "description": "Connect to Microsoft SQL Server or Azure SQL Database",
        "sprint":      1,
        "status":      "available",
        "auth_type":   "connection_string",
        "entities":    ["people", "enterprises", "products", "transactions", "tasks"],
        "icon":        "database",
    },
    "sqlite_db": {
        "id":          "sqlite_db",
        "name":        "SQLite",
        "category":    "database",
        "description": "Connect to a local SQLite database file",
        "sprint":      1,
        "status":      "available",
        "auth_type":   "file_path",
        "entities":    ["people", "enterprises", "products", "transactions", "tasks"],
        "icon":        "hard-drive",
    },

    # ── Sprint 8 — Government ─────────────────────────────
    "kra": {
        "id":          "kra",
        "name":        "KRA (Kenya)",
        "category":    "government",
        "description": "Validate business registration and tax compliance via KRA iTax",
        "sprint":      8,
        "status":      "coming_soon",
        "auth_type":   "api_key",
        "entities":    ["enterprises"],
        "icon":        "shield",
    },
    "ghana_gra": {
        "id":          "ghana_gra",
        "name":        "Ghana GRA",
        "category":    "government",
        "description": "Validate business registration via Ghana Revenue Authority",
        "sprint":      8,
        "status":      "coming_soon",
        "auth_type":   "api_key",
        "entities":    ["enterprises"],
        "icon":        "shield",
    },
    "nigeria_cac": {
        "id":          "nigeria_cac",
        "name":        "Nigeria CAC",
        "category":    "government",
        "description": "Validate business registration via Nigeria Corporate Affairs Commission",
        "sprint":      8,
        "status":      "coming_soon",
        "auth_type":   "api_key",
        "entities":    ["enterprises"],
        "icon":        "shield",
    },
}

# ----------------------------------------------------------
# Runtime registry — maps connector_id to class
# Populated lazily as connectors are imported
# ----------------------------------------------------------
_REGISTRY: dict[str, type] = {}


def register(connector_id: str):
    """Decorator to register a connector class."""
    def decorator(cls):
        _REGISTRY[connector_id] = cls
        logger.debug("connector registered: %s → %s", connector_id, cls.__name__)
        return cls
    return decorator


def get_connector(connector_id: str) -> type | None:
    """Return the connector class for a given connector_id."""
    _ensure_connectors_loaded()
    return _REGISTRY.get(connector_id)


def list_available() -> list[dict]:
    """Return catalog entries for all connectors."""
    return list(CONNECTOR_CATALOG.values())


def list_by_sprint(sprint: int) -> list[dict]:
    """Return catalog entries for connectors in a specific sprint."""
    return [c for c in CONNECTOR_CATALOG.values() if c["sprint"] == sprint]


def list_by_category(category: str) -> list[dict]:
    """Return catalog entries for connectors in a specific category."""
    return [c for c in CONNECTOR_CATALOG.values() if c["category"] == category]


def _ensure_connectors_loaded():
    """Lazy-load connector classes on first registry access."""
    if _REGISTRY:
        return
    try:
        from connectors.file.excel import ExcelConnector
        _REGISTRY["excel"] = ExcelConnector
        _REGISTRY["csv"]   = ExcelConnector  # CSV uses the same connector
    except ImportError as e:
        logger.warning("connector registry: could not load file connectors — %s", e)
    try:
        from connectors.file.google_sheets import GoogleSheetsConnector
        _REGISTRY["google_sheets"] = GoogleSheetsConnector
    except ImportError:
        pass
    try:
        from connectors.file.json_xml import JsonXmlConnector
        _REGISTRY["json_xml"] = JsonXmlConnector
    except ImportError:
        pass
    try:
        from connectors.database.sql import SqlDatabaseConnector
        for _db_id in ("postgresql_db", "mysql_db", "aws_rds", "mssql_db", "sqlite_db"):
            _REGISTRY[_db_id] = SqlDatabaseConnector
    except ImportError as e:
        logger.warning("connector registry: could not load database connectors — %s", e)
    try:
        from connectors.mobile_money.mpesa import MpesaConnector
        _REGISTRY["mpesa"] = MpesaConnector
    except ImportError as e:
        logger.warning("connector registry: could not load mpesa — %s", e)
    try:
        from connectors.mobile_money.mtn import MtnConnector
        _REGISTRY["mtn_momo"] = MtnConnector
    except ImportError as e:
        logger.warning("connector registry: could not load mtn_momo — %s", e)
    try:
        from connectors.mobile_money.airtel import AirtelConnector
        _REGISTRY["airtel_money"] = AirtelConnector
    except ImportError as e:
        logger.warning("connector registry: could not load airtel_money — %s", e)
    try:
        from connectors.mobile_money.stripe import StripeConnector
        _REGISTRY["stripe"] = StripeConnector
    except ImportError as e:
        logger.warning("connector registry: could not load stripe — %s", e)
    try:
        from connectors.mobile_money.wavepay import WavePayConnector
        _REGISTRY["wave"] = WavePayConnector
    except ImportError as e:
        logger.warning("connector registry: could not load wave — %s", e)
    try:
        from connectors.mobile_money.bank_statement import BankStatementConnector
        _REGISTRY["bank_statement"] = BankStatementConnector
    except ImportError as e:
        logger.warning("connector registry: could not load bank_statement — %s", e)
