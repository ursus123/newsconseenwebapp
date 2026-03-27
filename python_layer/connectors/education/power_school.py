import logging
from connectors.base import BaseConnector

logger = logging.getLogger(__name__)


class PowerSchoolConnector(BaseConnector):
    """PowerSchool API connector. Sprint 6."""

    def extract(self):
        logger.info("PowerSchoolConnector: stub — not yet implemented")
        return []

    def transform(self, raw_records):
        return {"people": [], "enterprises": [], "products": [], "transactions": []}
