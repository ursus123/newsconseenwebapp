"""Canonical intelligence ingestion boundary."""

from intelligence.adapters import adapt
from intelligence.cache import clear
from intelligence.correlation import describe
from intelligence.repository import SupabaseIntelligenceRepository


class IntelligenceIngestionService:
    def __init__(self, repository=None):
        self.repository = repository or SupabaseIntelligenceRepository()

    def ingest(self, source_kind: str, payload: dict, context: dict, *, actor_id="system", request_id=""):
        candidate = adapt(source_kind, payload, context)
        result = self.repository.ingest(candidate, describe(candidate), actor_id=actor_id, request_id=request_id)
        clear()
        return result
