"""Short-lived principal-specific Intelligence Inbox cache."""

import copy
import threading
import time


_TTL_SECONDS = 10
_MAX_ENTRIES = 512
_CACHE = {}
_LOCK = threading.Lock()


def cache_key(authorization_fingerprint: str, limit: int) -> tuple:
    return ("intelligence-inbox.v1", authorization_fingerprint, int(limit))


def get(key):
    with _LOCK:
        value = _CACHE.get(key)
        if not value or value[0] <= time.monotonic():
            _CACHE.pop(key, None)
            return None
        return copy.deepcopy(value[1])


def put(key, payload):
    with _LOCK:
        if len(_CACHE) >= _MAX_ENTRIES and key not in _CACHE:
            oldest = min(_CACHE, key=lambda candidate: _CACHE[candidate][0])
            _CACHE.pop(oldest, None)
        _CACHE[key] = (time.monotonic() + _TTL_SECONDS, copy.deepcopy(payload))


def clear():
    with _LOCK:
        _CACHE.clear()
