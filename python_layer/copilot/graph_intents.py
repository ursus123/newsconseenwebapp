"""Deterministic Idjwi execution for governed Company Graph intents."""

from company_graph.intents import GRAPH_INTENT_VERSION
from company_graph.explanations import edge_citation, graph_claim_confidence, node_citation
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
    cited_edges = []
    cited_nodes = []
    intent_complete = True

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
        cited_edges = edges[:5]
        cited_nodes = nodes[:5] if not cited_edges else []
    elif intent == "explain_operational_unit":
        answer = f"The authorized graph for {scope_label} contains {len(nodes)} records and {len(edges)} relationships. It is restricted to the selected operational-unit permission boundary."
        data = {"scope": context.get("scope"), "node_count": len(nodes), "edge_count": len(edges)}
        cited_edges = edges[:5]
        cited_nodes = nodes[:5] if not cited_edges else []
    elif intent == "explain_node":
        if not selected_node:
            answer, data = "Select an authorized graph node before asking Idjwi to explain it.", {"required_context": "selected_node_id"}
            intent_complete = False
        else:
            incident = [edge for edge in edges if selected_node["id"] in (edge.get("source"), edge.get("target"))]
            answer = f"{selected_node.get('label') or selected_node['id']} is a {selected_node.get('entity_type', 'record')} with {len(incident)} visible governed connections in this scope."
            data = {"node": selected_node, "relationships": incident}
            cited_nodes = [selected_node]
            cited_edges = incident[:8]
    elif intent == "explain_relationship":
        if not selected_edge:
            answer, data = "Select an authorized relationship before asking Idjwi to explain it.", {"required_context": "selected_edge_id"}
            intent_complete = False
        else:
            evidence = (selected_edge.get("evidence") or [{}])[0]
            last_confirmed = (selected_edge.get("temporal") or {}).get("confirmed_at")
            answer = (
                f"This relationship says {selected_edge.get('source')} "
                f"{selected_edge.get('label') or selected_edge.get('predicate')} "
                f"{selected_edge.get('target')}. Evidence: "
                f"{evidence.get('source_record_id') or evidence.get('evidence_id') or 'governed graph evidence'}."
                + (f" Last confirmed: {last_confirmed}." if last_confirmed else "")
                + f" {evidence.get('explanation') or ''}"
            ).strip()
            data = {"relationship": selected_edge, "evidence": selected_edge.get("evidence") or []}
            cited_edges = [selected_edge]
    elif intent == "explain_graph_change":
        history = graph["history"]
        answer = f"Idjwi found {len(history)} governed relationship state changes in the supplied graph context."
        data = {"changes": history}
        cited_edges = edges[:8]
    elif intent == "find_graph_gaps":
        issues = quality.get("issues") or []
        answer = f"Idjwi found {quality.get('unconnected_count', 0)} unconnected records, {quality.get('missing_assignment_count', 0)} missing assignments, and {len(issues)} graph-quality issue categories in this bounded scope."
        data = {"quality": quality, "issues": issues}
        connected = {endpoint for edge in edges for endpoint in (edge.get("source"), edge.get("target"))}
        cited_nodes = [node for node in nodes if node.get("id") not in connected][:8]
    elif intent == "recommend_graph_action":
        issues = quality.get("issues") or []
        first = issues[0] if issues else None
        answer = (f"Start with {str(first.get('code')).replace('_', ' ').lower()} affecting {first.get('count', 0)} records; review its evidence before approving corrections." if first else "No graph-quality repair is currently prioritized. Review open work and newly observed changes next.")
        data = {"priority_issue": first, "permitted_actions": context.get("permitted_actions") or []}
        cited_edges = edges[:5]
    elif intent == "compare_graph_scopes":
        comparisons = context.get("comparison_scopes") or []
        answer = (f"Idjwi compared {len(comparisons)} authorized graph scopes." if len(comparisons) >= 2 else "Choose at least two authorized operational scopes before requesting a comparison.")
        data = {"comparison_scopes": comparisons, "required_scopes": max(0, 2 - len(comparisons))}
        intent_complete = len(comparisons) >= 2
    elif intent == "search_company_graph":
        search_query = str(context.get("graph_search_query") or question or "").casefold().strip()
        ignored = {
            "a", "an", "and", "ask", "company", "find", "for", "graph", "governed",
            "idjwi", "in", "me", "of", "record", "records", "search", "show", "the", "to",
        }
        terms = [
            term for term in search_query.replace("?", " ").replace(",", " ").split()
            if len(term) >= 2 and term not in ignored
        ]
        matched_nodes = [
            node for node in nodes
            if terms and any(term in " ".join([
                str(node.get("label") or ""), str(node.get("sublabel") or ""),
                str(node.get("status") or ""), str(node.get("entity_type") or ""),
                " ".join(str(value) for value in (node.get("attributes") or {}).values()),
            ]).casefold() for term in terms)
        ]
        matched_ids = {node.get("id") for node in matched_nodes}
        matched_edges = [
            edge for edge in edges
            if any(term in str(edge.get("predicate") or edge.get("label") or "").casefold() for term in terms)
            or edge.get("source") in matched_ids or edge.get("target") in matched_ids
        ]
        answer = (
            f"Idjwi found {len(matched_nodes)} authorized records and {len(matched_edges)} relationships "
            f"matching '{context.get('graph_search_query') or question}' in the supplied governed graph."
        )
        data = {"query": context.get("graph_search_query") or question, "nodes": matched_nodes, "relationships": matched_edges}
        cited_nodes = matched_nodes[:8]
        cited_edges = matched_edges[:8]
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
    node_lookup = {node["id"]: node for node in nodes}
    graph_citations = [edge_citation(edge, node_lookup) for edge in cited_edges]
    graph_citations.extend(node_citation(node) for node in cited_nodes)
    cited_node_ids = list(dict.fromkeys(
        node_id
        for citation in graph_citations
        for node_id in (citation.get("node_ids") or [])
    ))
    cited_edge_ids = list(dict.fromkeys(
        citation.get("edge_id") for citation in graph_citations if citation.get("edge_id")
    ))
    graph_workspace_actions = []
    if cited_node_ids:
        graph_workspace_actions.extend([
            {"action": "highlight_records", "label": "Highlight evidence", "node_ids": cited_node_ids},
            {"action": "center_record", "label": "Center first record", "node_id": cited_node_ids[0]},
        ])
    if cited_edge_ids:
        graph_workspace_actions.append({
            "action": "open_edge", "label": "Open relationship", "edge_id": cited_edge_ids[0],
        })
    if len(cited_node_ids) >= 2:
        graph_workspace_actions.append({
            "action": "compare_neighborhoods", "label": "Compare neighborhoods",
            "node_ids": cited_node_ids[:2],
        })
    permitted_action_names = {
        item.get("action") if isinstance(item, dict) else item
        for item in graph["permitted_actions"]
    }
    if selected_edge and permitted_action_names.intersection({
        "confirm", "reject", "propose", "edit",
        "relationship_confirm", "relationship_reject", "relationship_propose",
    }):
        graph_workspace_actions.append({
            "action": "propose_governed_correction", "label": "Review correction",
            "edge_id": selected_edge.get("id"),
        })
    graph_workspace_actions.extend([
        {"action": "create_task", "label": "Create follow-up task"},
        {"action": "request_approval", "label": "Request approval"},
    ])
    if graph["completeness"].get("state") != "complete" or graph["unavailable_sources"]:
        graph_workspace_actions.append({
            "action": "explain_degraded_data", "label": "Explain degraded data",
        })
    confidence = graph_claim_confidence(context, cited_edges, intent_complete=intent_complete)
    return {
        "answer": answer, "intent": intent, "intent_version": GRAPH_INTENT_VERSION,
        "mode": "autonomous", "operating_mode": "governed_graph_intent",
        "tools_called": [intent], "tools_detail": [tool], "data": data,
        "confidence": confidence,
        "graph_citations": graph_citations,
        "graph_workspace_actions": graph_workspace_actions,
        "missing_data_caveats": caveats,
        "trust": build_trust_packet(
            question=question, company_id=company_id, principal=principal,
            mode="autonomous", operating_mode="governed_graph_intent",
            collected_tools=[tool], tools_detail=[tool], caveats=caveats,
            confidence=confidence,
            tenant_brain_used=True, default_brain_used=False,
        ),
    }
