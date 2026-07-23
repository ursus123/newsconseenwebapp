"""Authorization policy for Company Graph reads, fields, and actions."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from fastapi import HTTPException

from tenant_context.entity_registry import definition_for
from tenant_context.models import TenantContext

from .contracts import GraphPermittedAction


GRAPH_POLICY_VERSION = "graph-policy.v1"

GRAPH_PERMISSIONS = (
    "graph.read",
    "graph.read_sensitive",
    "graph.export",
    "graph.relationship_propose",
    "graph.relationship_confirm",
    "graph.relationship_reject",
    "graph.admin",
)

ROLE_GRAPH_PERMISSIONS = {
    "super_admin": GRAPH_PERMISSIONS,
    "admin": GRAPH_PERMISSIONS,
    "manager": (
        "graph.read", "graph.read_sensitive", "graph.export",
        "graph.relationship_propose", "graph.relationship_confirm",
        "graph.relationship_reject",
    ),
    "teacher": ("graph.read", "graph.relationship_propose"),
    "staff": ("graph.read", "graph.relationship_propose"),
    "user": ("graph.read",),
    "student": ("graph.read",),
}

SENSITIVE_REGISTRY_LEVELS = {"personal", "financial", "confidential", "restricted"}

def _denied(permission: str, role: str, *, action: str = "contact_admin") -> HTTPException:
    return HTTPException(status_code=403, detail={
        "code": "GRAPH_PERMISSION_DENIED", "category": "authorization",
        "message": f"Role '{role}' does not have {permission}.",
        "required_permission": permission, "action": action, "retryable": False,
    })


@dataclass(frozen=True)
class GraphAuthorizationPolicy:
    context: TenantContext
    permissions: tuple[str, ...]

    @classmethod
    def for_context(cls, context: TenantContext) -> "GraphAuthorizationPolicy":
        explicit = tuple(permission for permission in context.permissions if permission.startswith("graph."))
        role_permissions = ROLE_GRAPH_PERMISSIONS.get(context.role, ROLE_GRAPH_PERMISSIONS["user"])
        return cls(context=context, permissions=tuple(sorted(set(role_permissions).union(explicit))))

    def allows(self, permission: str) -> bool:
        return permission in self.permissions or "graph.admin" in self.permissions

    def require(self, permission: str) -> None:
        if not self.allows(permission):
            raise _denied(permission, self.context.role)

    def require_scope(self, operational_unit_id: str = "") -> None:
        self.require("graph.read")
        if operational_unit_id and not self.context.scope_authorized:
            raise _denied("graph.read", self.context.role, action="request_unit_membership")

    def can_read_entity(self, entity_type: str) -> bool:
        try:
            sensitivity = definition_for(entity_type)[1].sensitivity
        except ValueError:
            return False
        return sensitivity not in SENSITIVE_REGISTRY_LEVELS or self.allows("graph.read_sensitive")

    def sensitivity_for(self, entity_type: str) -> str:
        sensitivity = definition_for(entity_type)[1].sensitivity
        if sensitivity == "confidential":
            return "confidential"
        if sensitivity in {"personal", "financial", "restricted"}:
            return "restricted"
        return "internal"

    def packet_actions(self) -> list[GraphPermittedAction]:
        return [
            GraphPermittedAction(action="search", allowed=self.allows("graph.read")),
            GraphPermittedAction(action="ask_idjwi", allowed=self.allows("graph.read")),
            GraphPermittedAction(action="export", allowed=self.allows("graph.export"),
                                 reason=None if self.allows("graph.export") else "graph.export is required."),
            GraphPermittedAction(action="administer", allowed=self.allows("graph.admin"),
                                 reason=None if self.allows("graph.admin") else "graph.admin is required."),
        ]

    def node_actions(self) -> list[GraphPermittedAction]:
        return [
            GraphPermittedAction(action="inspect", allowed=self.allows("graph.read")),
            GraphPermittedAction(action="ask_idjwi", allowed=self.allows("graph.read")),
            GraphPermittedAction(action="propose_relationship", allowed=self.allows("graph.relationship_propose"),
                                 requires_approval=True),
        ]

    def edge_actions(self, assertion_class: str) -> list[GraphPermittedAction]:
        proposed = assertion_class in {"deterministic_derivation", "analytical_inference", "advisor_proposal"}
        return [
            GraphPermittedAction(action="inspect_evidence", allowed=self.allows("graph.read")),
            GraphPermittedAction(action="ask_idjwi", allowed=self.allows("graph.read")),
            GraphPermittedAction(action="record_proposal", allowed=proposed and self.allows("graph.relationship_propose"),
                                 reason=None if proposed and self.allows("graph.relationship_propose") else "A proposed assertion and graph.relationship_propose are required."),
            GraphPermittedAction(action="confirm", allowed=proposed and self.allows("graph.relationship_confirm"), requires_approval=True,
                                 reason=None if proposed and self.allows("graph.relationship_confirm") else "A proposed assertion and graph.relationship_confirm are required."),
            GraphPermittedAction(action="reject", allowed=proposed and self.allows("graph.relationship_reject"),
                                 reason=None if proposed and self.allows("graph.relationship_reject") else "A proposed assertion and graph.relationship_reject are required."),
        ]

    def fingerprint(self) -> str:
        material = {
            "version": GRAPH_POLICY_VERSION,
            "tenant": self.context.tenant_id,
            "user": self.context.user_id,
            "role": self.context.role,
            "permissions": self.permissions,
            "scope_type": self.context.scope_type,
            "scope_id": self.context.scope_id,
            "allowed_operational_units": self.context.allowed_operational_unit_ids,
            "managed_operational_units": self.context.managed_operational_unit_ids,
        }
        return hashlib.sha256(json.dumps(material, sort_keys=True).encode("utf-8")).hexdigest()
