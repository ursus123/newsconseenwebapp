# ==============================================================
# Newsconseen — Onboarding auth verification
# ==============================================================
# No JWT-verification pattern exists elsewhere in python_layer. The
# lightest-weight correct approach: forward the caller's bearer token
# to Supabase's own /auth/v1/user endpoint, which validates it and
# returns the real user. No new dependency required.
# ==============================================================

import logging
import copy
import hashlib
import threading
import time
from typing import Optional

import requests
from fastapi import HTTPException

from config.settings import settings

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15
_VERIFIED_SESSION_TTL_SECONDS = 30
_VERIFIED_SESSION_CACHE = {}
_VERIFIED_SESSION_LOCK = threading.Lock()


def _session_cache_key(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _get_verified_session(token: str):
    key = _session_cache_key(token)
    with _VERIFIED_SESSION_LOCK:
        item = _VERIFIED_SESSION_CACHE.get(key)
        if not item or item[0] <= time.monotonic():
            _VERIFIED_SESSION_CACHE.pop(key, None)
            return None
        return copy.deepcopy(item[1])


def _put_verified_session(token: str, user: dict):
    with _VERIFIED_SESSION_LOCK:
        if len(_VERIFIED_SESSION_CACHE) >= 512:
            oldest = min(_VERIFIED_SESSION_CACHE, key=lambda candidate: _VERIFIED_SESSION_CACHE[candidate][0])
            _VERIFIED_SESSION_CACHE.pop(oldest, None)
        _VERIFIED_SESSION_CACHE[_session_cache_key(token)] = (
            time.monotonic() + _VERIFIED_SESSION_TTL_SECONDS, copy.deepcopy(user),
        )


def _auth_error(code: str, message: str, *, action: str, retryable: bool) -> dict:
    return {
        "code": code,
        "category": "authorization",
        "message": message,
        "retryable": retryable,
        "action": action,
    }


def verify_supabase_user(authorization: Optional[str]) -> dict:
    """
    Verify a Supabase access token by forwarding it to Supabase's own
    GET /auth/v1/user endpoint. Returns {"id", "email", "app_metadata"}.
    Raises HTTPException(401) if the token is missing or invalid.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail=_auth_error(
            "session_missing", "Your Newsconseen session is missing.",
            action="sign_in", retryable=True,
        ))
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail=_auth_error(
            "session_missing", "Your Newsconseen session is missing.",
            action="sign_in", retryable=True,
        ))

    cached = _get_verified_session(token)
    if cached:
        return cached

    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=503, detail={
            "code": "authorization_service_unavailable",
            "category": "authorization",
            "message": "The tenant authorization service is not configured.",
            "retryable": False,
            "action": "contact_admin",
        })

    try:
        from data_sources.supabase_source import _http_session
        resp = _http_session().get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {token}",
            },
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        logger.error("verify_supabase_user: request to Supabase failed — %s", exc)
        raise HTTPException(status_code=503, detail={
            "code": "authorization_service_unavailable",
            "category": "authorization",
            "message": "Newsconseen could not reach the tenant authorization service.",
            "retryable": True,
            "action": "retry",
        }) from exc

    if not resp.ok:
        raise HTTPException(status_code=401, detail=_auth_error(
            "session_invalid", "Your Newsconseen session is invalid or expired.",
            action="sign_in", retryable=True,
        ))

    data = resp.json()
    user_id = data.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session — no user id")

    verified = {
        "id": user_id,
        "email": data.get("email"),
        "app_metadata": data.get("app_metadata") or {},
    }
    _put_verified_session(token, verified)
    return verified


def _get_profile(user_id: str) -> dict:
    """Look up {company_id, role} for a verified user id from user_profiles."""
    from data_sources import supabase_source
    resp = supabase_source._request(
        "GET", "user_profiles",
        headers=supabase_source._headers(),
        params={"id": f"eq.{user_id}", "select": "id,company_id,role"},
    )
    rows = resp.json()
    return rows[0] if rows else {}


def verify_tenant_access(authorization: Optional[str], company_id: str) -> dict:
    """
    Verify the caller's Supabase session and confirm they may access
    `company_id`: either it's their own company_id, or they're super_admin
    (cross-tenant allowed). Raises HTTPException(401/403) otherwise.
    Returns the verified user dict merged with their profile.
    """
    user = verify_supabase_user(authorization)
    profile = _get_profile(user["id"])
    app_meta = user.get("app_metadata") or {}
    profile_company_id = profile.get("company_id")
    metadata_company_id = app_meta.get("company_id")
    role = profile.get("role") or app_meta.get("role") or "user"
    identity_diagnostics = {
        "profile_found": bool(profile),
        "profile_user_id_matches": bool(profile) and str(profile.get("id")) == str(user.get("id")),
    }

    if role == "super_admin":
        return {**user, **profile, **identity_diagnostics, "role": role, "tenant_auth_source": "super_admin"}
    if profile_company_id == company_id:
        return {**user, **profile, **identity_diagnostics, "role": role, "tenant_auth_source": "user_profiles"}

    # Supabase app_metadata is server/admin controlled. Use it as a safe
    # fallback for newly linked or invited users whose user_profiles row has
    # not materialised yet, but make the source explicit for debugging.
    if metadata_company_id == company_id:
        return {
            **user,
            **profile,
            "company_id": metadata_company_id,
            "role": role,
            "tenant_auth_source": "app_metadata",
            "profile_company_id": profile_company_id,
            **identity_diagnostics,
        }

    raise HTTPException(status_code=403, detail={
        "code": "tenant_mismatch",
        "category": "authorization",
        "message": "Your account is not authorized for the requested organization.",
        "retryable": False,
        "action": "contact_admin",
        "requested_company_id": company_id,
        "profile_company_id": profile_company_id,
        "metadata_company_id": metadata_company_id,
        "profile_found": bool(profile),
    })


def try_tenant_access(authorization: Optional[str], company_id: Optional[str]) -> dict:
    """
    Like verify_tenant_access but never raises. Used by endpoints that must
    still answer from Idjwi's default brain (product knowledge, ontology,
    public data — no tenant records) when the caller isn't authorized for
    company_id, instead of blocking the whole request with a 403.

    Returns {"authorized": bool, "user": dict|None, "reason": str|None}.
    """
    if not company_id:
        return {
            "authorized": False,
            "user": None,
            "reason": "No company_id supplied.",
            "diagnostics": {"code": "missing_company_id"},
        }
    try:
        user = verify_tenant_access(authorization, company_id)
        return {
            "authorized": True,
            "user": user,
            "reason": None,
            "diagnostics": {
                "code": "authorized",
                "source": user.get("tenant_auth_source", "unknown"),
                "role": user.get("role"),
            },
        }
    except HTTPException as exc:
        detail = exc.detail
        if isinstance(detail, dict):
            reason = detail.get("message") or detail.get("code") or "Tenant authorization failed."
            diagnostics = detail
        else:
            reason = str(detail)
            code = {
                401: "missing_or_invalid_session",
                403: "tenant_forbidden",
            }.get(exc.status_code, "tenant_auth_failed")
            diagnostics = {"code": code, "message": reason}
        return {
            "authorized": False,
            "user": None,
            "reason": reason,
            "diagnostics": diagnostics,
        }


def verify_super_admin(authorization: Optional[str]) -> dict:
    """Verify caller session and require role == 'super_admin'."""
    user = verify_supabase_user(authorization)
    profile = _get_profile(user["id"])
    if profile.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin required")
    return {**user, **profile}
