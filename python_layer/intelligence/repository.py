"""Canonical persistence for governed intelligence cases and lifecycle records."""

from __future__ import annotations

import copy
import uuid
from datetime import datetime, timezone

from data_sources import supabase_source
from intelligence.contracts import IntelligenceItem
from intelligence.correlation import CorrelationDescriptor


TABLES = {
    "groups": "intelligence_deduplication_groups", "items": "intelligence_items",
    "evidence": "intelligence_evidence_links", "assignments": "intelligence_assignments",
    "transitions": "intelligence_status_transitions", "decisions": "intelligence_decision_links",
    "approvals": "intelligence_approval_requests", "actions": "intelligence_actions",
    "outcomes": "intelligence_outcomes", "feedback": "intelligence_operator_feedback",
    "audit": "intelligence_audit_events",
}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _support_summary(source_ids: list[str], intelligence_type: str) -> str:
    count = len(source_ids)
    noun = "source" if count == 1 else "sources"
    return f"{count} {noun} support this {intelligence_type}: {', '.join(source_ids)}."


class SupabaseIntelligenceRepository:
    """Service-role-only repository; browser access is deliberately unavailable."""

    def list_items(self, company_id: str, limit: int = 200) -> list[IntelligenceItem]:
        rows = supabase_source.list_records(TABLES["items"], company_id=company_id, limit=limit, order="updated_at.desc")
        items = []
        for row in rows:
            payload = row.get("contract_payload")
            if isinstance(payload, dict):
                items.append(IntelligenceItem.model_validate(payload))
        return items

    def _find_group(self, company_id: str, descriptor: CorrelationDescriptor):
        rows = supabase_source.list_records(TABLES["groups"], company_id=company_id, limit=1, filters={"correlation_key": descriptor.correlation_key, "status": "open"})
        if not rows:
            return None
        row = rows[0]
        if str(row.get("window_ends_at") or "") >= descriptor.window_started_at:
            return row
        supabase_source.update_record(TABLES["groups"], row["id"], {"status": "expired"}, company_id)
        return None

    def _find_item(self, company_id: str, group_id: str):
        rows = supabase_source.list_records(TABLES["items"], company_id=company_id, limit=1, filters={"deduplication_group_id": group_id})
        return rows[0] if rows else None

    def ingest(self, item: IntelligenceItem, descriptor: CorrelationDescriptor, *, actor_id: str = "system", request_id: str = "") -> dict:
        group = self._find_group(item.tenant_id, descriptor)
        created = group is None
        if created:
            group = supabase_source.create_record(TABLES["groups"], {
                "company_id": item.tenant_id, "organization_id": item.organization_id,
                "operational_unit_id": item.operational_unit_id, "correlation_key": descriptor.correlation_key,
                "condition_key": descriptor.condition_key, "affected_scope": item.affected_scope,
                "affected_records": list(descriptor.affected_records),
                "evidence_fingerprints": list(descriptor.evidence_fingerprints),
                "source_identities": [descriptor.source_identity],
                "window_started_at": descriptor.window_started_at, "window_ends_at": descriptor.window_ends_at,
            })
        else:
            sources = list(dict.fromkeys([*(group.get("source_identities") or []), descriptor.source_identity]))
            evidence = list(dict.fromkeys([*(group.get("evidence_fingerprints") or []), *descriptor.evidence_fingerprints]))
            group = supabase_source.update_record(TABLES["groups"], group["id"], {
                "source_identities": sources, "source_count": len(sources), "evidence_fingerprints": evidence,
                "occurrence_count": int(group.get("occurrence_count") or 0) + 1,
                "window_ends_at": descriptor.window_ends_at,
            }, item.tenant_id)

        existing = self._find_item(item.tenant_id, group["id"])
        item_id = str(existing.get("id")) if existing else str(uuid.uuid4())
        sources = list(group.get("source_identities") or [descriptor.source_identity])
        item.id = item_id
        item.idjwi_context.update({
            "correlation_key": descriptor.correlation_key,
            "source_count": len(sources), "support_summary": _support_summary(sources, item.intelligence_type),
        })
        payload = item.model_dump(mode="json")
        row = {
            "company_id": item.tenant_id, "organization_id": item.organization_id,
            "operational_unit_id": item.operational_unit_id, "deduplication_group_id": group["id"],
            "item_key": descriptor.correlation_key, "contract_version": item.contract,
            "intelligence_type": item.intelligence_type, "subtype": item.subtype,
            "title": item.title, "explanation": item.explanation, "severity": item.severity,
            "priority": item.priority, "status": item.status, "operational_impact": item.operational_impact,
            "source_type": item.source.type, "source_id": item.source.id,
            "assertion_class": item.source.assertion_class, "confidence": item.confidence,
            "uncertainty": item.uncertainty, "contract_payload": payload,
            "occurrence_count": int(group.get("occurrence_count") or 1), "source_count": len(sources),
            "last_detected_at": descriptor.window_started_at, "expires_at": item.expires_at,
            "created_by": actor_id,
        }
        persisted = (supabase_source.update_record(TABLES["items"], item_id, row, item.tenant_id)
                     if existing else supabase_source.create_record(TABLES["items"], {"id": item_id, **row}))
        # create_record strips supplied IDs; synchronize to its durable UUID.
        if persisted.get("id") and str(persisted["id"]) != item.id:
            item.id = str(persisted["id"])
            payload = item.model_dump(mode="json")
            supabase_source.update_record(TABLES["items"], item.id, {"contract_payload": payload}, item.tenant_id)
        for evidence_ref, fingerprint in zip(item.evidence, descriptor.evidence_fingerprints):
            existing_evidence = supabase_source.list_records(
                TABLES["evidence"], company_id=item.tenant_id, limit=1,
                filters={"intelligence_item_id": item.id, "evidence_fingerprint": fingerprint},
            )
            if not existing_evidence:
                supabase_source.create_record(TABLES["evidence"], {
                    "company_id": item.tenant_id, "intelligence_item_id": item.id,
                    "evidence_type": evidence_ref.type, "evidence_id": evidence_ref.id,
                    "label": evidence_ref.label, "source_identity": evidence_ref.source,
                    "evidence_fingerprint": fingerprint, "observed_at": evidence_ref.observed_at,
                    "provenance": item.provenance,
                })
        self.audit(item.tenant_id, item.id, "intelligence.item.created" if created else "intelligence.item.correlated", actor_id, request_id, {"correlation_key": descriptor.correlation_key, "source_count": len(sources)})
        return {"item": item, "created": created, "correlated": not created, "source_count": len(sources)}

    def audit(self, company_id, item_id, event_type, actor_id, request_id="", payload=None):
        return supabase_source.create_record(TABLES["audit"], {"company_id": company_id, "intelligence_item_id": item_id, "event_type": event_type, "actor_id": actor_id, "request_id": request_id, "event_payload": payload or {}})

    def transition(self, company_id, item_id, from_status, to_status, actor_id, reason=None):
        event = supabase_source.create_record(TABLES["transitions"], {"company_id": company_id, "intelligence_item_id": item_id, "from_status": from_status, "to_status": to_status, "actor_id": actor_id, "reason": reason})
        current = supabase_source.get_record(TABLES["items"], item_id, company_id)
        if current and isinstance(current.get("contract_payload"), dict):
            payload = current["contract_payload"]; payload["status"] = to_status
            supabase_source.update_record(TABLES["items"], item_id, {"status": to_status, "contract_payload": payload}, company_id)
        self.audit(company_id, item_id, "intelligence.status.transitioned", actor_id, payload={"from": from_status, "to": to_status})
        return event

    def record_lifecycle(self, kind: str, company_id: str, item_id: str, payload: dict):
        if kind not in {"assignments", "decisions", "approvals", "actions", "outcomes", "feedback"}:
            raise ValueError(f"Unsupported intelligence lifecycle record: {kind}")
        return supabase_source.create_record(TABLES[kind], {"company_id": company_id, "intelligence_item_id": item_id, **payload})


class InMemoryIntelligenceRepository:
    """Contract-faithful test repository."""
    def __init__(self): self.groups, self.items, self.audit_events, self.lifecycle = {}, {}, [], []

    def list_items(self, company_id, limit=200):
        return [copy.deepcopy(v) for v in self.items.values() if v.tenant_id == company_id][:limit]

    def ingest(self, item, descriptor, actor_id="system", request_id=""):
        key = (item.tenant_id, descriptor.correlation_key)
        group = self.groups.get(key)
        if group and group["window_ends_at"] < descriptor.window_started_at:
            group = None
        created = group is None
        if not group:
            group = {"id": str(uuid.uuid4()), "sources": [], "events": set(), "occurrences": 0, "window_ends_at": descriptor.window_ends_at}
            self.groups[key] = group
        else:
            group["window_ends_at"] = descriptor.window_ends_at
        group["occurrences"] += 1; group["events"].add(descriptor.source_event_key)
        if descriptor.source_identity not in group["sources"]: group["sources"].append(descriptor.source_identity)
        item_key = (item.tenant_id, descriptor.correlation_key, group["id"])
        existing = self.items.get(item_key)
        item = copy.deepcopy(item); item.id = existing.id if existing else str(uuid.uuid4())
        item.idjwi_context.update({"correlation_key": descriptor.correlation_key, "source_count": len(group["sources"]), "support_summary": _support_summary(group["sources"], item.intelligence_type)})
        self.items[item_key] = item
        self.audit_events.append({"item_id": item.id, "event": "created" if created else "correlated", "actor": actor_id})
        return {"item": copy.deepcopy(item), "created": created, "correlated": not created, "source_count": len(group["sources"])}

    def transition(self, company_id, item_id, from_status, to_status, actor_id, reason=None):
        item = next(value for value in self.items.values() if value.id == item_id and value.tenant_id == company_id)
        item.status = to_status; event = {"from_status": from_status, "to_status": to_status, "actor_id": actor_id, "reason": reason}; self.lifecycle.append(event); return event

    def record_lifecycle(self, kind, company_id, item_id, payload):
        event = {"kind": kind, "company_id": company_id, "intelligence_item_id": item_id, **payload}; self.lifecycle.append(event); return event
