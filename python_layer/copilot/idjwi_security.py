"""
Security and governance helpers for Idjwi.

Defaults are permissive for existing deployments. Set IDJWI_REQUIRE_API_KEY=true
and IDJWI_API_KEY in production to enforce API access at the route layer.
"""

import hmac
import os
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

from .llm_registry import check_capability


ROLE_CAPABILITIES = {
    "super_admin": "*",
    "admin": "*",
    "manager": {
        "read_company_data",
        "create_task",
        "propose_record_update",
        "save_memory",
        "search_intelligence",
        "run_agents",
        "generate_report",
        "approve_actions",
    },
    "staff": {
        "read_company_data",
        "create_task",
        "save_memory",
        "search_intelligence",
    },
    "viewer": {
        "read_company_data",
        "search_intelligence",
    },
}

CRITICAL_ACTIONS = {
    "delete_record",
    "bulk_delete",
    "financial_transfer",
    "send_bulk_message",
}

# Capabilities answerable from Newsconseen's own product/ontology/public-data
# knowledge — never tenant records. These are allowed even when the caller
# has no verified company_id (anonymous, demo, or failed tenant auth).
# Every other capability in IDJWI_CAPABILITIES touches company data in some
# form and requires principal.tenant_authorized.
PUBLIC_CAPABILITIES = {"read_default_brain", "read_public_data"}

TENANT_DENIED_REASON = (
    "I cannot access this company's private data because your account is not "
    "authorized for this company. I can still answer from Newsconseen's "
    "default brain — product knowledge, the ontology, and public data sources."
)


@dataclass(frozen=True)
class IdjwiPrincipal:
    user_id: str = "system"
    role: str = "admin"
    company_id: Optional[str] = None
    plan: str = "standard"
    # False for anonymous/demo callers and callers who failed tenant auth —
    # blocks every capability outside PUBLIC_CAPABILITIES. True is the
    # default so every existing call site (which only ever constructs a
    # principal after verify_tenant_access already succeeded) keeps working
    # unchanged.
    tenant_authorized: bool = True
    auth_reason: Optional[str] = None
    auth_diagnostics: Optional[dict] = None


# Simple in-memory per-IP rate limiter for public, unauthenticated Idjwi
# endpoints (the marketing-page demo). 20 requests per IP per hour.
_demo_rate_store: dict = defaultdict(lambda: {"count": 0, "window": 0})
DEMO_RATE_LIMIT_PER_HOUR = 20


def check_demo_rate_limit(ip: str) -> bool:
    window = int(time.time()) // 3600
    rec = _demo_rate_store[ip]
    if rec["window"] != window:
        rec["count"] = 0
        rec["window"] = window
    if rec["count"] >= DEMO_RATE_LIMIT_PER_HOUR:
        return False
    rec["count"] += 1
    return True


def require_api_key(header_value: Optional[str]) -> dict:
    required = os.getenv("IDJWI_REQUIRE_API_KEY", "false").lower() == "true"
    expected = os.getenv("IDJWI_API_KEY", "")
    if not required:
        return {"allowed": True, "reason": "api key not required"}
    if expected and header_value and hmac.compare_digest(header_value, expected):
        return {"allowed": True, "reason": "api key accepted"}
    return {"allowed": False, "reason": "Missing or invalid Idjwi API key."}


def principal_from_headers(
    company_id: str,
    user_id: Optional[str] = None,
    role: Optional[str] = None,
    plan: Optional[str] = None,
    tenant_authorized: bool = True,
    auth_reason: Optional[str] = None,
    auth_diagnostics: Optional[dict] = None,
) -> IdjwiPrincipal:
    return IdjwiPrincipal(
        user_id=user_id or "system",
        role=(role or "admin").lower(),
        company_id=company_id,
        plan=(plan or "standard").lower(),
        tenant_authorized=tenant_authorized,
        auth_reason=auth_reason,
        auth_diagnostics=auth_diagnostics or {},
    )


def default_brain_principal(
    company_id: Optional[str] = None,
    user_id: Optional[str] = None,
    auth_reason: Optional[str] = None,
    auth_diagnostics: Optional[dict] = None,
) -> IdjwiPrincipal:
    """
    Principal for a caller who is not (or not yet) authorized for company_id.
    Can still use every PUBLIC_CAPABILITIES tool — Idjwi's own product,
    ontology, and public-data knowledge — but every tenant capability is
    denied by authorize_capability() below.
    """
    return IdjwiPrincipal(
        user_id=user_id or "anonymous",
        role="viewer",
        company_id=company_id,
        plan="standard",
        tenant_authorized=False,
        auth_reason=auth_reason,
        auth_diagnostics=auth_diagnostics or {},
    )


def _tenant_denied_reason(principal: IdjwiPrincipal) -> str:
    reason = principal.auth_reason or ""
    diagnostics = principal.auth_diagnostics or {}
    if not reason and not diagnostics:
        return TENANT_DENIED_REASON

    parts = [TENANT_DENIED_REASON]
    if reason:
        parts.append(f"Tenant auth diagnostic: {reason}.")

    requested = diagnostics.get("requested_company_id") or principal.company_id
    profile_cid = diagnostics.get("profile_company_id")
    metadata_cid = diagnostics.get("metadata_company_id")
    code = diagnostics.get("code")
    details = []
    if code:
        details.append(f"code: `{code}`")
    if requested:
        details.append(f"requested company_id: `{requested}`")
    if profile_cid is not None:
        details.append(f"profile company_id: `{profile_cid}`")
    if metadata_cid is not None:
        details.append(f"metadata company_id: `{metadata_cid}`")
    if details:
        parts.append("Auth details: " + "; ".join(details) + ".")
    return "\n\n".join(parts)


def authorize_capability(
    capability_id: str,
    principal: Optional[IdjwiPrincipal] = None,
    llm_available: bool = True,
) -> dict:
    base = check_capability(capability_id, llm_available=llm_available)
    if not base.get("allowed"):
        return base

    principal = principal or IdjwiPrincipal()

    # Shared product knowledge isn't role-scoped — every role (including a
    # bare viewer, or an unauthenticated default-brain caller) can use it.
    # Role restrictions below only make sense for tenant-scoped capabilities.
    if capability_id in PUBLIC_CAPABILITIES:
        return {
            "allowed": True,
            "capability": capability_id,
            "role": principal.role,
            "reason": "allowed (public capability)",
        }

    # Tenant gate — everything past this point is a tenant-scoped capability
    # (public ones already returned above). A caller who isn't authorized
    # for any company has no role-based access to fall back on.
    if not principal.tenant_authorized:
        return {
            "allowed": False,
            "capability": capability_id,
            "role": principal.role,
            "reason": _tenant_denied_reason(principal),
            "diagnostics": principal.auth_diagnostics or {},
        }

    allowed = ROLE_CAPABILITIES.get(principal.role, ROLE_CAPABILITIES["viewer"])
    if allowed == "*" or capability_id in allowed:
        return {
            "allowed": True,
            "capability": capability_id,
            "role": principal.role,
            "reason": "allowed",
        }
    return {
        "allowed": False,
        "capability": capability_id,
        "role": principal.role,
        "reason": f"Role '{principal.role}' cannot use capability '{capability_id}'.",
    }


def authorize_action(action_type: str, principal: Optional[IdjwiPrincipal] = None) -> dict:
    principal = principal or IdjwiPrincipal()
    if action_type in CRITICAL_ACTIONS and principal.role not in ("admin", "super_admin"):
        return {
            "allowed": False,
            "action_type": action_type,
            "reason": f"Role '{principal.role}' cannot perform critical action '{action_type}'.",
        }
    return {"allowed": True, "action_type": action_type, "reason": "allowed"}
