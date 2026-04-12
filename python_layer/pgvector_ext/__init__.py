# pgvector semantic search layer for Newsconseen
from .embedder import get_embedding, entity_to_text
from .searcher import search_similar, find_duplicates

__all__ = ["get_embedding", "entity_to_text", "search_similar", "find_duplicates"]
