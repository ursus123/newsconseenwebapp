from dataclasses import asdict, dataclass, field
from typing import Any, Optional


@dataclass(frozen=True)
class TenantContext:
    """Verified, immutable identity and operational scope for one request."""

    user_id: str
    tenant_id: str
    role: str
    request_id: str
    auth_source: str
    profile_found: bool
    profile_user_id_matches: bool
    scope_type: str = "organization"
    scope_id: Optional[str] = None
    scope_name: Optional[str] = None
    permissions: tuple[str, ...] = field(default_factory=tuple)

    def public_dict(self) -> dict:
        data = asdict(self)
        data.pop("user_id", None)
        data["authenticated_user_verified"] = bool(self.user_id)
        data["permissions"] = list(self.permissions)
        return data


@dataclass
class TenantRepositoryResult:
    data: Any
    context: TenantContext
    code: str = "CONTEXT_READY"
    layer: str = "data"
    entities: tuple[str, ...] = field(default_factory=tuple)
    duration_ms: float = 0.0

    def envelope(self) -> dict:
        count = len(self.data) if isinstance(self.data, (list, tuple, dict)) else None
        return {
            "data": self.data,
            "context": self.context.public_dict(),
            "status": {
                "code": "EMPTY_DATA" if count == 0 else self.code,
                "layer": self.layer,
                "empty": count == 0,
            },
            "audit": {
                "request_id": self.context.request_id,
                "tenant_filter_enforced": True,
                "queried_entities": list(self.entities),
                "result_count": count,
                "duration_ms": self.duration_ms,
            },
        }
