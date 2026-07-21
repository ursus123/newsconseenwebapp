import copy
import threading
import time

_LOCK = threading.Lock()
_CACHE = {}
TTL_SECONDS = 30


def get(key):
    with _LOCK:
        item = _CACHE.get(key)
        if not item or item[0] <= time.monotonic():
            _CACHE.pop(key, None)
            return None
        return copy.deepcopy(item[1])


def put(key, value):
    with _LOCK:
        _CACHE[key] = (time.monotonic() + TTL_SECONDS, copy.deepcopy(value))


def invalidate(company_id):
    with _LOCK:
        for key in [key for key in _CACHE if key[0] == company_id]:
            _CACHE.pop(key, None)
