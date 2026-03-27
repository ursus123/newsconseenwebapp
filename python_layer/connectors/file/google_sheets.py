# Google Sheets Connector — Sprint 1
# Stub — implement after Excel connector is deployed and validated

import logging
from connectors.base import BaseConnector

logger = logging.getLogger(__name__)


class GoogleSheetsConnector(BaseConnector):
    """
    Connector for Google Sheets via Google Sheets API v4.

    credentials must contain:
        sheet_id:       str  — Google Sheet ID from the URL
        range:          str  — Sheet range e.g. "Sheet1!A1:Z1000"
        access_token:   str  — OAuth2 access token
        entity_type:    str  — "people", "enterprises", or "products"
        column_map:     dict — operator-confirmed column mappings

    Sprint 1 — stub implementation.
    Full implementation follows ExcelConnector pattern.
    """

    def extract(self):
        logger.info("GoogleSheetsConnector: sprint 1 stub — not yet implemented")
        return []

    def transform(self, raw_records):
        return {"people": [], "enterprises": [], "products": []}
