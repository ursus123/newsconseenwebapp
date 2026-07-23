"""Deterministic Idjwi execution for governed Company Graph intents."""

from company_graph.intents import GRAPH_INTENT_VERSION
from copilot.trust import build_trust_packet


def _scope_label(context):
    scope = context.get("scope") or {}
    return scope.get("name") or scope.get("id") or "the authorized organization scope"


def _base(context):
    nodes = context.get("nodes") or []
    edges = context.get("edges") or []
    unavailable = context.get("unavailable_sources")
    if unavailable is None:
        unavailable = sorted(
            source.get("source_id") for source in (context.get("source_status") or [])
            if source.get("state") in {"unavailable", "partial"}
        )
    semantic = context.get("semantic_summary") or {
        "node_count": len(nodes),
        "edge_count": len(edges),
        "disconnected_count": (context.get("quality") or {}).get("unconnected_count", 0),
        "unavailable_source_count": len(unavailable),
    }
    return {
        "nodes": nodes,
        "edges": edges,
        "counts": context.get("counts") or {},
        "semantic_summary": semantic,
        "ranked_neighborhood": context.get("ranked_neighborhood") or {},
        "relationship_predicates": context.get("relationship_predicates") or [],
        "provenance": context.get("provenance") or {},
        "freshness": context.get("freshness") or {},
        "source_status": context.get("source_status") or [],
        "unavailable_sources": unavailable,
        "sensitivity_classes": context.get("sensitivity_classes") or [],
        "quality": context.get("quality") or {},
        "completeness": context.get("completeness") or {},
        "truncation": context.get("truncation") or {},
        "history": context.get("assertion_history") or [],
        "permitted_actions": context.get("permitted_actions") or [],
    }


def execute_graph_intent(intent, *, question, company_id, context, principal):
    graph = _base(context)
    nodes, edges = graph["nodes"], graph["edges"]
    semantic_summary = graph["semantic_summary"]
    scope_label = _scope_label(context)
    selected_node = next((node for node in nodes if node.get("id") == context.get("selected_node_id")), None)
    selected_edge = next((edge for edge in edges if edge.get("id") == context.get("selected_edge_id")), None)
    quality = graph["quality"]

    if intent == "explain_company_graph":
        types = {}
        for node in nodes:
            types[node.get("entity_type", "record")] = types.get(node.get("entity_type", "record"), 0) + 1
        answer = (
            f"Idjwi's governed view of {scope_label} contains {len(nodes)} authorized records and {len(edges)} visible relationships. "
            f"The largest visible record groups are " + (", ".join(f"{kind}: {count}" for kind, count in sorted(types.items(), key=lambda item: (-item[1], item[0]))[:5]) or "none") + ". "
            f"Graph state is {graph['completeness'].get('state', 'unknown')}"
            + (" and bounded; omitted records are disclosed in truncation metadata." if graph["truncation"].get("truncated") else ".")
        )
        data = {"scope": context.get("scope"), "node_count": len(nodes), "edge_count": len(edges), "counts": types}
    elif intent == "explain_operational_unit":
        answer = f"The authorized graph for {scope_label} contains {len(nodes)} records and {len(edges)} relationships. It is restricted to the selected operational-unit permission boundary."
        data = {"scope": context.get("scope"), "node_count": len(nodes), "edge_count": len(edges)}
    elif intent == "explain_node":
        if not selected_node:
            answer, data = "Select an authorized graph node before asking Idjwi to explain it.", {"required_context": "selected_node_id"}
        else:
            incident = [edge for edge in edges if selected_node["id"] in (edge.get("source"), edge.get("target"))]
            answer = f"{selected_node.get('label') or selected_node['id']} is a {selected_node.get('entity_type', 'record')} with {len(incident)} visible governed connections in this scope."
            data = {"node": selected_node, "relationships": incident}
    elif intent == "explain_relationship":
        if not selected_edge:
            answer, data = "Select an authorized relationship before asking Idjwi to explain it.", {"required_context": "selected_edge_id"}
        else:
            evidence = (selected_edge.get("evidence") or [{}])[0]
            answer = f"This relationship says {selected_edge.get('source')} {selected_edge.get('label') or selected_edge.get('predicate')} {selected_edge.get('target')}. It is a {selected_edge.get('assertion_class')} assertion with {round(float(selected_edge.get('confidence') or 0) * 100)}% confidence. {evidence.get('explanation') or ''}".strip()
            data = {"relationship": selected_edge, "evidence": selected_edge.get("evidence") or []}
    elif intent == "explain_graph_change":
        history = graph["history"]
        answer = f"Idjwi found {len(history)} governed relationship state changes in the supplied graph context."
        data = {"changes": history}
    elif intent == "find_graph_gaps":
        issues = quality.get("issues") or []
        answer = f"Idjwi found {quality.get('unconnected_count', 0)} unconnected records, {quality.get('missing_assignment_count', 0)} missing assignments, and {len(issues)} graph-quality issue categories in this bounded scope."
        data = {"quality": quality, "issues": issues}
    elif intent == "recommend_graph_action":
        issues = quality.get("issues") or []
        first = issues[0] if issues else None
        answer = (f"Start with {str(first.get('code')).replace('_', ' ').lower()} affecting {first.get('count', 0)} records; review its evidence before approving corrections." if first else "No graph-quality repair is currently prioritized. Review open work and newly observed changes next.")
        data = {"priority_issue": first, "permitted_actions": context.get("permitted_actions") or []}
    elif intent == "compare_graph_scopes":
        comparisons = context.get("comparison_scopes") or []
        answer = (f"Idjwi compared {len(comparisons)} authorized graph scopes." if len(comparisons) >= 2 else "Choose at least two authorized operational scopes before requesting a comparison.")
        data = {"comparison_scopes": comparisons, "required_scopes": max(0, 2 - len(comparisons))}
    else:
        raise ValueError(f"Unsupported Idjwi graph intent: {intent}")

    caveats = []
    if graph["truncation"].get("truncated"):
        caveats.append("This is a bounded graph context; omitted records are disclosed by the graph truncation contract.")
    if graph["completeness"].get("state") != "complete":
        caveats.append(f"Graph completeness is {graph['completeness'].get('state', 'unknown')}.")
    tool = {"tool": intent, "status": "success", "source": "company_graph.v1"}
    data["graph_semantic_summary"] = semantic_summary
    data["graph_packet"] = {
        "contract_version": context.get("contract_version"),
        "tenant_id": context.get("tenant_id"),
        "scope": context.get("scope"),
        "role": context.get("role"),
        "selected_node_id": context.get("selected_node_id"),
        "selected_edge_id": context.get("selected_edge_id"),
        "ranked_neighborhood": graph["ranked_neighborhood"],
        "relationship_predicates": graph["relationship_predicates"],
        "provenance": graph["provenance"],
        "freshness": graph["freshness"],
        "source_status": graph["source_status"],
        "unavailable_sources": graph["unavailable_sources"],
        "completeness": graph["completeness"],
        "truncation": graph["truncation"],
        "sensitivity_classes": graph["sensitivity_classes"],
        "permitted_actions": graph["permitted_actions"],
        "page": context.get("page"),
        "product_surface": context.get("product_surface"),
    }
    return {
        "answer": answer, "intent": intent, "intent_version": GRAPH_INTENT_VERSION,
        "mode": "autonomous", "operating_mode": "governed_graph_intent",
        "tools_called": [intent], "tools_detail": [tool], "data": data,
        "confidence": {"score": 0.95, "label": "High", "reason": "Deterministic reasoning over the authorized versioned graph context."},
        "missing_data_caveats": caveats,
        "trust": build_trust_packet(
            question=question, company_id=company_id, principal=principal,
            mode="autonomous", operating_mode="governed_graph_intent",
            collected_tools=[tool], tools_detail=[tool], caveats=caveats,
            confidence={"score": 0.95, "label": "High", "reason": "Deterministic governed graph intent."},
            tenant_brain_used=True, default_brain_used=False,
        ),
    }
