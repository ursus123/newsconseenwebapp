from __future__ import annotations

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Iterable

from tenant_context.models import TenantContext
from tenant_context.entity_registry import definition_for

from .contracts import GraphEdge, GraphEvidence, GraphNode, GraphPacket


ENTITY_TYPES = (
    "enterprise", "person", "product", "service", "task", "transaction",
    "address", "territory", "relationship", "document", "schedule", "signal",
    "animal", "plot", "observation", "insight", "risk", "opportunity", "recommendation", "decision",
)
NODE_TYPES = tuple(entity_type for entity_type in ENTITY_TYPES if entity_type != "relationship")


def _node_id(entity_type: str, record_id: object) -> str:
    return f"{entity_type}:{record_id}"


def _label(entity_type: str, row: dict) -> str:
    candidates = {
        "enterprise": ("enterprise_name", "name"),
        "person": ("full_name", "preferred_name", "first_name"),
        "product": ("product_name", "item_name", "name"),
        "service": ("service_name", "name"),
        "task": ("title", "task_name"),
        "transaction": ("reference_number", "description"),
        "address": ("address_line1", "city", "country"),
        "territory": ("territory_name", "name"),
        "insight": ("title",), "risk": ("title",),
        "opportunity": ("title",), "recommendation": ("title",),
    }.get(entity_type, ("name", "title"))
    for field in candidates:
        if row.get(field):
            return str(row[field])
    if entity_type == "person":
        joined = " ".join(filter(None, (row.get("first_name"), row.get("last_name"))))
        if joined:
            return joined
    return f"{entity_type.title()} {str(row.get('id', ''))[:8]}"


def _edge(source: str, target: str, predicate: str, *, source_table: str,
          source_record_id: object, explanation: str, assertion_type: str = "fact",
          confidence: float = 1.0, status: str = "active", valid_from=None,
          valid_to=None, derivation_rule=None) -> GraphEdge:
    return GraphEdge(
        id=f"{source}|{predicate}|{target}|{source_table}:{source_record_id}",
        source=source, target=target, predicate=predicate,
        label=predicate.replace("_", " "), status=status or "active",
        valid_from=str(valid_from) if valid_from else None,
        valid_to=str(valid_to) if valid_to else None,
        evidence=GraphEvidence(
            source_zone="canonical" if assertion_type == "fact" else "analytics",
            source_table=source_table, source_record_id=str(source_record_id),
            assertion_type=assertion_type, confidence=confidence,
            explanation=explanation, derivation_rule=derivation_rule,
        ),
    )


def _add(edges: list[GraphEdge], seen: set[tuple], edge: GraphEdge, node_ids: set[str]):
    key = (edge.source, edge.target, edge.predicate)
    if edge.source in node_ids and edge.target in node_ids and edge.source != edge.target and key not in seen:
        seen.add(key)
        edges.append(edge)


def build_graph_packet(context: TenantContext, repository, *, center: str | None = None,
                       depth: int = 1, limit: int = 500) -> GraphPacket:
    records: dict[str, list[dict]] = {}
    unavailable: list[str] = []
    with ThreadPoolExecutor(max_workers=6, thread_name_prefix="company-graph") as pool:
        futures = {pool.submit(repository.list_entities, context, entity_type, limit=limit): entity_type for entity_type in ENTITY_TYPES}
        for future in as_completed(futures):
            entity_type = futures[future]
            try:
                records[entity_type] = future.result().data or []
            except Exception:
                records[entity_type] = []
                unavailable.append(entity_type)

    nodes = [
        GraphNode(id=_node_id(kind, row["id"]), entity_type=kind,
                  entity_id=str(row["id"]), label=_label(kind, row), metadata=row)
        for kind, rows in records.items() if kind in NODE_TYPES for row in rows if row.get("id")
    ]
    node_ids = {node.id for node in nodes}
    edges: list[GraphEdge] = []
    seen: set[tuple] = set()

    for rel in records.get("relationship", []):
        pairs = [
            ("person", rel.get("person_id"), "enterprise", rel.get("enterprise_id")),
            ("person", rel.get("person_id"), "person", rel.get("secondary_person_id")),
            ("enterprise", rel.get("enterprise_id"), "enterprise", rel.get("secondary_enterprise_id")),
            ("enterprise", rel.get("enterprise_id"), "product", rel.get("item_id")),
            ("enterprise", rel.get("enterprise_id"), "service", rel.get("service_id")),
        ]
        for st, sid, tt, tid in pairs:
            if sid and tid:
                predicate = rel.get("relationship_type") or "related_to"
                _add(edges, seen, _edge(
                    _node_id(st, sid), _node_id(tt, tid), predicate,
                    source_table="public.relationships", source_record_id=rel.get("id"),
                    explanation=f"A tenant-governed relationship record states that the {st} {predicate.replace('_', ' ')} the {tt}.",
                    status=rel.get("status") or "active", valid_from=rel.get("start_date"),
                    valid_to=rel.get("end_date"),
                ), node_ids)

    inferred_specs = (
        ("task", "enterprise_id", "enterprise", "belongs_to"),
        ("task", "related_person_id", "person", "assigned_to"),
        ("transaction", "enterprise_id", "enterprise", "involves"),
        ("transaction", "person_id", "person", "involves_person"),
        ("transaction", "product_id", "product", "includes_product"),
        ("product", "enterprise_id", "enterprise", "provided_by"),
        ("service", "enterprise_id", "enterprise", "provided_by"),
        ("address", "entity_ref_id", "enterprise", "location_of"),
        ("document", "entity_ref_id", "enterprise", "references"),
        ("schedule", "entity_ref_id", "enterprise", "references"),
        ("signal", "entity_ref_id", "enterprise", "references"),
        ("insight", "entity_ref_id", "enterprise", "references"),
        ("risk", "entity_ref_id", "enterprise", "references"),
        ("opportunity", "entity_ref_id", "enterprise", "references"),
        ("recommendation", "entity_ref_id", "enterprise", "references"),
        ("decision", "entity_ref_id", "enterprise", "references"),
        ("observation", "subject_id", "enterprise", "references"),
        ("animal", "enterprise_id", "enterprise", "belongs_to"),
        ("plot", "enterprise_id", "enterprise", "belongs_to"),
    )
    for source_type, field, target_type, predicate in inferred_specs:
        for row in records.get(source_type, []):
            target_id = row.get(field)
            actual_target = row.get("entity_ref_type") or target_type
            if target_id:
                _add(edges, seen, _edge(
                    _node_id(source_type, row["id"]), _node_id(actual_target, target_id), predicate,
                    source_table=definition_for(source_type)[1].qualified_table,
                    source_record_id=row["id"], assertion_type="derived", confidence=0.95,
                    derivation_rule=f"canonical_field:{field}",
                    explanation=f"Newsconseen derived this connection from the canonical {source_type}.{field} reference.",
                ), node_ids)

    if center and center in node_ids:
        included = {center}
        for _ in range(max(1, min(depth, 3))):
            included.update(e.target if e.source in included else e.source for e in edges if e.source in included or e.target in included)
        nodes = [node for node in nodes if node.id in included]
        edges = [edge for edge in edges if edge.source in included and edge.target in included]

    counts = defaultdict(int)
    for node in nodes:
        counts[node.entity_type] += 1
    unconnected = [node for node in nodes if not any(edge.source == node.id or edge.target == node.id for edge in edges)]
    expired = [edge for edge in edges if edge.status in {"ended", "expired", "inactive"}]
    open_tasks = [row for row in records.get("task", []) if row.get("status") not in {"completed", "done", "closed"}]
    high_risks = [row for row in records.get("risk", []) if row.get("status") not in {"closed", "resolved"} and row.get("severity") in {"high", "critical"}]
    recommendations = [row for row in records.get("recommendation", []) if not row.get("is_actioned") and not row.get("is_dismissed")]
    quality = {
        "unconnected_count": len(unconnected), "expired_relationship_count": len(expired),
        "duplicate_edge_count": max(0, len(edges) - len({(e.source, e.target, e.predicate) for e in edges})),
        "missing_assignment_count": sum(1 for row in open_tasks if not (row.get("related_person_id") or row.get("assigned_to_name"))),
        "issues": ([{"code": "UNCONNECTED_RECORDS", "count": len(unconnected), "severity": "warning"}] if unconnected else [])
            + ([{"code": "EXPIRED_RELATIONSHIPS", "count": len(expired), "severity": "warning"}] if expired else [])
            + ([{"code": "PARTIAL_SOURCES", "count": len(unavailable), "severity": "critical"}] if unavailable else []),
    }
    briefing = {
        "headline": "Your operational graph is ready" if not unavailable else "Your operational graph is partially available",
        "open_tasks": len(open_tasks), "high_risks": len(high_risks),
        "pending_recommendations": len(recommendations), "quality_issues": sum(item["count"] for item in quality["issues"]),
        "recommended_focus": "Review high risks first" if high_risks else "Review open work and graph gaps",
    }
    return GraphPacket(
        company_id=context.tenant_id, scope="neighborhood" if center else "overview",
        nodes=nodes, edges=edges, counts=dict(counts),
        provenance={"tenant_verified": True, "source_of_truth": "Supabase public.*", "projection": "request_time", "edge_count": len(edges), "generated_at": datetime.now(timezone.utc).isoformat(), "complete": not unavailable},
        unavailable_sources=sorted(unavailable), quality=quality, briefing=briefing,
    )
