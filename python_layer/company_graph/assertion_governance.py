"""Durable temporal state and history for governed graph assertions."""

from __future__ import annotations

import hashlib
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import HTTPException


ASSERTION_STATES = ("proposed", "confirmed", "rejected", "disputed", "active", "expired", "superseded")
ALLOWED_TRANSITIONS = {
    "proposed": {"confirmed", "rejected", "disputed", "expired", "superseded"},
    "confirmed": {"active", "disputed", "expired", "superseded"},
    "active": {"disputed", "expired", "superseded"},
    "disputed": {"confirmed", "rejected", "active", "superseded"},
    "rejected": {"proposed", "superseded"},
    "expired": {"active", "superseded"},
    "superseded": set(),
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_assertion_key(source: str, predicate: str, target: str, relationship_rule_id: str | None) -> str:
    material = "|".join((source, predicate, target, relationship_rule_id or "unregistered"))
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def default_assertion_state(assertion_class: str, status: str, expires_at: str | None = None) -> str:
    if expires_at:
        try:
            if datetime.fromisoformat(str(expires_at).replace("Z", "+00:00")) <= datetime.now(timezone.utc):
                return "expired"
        except ValueError:
            pass
    if status in {"expired", "ended", "inactive"}:
        return "expired"
    if assertion_class in {"canonical_relationship", "operator_confirmed_assertion", "canonical_reference_projection"}:
        return "active"
    return "proposed"


def persist_assertion_transition(repository, context, edge, to_state: str, *, reason: str,
                                 evidence_version: int | None = None,
                                 superseded_by: str | None = None) -> dict:
    if to_state not in ASSERTION_STATES:
        raise HTTPException(status_code=422, detail={"code": "ASSERTION_STATE_INVALID"})
    assertions = repository.list_entities(context, "graph_assertion", limit=5000).data or []
    existing = next((row for row in assertions if row.get("assertion_key") == edge.assertion_key), None)
    from_state = str(existing.get("assertion_state")) if existing else edge.assertion_state
    if existing and to_state != from_state and to_state not in ALLOWED_TRANSITIONS.get(from_state, set()):
        raise HTTPException(status_code=409, detail={
            "code": "ASSERTION_TRANSITION_NOT_ALLOWED", "category": "governance",
            "message": f"Assertion cannot transition from {from_state} to {to_state}.",
            "action": "review_assertion_history", "retryable": False,
        })
    timestamp = now_iso()
    version = evidence_version or int((existing or {}).get("evidence_version") or edge.temporal.evidence_version or 1)
    payload = {
        "operational_unit_id": context.scope_id if context.scope_type == "operational_unit" else None,
        "assertion_key": edge.assertion_key,
        "relationship_rule_id": edge.relationship_rule_id,
        "source_node_id": edge.source, "predicate": edge.predicate,
        "target_node_id": edge.target, "assertion_class": edge.assertion_class,
        "assertion_state": to_state,
        "valid_from": edge.temporal.valid_from, "valid_until": edge.temporal.valid_to,
        "observed_at": edge.temporal.observed_at,
        "confirmed_at": timestamp if to_state in {"confirmed", "active"} else (existing or {}).get("confirmed_at"),
        "rejected_at": timestamp if to_state == "rejected" else (existing or {}).get("rejected_at"),
        "superseded_by": superseded_by, "evidence_version": version,
        "evidence": [item.model_dump() for item in edge.evidence],
        "reason": reason, "actor_user_id": context.user_id,
    }
    if existing:
        assertion = repository.update_entity(context, "graph_assertion", str(existing["id"]), payload).data
    else:
        assertion = repository.create_entity(context, "graph_assertion", payload).data
    event = repository.create_entity(context, "graph_assertion_event", {
        "assertion_id": assertion["id"], "assertion_key": edge.assertion_key,
        "from_state": from_state, "to_state": to_state, "reason": reason,
        "actor_user_id": context.user_id, "evidence_version": version,
        "evidence": [item.model_dump() for item in edge.evidence], "occurred_at": timestamp,
    }).data
    return {"assertion": assertion, "event": event}


def apply_assertion_state(edges, assertion_rows: list[dict], event_rows: list[dict], *, include_history_details: bool = True):
    assertions = {str(row.get("assertion_key")): row for row in assertion_rows if row.get("assertion_key")}
    events_by_key = defaultdict(list)
    for row in event_rows:
        events_by_key[str(row.get("assertion_key") or "")].append(row)
    visible, history = [], []
    for edge in edges:
        assertion = assertions.get(edge.assertion_key)
        if assertion:
            edge.assertion_state = assertion.get("assertion_state") or edge.assertion_state
            edge.temporal.valid_from = str(assertion.get("valid_from")) if assertion.get("valid_from") else edge.temporal.valid_from
            edge.temporal.valid_to = str(assertion.get("valid_until")) if assertion.get("valid_until") else edge.temporal.valid_to
            edge.temporal.observed_at = str(assertion.get("observed_at")) if assertion.get("observed_at") else edge.temporal.observed_at
            edge.temporal.confirmed_at = str(assertion.get("confirmed_at")) if assertion.get("confirmed_at") else None
            edge.temporal.rejected_at = str(assertion.get("rejected_at")) if assertion.get("rejected_at") else None
            edge.temporal.superseded_by = str(assertion.get("superseded_by")) if assertion.get("superseded_by") else None
            edge.temporal.evidence_version = int(assertion.get("evidence_version") or 1)
        for event in sorted(events_by_key.get(edge.assertion_key, []), key=lambda row: str(row.get("occurred_at") or "")):
            history.append({
                "assertion_key": edge.assertion_key, "edge_id": edge.id,
                "source": edge.source, "predicate": edge.predicate, "target": edge.target,
                "from_state": event.get("from_state"), "to_state": event.get("to_state"),
                "reason": event.get("reason") if include_history_details else "Governed operator decision",
                "actor": "authorized_operator",
                "occurred_at": str(event.get("occurred_at")) if event.get("occurred_at") else None,
                "evidence_version": int(event.get("evidence_version") or 1),
            })
        if edge.assertion_state == "rejected" and edge.assertion_class not in {"canonical_relationship", "operator_confirmed_assertion"}:
            continue
        visible.append(edge)
    # Preserve history of currently suppressed assertions even if its source no
    # longer emits an edge, so Idjwi can explain why it remains absent.
    edge_keys = {edge.assertion_key for edge in edges}
    for key, assertion in assertions.items():
        if key in edge_keys or assertion.get("assertion_state") != "rejected":
            continue
        for event in events_by_key.get(key, []):
            history.append({
                "assertion_key": key, "edge_id": None,
                "source": assertion.get("source_node_id"), "predicate": assertion.get("predicate"),
                "target": assertion.get("target_node_id"), "from_state": event.get("from_state"),
                "to_state": event.get("to_state"),
                "reason": event.get("reason") if include_history_details else "Governed operator decision",
                "actor": "authorized_operator",
                "occurred_at": str(event.get("occurred_at")) if event.get("occurred_at") else None,
                "evidence_version": int(event.get("evidence_version") or 1),
            })
    return visible, history
