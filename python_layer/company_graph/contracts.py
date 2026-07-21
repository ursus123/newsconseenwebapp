from typing import Any, Literal

from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    label: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class GraphEvidence(BaseModel):
    source_zone: Literal["canonical", "analytics"]
    source_table: str
    source_record_id: str
    assertion_type: Literal["fact", "derived"]
    confidence: float = Field(ge=0, le=1)
    explanation: str
    derivation_rule: str | None = None


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    predicate: str
    label: str
    direction: Literal["directed"] = "directed"
    status: str = "active"
    valid_from: str | None = None
    valid_to: str | None = None
    evidence: GraphEvidence


class GraphPacket(BaseModel):
    company_id: str
    scope: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    counts: dict[str, int]
    provenance: dict[str, Any]
    unavailable_sources: list[str] = Field(default_factory=list)
    quality: dict[str, Any] = Field(default_factory=dict)
    briefing: dict[str, Any] = Field(default_factory=dict)
