"""Evidence-linked claims and confidence for governed Company Graph answers."""

from __future__ import annotations

from datetime import datetime, timezone

from .contracts import GraphCitation

ASSERTION_STRENGTH = {
    "canonical_relationship": 1.0,
    "operator_confirmed_assertion": 1.0,
    "canonical_reference_projection": 0.9,
    "deterministic_derivation": 0.78,
    "analytical_inference": 0.65,
    "external_observation": 0.62,
    "advisor_proposal": 0.5,
}


def _as_dict(value):
    return value if isinstance(value, dict) else value.model_dump()


def _freshness_score(edge: dict) -> float:
    temporal = edge.get("temporal") or {}
    candidates = [
        temporal.get("confirmed_at"), temporal.get("observed_at"),
        *[
            item.get("freshness_at") or item.get("retrieved_at")
            for item in (edge.get("evidence") or [])
        ],
    ]
    for value in candidates:
        if not value:
            continue
        try:
            observed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            age_days = max(0, (datetime.now(timezone.utc) - observed).days)
            if age_days <= 7:
                return 1.0
            if age_days <= 30:
                return 0.85
            if age_days <= 90:
                return 0.65
            return 0.4
        except ValueError:
            continue
    return 0.6


def graph_claim_confidence(context: dict, edges: list, *, intent_complete: bool) -> dict:
    edge_values = [_as_dict(edge) for edge in edges]
    evidence_strength = (
        sum(
            min(
                float(edge.get("confidence") or 0),
                ASSERTION_STRENGTH.get(edge.get("assertion_class"), 0.5),
            )
            for edge in edge_values
        ) / len(edge_values)
        if edge_values else 0.7
    )
    source_status = context.get("source_status") or []
    available = sum(source.get("state") in {"available", "empty"} for source in source_status)
    source_completeness = available / len(source_status) if source_status else 0.7
    freshness = (
        sum(_freshness_score(edge) for edge in edge_values) / len(edge_values)
        if edge_values else 0.7
    )
    intent_completion = 1.0 if intent_complete else 0.45
    contradiction_status = 1.0
    if any(edge.get("assertion_state") in {"rejected", "disputed"} for edge in edge_values):
        contradiction_status = 0.2
    elif (context.get("quality") or {}).get("duplicate_edge_count", 0):
        contradiction_status = 0.8
    factors = {
        "evidence_strength": round(evidence_strength, 3),
        "source_completeness": round(source_completeness, 3),
        "freshness": round(freshness, 3),
        "intent_completion": round(intent_completion, 3),
        "contradiction_status": round(contradiction_status, 3),
    }
    score = (
        evidence_strength * 0.35
        + source_completeness * 0.2
        + freshness * 0.2
        + intent_completion * 0.15
        + contradiction_status * 0.1
    )
    score = round(max(0.0, min(1.0, score)), 3)
    label = "High" if score >= 0.8 else "Medium" if score >= 0.6 else "Low"
    return {
        "score": score,
        "label": label,
        "reason": "Calculated from governed evidence strength, source completeness, freshness, intent completion, and contradiction state.",
        "factors": factors,
    }


def edge_citation(edge, nodes: dict[str, dict], *, claim: str | None = None) -> dict:
    value = _as_dict(edge)
    source = nodes.get(value["source"]) or {"id": value["source"], "label": value["source"]}
    target = nodes.get(value["target"]) or {"id": value["target"], "label": value["target"]}
    evidence = value.get("evidence") or []
    predicate = value.get("label") or value.get("predicate") or "relates to"
    text = claim or f"{source.get('label')} {predicate} {target.get('label')}."
    confirmed = (value.get("temporal") or {}).get("confirmed_at")
    return GraphCitation.model_validate({
        "citation_id": f"graph-edge:{value['id']}",
        "kind": "graph_edge",
        "title": text,
        "claim": text,
        "node_ids": [value["source"], value["target"]],
        "edge_id": value["id"],
        "source": source,
        "target": target,
        "predicate": value.get("predicate"),
        "assertion_state": value.get("assertion_state"),
        "verification_state": value.get("verification_state"),
        "evidence_ids": [item.get("evidence_id") for item in evidence if item.get("evidence_id")],
        "evidence": evidence,
        "last_confirmed": confirmed,
    }).model_dump()


def node_citation(node, *, claim: str | None = None) -> dict:
    value = _as_dict(node)
    return GraphCitation.model_validate({
        "citation_id": f"graph-node:{value['id']}",
        "kind": "graph_node",
        "title": claim or value.get("label") or value["id"],
        "claim": claim or f"{value.get('label') or value['id']} is visible in the authorized graph.",
        "node_ids": [value["id"]],
        "edge_id": None,
        "source": value,
        "target": None,
        "predicate": None,
        "assertion_state": None,
        "verification_state": None,
        "evidence_ids": [],
        "evidence": [],
        "last_confirmed": None,
    }).model_dump()
