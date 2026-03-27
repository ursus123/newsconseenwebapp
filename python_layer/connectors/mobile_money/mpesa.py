import logging
from connectors.base import BaseConnector

logger = logging.getLogger(__name__)


class MpesaConnector(BaseConnector):
    """M-Pesa Daraja API connector. Sprint 2."""

    def extract(self):
        logger.info("MpesaConnector: stub — not yet implemented")
        return []

    def transform(self, raw_records):
        return {"people": [], "enterprises": [], "products": [], "transactions": []}
