from unittest.mock import Mock

from onboarding import auth


def test_verified_session_cache_uses_token_hash_and_avoids_repeat_network(monkeypatch):
    auth._VERIFIED_SESSION_CACHE.clear()
    response = Mock(ok=True)
    response.json.return_value = {"id": "user-1", "email": "user@example.com", "app_metadata": {}}
    session = Mock()
    session.get.return_value = response
    monkeypatch.setattr("data_sources.supabase_source._http_session", lambda: session)
    monkeypatch.setattr(auth.settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(auth.settings, "supabase_service_role_key", "service-key")

    first = auth.verify_supabase_user("Bearer signed-token")
    second = auth.verify_supabase_user("Bearer signed-token")

    assert first == second
    assert session.get.call_count == 1
    assert "signed-token" not in auth._VERIFIED_SESSION_CACHE
