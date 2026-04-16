"""
security/totp.py
-----------------
TOTP 2FA using pyotp (RFC 6238 — same standard as Google Authenticator).

Flow:
  1. User opens Settings → Security → Enable 2FA
  2. Frontend calls POST /security/2fa/setup → gets {secret, qr_uri, qr_image_b64}
  3. User scans QR code with any TOTP app (Google Authenticator, Authy, etc.)
  4. User enters 6-digit code → POST /security/2fa/verify → activates 2FA
  5. On subsequent logins, code required → POST /security/2fa/check

Secrets are stored in analytics.user_2fa_secrets (company_id + user_id keyed).
pyotp is a pure-Python library — no native deps, works on Railway.

Install: pip install pyotp qrcode[pil]
"""

from __future__ import annotations

import base64
import io
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_TOTP_AVAILABLE = False
try:
    import pyotp
    import qrcode
    _TOTP_AVAILABLE = True
except ImportError:
    logger.warning("security/totp: pyotp or qrcode not installed — 2FA disabled")


ISSUER = "Newsconseen"


# ── Secret management ─────────────────────────────────────────────────────────

def generate_secret() -> str:
    """Generate a new base32 TOTP secret."""
    if not _TOTP_AVAILABLE:
        raise RuntimeError("pyotp not installed")
    return pyotp.random_base32()


def get_totp_uri(secret: str, user_email: str, issuer: str = ISSUER) -> str:
    """Return the otpauth:// URI for QR code generation."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=user_email, issuer_name=issuer)


def get_qr_image_b64(uri: str) -> str:
    """Generate a QR code PNG image as a base64 data URI."""
    qr = qrcode.QRCode(version=1, box_size=8, border=4)
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode()
    return f"data:image/png;base64,{b64}"


def verify_code(secret: str, code: str, valid_window: int = 1) -> bool:
    """
    Verify a 6-digit TOTP code against a secret.
    valid_window=1 allows 1 period (30s) drift in either direction.
    """
    if not _TOTP_AVAILABLE:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=valid_window)


# ── DB persistence ────────────────────────────────────────────────────────────

def _get_engine():
    from database import get_engine_safe
    return get_engine_safe()


def store_pending_secret(user_id: str, company_id: str, secret: str) -> None:
    """Store a pending (unverified) 2FA secret. Overwritten on re-setup."""
    engine = _get_engine()
    if not engine:
        return
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO analytics.user_2fa_secrets
                    (user_id, company_id, secret, status, created_at)
                VALUES (:uid, :cid, :secret, 'pending', NOW())
                ON CONFLICT (user_id) DO UPDATE
                    SET secret     = EXCLUDED.secret,
                        status     = 'pending',
                        created_at = NOW(),
                        verified_at = NULL
            """), {"uid": user_id, "cid": company_id, "secret": secret})
    except Exception as exc:
        logger.warning("totp: store_pending_secret failed — %s", exc)


def activate_secret(user_id: str) -> bool:
    """Mark a pending secret as active after successful verification."""
    engine = _get_engine()
    if not engine:
        return False
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            result = conn.execute(text("""
                UPDATE analytics.user_2fa_secrets
                SET status = 'active', verified_at = NOW()
                WHERE user_id = :uid AND status = 'pending'
            """), {"uid": user_id})
            return result.rowcount > 0
    except Exception as exc:
        logger.warning("totp: activate_secret failed — %s", exc)
        return False


def get_secret(user_id: str) -> dict | None:
    """Return the active 2FA record for a user, or None."""
    engine = _get_engine()
    if not engine:
        return None
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT secret, status, verified_at
                FROM analytics.user_2fa_secrets
                WHERE user_id = :uid
                ORDER BY created_at DESC LIMIT 1
            """), {"uid": user_id}).fetchone()
            if row:
                return {
                    "secret":      row.secret,
                    "status":      row.status,
                    "verified_at": str(row.verified_at) if row.verified_at else None,
                }
    except Exception as exc:
        logger.debug("totp: get_secret failed — %s", exc)
    return None


def disable_2fa(user_id: str) -> None:
    """Remove 2FA for a user."""
    engine = _get_engine()
    if not engine:
        return
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text(
                "DELETE FROM analytics.user_2fa_secrets WHERE user_id = :uid"
            ), {"uid": user_id})
    except Exception as exc:
        logger.warning("totp: disable_2fa failed — %s", exc)
