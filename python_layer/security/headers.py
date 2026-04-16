"""
security/headers.py
--------------------
HTTP security headers middleware.

Adds the following headers to every response:

  Strict-Transport-Security   Forces HTTPS for 1 year + subdomains (HSTS)
  X-Content-Type-Options      Prevents MIME sniffing (nosniff)
  X-Frame-Options             Prevents clickjacking (DENY)
  X-XSS-Protection            Legacy XSS filter hint (modern browsers ignore)
  Referrer-Policy             Controls referrer leakage
  Permissions-Policy          Disables unused browser APIs
  Content-Security-Policy     Restricts resource loading origins
  Cache-Control               Prevents sensitive API responses being cached

These headers close 6 common OWASP Top-10 / pen-test findings with zero
application logic changes.

Usage (in app.py):
    from security.headers import SecurityHeadersMiddleware
    app.add_middleware(SecurityHeadersMiddleware)
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


# CSP tuned for a FastAPI JSON API:
# - default-src 'none'   — deny everything not explicitly allowed
# - frame-ancestors 'none' — equivalent to X-Frame-Options: DENY
# The frontend (React/Base44) is a separate origin — it doesn't serve HTML
# from this API, so a strict CSP is safe here.
_CSP = (
    "default-src 'none'; "
    "frame-ancestors 'none'; "
    "form-action 'none';"
)

_SECURITY_HEADERS = {
    "Strict-Transport-Security":  "max-age=31536000; includeSubDomains; preload",
    "X-Content-Type-Options":     "nosniff",
    "X-Frame-Options":            "DENY",
    "X-XSS-Protection":           "1; mode=block",
    "Referrer-Policy":            "strict-origin-when-cross-origin",
    "Permissions-Policy": (
        "geolocation=(), microphone=(), camera=(), "
        "payment=(), usb=(), magnetometer=(), gyroscope=()"
    ),
    "Content-Security-Policy":    _CSP,
    "Cache-Control":              "no-store, no-cache, must-revalidate, private",
    "Pragma":                     "no-cache",
}

# Paths that serve docs/UI — relax CSP so Swagger UI loads correctly
_DOCS_PATHS = {"/docs", "/redoc", "/openapi.json"}
_DOCS_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "frame-ancestors 'none';"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Starlette middleware that stamps security headers on every response.
    Must be added AFTER CORSMiddleware so CORS headers are not overwritten.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        for header, value in _SECURITY_HEADERS.items():
            # Don't overwrite CSP for docs paths — use relaxed version
            if header == "Content-Security-Policy" and request.url.path in _DOCS_PATHS:
                response.headers[header] = _DOCS_CSP
            else:
                response.headers[header] = value

        return response
