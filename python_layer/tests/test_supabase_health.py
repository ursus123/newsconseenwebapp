from unittest.mock import Mock

from data_sources import supabase_source


def test_health_probe_reports_not_configured(monkeypatch):
    monkeypatch.setattr(supabase_source, "configured", lambda: False)
    assert supabase_source.health_probe() == {
        "status": "unavailable",
        "configured": False,
        "error": "not configured",
    }


def test_health_probe_reports_connected(monkeypatch):
    response = Mock()
    response.raise_for_status.return_value = None
    monkeypatch.setattr(supabase_source, "configured", lambda: True)
    monkeypatch.setattr(supabase_source.requests, "get", lambda *args, **kwargs: response)

    result = supabase_source.health_probe()

    assert result["status"] == "connected"
    assert result["configured"] is True
    assert result["latency_ms"] >= 0


def test_company_id_audit_detects_unassigned_and_format_variants(monkeypatch):
    response = Mock()
    response.content = b"[]"
    response.json.return_value = [
        {"company_id": "tenant-1"},
        {"company_id": " Tenant-1 "},
        {"company_id": None},
        {"company_id": "tenant-2"},
    ]
    monkeypatch.setattr(supabase_source, "_request", lambda *args, **kwargs: response)

    result = supabase_source.audit_company_id_assignments(["enterprises"], "tenant-1")

    table = result["tables"]["enterprises"]
    assert table["requested_tenant_records"] == 1
    assert table["tenant_id_format_variants"] == 1
    assert table["unassigned_records"] == 1
    assert table["other_tenant_records"] == 1
    assert result["tenant_ids_normalized"] is False
