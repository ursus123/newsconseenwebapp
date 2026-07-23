import threading
import time
from concurrent.futures import ThreadPoolExecutor

from tenant_context.supabase_repository import SupabaseTenantContextRepository


def test_concurrent_context_resolution_collapses_identity_and_membership_reads(monkeypatch):
    calls = {"verify": 0, "memberships": 0}
    calls_lock = threading.Lock()

    def verifier(_authorization, _tenant):
        with calls_lock:
            calls["verify"] += 1
        time.sleep(.02)
        return {
            "id": "user-concurrent", "company_id": "tenant-concurrent", "role": "admin",
            "tenant_auth_source": "user_profiles", "profile_found": True,
            "profile_user_id_matches": True,
        }

    def list_records(*_args, **_kwargs):
        with calls_lock:
            calls["memberships"] += 1
        time.sleep(.02)
        return []

    monkeypatch.setattr("tenant_context.supabase_repository.supabase_source.configured", lambda: True)
    monkeypatch.setattr("tenant_context.supabase_repository.supabase_source.list_records", list_records)
    repository = SupabaseTenantContextRepository(verifier=verifier)

    def resolve(index):
        return repository.resolve_context(
            "Bearer concurrent-token", "tenant-concurrent", request_id=f"request-{index}",
        )

    with ThreadPoolExecutor(max_workers=8) as pool:
        contexts = list(pool.map(resolve, range(8)))

    assert calls == {"verify": 1, "memberships": 1}
    assert {context.request_id for context in contexts} == {f"request-{index}" for index in range(8)}
    assert {context.user_id for context in contexts} == {"user-concurrent"}


def test_context_cache_isolated_by_bearer_fingerprint():
    calls = 0

    def verifier(_authorization, _tenant):
        nonlocal calls
        calls += 1
        return {
            "id": f"user-{calls}", "company_id": "tenant-isolation", "role": "admin",
            "tenant_auth_source": "user_profiles", "profile_found": True,
            "profile_user_id_matches": True,
        }

    repository = SupabaseTenantContextRepository(verifier=verifier)
    first = repository.resolve_context("Bearer principal-a", "tenant-isolation")
    second = repository.resolve_context("Bearer principal-b", "tenant-isolation")

    assert calls == 2
    assert first.user_id != second.user_id
