"""
security/oauth2.py
------------------
OAuth2 OIDC login via Google and Microsoft.

Flow:
  1. Frontend: user clicks "Sign in with Google"
  2. Frontend calls GET /security/oauth2/google/authorize
     → backend returns {auth_url}
  3. Frontend redirects user to auth_url (Google/Microsoft consent screen)
  4. Provider redirects to /security/oauth2/{provider}/callback?code=...
  5. Backend exchanges code for tokens → gets user email/name/picture
  6. Backend returns {email, name, picture, provider, access_token}
  7. Frontend uses this to call base44.auth or create/update the user session

Architecture note:
  Base44 manages the actual session. OAuth2 here returns verified identity
  claims (email, name). The frontend uses these to pre-fill or auto-authenticate
  via the base44 SDK. If Base44 adds OIDC in future, this layer becomes
  the adapter.

Environment variables required:
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
  OAUTH2_REDIRECT_BASE   — base URL for callbacks (e.g. https://your-railway-app.up.railway.app)
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import urllib.parse
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


# ── Provider configs ──────────────────────────────────────────────────────────

_PROVIDERS = {
    "google": {
        "auth_endpoint":  "https://accounts.google.com/o/oauth2/v2/auth",
        "token_endpoint": "https://oauth2.googleapis.com/token",
        "userinfo_url":   "https://www.googleapis.com/oauth2/v3/userinfo",
        "scope":          "openid email profile",
        "client_id_env":  "GOOGLE_CLIENT_ID",
        "client_secret_env": "GOOGLE_CLIENT_SECRET",
    },
    "microsoft": {
        "auth_endpoint":  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_endpoint": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "userinfo_url":   "https://graph.microsoft.com/v1.0/me",
        "scope":          "openid email profile User.Read",
        "client_id_env":  "MICROSOFT_CLIENT_ID",
        "client_secret_env": "MICROSOFT_CLIENT_SECRET",
    },
}

# In-process state store (nonce → provider mapping, TTL ~10 min)
# For multi-dyno: swap for Redis
_STATE_STORE: dict[str, str] = {}


def _get_redirect_uri(provider: str) -> str:
    base = os.getenv("OAUTH2_REDIRECT_BASE", "").rstrip("/")
    return f"{base}/security/oauth2/{provider}/callback"


def _get_credentials(provider: str) -> tuple[str, str]:
    cfg = _PROVIDERS[provider]
    cid    = os.getenv(cfg["client_id_env"],     "")
    secret = os.getenv(cfg["client_secret_env"], "")
    return cid, secret


# ── Step 1: build authorization URL ──────────────────────────────────────────

def build_auth_url(provider: str) -> dict:
    """
    Return the OAuth2 authorization URL for the given provider.
    Generates a random state nonce to prevent CSRF.
    """
    if provider not in _PROVIDERS:
        raise ValueError(f"Unknown provider: {provider}")

    cfg        = _PROVIDERS[provider]
    client_id, _ = _get_credentials(provider)

    if not client_id:
        raise RuntimeError(
            f"OAuth2 not configured for {provider} — "
            f"set {cfg['client_id_env']} env var"
        )

    state = secrets.token_urlsafe(32)
    _STATE_STORE[state] = provider

    params = {
        "client_id":     client_id,
        "redirect_uri":  _get_redirect_uri(provider),
        "response_type": "code",
        "scope":         cfg["scope"],
        "state":         state,
        "access_type":   "offline",   # Google — request refresh token
        "prompt":        "select_account",
    }

    auth_url = cfg["auth_endpoint"] + "?" + urllib.parse.urlencode(params)
    return {"auth_url": auth_url, "state": state}


# ── Step 2: exchange code for user identity ───────────────────────────────────

def exchange_code(provider: str, code: str, state: str) -> dict:
    """
    Exchange the authorization code for user identity claims.
    Returns {email, name, picture, provider, sub}.
    Raises ValueError on state mismatch or invalid code.
    """
    if provider not in _PROVIDERS:
        raise ValueError(f"Unknown provider: {provider}")

    # Validate state nonce (CSRF protection)
    expected_provider = _STATE_STORE.pop(state, None)
    if expected_provider != provider:
        raise ValueError("Invalid or expired OAuth2 state parameter")

    cfg = _PROVIDERS[provider]
    client_id, client_secret = _get_credentials(provider)

    if not client_id or not client_secret:
        raise RuntimeError(f"OAuth2 credentials missing for {provider}")

    # Token exchange
    token_data = {
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  _get_redirect_uri(provider),
        "client_id":     client_id,
        "client_secret": client_secret,
    }

    try:
        token_resp = httpx.post(
            cfg["token_endpoint"],
            data=token_data,
            timeout=15,
        )
        token_resp.raise_for_status()
        tokens = token_resp.json()
    except Exception as exc:
        logger.error("oauth2: token exchange failed for %s — %s", provider, exc)
        raise RuntimeError(f"Token exchange failed: {exc}")

    access_token = tokens.get("access_token", "")

    # Fetch user info
    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        userinfo_resp = httpx.get(cfg["userinfo_url"], headers=headers, timeout=10)
        userinfo_resp.raise_for_status()
        userinfo = userinfo_resp.json()
    except Exception as exc:
        logger.error("oauth2: userinfo fetch failed for %s — %s", provider, exc)
        raise RuntimeError(f"User info fetch failed: {exc}")

    # Normalise between providers
    if provider == "google":
        email   = userinfo.get("email", "")
        name    = userinfo.get("name", "")
        picture = userinfo.get("picture", "")
        sub     = userinfo.get("sub", "")
    else:  # microsoft — Graph API response format
        email   = userinfo.get("mail") or userinfo.get("userPrincipalName", "")
        name    = userinfo.get("displayName", "")
        picture = ""  # MS Graph photo requires a separate call
        sub     = userinfo.get("id", "")

    return {
        "email":        email,
        "name":         name,
        "picture":      picture,
        "provider":     provider,
        "sub":          sub,
        "access_token": access_token,
    }


def get_configured_providers() -> list[str]:
    """Return list of providers that have credentials configured."""
    configured = []
    for name, cfg in _PROVIDERS.items():
        cid = os.getenv(cfg["client_id_env"], "")
        if cid:
            configured.append(name)
    return configured
