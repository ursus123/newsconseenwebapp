"""
security/
---------
Security hardening for Newsconseen python_layer.

Modules:
  headers.py    — HTTP security headers middleware (HSTS, CSP, X-Frame, etc.)
  ratelimit.py  — In-process rate limiting for sensitive endpoints
  totp.py       — TOTP 2FA (pyotp): secret generation, QR code, verify
  oauth2.py     — OAuth2 OIDC login (Google, Microsoft) redirect + callback
  routes.py     — FastAPI router mounting all security endpoints
"""
