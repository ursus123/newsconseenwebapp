"""Privacy-preserving Sentry configuration helpers."""

from __future__ import annotations

from copy import deepcopy


_SENSITIVE_HEADERS = {
    "authorization", "cookie", "set-cookie", "x-api-key", "x-cron-secret",
    "apikey", "proxy-authorization",
}
_SENSITIVE_KEYS = {
    "password", "access_token", "refresh_token", "service_role_key", "secret", "token",
}


def scrub_sentry_event(event, hint):
    """Remove credentials and request bodies before an event leaves the service."""
    cleaned = deepcopy(event)
    request = cleaned.get("request") or {}
    headers = request.get("headers") or {}
    request["headers"] = {
        key: ("[Filtered]" if key.lower() in _SENSITIVE_HEADERS else value)
        for key, value in headers.items()
    }
    # Request bodies can contain imported records or tenant-sensitive prompts.
    request.pop("data", None)
    request.pop("cookies", None)
    cleaned["request"] = request
    extra = cleaned.get("extra") or {}
    cleaned["extra"] = {
        key: ("[Filtered]" if key.lower() in _SENSITIVE_KEYS else value)
        for key, value in extra.items()
    }
    cleaned.pop("user", None)
    return cleaned
