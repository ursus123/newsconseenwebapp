import time


_CACHE: dict[tuple, tuple[float, dict]] = {}


def cache_key(context, layer: str) -> tuple:
    return (context.tenant_id, context.scope_type, context.scope_id, tuple(sorted(context.permissions)), layer, "v1")


def get_cached(key: tuple, ttl_seconds: int = 45):
    item = _CACHE.get(key)
    if not item:
        return None
    created, value = item
    if time.monotonic() - created > ttl_seconds:
        _CACHE.pop(key, None)
        return None
    return value


def set_cached(key: tuple, value: dict):
    _CACHE[key] = (time.monotonic(), value)


def invalidate_tenant(tenant_id: str):
    for key in [key for key in _CACHE if key[0] == tenant_id]:
        _CACHE.pop(key, None)
