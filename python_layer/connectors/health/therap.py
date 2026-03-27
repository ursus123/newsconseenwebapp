import logging
from connectors.base import BaseConnector

logger = logging.getLogger(__name__)


class TherapConnector(BaseConnector):
    """Therap API connector. Sprint 5."""

    def extract(self):
        logger.info("TherapConnector: stub — not yet implemented")
        return []

    def transform(self, raw_records):
        return {"people": [], "enterprises": [], "products": [], "transactions": []}
