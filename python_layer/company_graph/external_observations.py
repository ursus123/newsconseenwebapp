"""Governed normalization and matching for external operational observations.

This module deliberately produces separate observation and match records.  It
never writes to the canonical target record that may be affected.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any


CONTRACT_VERSION = "external-operational-observation.v1"
OBSERVATION_TYPES = frozenset({
    "severe_weather", "closure", "recall", "traffic", "supply_disruption",
    "public_holiday", "regulatory_change",
})
TARGET_TYPES = frozenset({
    "enterprise", "operational_unit", "task", "product", "schedule", "address", "territory",
})
MATCH_METHODS = frozenset({
    "explicit_reference", "product_identifier", "coordinates_radius",
    "address_region", "schedule_window", "ontology_rule",
})
PREDICATES = frozenset({"may_affect", "may_disrupt", "requires_alternative"})


def _iso(value: Any, field: str) -> str:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field} must be an ISO-8601 timestamp") from error
    return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc).isoformat()


def normalize_observation(payload: dict[str, Any], *, actor: str) -> dict[str, Any]:
    kind = str(payload.get("observation_type") or "").strip()
    if kind not in OBSERVATION_TYPES:
        raise ValueError("observation_type is not supported")
    confidence = float(payload.get("confidence", 0))
    if not 0 <= confidence <= 1:
        raise ValueError("confidence must be between 0 and 1")
    source_name = str(payload.get("source_name") or "").strip()
    source_record_id = str(payload.get("source_record_id") or "").strip()
    if not source_name or not source_record_id:
        raise ValueError("source_name and source_record_id are required")
    valid_from = _iso(payload.get("valid_from"), "valid_from")
    expires_at = _iso(payload.get("expires_at"), "expires_at")
    if datetime.fromisoformat(expires_at) <= datetime.fromisoformat(valid_from):
        raise ValueError("expires_at must be later than valid_from")
    source_material = payload.get("source_payload") or {
        "source_name": source_name, "source_record_id": source_record_id,
        "retrieved_at": payload.get("retrieved_at"),
    }
    return {
        "operational_unit_id": payload.get("operational_unit_id"),
        "observation_type": kind,
        "title": str(payload.get("title") or "").strip(),
        "summary": str(payload.get("summary") or "").strip(),
        "severity": str(payload.get("severity") or "warning"),
        "status": "active",
        "source_name": source_name,
        "source_url": payload.get("source_url"),
        "source_record_id": source_record_id,
        "retrieved_at": _iso(payload.get("retrieved_at"), "retrieved_at"),
        "freshness_at": _iso(payload.get("freshness_at") or payload.get("retrieved_at"), "freshness_at"),
        "location": payload.get("location") or {},
        "valid_from": valid_from,
        "valid_until": _iso(payload["valid_until"], "valid_until") if payload.get("valid_until") else None,
        "confidence": confidence,
        "expires_at": expires_at,
        "provenance": {
            **(payload.get("provenance") or {}),
            "contract_version": CONTRACT_VERSION,
            "normalization": "provider_payload_to_governed_observation",
        },
        "source_payload_hash": hashlib.sha256(
            json.dumps(source_material, sort_keys=True, default=str).encode("utf-8")
        ).hexdigest(),
        "created_by": actor,
    }


def normalize_matches(matches: list[dict[str, Any]], observation: dict[str, Any], *,
                      observation_id: str, actor: str) -> list[dict[str, Any]]:
    normalized = []
    for item in matches:
        target_type = str(item.get("target_type") or "")
        method = str(item.get("matching_method") or "")
        predicate = str(item.get("predicate") or "may_affect")
        confidence = float(item.get("confidence", observation["confidence"]))
        if target_type not in TARGET_TYPES or not item.get("target_id"):
            raise ValueError("each match requires a supported target_type and target_id")
        if method not in MATCH_METHODS:
            raise ValueError("matching_method is not supported")
        if predicate not in PREDICATES or not 0 <= confidence <= 1:
            raise ValueError("match predicate or confidence is invalid")
        normalized.append({
            "observation_id": observation_id,
            "target_type": target_type,
            "target_id": str(item["target_id"]),
            "predicate": predicate,
            "matching_method": method,
            "confidence": confidence,
            "evidence": item.get("evidence") or [{
                "source_name": observation["source_name"],
                "source_record_id": observation["source_record_id"],
                "matching_method": method,
            }],
            "verification_status": "proposed",
            "valid_from": observation["valid_from"],
            "valid_until": observation.get("valid_until"),
            "expires_at": observation["expires_at"],
            "created_by": actor,
        })
    return normalized


def governed_alternatives(observation: dict[str, Any], matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return proposals only; execution always requires the normal policy gate."""
    labels = {
        "severe_weather": "Review timing or route and choose a safer authorized alternative.",
        "traffic": "Review route and schedule alternatives before dispatch.",
        "closure": "Verify another authorized location or provider nearby.",
        "recall": "Quarantine affected stock and verify an approved replacement.",
        "supply_disruption": "Review approved suppliers, inventory and delivery dates.",
        "public_holiday": "Confirm staffing, opening hours and due dates.",
        "regulatory_change": "Assign policy review and obtain approval before operational changes.",
    }
    return [{
        "proposal_type": "governed_operational_alternative",
        "target_type": match["target_type"],
        "target_id": match["target_id"],
        "recommendation": labels[observation["observation_type"]],
        "requires_approval": True,
        "writes_canonical_record": False,
    } for match in matches]
