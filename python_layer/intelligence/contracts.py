"""Versioned governed contract for Intelligence Inbox items."""

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


INTELLIGENCE_ITEM_CONTRACT = "intelligence-item.v1"
INTELLIGENCE_INBOX_CONTRACT = "intelligence-inbox.v1"

SourceClass = Literal[
    "deterministic_rule",
    "analytical_calculation",
    "machine_learning_model",
    "governed_agent",
    "external_observation",
    "data_quality_detector",
    "idjwi_core_reasoning",
    "tenant_llm_advisor",
    "human_operator_report",
]

AssertionClass = Literal[
    "observed_fact",
    "deterministic_finding",
    "analytical_finding",
    "predictive_finding",
    "external_finding",
    "operator_report",
    "advisor_proposal",
    "idjwi_validated_finding",
]


class AuthorizedReference(BaseModel):
    type: str
    id: str
    label: Optional[str] = None
    relationship: Optional[str] = None


class EvidenceReference(BaseModel):
    id: str
    type: str = "record"
    label: Optional[str] = None
    source: Optional[str] = None
    observed_at: Optional[str] = None


class IntelligenceSource(BaseModel):
    type: SourceClass
    id: str
    label: Optional[str] = None
    assertion_class: AssertionClass
    authority: Literal["evidence", "derived", "proposal", "operator"]
    model_version: Optional[str] = None


class AdvisorParticipation(BaseModel):
    state: Literal[
        "not_requested", "requested", "consulted", "multiple_consulted",
        "unavailable", "core_fallback", "required_unavailable",
    ] = "not_requested"
    advisor_ids: list[str] = Field(default_factory=list)
    contribution_proven: bool = False


class LifecycleTimestamps(BaseModel):
    detected_at: Optional[str] = None
    validated_at: Optional[str] = None
    assigned_at: Optional[str] = None
    investigated_at: Optional[str] = None
    decided_at: Optional[str] = None
    approved_at: Optional[str] = None
    actioned_at: Optional[str] = None
    outcome_observed_at: Optional[str] = None
    resolved_at: Optional[str] = None
    reopened_at: Optional[str] = None


class IntelligenceItem(BaseModel):
    contract: Literal["intelligence-item.v1"] = INTELLIGENCE_ITEM_CONTRACT
    id: str
    tenant_id: str
    organization_id: str
    operational_unit_id: Optional[str] = None
    affected_scope: dict[str, Any] = Field(default_factory=dict)
    intelligence_type: Literal["finding", "risk", "opportunity", "prediction", "recommendation"]
    subtype: Optional[str] = None
    title: str
    explanation: str
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    operational_impact: Optional[str] = None
    source: IntelligenceSource
    evidence: list[EvidenceReference] = Field(default_factory=list)
    provenance: dict[str, Any] = Field(default_factory=dict)
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    uncertainty: Optional[str] = None
    freshness: dict[str, Any] = Field(default_factory=dict)
    expires_at: Optional[str] = None
    status: str
    lifecycle: LifecycleTimestamps = Field(default_factory=LifecycleTimestamps)
    owner: Optional[AuthorizedReference] = None
    eligible_actors: list[AuthorizedReference] = Field(default_factory=list)
    required_permissions: list[str] = Field(default_factory=lambda: ["intelligence.read"])
    permitted_actions: list[dict[str, Any]] = Field(default_factory=list)
    recommended_next_action: Optional[dict[str, Any]] = None
    approval: dict[str, Any] = Field(default_factory=dict)
    related_records: list[AuthorizedReference] = Field(default_factory=list)
    graph_relationships: list[AuthorizedReference] = Field(default_factory=list)
    idjwi_context: dict[str, Any] = Field(default_factory=dict)
    advisor: AdvisorParticipation = Field(default_factory=AdvisorParticipation)
    contradictions: list[EvidenceReference] = Field(default_factory=list)
    outcome_history: list[dict[str, Any]] = Field(default_factory=list)
    resolution_history: list[dict[str, Any]] = Field(default_factory=list)
    audit_context: dict[str, Any] = Field(default_factory=dict)


class IntelligenceInboxEnvelope(BaseModel):
    contract: Literal["intelligence-inbox.v1"] = INTELLIGENCE_INBOX_CONTRACT
    item_contract: Literal["intelligence-item.v1"] = INTELLIGENCE_ITEM_CONTRACT
    generated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    tenant_id: str
    organization_id: str
    items: list[IntelligenceItem] = Field(default_factory=list)
    state: Literal["available", "empty", "unauthorized", "unavailable", "degraded"] = "empty"
    summary: dict[str, int] = Field(default_factory=dict)
    idjwi_context: dict[str, Any] = Field(default_factory=dict)
    audit_context: dict[str, Any] = Field(default_factory=dict)
    authorization: dict[str, Any] = Field(default_factory=dict)
    delivery: dict[str, Any] = Field(default_factory=dict)
