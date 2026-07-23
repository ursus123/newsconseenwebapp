import threading
import time
from concurrent.futures import ThreadPoolExecutor

from company_graph import cache


def test_cache_is_copy_safe_and_generation_invalidates_tenant():
    company = "cache-test-copy"
    key = (company, "principal", cache.generation(company))
    value = {"nodes": [{"id": "enterprise:e1"}]}
    cache.put(key, value)
    first = cache.get(key)
    first["nodes"].append({"id": "enterprise:e2"})
    assert cache.get(key) == value
    previous_generation = cache.generation(company)
    cache.invalidate(company)
    assert cache.get(key) is None
    assert cache.generation(company) == previous_generation + 1


def test_single_flight_prevents_duplicate_rebuilds():
    key = ("cache-test-flight", "principal", 0)
    builds = 0
    builds_lock = threading.Lock()

    def get_or_build(_):
        nonlocal builds
        cached = cache.get(key)
        if cached:
            return cached
        with cache.single_flight(key):
            cached = cache.get(key)
            if cached:
                return cached
            with builds_lock:
                builds += 1
            time.sleep(.03)
            value = {"ready": True}
            cache.put(key, value)
            return value

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(get_or_build, range(8)))
    assert builds == 1
    assert results == [{"ready": True}] * 8
