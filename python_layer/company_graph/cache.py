import copy
import threading
import time
from contextlib import contextmanager

_LOCK = threading.Lock()
_CACHE = {}
_KEY_LOCKS = {}
_GENERATIONS = {}
TTL_SECONDS = 60
MAX_ENTRIES = 256


def get(key):
    with _LOCK:
        item = _CACHE.get(key)
        if not item or item[0] <= time.monotonic():
            _CACHE.pop(key, None)
            return None
        return copy.deepcopy(item[2])


def put(key, value):
    with _LOCK:
        if len(_CACHE) >= MAX_ENTRIES and key not in _CACHE:
            oldest = min(_CACHE, key=lambda candidate: _CACHE[candidate][1])
            _CACHE.pop(oldest, None)
        now = time.monotonic()
        _CACHE[key] = (now + TTL_SECONDS, now, copy.deepcopy(value))


def invalidate(company_id):
    with _LOCK:
        _GENERATIONS[company_id] = _GENERATIONS.get(company_id, 0) + 1
        for key in [key for key in _CACHE if key[0] == company_id]:
            _CACHE.pop(key, None)


def generation(company_id):
    with _LOCK:
        return _GENERATIONS.get(company_id, 0)


@contextmanager
def single_flight(key):
    """Allow only one worker to rebuild a specific authorization-safe key."""
    with _LOCK:
        lock = _KEY_LOCKS.setdefault(key, threading.Lock())
    lock.acquire()
    try:
        yield
    finally:
        lock.release()
