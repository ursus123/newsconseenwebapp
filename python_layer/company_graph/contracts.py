"""Versioned governed Company Graph contract shared by API, UI, and Idjwi."""

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


GRAPH_CONTRACT_VERSION = "company-graph.v1"

AssertionClass = Literal[
    "canonical_relationship",
    "canonical_reference_projection",
    "deterministic_derivation",
    "analytical_inference",
    "external_observation",
    "advisor_proposal",
    "operator_confirmed_assertion",
]
VerificationState = Literal["verified", "unverified", "proposed", "rejected", "disputed", "superseded"]
SourceState = Literal["available", "partial", "unavailable", "unauthorized", "empty"]
CompletenessState = Literal["complete", "partial", "empty", "unauthorized", "unavailable"]
DiagnosticState = Literal["complete", "partial", "empty", "unauthorized", "unavailable", "not_applicable"]
AssertionState = Literal["proposed", "confirmed", "rejected", "disputed", "active", "expired", "superseded"]


class GraphScope(BaseModel):
    type: Literal["tenant", "organization", "operational_unit", "department", "team", "neighborhood"]
    id: str | None = None
    name: str | None = None
    center_node_id: str | None = None
    depth: int | None = Field(default=None, ge=1, le=3)


class GraphPermittedAction(BaseModel):
    action: str
    allowed: bool
    requires_approval: bool = False
    reason: str | None = None


class GraphTemporalState(BaseModel):
    status: str = "active"
    valid_from: str | None = None
    valid_to: str | None = None
    observed_at: str | None = None
    expires_at: str | None = None
    confirmed_at: str | None = None
    rejected_at: str | None = None
    superseded_by: str | None = None
    evidence_version: int = Field(default=1, ge=1)


class GraphAssertionHistoryEvent(BaseModel):
    assertion_key: str
    edge_id: str | None = None
    source: str
    predicate: str
    target: str
    from_state: str | None = None
    to_state: AssertionState
    reason: str | None = None
    actor: str = "authorized_operator"
    occurred_at: str | None = None
    evidence_version: int = Field(default=1, ge=1)


class GraphNodeSummary(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    label: str
    sublabel: str | None = None
    status: str | None = None
    sensitivity: Literal["public", "internal", "restricted", "confidential"] = "internal"
    attributes: dict[str, Any] = Field(default_factory=dict)
    permitted_actions: list[GraphPermittedAction] = Field(default_factory=list)


class GraphEvidence(BaseModel):
    evidence_id: str
    source_zone: Literal["canonical", "raw", "analytics", "external", "advisor"]
    source_table: str
    source_record_id: str
    assertion_class: AssertionClass
    explanation: str
    derivation_rule: str | None = None
    retrieved_at: str | None = None
    freshness_at: str | None = None
    requirement: str = "canonical_record_id"


class GraphEdge(BaseModel):
    id: str
    source: str
    predicate: str
    target: str
    direction: Literal["directed", "undirected"] = "directed"
    label: str
    assertion_class: AssertionClass
    status: str = "active"
    temporal: GraphTemporalState = Field(default_factory=GraphTemporalState)
    evidence: list[GraphEvidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    verification_state: VerificationState
    assertion_key: str
    assertion_state: AssertionState
    relationship_rule_id: str | None = None
    sensitivity: Literal["public", "internal", "restricted", "confidential"] = "internal"
    valid_correction_actions: list[str] = Field(default_factory=list)
    permitted_actions: list[GraphPermittedAction] = Field(default_factory=list)


class GraphSourceStatus(BaseModel):
    source_id: str
    zone: str
    table: str
    state: SourceState
    returned_records: int = Field(default=0, ge=0)
    total_records: int | None = Field(default=None, ge=0)
    requested_limit: int | None = Field(default=None, ge=1)
    may_be_truncated: bool = False
    last_success_at: str | None = None
    message: str | None = None
    retryable: bool = False
    failure_category: str | None = None
    affected_capabilities: list[str] = Field(default_factory=list)
    operator_action: str | None = None
    duration_ms: float | None = Field(default=None, ge=0)


class GraphDiagnosticDimension(BaseModel):
    state: DiagnosticState
    count: int = Field(default=0, ge=0)
    total: int = Field(default=0, ge=0)
    explanation: str
    affected_sources: list[str] = Field(default_factory=list)


class GraphCompletenessDiagnostics(BaseModel):
    source_availability: GraphDiagnosticDimension
    authorization_coverage: GraphDiagnosticDimension
    pagination_completeness: GraphDiagnosticDimension
    truncation: GraphDiagnosticDimension
    mapping_coverage: GraphDiagnosticDimension
    unmatched_endpoints: GraphDiagnosticDimension
    unknown_predicates: GraphDiagnosticDimension
    disconnected_records: GraphDiagnosticDimension
    stale_records: GraphDiagnosticDimension
    expired_relationships: GraphDiagnosticDimension
    duplicate_relationships: GraphDiagnosticDimension
    missing_assignments: GraphDiagnosticDimension
    analytical_availability: GraphDiagnosticDimension


class GraphCompleteness(BaseModel):
    state: CompletenessState
    sources_total: int = Field(ge=0)
    sources_available: int = Field(ge=0)
    sources_unavailable: int = Field(ge=0)
    sources_unauthorized: int = Field(default=0, ge=0)
    mapping_complete: bool
    authorization_filtered: bool = False
    explanation: str
    diagnostics: GraphCompletenessDiagnostics


class GraphTruncation(BaseModel):
    truncated: bool = False
    requested_limit_per_source: int | None = Field(default=None, ge=1)
    sources_at_limit: list[str] = Field(default_factory=list)
    returned_nodes: int = Field(default=0, ge=0)
    returned_edges: int = Field(default=0, ge=0)
    continuation_available: bool = False
    context_nodes_truncated: bool = False
    context_edges_truncated: bool = False
    global_node_budget: int | None = Field(default=None, ge=1)
    global_edge_budget: int | None = Field(default=None, ge=1)
    per_type_allocations: dict[str, int] = Field(default_factory=dict)
    omitted_nodes: int = Field(default=0, ge=0)
    omitted_edges: int = Field(default=0, ge=0)
    omitted_by_type: dict[str, int] = Field(default_factory=dict)
    omission_counts_exact: bool = False
    continuation_token: str | None = None


class GraphQualityIssue(BaseModel):
    code: str
    count: int = Field(ge=0)
    severity: Literal["info", "warning", "critical"]
    message: str
    action: str | None = None


class GraphQuality(BaseModel):
    unconnected_count: int = Field(default=0, ge=0)
    expired_relationship_count: int = Field(default=0, ge=0)
    duplicate_edge_count: int = Field(default=0, ge=0)
    missing_assignment_count: int = Field(default=0, ge=0)
    issues: list[GraphQualityIssue] = Field(default_factory=list)


class GraphProvenance(BaseModel):
    generated_at: str
    projection: str
    source_of_truth: str
    tenant_verified: bool
    authorization_enforced: bool
    authorization_fingerprint: str
    policy_version: str
    contract_version: str = GRAPH_CONTRACT_VERSION
    relationship_registry_version: str = "ontology-relationships.v1"
    cache: Literal["hit", "miss", "none"] = "none"
    scope_type: str | None = None
    scope_id: str | None = None


class IdjwiGraphContext(BaseModel):
    contract_version: str = GRAPH_CONTRACT_VERSION
    intent: str | None = None
    scope: GraphScope
    selected_node_id: str | None = None
    selected_edge_id: str | None = None
    nodes: list[GraphNodeSummary] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    provenance: GraphProvenance
    source_status: list[GraphSourceStatus] = Field(default_factory=list)
    completeness: GraphCompleteness
    truncation: GraphTruncation
    quality: GraphQuality
    permitted_actions: list[GraphPermittedAction] = Field(default_factory=list)
    assertion_history: list[GraphAssertionHistoryEvent] = Field(default_factory=list)
    tenant_id: str | None = None
    role: str | None = None
    counts: dict[str, int] = Field(default_factory=dict)
    semantic_summary: dict[str, Any] | None = None
    ranked_neighborhood: dict[str, Any] = Field(default_factory=dict)
    relationship_predicates: list[str] = Field(default_factory=list)
    freshness: dict[str, Any] = Field(default_factory=dict)
    unavailable_sources: list[str] = Field(default_factory=list)
    sensitivity_classes: list[str] = Field(default_factory=list)
    page: str | None = None
    product_surface: str = "web"

    @model_validator(mode="after")
    def validate_semantic_packet(self):
        actual_counts: dict[str, int] = {}
        for node in self.nodes:
            actual_counts[node.entity_type] = actual_counts.get(node.entity_type, 0) + 1
        actual_unavailable = sorted(
            source.source_id for source in self.source_status
            if source.state in {"unavailable", "partial"}
        )
        actual = {
            "node_count": len(self.nodes),
            "edge_count": len(self.edges),
            "disconnected_count": self.quality.unconnected_count,
            "unavailable_source_count": len(actual_unavailable),
        }
        if self.semantic_summary is not None and any(
            self.semantic_summary.get(key) != value for key, value in actual.items()
        ):
            raise ValueError("Idjwi graph semantic summary does not match the governed packet")
        self.semantic_summary = actual
        if self.counts and self.counts != actual_counts:
            raise ValueError("Idjwi graph type counts do not match the governed packet")
        self.counts = actual_counts
        if self.unavailable_sources and sorted(self.unavailable_sources) != actual_unavailable:
            raise ValueError("Idjwi unavailable sources do not match source status")
        self.unavailable_sources = actual_unavailable
        node_ids = {node.id for node in self.nodes}
        edge_ids = {edge.id for edge in self.edges}
        if self.selected_node_id and self.selected_node_id not in node_ids:
            raise ValueError("Selected Idjwi graph node is outside the governed packet")
        if self.selected_edge_id and self.selected_edge_id not in edge_ids:
            raise ValueError("Selected Idjwi graph edge is outside the governed packet")
        return self


class GraphPacket(BaseModel):
    contract_version: str = GRAPH_CONTRACT_VERSION
    company_id: str
    scope: GraphScope
    nodes: list[GraphNodeSummary]
    edges: list[GraphEdge]
    counts: dict[str, int]
    provenance: GraphProvenance
    source_status: list[GraphSourceStatus]
    completeness: GraphCompleteness
    truncation: GraphTruncation
    quality: GraphQuality
    permitted_actions: list[GraphPermittedAction] = Field(default_factory=list)
    briefing: dict[str, Any] = Field(default_factory=dict)
    assertion_history: list[GraphAssertionHistoryEvent] = Field(default_factory=list)
