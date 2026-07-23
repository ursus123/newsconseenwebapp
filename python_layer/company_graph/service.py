from __future__ import annotations

from collections import defaultdict
from concurrent.futures import as_completed
from datetime import datetime, timezone

from tenant_context.entity_registry import definition_for
from tenant_context.models import TenantContext
from ontology.relationship_registry import (
    data_quality_issues,
    edge_carrier_types,
    graph_entity_types,
    rules_for_carrier,
    mapping_diagnostics,
)

from .contracts import (
    GRAPH_CONTRACT_VERSION,
    GraphCompleteness,
    GraphEdge,
    GraphEvidence,
    GraphNodeSummary,
    GraphPacket,
    GraphProvenance,
    GraphQuality,
    GraphQualityIssue,
    GraphScope,
    GraphSourceStatus,
    GraphTemporalState,
    GraphTruncation,
)
from .authorization import GRAPH_POLICY_VERSION, GraphAuthorizationPolicy
from .field_classification import project_record
from .assertion_governance import apply_assertion_state, default_assertion_state, stable_assertion_key
from .diagnostics import build_diagnostics, source_failure_metadata
from .bounded_queries import DEFAULT_EDGE_BUDGET, DEFAULT_NODE_BUDGET, TYPE_WEIGHTS, allocations, encode_continuation
from .execution import GRAPH_IO_EXECUTOR


ENTITY_TYPES = tuple(sorted(set(graph_entity_types()).union({"graph_assertion", "graph_assertion_event"})))
NODE_TYPES = tuple(entity_type for entity_type in ENTITY_TYPES if entity_type not in edge_carrier_types() and entity_type not in {"graph_assertion", "graph_assertion_event"})
_LAST_SOURCE_SUCCESS: dict[tuple[str, str], str] = {}

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _node_id(entity_type: str, record_id: object) -> str:
    return f"{entity_type}:{record_id}"


def _node(entity_type: str, row: dict, policy: GraphAuthorizationPolicy) -> GraphNodeSummary:
    projection = project_record(
        entity_type, row,
        include_role_restricted=policy.allows("graph.read_sensitive"),
    )
    return GraphNodeSummary(
        id=_node_id(entity_type, row["id"]), entity_type=entity_type,
        entity_id=str(row["id"]), label=projection["label"],
        sublabel=projection["sublabel"], status=projection["status"],
        sensitivity=policy.sensitivity_for(entity_type),
        attributes=projection["attributes"], permitted_actions=policy.node_actions(),
    )


def _edge(source: str, target: str, predicate: str, *, source_zone: str,
          source_table: str, source_record_id: object, explanation: str,
          assertion_class: str, confidence: float, verification_state: str,
          status: str = "active", valid_from=None, valid_to=None,
          derivation_rule=None, observed_at=None, expires_at=None,
          relationship_rule_id=None, evidence_requirement="canonical_record_id",
          sensitivity="internal", valid_correction_actions=(),
          policy: GraphAuthorizationPolicy) -> GraphEdge:
    evidence_id = f"{source_table}:{source_record_id}"
    assertion_key = stable_assertion_key(source, predicate, target, relationship_rule_id)
    assertion_state = default_assertion_state(assertion_class, status or "active", str(expires_at) if expires_at else None)
    return GraphEdge(
        id=f"{source}|{predicate}|{target}|{evidence_id}", source=source,
        predicate=predicate, target=target, label=predicate.replace("_", " "),
        assertion_class=assertion_class, status=status or "active",
        temporal=GraphTemporalState(
            status=status or "active",
            valid_from=str(valid_from) if valid_from else None,
            valid_to=str(valid_to) if valid_to else None,
            observed_at=str(observed_at) if observed_at else None,
            expires_at=str(expires_at) if expires_at else None,
        ),
        evidence=[GraphEvidence(
            evidence_id=evidence_id, source_zone=source_zone,
            source_table=source_table, source_record_id=str(source_record_id),
            assertion_class=assertion_class, explanation=explanation,
            derivation_rule=derivation_rule, retrieved_at=_now(),
            requirement=evidence_requirement,
        )],
        confidence=confidence, verification_state=verification_state,
        assertion_key=assertion_key, assertion_state=assertion_state,
        relationship_rule_id=relationship_rule_id, sensitivity=sensitivity,
        valid_correction_actions=list(valid_correction_actions),
        permitted_actions=policy.edge_actions(assertion_class),
    )


def _add(edges: list[GraphEdge], seen: set[tuple], edge: GraphEdge, node_ids: set[str]):
    key = (edge.source, edge.target, edge.predicate)
    if edge.source in node_ids and edge.target in node_ids and edge.source != edge.target and key not in seen:
        seen.add(key)
        edges.append(edge)


def _apply_operational_unit_scope(records: dict[str, list[dict]], context: TenantContext) -> set[str]:
    """Restrict records to a first-class unit; never substitute an enterprise."""
    if context.scope_type != "operational_unit" or not context.scope_id:
        return set()
    selected = str(context.scope_id)
    units = records.get("operational_unit", [])
    by_id = {str(row.get("id")): row for row in units if row.get("id")}
    if selected not in by_id:
        records["operational_unit"] = []
        for entity_type, rows in list(records.items()):
            if definition_for(entity_type)[1].operational_unit_field:
                records[entity_type] = []
        return set()

    unit_ids = {selected}
    may_include_descendants = context.role in {"admin", "super_admin"} or selected in context.managed_operational_unit_ids
    if may_include_descendants:
        changed = True
        while changed:
            changed = False
            for unit_id, row in by_id.items():
                if str(row.get("parent_unit_id") or "") in unit_ids and unit_id not in unit_ids:
                    unit_ids.add(unit_id)
                    changed = True

    # Keep ancestors for hierarchy context, but never their owned records.
    contextual_unit_ids = set(unit_ids)
    cursor = by_id.get(selected)
    while cursor and cursor.get("parent_unit_id"):
        parent_id = str(cursor["parent_unit_id"])
        contextual_unit_ids.add(parent_id)
        cursor = by_id.get(parent_id)

    memberships = [row for row in records.get("operational_unit_membership", []) if str(row.get("operational_unit_id") or "") in unit_ids]
    member_person_ids = {str(row.get("person_id")) for row in memberships if row.get("person_id")}
    records["operational_unit_membership"] = memberships
    records["operational_unit_relationship"] = [
        row for row in records.get("operational_unit_relationship", [])
        if str(row.get("source_unit_id") or "") in unit_ids and str(row.get("target_unit_id") or "") in unit_ids
    ]
    records["operational_unit"] = [row for row in units if str(row.get("id")) in contextual_unit_ids]

    for entity_type, rows in list(records.items()):
        definition = definition_for(entity_type)[1]
        if definition.operational_unit_field:
            scoped = [row for row in rows if str(row.get(definition.operational_unit_field) or "") in unit_ids]
            if entity_type == "person":
                scoped.extend(row for row in rows if str(row.get("id")) in member_person_ids and row not in scoped)
            records[entity_type] = scoped

    # Enterprises are counterparties/organizations, not unit substitutes. Only
    # retain those actually referenced by scoped records.
    enterprise_ids = {
        str(row[field]) for rows in records.values() for row in rows
        for field in ("enterprise_id", "secondary_enterprise_id") if row.get(field)
    }
    records["enterprise"] = [row for row in records.get("enterprise", []) if str(row.get("id")) in enterprise_ids]
    return unit_ids


def _apply_principal_unit_visibility(records: dict[str, list[dict]], context: TenantContext) -> None:
    """Hide unit identities outside a non-administrator's memberships."""
    if context.scope_type == "operational_unit" or context.role in {"admin", "super_admin"}:
        return
    visible = set(context.allowed_operational_unit_ids)
    units = records.get("operational_unit", [])
    by_id = {str(row.get("id")): row for row in units if row.get("id")}
    contextual = set(visible)
    for unit_id in tuple(visible):
        cursor = by_id.get(unit_id)
        while cursor and cursor.get("parent_unit_id"):
            parent_id = str(cursor["parent_unit_id"])
            contextual.add(parent_id)
            cursor = by_id.get(parent_id)
    records["operational_unit"] = [row for row in units if str(row.get("id")) in contextual]
    records["operational_unit_membership"] = [
        row for row in records.get("operational_unit_membership", [])
        if str(row.get("operational_unit_id") or "") in visible and str(row.get("user_id") or "") == context.user_id
    ]
    records["operational_unit_relationship"] = [
        row for row in records.get("operational_unit_relationship", [])
        if str(row.get("source_unit_id") or "") in visible and str(row.get("target_unit_id") or "") in visible
    ]
    for entity_type, rows in list(records.items()):
        definition = definition_for(entity_type)[1]
        if definition.operational_unit_field:
            records[entity_type] = [
                row for row in rows
                if not row.get(definition.operational_unit_field) or str(row[definition.operational_unit_field]) in visible
            ]


def _normalized_label(value) -> str:
    return " ".join(str(value or "").strip().casefold().split())


def _unique_label_indexes(records: dict[str, list[dict]]) -> dict[str, dict[str, str]]:
    label_fields = {
        "enterprise": (("enterprise_name",),),
        "person": (("first_name", "last_name"), ("preferred_name",)),
        "product": (("product_name",), ("item_name",)),
        "service": (("name",), ("service_name",)),
    }
    indexes = {}
    for entity_type, alternatives in label_fields.items():
        candidates = defaultdict(set)
        for row in records.get(entity_type, []):
            if not row.get("id"):
                continue
            for fields in alternatives:
                label = _normalized_label(" ".join(str(row.get(field) or "") for field in fields))
                if label:
                    candidates[label].add(str(row["id"]))
        indexes[entity_type] = {
            label: next(iter(ids)) for label, ids in candidates.items() if len(ids) == 1
        }
    return indexes


def _resolve_legacy_name_references(records: dict[str, list[dict]]) -> int:
    """Resolve exact unique tenant-local labels without mutating canonical data."""
    indexes = _unique_label_indexes(records)
    mappings = {
        "task": (
            ("enterprise_id", "enterprise", "enterprise"),
            ("related_person_id", "related_person", "person"),
            ("related_person_id", "assigned_to_name", "person"),
        ),
        "transaction": (
            ("enterprise_id", "enterprise", "enterprise"),
            ("person_id", "person_name", "person"),
            ("product_id", "product_name", "product"),
        ),
        "relationship": (
            ("person_id", "person_name", "person"),
            ("person_id", "person", "person"),
            ("secondary_person_id", "secondary_person", "person"),
            ("enterprise_id", "enterprise_name", "enterprise"),
            ("enterprise_id", "enterprise", "enterprise"),
            ("secondary_enterprise_id", "secondary_enterprise", "enterprise"),
            ("item_id", "item_name", "product"),
            ("service_id", "service_name", "service"),
        ),
    }
    resolved = 0
    for carrier_type, field_mappings in mappings.items():
        for row in records.get(carrier_type, []):
            derived = row.setdefault("__derived_reference_fields", {})
            for target_field, label_field, target_type in field_mappings:
                if row.get(target_field):
                    continue
                label = _normalized_label(row.get(label_field))
                target_id = indexes.get(target_type, {}).get(label)
                if target_id:
                    row[target_field] = target_id
                    derived[target_field] = {
                        "label_field": label_field,
                        "target_type": target_type,
                        "method": "exact_unique_tenant_label",
                    }
                    resolved += 1
            if not derived:
                row.pop("__derived_reference_fields", None)
    return resolved


def _registry_edges(records: dict[str, list[dict]], policy: GraphAuthorizationPolicy,
                    node_ids: set[str]) -> list[GraphEdge]:
    edges: list[GraphEdge] = []
    seen: set[tuple] = set()
    for carrier_type, rows in records.items():
        for rule in rules_for_carrier(carrier_type):
            for row in rows:
                source_id, target_id = row.get(rule.source_field), row.get(rule.target_field)
                if not source_id or not target_id:
                    continue
                target_type = str(row.get(rule.target_type_field) or rule.target_type) if rule.target_type_field else rule.target_type
                predicate = str(row.get(rule.predicate_field) or rule.predicate) if rule.predicate_field else rule.predicate
                assertion_class = rule.assertion_class
                derived_fields = row.get("__derived_reference_fields") or {}
                derived_reference = derived_fields.get(rule.source_field) or derived_fields.get(rule.target_field)
                if derived_reference:
                    assertion_class = "deterministic_derivation"
                if assertion_class == "canonical_relationship" and (row.get("confirmed_by") or row.get("verified_by")):
                    assertion_class = "operator_confirmed_assertion"
                confidence = .95 if derived_reference else float(row.get("confidence") or rule.confidence)
                verification = "verified" if assertion_class in {"canonical_relationship", "operator_confirmed_assertion", "canonical_reference_projection"} else "unverified"
                table = definition_for(carrier_type)[1].qualified_table
                explanation = (
                    f"Newsconseen deterministically resolved {carrier_type}.{derived_reference['label_field']} "
                    f"to one unique tenant-local {derived_reference['target_type']} record. Confirm this legacy link before high-impact action."
                    if derived_reference else
                    f"Ontology rule {rule.id} projected this {predicate.replace('_', ' ')} relationship from {table}."
                )
                _add(edges, seen, _edge(
                    _node_id(rule.source_type, source_id), _node_id(target_type, target_id), predicate,
                    source_zone=rule.source_zone, source_table=table,
                    source_record_id=row.get("id"), assertion_class=assertion_class,
                    confidence=max(0.0, min(1.0, confidence)), verification_state=verification,
                    explanation=explanation,
                    status=row.get("status") or "active",
                    valid_from=row.get(rule.valid_from_field) if rule.valid_from_field else None,
                    valid_to=row.get(rule.valid_to_field) if rule.valid_to_field else None,
                    observed_at=row.get(rule.observed_at_field) if rule.observed_at_field else row.get("observed_at"),
                    expires_at=row.get(rule.expires_at_field) if rule.expires_at_field else row.get("expires_at"),
                    derivation_rule=(
                        f"legacy_exact_unique_name:{carrier_type}.{derived_reference['label_field']}"
                        if derived_reference else f"ontology_registry:{rule.id}"
                    ),
                    relationship_rule_id=rule.id,
                    evidence_requirement="operator_confirmation" if derived_reference else rule.evidence_requirement,
                    sensitivity=rule.sensitivity,
                    valid_correction_actions=rule.valid_correction_actions,
                    policy=policy,
                ), node_ids)
    return edges


def build_graph_packet(context: TenantContext, repository, *, center: str | None = None,
                       depth: int = 1, limit: int = 500,
                       node_budget: int | None = None, edge_budget: int | None = None,
                       offsets: dict[str, int] | None = None,
                       preloaded_records: dict[str, list[dict]] | None = None) -> GraphPacket:
    policy = GraphAuthorizationPolicy.for_context(context)
    policy.require("graph.read")
    records: dict[str, list[dict]] = {}
    source_status: list[GraphSourceStatus] = []
    generated_at = _now()
    node_budget = node_budget or DEFAULT_NODE_BUDGET
    edge_budget = edge_budget or DEFAULT_EDGE_BUDGET
    type_allocations = allocations(NODE_TYPES, node_budget)
    # Edge carriers and assertion governance receive separate bounded reads.
    read_allocations = {
        kind: min(limit, type_allocations.get(kind, min(80, max(10, edge_budget // 8))))
        for kind in ENTITY_TYPES
    }
    offsets = offsets or {}
    readable_types = []
    for entity_type in ENTITY_TYPES:
        if policy.can_read_entity(entity_type):
            readable_types.append(entity_type)
        else:
            records[entity_type] = []
            definition = definition_for(entity_type)[1]
            source_status.append(GraphSourceStatus(
                source_id=entity_type, zone="canonical", table=definition.qualified_table,
                state="unauthorized", requested_limit=limit,
                message="The principal is not permitted to read this graph sensitivity class.",
                failure_category="authorization",
                affected_capabilities=source_failure_metadata(entity_type, "authorization")[0],
                operator_action=source_failure_metadata(entity_type, "authorization")[1],
            ))
    if preloaded_records is not None:
        readable_types = list(preloaded_records)
        for entity_type, rows in preloaded_records.items():
            records[entity_type] = list(rows)
            table = definition_for(entity_type)[1].qualified_table
            source_status.append(GraphSourceStatus(
                source_id=entity_type, zone=table.split(".", 1)[0], table=table,
                state="empty" if not rows else "available", returned_records=len(rows),
                requested_limit=read_allocations.get(entity_type, limit), last_success_at=generated_at,
            ))
    def bounded_read(entity_type):
        if hasattr(repository, "list_entities_filtered"):
            return repository.list_entities_filtered(
                context, entity_type, filters={}, limit=read_allocations[entity_type] + 1,
                offset=offsets.get(entity_type, 0),
            )
        # Test and adapter compatibility; production repositories implement
        # offset-aware filtered reads.
        rows = repository.list_entities(context, entity_type, limit=offsets.get(entity_type, 0) + read_allocations[entity_type] + 1).data or []
        return type("BoundedResult", (), {"data": rows[offsets.get(entity_type, 0):]})()

    futures = {} if preloaded_records is not None else {
        GRAPH_IO_EXECUTOR.submit(bounded_read, entity_type): entity_type for entity_type in readable_types
    }
    for future in as_completed(futures):
        entity_type = futures[future]
        try:
            result = future.result()
            rows = result.data or []
            allocation = read_allocations[entity_type]
            has_more = len(rows) > allocation
            records[entity_type] = rows[:allocation]
            total_records = None
            if has_more:
                try:
                    total_records = repository.count_entities(context, entity_type)
                except Exception:
                    total_records = None
            table = definition_for(entity_type)[1].qualified_table
            _LAST_SOURCE_SUCCESS[(context.tenant_id, entity_type)] = generated_at
            source_status.append(GraphSourceStatus(
                source_id=entity_type, zone=table.split(".", 1)[0], table=table,
                state="empty" if not rows else "available", returned_records=len(records[entity_type]),
                total_records=total_records,
                requested_limit=allocation, may_be_truncated=has_more,
                last_success_at=generated_at,
                duration_ms=getattr(result, "duration_ms", None),
            ))
        except Exception as error:
            records[entity_type] = []
            category = "timeout" if "timeout" in type(error).__name__.lower() else "data_source"
            capabilities, operator_action = source_failure_metadata(entity_type, category)
            source_status.append(GraphSourceStatus(
                source_id=entity_type, zone="canonical", table=definition_for(entity_type)[1].qualified_table,
                state="unavailable", requested_limit=read_allocations[entity_type],
                message="The governed source could not be read.", retryable=True,
                last_success_at=_LAST_SOURCE_SUCCESS.get((context.tenant_id, entity_type)),
                failure_category=category, affected_capabilities=capabilities,
                operator_action=operator_action,
            ))

    _apply_principal_unit_visibility(records, context)
    scoped_unit_ids = _apply_operational_unit_scope(records, context)
    derived_reference_count = _resolve_legacy_name_references(records)
    nodes = [_node(kind, row, policy) for kind, rows in records.items() if kind in NODE_TYPES for row in rows if row.get("id")]
    node_ids = {node.id for node in nodes}
    edges = _registry_edges(records, policy, node_ids)
    mapping = mapping_diagnostics(records, node_ids)
    edges, assertion_history = apply_assertion_state(
        edges, records.get("graph_assertion", []), records.get("graph_assertion_event", []),
        include_history_details=policy.allows("graph.read_sensitive"),
    )
    assertion_source_unavailable = any(
        source.source_id == "graph_assertion" and source.state in {"unavailable", "unauthorized", "partial"}
        for source in source_status
    )
    if assertion_source_unavailable:
        # Without the durable state store, Newsconseen cannot know whether a
        # generated proposal was previously rejected. Fail closed for derived
        # proposals while retaining canonical/reference facts.
        edges = [edge for edge in edges if edge.assertion_class in {
            "canonical_relationship", "operator_confirmed_assertion", "canonical_reference_projection",
        }]

    scope = GraphScope(
        type="neighborhood" if center else (context.scope_type if context.scope_type in {"tenant", "organization", "operational_unit", "department", "team"} else "organization"),
        id=context.scope_id or context.tenant_id, name=context.scope_name,
        center_node_id=center, depth=depth if center else None,
    )
    if center and center in node_ids:
        included = {center}
        for _ in range(max(1, min(depth, 3))):
            included.update(edge.target if edge.source in included else edge.source for edge in edges if edge.source in included or edge.target in included)
        nodes = [node for node in nodes if node.id in included]
        edges = [edge for edge in edges if edge.source in included and edge.target in included]

    # Operational ranking is deterministic and applied server-side. Risks,
    # recommendations and open work are favored over passive reference data.
    pre_budget_nodes, pre_budget_edges = len(nodes), len(edges)
    pre_budget_type_counts = defaultdict(int)
    for node in nodes:
        pre_budget_type_counts[node.entity_type] += 1
    nodes.sort(key=lambda node: (-TYPE_WEIGHTS.get(node.entity_type, 3), node.status in {"closed", "completed", "inactive"}, node.id))
    nodes = nodes[:node_budget]
    allowed_node_ids = {node.id for node in nodes}
    edges = [edge for edge in edges if edge.source in allowed_node_ids and edge.target in allowed_node_ids]
    edges.sort(key=lambda edge: (edge.assertion_state in {"expired", "rejected", "superseded"}, -edge.confidence, edge.id))
    edges = edges[:edge_budget]

    counts = defaultdict(int)
    for node in nodes:
        counts[node.entity_type] += 1
    connected_ids = {endpoint for edge in edges for endpoint in (edge.source, edge.target)}
    unconnected = [node for node in nodes if node.id not in connected_ids]
    expired = [edge for edge in edges if edge.assertion_state == "expired" or edge.status in {"ended", "expired", "inactive"}]
    open_tasks = [row for row in records.get("task", []) if row.get("status") not in {"completed", "done", "closed"}]
    high_risks = [row for row in records.get("risk", []) if row.get("status") not in {"closed", "resolved"} and row.get("severity") in {"high", "critical"}]
    recommendations = [row for row in records.get("recommendation", []) if not row.get("is_actioned") and not row.get("is_dismissed")]
    unavailable = [source.source_id for source in source_status if source.state in {"unavailable", "partial"}]
    unauthorized = [source.source_id for source in source_status if source.state == "unauthorized"]
    at_limit = [source.source_id for source in source_status if source.may_be_truncated]
    omitted_by_type = {
        source.source_id: max(1, source.total_records - offsets.get(source.source_id, 0) - source.returned_records)
        if source.total_records is not None else 1
        for source in source_status if source.may_be_truncated
    }
    returned_type_counts = defaultdict(int)
    for node in nodes:
        returned_type_counts[node.entity_type] += 1
    for kind, count in pre_budget_type_counts.items():
        budget_omission = max(0, count - returned_type_counts[kind])
        if budget_omission:
            omitted_by_type[kind] = omitted_by_type.get(kind, 0) + budget_omission
    omission_counts_exact = all(source.total_records is not None for source in source_status if source.may_be_truncated)
    omitted_nodes = sum(omitted_by_type.values())
    omitted_edges = max(0, pre_budget_edges - len(edges))
    continuation_token = None
    if at_limit and preloaded_records is None:
        next_offsets = dict(offsets)
        for kind in at_limit:
            next_offsets[kind] = next_offsets.get(kind, 0) + read_allocations[kind]
        continuation_token = encode_continuation({
            "tenant": context.tenant_id,
            "authorization": policy.fingerprint(),
            "scope": context.scope_id or context.tenant_id,
            "offsets": next_offsets,
        })

    issues = []
    if unconnected:
        issues.append(GraphQualityIssue(code="UNCONNECTED_RECORDS", count=len(unconnected), severity="warning", message="Records have no visible governed connection.", action="review_graph_gaps"))
    if expired:
        issues.append(GraphQualityIssue(code="EXPIRED_RELATIONSHIPS", count=len(expired), severity="warning", message="Expired relationships remain in the selected graph.", action="review_relationship_history"))
    if unavailable:
        issues.append(GraphQualityIssue(code="PARTIAL_SOURCES", count=len(unavailable), severity="critical", message="One or more governed sources are unavailable.", action="open_data_readiness"))
    if at_limit:
        issues.append(GraphQualityIssue(code="TRUNCATED_SOURCES", count=len(at_limit), severity="warning", message="One or more sources reached the request limit.", action="narrow_scope"))
    if assertion_source_unavailable:
        issues.append(GraphQualityIssue(code="ASSERTION_GOVERNANCE_UNAVAILABLE", count=1, severity="critical", message="Derived proposals are hidden because durable assertion state could not be verified.", action="restore_assertion_store"))
    registry_issues = data_quality_issues(records)
    if registry_issues:
        issues.append(GraphQualityIssue(code="RELATIONSHIP_REGISTRY_GAPS", count=len(registry_issues), severity="warning", message="Relationship carrier records have missing endpoints required by the ontology registry.", action="review_relationship_quality"))
    if derived_reference_count:
        issues.append(GraphQualityIssue(code="LEGACY_LINKS_REQUIRE_CONFIRMATION", count=derived_reference_count, severity="warning", message="Legacy name fields were linked by exact unique tenant-local matches.", action="confirm_derived_relationships"))
    missing_assignments = sum(1 for row in open_tasks if not (row.get("related_person_id") or row.get("assigned_to_name")))
    quality = GraphQuality(
        unconnected_count=len(unconnected), expired_relationship_count=len(expired),
        duplicate_edge_count=mapping["duplicates"], missing_assignment_count=missing_assignments, issues=issues,
    )
    truncation = GraphTruncation(
        truncated=bool(at_limit), requested_limit_per_source=limit,
        sources_at_limit=at_limit, returned_nodes=len(nodes), returned_edges=len(edges),
        continuation_available=bool(continuation_token),
        global_node_budget=node_budget, global_edge_budget=edge_budget,
        per_type_allocations=type_allocations,
        omitted_nodes=omitted_nodes, omitted_edges=omitted_edges,
        omitted_by_type=omitted_by_type, omission_counts_exact=omission_counts_exact,
        continuation_token=continuation_token,
    )
    completeness_state, explanation, diagnostic_report = build_diagnostics(
        source_status=source_status, records=records, nodes=nodes, edges=edges,
        mapping=mapping, disconnected_count=len(unconnected), expired_count=len(expired),
        missing_assignments=missing_assignments,
    )
    completeness = GraphCompleteness(
        state=completeness_state, sources_total=len(source_status),
        sources_available=sum(source.state in {"available", "empty"} for source in source_status),
        sources_unavailable=len(unavailable), mapping_complete=not unavailable and mapping["candidates"] == mapping["mapped"],
        sources_unauthorized=len(unauthorized), authorization_filtered=bool(unauthorized),
        explanation=explanation, diagnostics=diagnostic_report,
    )
    briefing = {
        "headline": "Your operational graph is ready" if completeness_state == "complete" else f"Your operational graph is {completeness_state}",
        "open_tasks": len(open_tasks), "high_risks": len(high_risks),
        "pending_recommendations": len(recommendations),
        "operational_units_in_scope": len(scoped_unit_ids),
        "quality_issues": sum(issue.count for issue in issues),
        "recommended_focus": "Review high risks first" if high_risks else "Review open work and graph gaps",
    }
    packet_actions = policy.packet_actions()
    return GraphPacket(
        contract_version=GRAPH_CONTRACT_VERSION, company_id=context.tenant_id,
        scope=scope, nodes=nodes, edges=edges, counts=dict(counts),
        provenance=GraphProvenance(
            generated_at=generated_at, projection="request_time",
            source_of_truth="Supabase public.* through governed repositories",
            tenant_verified=True, authorization_enforced=True,
            authorization_fingerprint=policy.fingerprint(), policy_version=GRAPH_POLICY_VERSION,
        ),
        source_status=sorted(source_status, key=lambda item: item.source_id),
        completeness=completeness, truncation=truncation, quality=quality,
        permitted_actions=packet_actions, briefing=briefing,
        assertion_history=assertion_history,
    )
