"""
security/routes.py
------------------
FastAPI router for all security endpoints.

Routes:
  GET  /security/config                       — which features are enabled
  POST /security/2fa/setup                    — generate TOTP secret + QR code
  POST /security/2fa/verify                   — verify code + activate 2FA
  POST /security/2fa/check                    — validate code on login
  DELETE /security/2fa                        — disable 2FA
  GET  /security/oauth2/providers             — list configured OAuth2 providers
  GET  /security/oauth2/{provider}/authorize  — get auth URL
  GET  /security/oauth2/{provider}/callback   — exchange code for identity
  GET  /security/compliance                   — SOC 2 evidence package
  GET  /security/headers-test                 — confirm security headers are set
"""

import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/security", tags=["Security"])


# ── Config endpoint ───────────────────────────────────────────────────────────

@router.get("/config")
def security_config():
    """Return which security features are available / configured."""
    try:
        from security.totp import _TOTP_AVAILABLE
        totp_available = _TOTP_AVAILABLE
    except Exception:
        totp_available = False

    try:
        from security.oauth2 import get_configured_providers
        oauth2_providers = get_configured_providers()
    except Exception:
        oauth2_providers = []

    return {
        "2fa_available":      totp_available,
        "oauth2_providers":   oauth2_providers,
        "rate_limiting":      True,
        "security_headers":   True,
        "compliance_export":  True,
    }


# ── 2FA endpoints ─────────────────────────────────────────────────────────────

class TwoFASetupRequest(BaseModel):
    user_id:    str
    company_id: str
    user_email: str


class TwoFAVerifyRequest(BaseModel):
    user_id: str
    code:    str


@router.post("/2fa/setup", status_code=201)
def setup_2fa(req: TwoFASetupRequest):
    """
    Generate a TOTP secret and QR code for a user.
    The secret is stored as 'pending' until verified.
    """
    try:
        from security.totp import (
            generate_secret, get_totp_uri, get_qr_image_b64, store_pending_secret
        )
        secret  = generate_secret()
        uri     = get_totp_uri(secret, req.user_email)
        qr_b64  = get_qr_image_b64(uri)
        store_pending_secret(req.user_id, req.company_id, secret)
        return {
            "secret":       secret,
            "qr_uri":       uri,
            "qr_image_b64": qr_b64,
            "instructions": "Scan the QR code with Google Authenticator, Authy, or any TOTP app. Then enter the 6-digit code to activate.",
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("2fa/setup failed — %s", exc)
        raise HTTPException(status_code=500, detail="2FA setup failed")


@router.post("/2fa/verify")
def verify_2fa(req: TwoFAVerifyRequest):
    """Verify a TOTP code and activate 2FA for the user."""
    try:
        from security.totp import get_secret, verify_code, activate_secret
        record = get_secret(req.user_id)
        if not record:
            raise HTTPException(status_code=404, detail="No pending 2FA setup found. Call /security/2fa/setup first.")

        if not verify_code(record["secret"], req.code):
            raise HTTPException(status_code=400, detail="Invalid code. Check your authenticator app and try again.")

        activated = activate_secret(req.user_id)
        return {
            "activated":    activated,
            "message":      "2FA is now active. You will be asked for a code on each login.",
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("2fa/verify failed — %s", exc)
        raise HTTPException(status_code=500, detail="2FA verification failed")


@router.post("/2fa/check")
def check_2fa(req: TwoFAVerifyRequest):
    """Validate a TOTP code at login time (after password)."""
    try:
        from security.totp import get_secret, verify_code
        record = get_secret(req.user_id)
        if not record or record["status"] != "active":
            return {"valid": True, "reason": "2FA not enabled for this user"}

        valid = verify_code(record["secret"], req.code)
        if not valid:
            raise HTTPException(status_code=401, detail="Invalid 2FA code")

        return {"valid": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("2fa/check failed — %s", exc)
        raise HTTPException(status_code=500, detail="2FA check failed")


@router.get("/2fa/status")
def get_2fa_status(user_id: str = Query(...)):
    """Return 2FA enrollment status for a user."""
    try:
        from security.totp import get_secret
        record = get_secret(user_id)
        if not record:
            return {"enabled": False, "status": "not_enrolled"}
        return {
            "enabled":     record["status"] == "active",
            "status":      record["status"],
            "verified_at": record.get("verified_at"),
        }
    except Exception:
        return {"enabled": False, "status": "unknown"}


@router.delete("/2fa")
def disable_2fa(user_id: str = Query(...)):
    """Disable 2FA for a user."""
    try:
        from security.totp import disable_2fa as _disable
        _disable(user_id)
        return {"disabled": True}
    except Exception as exc:
        logger.error("2fa/disable failed — %s", exc)
        raise HTTPException(status_code=500, detail="Failed to disable 2FA")


# ── OAuth2 endpoints ──────────────────────────────────────────────────────────

@router.get("/oauth2/providers")
def list_oauth2_providers():
    """List which OAuth2 providers have credentials configured."""
    try:
        from security.oauth2 import get_configured_providers
        providers = get_configured_providers()
        return {
            "providers": [
                {"id": "google",    "label": "Google",    "configured": "google"    in providers},
                {"id": "microsoft", "label": "Microsoft", "configured": "microsoft" in providers},
            ]
        }
    except Exception:
        return {"providers": []}


@router.get("/oauth2/{provider}/authorize")
def oauth2_authorize(provider: str):
    """Return the OAuth2 authorization URL for the given provider."""
    try:
        from security.oauth2 import build_auth_url
        result = build_auth_url(provider)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/oauth2/{provider}/callback")
def oauth2_callback(
    provider: str,
    code:  str = Query(...),
    state: str = Query(...),
    error: Optional[str] = Query(default=None),
):
    """
    OAuth2 callback — exchange code for user identity.
    Returns user identity claims as JSON (frontend handles session creation).
    """
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth2 error: {error}")

    try:
        from security.oauth2 import exchange_code
        identity = exchange_code(provider, code, state)
        return identity
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        logger.error("oauth2/callback failed — %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))


# ── Compliance evidence ───────────────────────────────────────────────────────

@router.get("/compliance")
def get_compliance_evidence(
    company_id: str = Query(...),
    x_admin_secret: Optional[str] = Header(default=None),
):
    """
    Return a full SOC 2 / ISO 27001 evidence package for a company.
    Requires x-admin-secret (same as /admin/* endpoints).
    """
    try:
        from config.settings import settings
        secret = settings.admin_secret
        if secret and x_admin_secret != secret:
            raise HTTPException(status_code=401, detail="x-admin-secret required for compliance export")
    except HTTPException:
        raise
    except Exception:
        pass  # if settings unavailable, proceed without auth check

    try:
        from database import get_engine_safe
        from security.compliance import collect_evidence
        engine = get_engine_safe()
        if not engine:
            raise HTTPException(status_code=503, detail="Database unavailable")
        return collect_evidence(company_id, engine)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("compliance evidence failed — %s", exc)
        raise HTTPException(status_code=500, detail=f"Evidence collection failed: {exc}")


# ── Security headers test ─────────────────────────────────────────────────────

@router.get("/headers-test")
def headers_test():
    """
    Confirm security headers are being set.
    Response headers should include HSTS, X-Frame-Options, CSP, etc.
    Useful for pen-test verification.
    """
    return {
        "message": "Check this response's HTTP headers to verify security headers are set.",
        "expected_headers": [
            "Strict-Transport-Security",
            "X-Content-Type-Options",
            "X-Frame-Options",
            "Content-Security-Policy",
            "Referrer-Policy",
            "Permissions-Policy",
        ],
    }
