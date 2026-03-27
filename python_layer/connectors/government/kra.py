import logging
from connectors.base import BaseConnector

logger = logging.getLogger(__name__)


class KraConnector(BaseConnector):
    """Kenya KRA iTax API connector. Sprint 8."""

    def extract(self):
        logger.info("KraConnector: stub — not yet implemented")
        return []

    def transform(self, raw_records):
        return {"people": [], "enterprises": [], "products": [], "transactions": []}
