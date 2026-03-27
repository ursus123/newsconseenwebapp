import logging
from connectors.base import BaseConnector

logger = logging.getLogger(__name__)


class SquareConnector(BaseConnector):
    """Square POS OAuth connector. Sprint 7."""

    def extract(self):
        logger.info("SquareConnector: stub — not yet implemented")
        return []

    def transform(self, raw_records):
        return {"people": [], "enterprises": [], "products": [], "transactions": []}
