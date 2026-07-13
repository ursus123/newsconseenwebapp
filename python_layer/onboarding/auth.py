# ==============================================================
# Newsconseen — Onboarding auth verification
# ==============================================================
# No JWT-verification pattern exists elsewhere in python_layer. The
# lightest-weight correct approach: forward the caller's bearer token
# to Supabase's own /auth/v1/user endpoint, which validates it and
# returns the real user. No new dependency required.
# ==============================================================

import logging
from typing import Optional

import requests
from fastapi import HTTPException

from config.settings import settings

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15


def verify_supabase_user(authorization: Optional[str]) -> dict:
    """
    Verify a Supabase access token by forwarding it to Supabase's own
    GET /auth/v1/user endpoint. Returns {"id", "email", "app_metadata"}.
    Raises HTTPException(401) if the token is missing or invalid.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=500, detail="Supabase is not configured")

    try:
        resp = requests.get(
            f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {token}",
            },
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        logger.error("verify_supabase_user: request to Supabase failed — %s", exc)
        raise HTTPException(status_code=401, detail="Could not verify session") from exc

    if not resp.ok:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    data = resp.json()
    user_id = data.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session — no user id")

    return {
        "id": user_id,
        "email": data.get("email"),
        "app_metadata": data.get("app_metadata") or {},
    }
