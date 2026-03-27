import logging
from connectors.base import BaseConnector

logger = logging.getLogger(__name__)


class OpenMrsConnector(BaseConnector):
    """OpenMRS REST API connector. Sprint 5."""

    def extract(self):
        logger.info("OpenMrsConnector: stub — not yet implemented")
        return []

    def transform(self, raw_records):
        return {"people": [], "enterprises": [], "products": [], "transactions": []}
