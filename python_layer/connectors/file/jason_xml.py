import logging
from connectors.base import BaseConnector

logger = logging.getLogger(__name__)


class JsonXmlConnector(BaseConnector):
    """JSON/XML file import connector. Sprint 1 stub."""

    def extract(self):
        logger.info("JsonXmlConnector: stub — not yet implemented")
        return []

    def transform(self, raw_records):
        return {"people": [], "enterprises": [], "products": [], "transactions": []}
