import gzip

import pytest

from observability import scrub_sentry_event
from backup import engine as backup_engine


def test_sentry_scrubber_removes_identity_body_and_credentials():
    event = {
        "user": {"email": "private@example.com"},
        "request": {
            "data": {"prompt": "tenant-sensitive"},
            "cookies": {"session": "secret"},
            "headers": {"Authorization": "Bearer secret", "X-Request-ID": "req-safe"},
        },
        "extra": {"password": "secret", "request_id": "req-safe"},
    }
    cleaned = scrub_sentry_event(event, {})
    assert "user" not in cleaned
    assert "data" not in cleaned["request"]
    assert "cookies" not in cleaned["request"]
    assert cleaned["request"]["headers"]["Authorization"] == "[Filtered]"
    assert cleaned["request"]["headers"]["X-Request-ID"] == "req-safe"
    assert cleaned["extra"]["password"] == "[Filtered]"


def test_restore_refuses_active_database_even_with_disposable_confirmation(tmp_path, monkeypatch):
    dump = tmp_path / "backup.sql.gz"
    with gzip.open(dump, "wb") as output:
        output.write(b"-- test")
    active = "postgresql://user:password@db.example.com:5432/newsconseen"
    monkeypatch.setattr(backup_engine.settings, "database_url", active)
    monkeypatch.setenv("RESTORE_TEST_DATABASE_CONFIRM_DISPOSABLE", "true")
    with pytest.raises(RuntimeError, match="active database"):
        backup_engine._restore_into_scratch_db(str(dump), active)
