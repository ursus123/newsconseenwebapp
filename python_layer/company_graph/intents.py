"""Versioned governed intents shared by Company Graph and Idjwi."""

GRAPH_INTENT_VERSION = "company-graph-intents.v1"
GRAPH_INTENTS = (
    "explain_company_graph",
    "explain_operational_unit",
    "explain_node",
    "explain_relationship",
    "explain_graph_change",
    "find_graph_gaps",
    "recommend_graph_action",
    "compare_graph_scopes",
)
GRAPH_INTENT_SET = frozenset(GRAPH_INTENTS)


def classify_graph_question(question: str, context: dict | None = None) -> str | None:
    """Conservative fallback for typed questions; buttons send explicit intent."""
    text = " ".join(str(question or "").casefold().split())
    context = context or {}
    if any(phrase in text for phrase in ("what is disconnected", "graph gaps", "missing link", "unconnected")):
        return "find_graph_gaps"
    if any(phrase in text for phrase in ("what changed", "graph change", "relationship changed")):
        return "explain_graph_change"
    if "compare" in text and any(word in text for word in ("scope", "department", "unit", "branch", "team")):
        return "compare_graph_scopes"
    if any(phrase in text for phrase in ("explain this company", "explain the company", "explain company graph", "explain this graph")):
        return "explain_company_graph"
    if context.get("selected_edge_id") and any(word in text for word in ("relationship", "connection", "connected", "edge")):
        return "explain_relationship"
    if context.get("selected_node_id") and any(word in text for word in ("explain", "risk", "action", "know about")):
        return "explain_node"
    if any(phrase in text for phrase in ("what should we do", "recommend graph", "biggest risks", "most actionable")):
        return "recommend_graph_action"
    if context.get("scope", {}).get("type") in {"operational_unit", "department", "team"} and "explain" in text:
        return "explain_operational_unit"
    return None


def resolve_graph_intent(explicit_intent: str | None, question: str, context: dict | None = None) -> str | None:
    if explicit_intent:
        if explicit_intent not in GRAPH_INTENT_SET:
            raise ValueError(f"Unsupported Idjwi graph intent: {explicit_intent}")
        return explicit_intent
    return classify_graph_question(question, context)
