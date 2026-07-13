"""
security/ratelimit.py
---------------------
In-process token-bucket rate limiter for sensitive endpoints.

No Redis required — uses a thread-safe in-memory store. Sufficient for a
single Railway dyno. If Newsconseen scales to multiple dynos, swap the
_BUCKETS store for a Redis backend using the same interface.

Default limits (tuned for SME operator usage):
  /copilot/ask           10 req / 60s per IP   — LLM calls are expensive (covers /ask + /ask/stream)
  /copilot/command       10 req / 60s per IP   — LLM calls are expensive
  /auth/*                5  req / 60s per IP   — brute-force protection
  /admin/*               20 req / 60s per IP   — admin ops
  /bi/export             5  req / 60s per IP   — file generation is heavy
  /enrichment/run        3  req / 60s per IP   — enrichment pipeline
  /webhook                20 req / 60s per IP   — inbound webhook abuse guard
  public open-data/proxy 30 req / 60s per IP   — /public-data, /agriculture, etc.

Usage (in app.py — add as middleware BEFORE route handlers):
    from security.ratelimit import RateLimitMiddleware
    app.add_middleware(RateLimitMiddleware)

Or use the per-route dependency:
    from security.ratelimit import rate_limit
    @app.post("/my-endpoint")
    def endpoint(request: Request, _=Depends(rate_limit(10, 60))):
        ...
"""

from __future__ import annotations

import time
import threading
from collections import defaultdict, deque
from typing import Callable

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response


# ── Token bucket store ────────────────────────────────────────────────────────

class _Bucket:
    """Sliding-window counter per (ip, route_key)."""

    def __init__(self, limit: int, window: int):
        self.limit  = limit   # max requests
        self.window = window  # window in seconds
        self._lock  = threading.Lock()
        self._times: deque[float] = deque()

    def is_allowed(self) -> tuple[bool, int]:
        """Return (allowed, retry_after_seconds)."""
        now = time.monotonic()
        with self._lock:
            # Drop expired timestamps
            cutoff = now - self.window
            while self._times and self._times[0] < cutoff:
                self._times.popleft()

            if len(self._times) >= self.limit:
                retry = int(self._times[0] + self.window - now) + 1
                return False, retry

            self._times.append(now)
            return True, 0


_BUCKETS: dict[tuple[str, str], _Bucket] = {}
_BUCKET_LOCK = threading.Lock()


def _get_bucket(key: tuple[str, str], limit: int, window: int) -> _Bucket:
    with _BUCKET_LOCK:
        if key not in _BUCKETS:
            _BUCKETS[key] = _Bucket(limit, window)
        return _BUCKETS[key]


def _client_ip(request: Request) -> str:
    """Extract real client IP, respecting Railway/proxy forwarded headers."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── Route-level rate limit rules ──────────────────────────────────────────────

# (path_prefix, limit, window_seconds)
_RULES: list[tuple[str, int, int]] = [
    ("/copilot/ask",     10,  60),   # 10 req/min per IP — covers /ask and /ask/stream
    ("/copilot/command", 10,  60),   # 10 req/min per IP — LLM-calling
    ("/auth/",            5,  60),   # 5 req/min — brute force guard
    ("/security/2fa",     5,  60),   # 5 2FA attempts/min
    ("/admin/",          20,  60),   # 20 req/min for admin ops
    ("/bi/export",        5,  60),   # 5 exports/min — file gen is heavy
    ("/enrichment/run",   3,  60),   # 3 enrichment triggers/min
    ("/onboarding/",      5, 300),   # 5 provision calls / 5 min
    ("/webhook",         20,  60),   # inbound webhook abuse guard
    # Public open-data / proxy routers — previously entirely uncovered.
    ("/public-data",     30,  60),
    ("/agriculture",     30,  60),
    ("/demographics",    30,  60),
    ("/education",       30,  60),
    ("/geo",             30,  60),
    ("/healthcare",      30,  60),
    ("/labor",           30,  60),
    ("/market",          30,  60),
    ("/medications",     30,  60),
    ("/nonprofit",       30,  60),
    ("/proxy",           30,  60),
    ("/open-data/weather",30,  60),
]


def _match_rule(path: str) -> tuple[int, int] | None:
    """Return (limit, window) for the first matching rule, or None."""
    for prefix, limit, window in _RULES:
        if path.startswith(prefix):
            return limit, window
    return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces per-IP rate limits on sensitive endpoints.
    Unmatched paths pass through with no limit applied.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        rule = _match_rule(path)

        if rule:
            limit, window = rule
            ip  = _client_ip(request)
            key = (ip, path.split("?")[0])
            bucket = _get_bucket(key, limit, window)
            allowed, retry_after = bucket.is_allowed()

            if not allowed:
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": f"Rate limit exceeded. Retry after {retry_after}s.",
                        "retry_after": retry_after,
                    },
                    headers={
                        "Retry-After":              str(retry_after),
                        "X-RateLimit-Limit":        str(limit),
                        "X-RateLimit-Window":       str(window),
                        "Access-Control-Allow-Origin": "*",
                    },
                )

        return await call_next(request)


# ── Per-route dependency (alternative usage) ──────────────────────────────────

def rate_limit(limit: int = 10, window: int = 60) -> Callable:
    """
    FastAPI dependency for per-route rate limiting.

    Usage:
        from fastapi import Depends
        from security.ratelimit import rate_limit

        @app.post("/sensitive")
        def handler(request: Request, _=Depends(rate_limit(5, 60))):
            ...
    """
    def _dep(request: Request):
        ip  = _client_ip(request)
        key = (ip, request.url.path)
        bucket = _get_bucket(key, limit, window)
        allowed, retry_after = bucket.is_allowed()
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Retry after {retry_after}s.",
                headers={
                    "Retry-After":       str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                },
            )
    return _dep


def get_rate_limit_stats() -> list[dict]:
    """Return current bucket states (for /health or /admin/health)."""
    with _BUCKET_LOCK:
        now = time.monotonic()
        return [
            {
                "key":     f"{ip}:{path}",
                "count":   sum(1 for t in b._times if t > now - b.window),
                "limit":   b.limit,
                "window":  b.window,
            }
            for (ip, path), b in _BUCKETS.items()
            if sum(1 for t in b._times if t > now - b.window) > 0
        ]
