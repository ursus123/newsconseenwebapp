import logging
from connectors.base import BaseConnector

logger = logging.getLogger(__name__)


class PaychexConnector(BaseConnector):
    """Paychex Flex API connector. Sprint 3."""

    def extract(self):
        logger.info("PaychexConnector: stub — not yet implemented")
        return []

    def transform(self, raw_records):
        return {"people": [], "enterprises": [], "products": [], "transactions": []}
