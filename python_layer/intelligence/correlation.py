"""Tenant-safe deterministic correlation for governed intelligence cases."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from intelligence.contracts import IntelligenceItem


def _stable(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _hash(value) -> str:
    return hashlib.sha256(_stable(value).encode()).hexdigest()


def _references(item: IntelligenceItem) -> list[str]:
    refs = [f"{ref.type}:{ref.id}" for ref in item.related_records]
    return sorted(set(refs))


@dataclass(frozen=True)
class CorrelationDescriptor:
    correlation_key: str
    condition_key: str
    source_event_key: str
    evidence_fingerprints: tuple[str, ...]
    source_identity: str
    affected_records: tuple[str, ...]
    window_started_at: str
    window_ends_at: str


def describe(item: IntelligenceItem, *, observed_at: datetime | None = None, window_hours: int = 24) -> CorrelationDescriptor:
    """Build a cross-source case key and a source-specific replay key.

    Source identity is intentionally excluded from correlation_key, allowing a
    rule, model, and external observation to support the same governed case.
    """
    moment = observed_at or datetime.now(timezone.utc)
    scope = item.operational_unit_id or item.affected_scope.get("id") or item.organization_id
    condition_key = ":".join((item.intelligence_type, item.subtype or "general"))
    affected = _references(item)
    evidence = tuple(sorted(_hash({"type": value.type, "id": value.id, "source": value.source}) for value in item.evidence))
    base = {
        "tenant": item.tenant_id, "organization": item.organization_id,
        "scope": scope, "condition": condition_key, "affected": affected,
    }
    correlation_key = _hash(base)
    source_identity = f"{item.source.type}:{item.source.id}"
    source_event_key = _hash({**base, "source": source_identity, "evidence": evidence})
    return CorrelationDescriptor(
        correlation_key=correlation_key, condition_key=condition_key,
        source_event_key=source_event_key, evidence_fingerprints=evidence,
        source_identity=source_identity, affected_records=tuple(affected),
        window_started_at=moment.isoformat(),
        window_ends_at=(moment + timedelta(hours=max(1, window_hours))).isoformat(),
    )
