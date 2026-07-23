"""Bounded graph planning, opaque continuation state, and direct traversals."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
from collections import defaultdict
from concurrent.futures import as_completed

from ontology.relationship_registry import ALL_RELATIONSHIP_RULES
from .authorization import GraphAuthorizationPolicy
from .execution import GRAPH_IO_EXECUTOR


DEFAULT_NODE_BUDGET = 240
DEFAULT_EDGE_BUDGET = 360
_PROCESS_SECRET = secrets.token_urlsafe(48)
TYPE_WEIGHTS = {
    "risk": 18, "recommendation": 16, "task": 15, "decision": 12,
    "operational_unit": 12, "enterprise": 10, "person": 8,
    "transaction": 7, "product": 6, "service": 6,
}


def allocations(entity_types, budget=DEFAULT_NODE_BUDGET):
    weights = {kind: TYPE_WEIGHTS.get(kind, 3) for kind in entity_types}
    total = sum(weights.values()) or 1
    result = {kind: max(2, budget * weight // total) for kind, weight in weights.items()}
    while sum(result.values()) > budget:
        candidate = max((kind for kind in result if result[kind] > 2), key=lambda kind: result[kind], default=None)
        if not candidate:
            break
        result[candidate] -= 1
    return result


def _secret():
    return os.getenv("GRAPH_CONTINUATION_SECRET") or os.getenv("SUPABASE_JWT_SECRET") or _PROCESS_SECRET


def encode_continuation(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    encoded = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    signature = hmac.new(_secret().encode(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def decode_continuation(token: str | None, *, tenant_id: str, fingerprint: str, scope_id: str) -> dict[str, int]:
    if not token:
        return {}
    try:
        encoded, signature = token.split(".", 1)
        expected = hmac.new(_secret().encode(), encoded.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        payload = json.loads(raw)
        if payload.get("tenant") != tenant_id or payload.get("authorization") != fingerprint or payload.get("scope") != scope_id:
            raise ValueError("scope")
        return {str(key): max(0, int(value)) for key, value in payload.get("offsets", {}).items()}
    except Exception as exc:
        raise ValueError("Invalid or out-of-scope graph continuation token") from exc


def direct_neighborhood_records(context, repository, center: str, depth: int, per_query_limit: int = 80):
    """Read only incident carriers and endpoints using bounded parallel batches.

    A traversal round is one graph hop. Queries sharing a carrier field are
    merged into one ``in`` filter, so latency grows by depth rather than by the
    number of relationship rules or endpoints.
    """
    center_type, center_id = center.split(":", 1)
    records = defaultdict(list)
    seen_rows = defaultdict(set)
    frontier = {(center_type, center_id)}
    visited = set()
    policy = GraphAuthorizationPolicy.for_context(context)

    def add(kind, row):
        if row and row.get("id") is not None and str(row["id"]) not in seen_rows[kind]:
            seen_rows[kind].add(str(row["id"]))
            records[kind].append(row)

    def read_filtered(kind, field, identifiers, limit, qualifier_field=None, qualifier_value=None):
        values = tuple(sorted({str(identifier) for identifier in identifiers if identifier is not None}))
        if not values:
            return []
        value = values[0] if len(values) == 1 else values
        filters = {field: value}
        if qualifier_field and qualifier_value:
            filters[qualifier_field] = qualifier_value
        return repository.list_entities_filtered(
            context, kind, filters=filters, limit=limit,
        ).data or []

    def run_batches(specifications):
        futures = {
            GRAPH_IO_EXECUTOR.submit(
                read_filtered, kind, field, identifiers, limit, qualifier_field, qualifier_value,
            ): (kind, field)
            for (kind, field, qualifier_field, qualifier_value), (identifiers, limit) in specifications.items()
        }
        completed = []
        for future in as_completed(futures):
            kind, field = futures[future]
            completed.append((kind, field, future.result()))
        return completed

    # The selected center must exist and be visible before traversal begins.
    if policy.can_read_entity(center_type):
        add(center_type, repository.get_entity(context, center_type, center_id).data)

    for _ in range(max(1, min(depth, 3))):
        current_frontier = frontier - visited
        if not current_frontier:
            break
        visited.update(current_frontier)
        query_ids = defaultdict(set)
        for node_type, node_id in current_frontier:
            if not policy.can_read_entity(node_type):
                continue
            for rule in ALL_RELATIONSHIP_RULES:
                if not policy.can_read_entity(rule.carrier_type):
                    continue
                if rule.source_type == node_type and not (
                    rule.carrier_type == node_type and rule.source_field == "id"
                ):
                    query_ids[(rule.carrier_type, rule.source_field, None, None)].add(node_id)
                if rule.target_type == node_type or rule.target_type_field:
                    query_ids[(
                        rule.carrier_type, rule.target_field,
                        rule.target_type_field, node_type if rule.target_type_field else None,
                    )].add(node_id)

        specifications = {
            key: (identifiers, per_query_limit)
            for key, identifiers in query_ids.items()
        }
        next_frontier = set()
        for carrier_type, _field, matches in run_batches(specifications):
            for row in matches:
                add(carrier_type, row)
                for rule in ALL_RELATIONSHIP_RULES:
                    if rule.carrier_type != carrier_type:
                        continue
                    source_id, target_id = row.get(rule.source_field), row.get(rule.target_field)
                    target_type = str(row.get(rule.target_type_field) or rule.target_type) if rule.target_type_field else rule.target_type
                    if source_id:
                        next_frontier.add((rule.source_type, str(source_id)))
                    if target_id:
                        next_frontier.add((target_type, str(target_id)))
        frontier = next_frontier

    # Hydrate exact endpoint identities in one request per entity type. Carrier
    # records already loaded above are deduplicated by ``add``.
    endpoint_ids = defaultdict(set)
    for node_type, node_id in visited | frontier:
        if policy.can_read_entity(node_type) and str(node_id) not in seen_rows[node_type]:
            endpoint_ids[(node_type, "id", None, None)].add(node_id)
    endpoint_specs = {
        key: (identifiers, max(per_query_limit, len(identifiers)))
        for key, identifiers in endpoint_ids.items()
    }
    for node_type, _field, rows in run_batches(endpoint_specs):
        for row in rows:
            add(node_type, row)

    typed_sources = [f"{kind}:{identifier}" for kind, identifier in visited | frontier]
    if typed_sources:
        assertion_specs = {
            ("graph_assertion", "source_node_id", None, None): (typed_sources, per_query_limit * 2),
            ("graph_assertion", "target_node_id", None, None): (typed_sources, per_query_limit * 2),
        }
        for _kind, _field, rows in run_batches(assertion_specs):
            for row in rows:
                add("graph_assertion", row)
        keys = [row.get("assertion_key") for row in records["graph_assertion"] if row.get("assertion_key")]
        if keys:
            for row in read_filtered("graph_assertion_event", "assertion_key", keys, per_query_limit * 3):
                add("graph_assertion_event", row)
    return dict(records)
