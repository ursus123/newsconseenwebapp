import database


def test_database_url_configured_rejects_missing(monkeypatch):
    monkeypatch.setattr(database.settings, "database_url", None)
    assert database.database_url_configured() is False
    assert database.get_engine_safe() is None


def test_database_url_configured_rejects_placeholder(monkeypatch):
    monkeypatch.setattr(
        database.settings,
        "database_url",
        "postgresql://postgres:YOUR_PASSWORD@YOUR_RAILWAY_HOST:5432/railway",
    )
    assert database.database_url_configured() is False
    assert database.get_engine_safe() is None


def test_database_url_configured_accepts_real_url_shape(monkeypatch):
    monkeypatch.setattr(
        database.settings,
        "database_url",
        "postgresql://newsconseen:secret@db.internal:5432/newsconseen",
    )
    assert database.database_url_configured() is True
