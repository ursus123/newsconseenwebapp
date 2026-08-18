"""Backend-owned authorization for governed Intelligence Inbox items."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from fastapi import HTTPException

from tenant_context.models import TenantContext


INTELLIGENCE_POLICY_VERSION = "intelligence-policy.v1"
INTELLIGENCE_PERMISSIONS = (
    "intelligence.read", "intelligence.read_sensitive", "intelligence.assign",
    "intelligence.investigate", "intelligence.decide", "intelligence.approve",
    "intelligence.act", "intelligence.dismiss", "intelligence.export", "intelligence.admin",
)

ROLE_INTELLIGENCE_PERMISSIONS = {
    "super_admin": INTELLIGENCE_PERMISSIONS,
    "admin": INTELLIGENCE_PERMISSIONS,
    "manager": (
        "intelligence.read", "intelligence.read_sensitive", "intelligence.assign",
        "intelligence.investigate", "intelligence.decide", "intelligence.approve",
        "intelligence.act", "intelligence.dismiss", "intelligence.export",
    ),
    "technician": (
        "intelligence.read", "intelligence.read_sensitive", "intelligence.assign",
        "intelligence.investigate", "intelligence.act",
    ),
    "worker": ("intelligence.read", "intelligence.investigate", "intelligence.act"),
    "staff": ("intelligence.read", "intelligence.investigate", "intelligence.act"),
    "teacher": ("intelligence.read", "intelligence.investigate", "intelligence.act"),
    "user": ("intelligence.read", "intelligence.investigate"),
    "student": ("intelligence.read",),
}

SENSITIVE_LEVELS = {"sensitive", "personal", "financial", "confidential", "restricted"}
ACTION_PERMISSION = {
    "read": "intelligence.read", "assign": "intelligence.assign",
    "investigate": "intelligence.investigate", "decide": "intelligence.decide",
    "approve": "intelligence.approve", "act": "intelligence.act",
    "dismiss": "intelligence.dismiss", "export": "intelligence.export",
    "administer": "intelligence.admin",
}


def _denied(permission: str, role: str, action: str = "contact_admin") -> HTTPException:
    return HTTPException(status_code=403, detail={
        "code": "INTELLIGENCE_PERMISSION_DENIED", "category": "authorization",
        "message": f"Role '{role}' does not have {permission}.",
        "required_permission": permission, "action": action, "retryable": False,
    })


def _ids(value) -> set[str]:
    if not isinstance(value, list):
        return set()
    return {str(item.get("id") if isinstance(item, dict) else item) for item in value if item}


@dataclass(frozen=True)
class IntelligenceAuthorizationPolicy:
    context: TenantContext
    permissions: tuple[str, ...]

    @classmethod
    def for_context(cls, context: TenantContext) -> "IntelligenceAuthorizationPolicy":
        explicit = tuple(p for p in context.permissions if p.startswith("intelligence."))
        role_permissions = ROLE_INTELLIGENCE_PERMISSIONS.get(context.role, ROLE_INTELLIGENCE_PERMISSIONS["user"])
        return cls(context=context, permissions=tuple(sorted(set(role_permissions).union(explicit))))

    def allows(self, permission: str) -> bool:
        return permission in self.permissions or "intelligence.admin" in self.permissions

    def require(self, permission: str) -> None:
        if not self.allows(permission):
            raise _denied(permission, self.context.role)

    def require_scope(self) -> None:
        self.require("intelligence.read")
        if self.context.scope_type == "operational_unit" and not self.context.scope_authorized:
            raise _denied("intelligence.read", self.context.role, "request_unit_membership")

    def can_read_row(self, row: dict) -> bool:
        if str(row.get("company_id") or self.context.tenant_id) != self.context.tenant_id:
            return False
        sensitivity = str(row.get("sensitivity") or row.get("record_sensitivity") or "internal").lower()
        source_sensitivity = str(row.get("source_sensitivity") or "internal").lower()
        if {sensitivity, source_sensitivity}.intersection(SENSITIVE_LEVELS) and not self.allows("intelligence.read_sensitive"):
            return False

        unit_id = str(row.get("operational_unit_id") or "")
        if self.context.scope_type == "operational_unit":
            return unit_id == str(self.context.scope_id or "")
        if self.context.role in {"admin", "super_admin"}:
            return True
        if unit_id and unit_id in set(self.context.allowed_operational_unit_ids):
            return True
        owner_ids = {
            str(row.get("owner_user_id") or row.get("assigned_user_id") or row.get("assigned_to_user_id") or ""),
            str(row.get("created_by_user_id") or ""),
        }
        eligible = _ids(row.get("eligible_actors")) | {str(v) for v in (row.get("eligible_actor_ids") or [])}
        return self.context.user_id in owner_ids or self.context.user_id in eligible

    def redact_evidence(self, row: dict) -> dict:
        if self.allows("intelligence.read_sensitive"):
            return dict(row)
        clone = dict(row)
        evidence = row.get("evidence")
        if isinstance(evidence, str):
            try:
                evidence = json.loads(evidence)
            except (TypeError, ValueError):
                evidence = []
        if isinstance(evidence, list):
            clone["evidence"] = [
                item for item in evidence
                if not isinstance(item, dict) or str(item.get("sensitivity") or "internal").lower() not in SENSITIVE_LEVELS
            ]
        return clone

    def permitted_actions(self, row: dict) -> list[dict]:
        requested = row.get("eligible_actions") or ["read", "investigate"]
        if row.get("status") in {"new", "open", "acknowledged"}:
            requested = list(requested) + ["assign", "dismiss"]
        if row.get("approval_required") or row.get("status") == "proposed":
            requested = list(requested) + ["decide", "approve"]
        if row.get("action_type"):
            requested = list(requested) + ["act"]
        actions = []
        for action in dict.fromkeys(str(value) for value in requested):
            permission = ACTION_PERMISSION.get(action)
            if not permission:
                continue
            allowed = self.allows(permission)
            actions.append({
                "action": action, "permission": permission, "allowed": allowed,
                "reason": None if allowed else f"{permission} is required.",
                "requires_approval": action in {"approve", "act"} and bool(row.get("approval_required")),
            })
        return actions

    def fingerprint(self) -> str:
        material = {
            "version": INTELLIGENCE_POLICY_VERSION,
            "tenant": self.context.tenant_id, "user": self.context.user_id,
            "role": self.context.role, "permissions": self.permissions,
            "scope_type": self.context.scope_type, "scope_id": self.context.scope_id,
            "allowed_units": self.context.allowed_operational_unit_ids,
            "managed_units": self.context.managed_operational_unit_ids,
        }
        return hashlib.sha256(json.dumps(material, sort_keys=True).encode()).hexdigest()
