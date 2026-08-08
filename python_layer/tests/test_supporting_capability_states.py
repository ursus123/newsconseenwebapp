from types import SimpleNamespace


def test_pending_approvals_reports_degraded_when_store_is_unavailable(monkeypatch):
    from agents import routes

    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(routes, "get_engine_safe", lambda: None)

    response = routes.get_pending_approvals("tenant-a", "Bearer token")

    assert response == {
        "state": "degraded",
        "pending": [],
        "message": "The approval store is unavailable.",
    }


def test_pending_approvals_distinguishes_empty_from_available(monkeypatch):
    from agents import routes

    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(routes, "get_engine_safe", lambda: object())
    monkeypatch.setattr(routes, "get_pending", lambda *_args: [])
    assert routes.get_pending_approvals("tenant-a", "Bearer token")["state"] == "empty"

    monkeypatch.setattr(routes, "get_pending", lambda *_args: [{"id": "approval-1"}])
    assert routes.get_pending_approvals("tenant-a", "Bearer token")["state"] == "available"


def test_intelligence_inbox_distinguishes_empty_from_available(monkeypatch):
    from intelligence import routes

    monkeypatch.setattr(routes, "verify_tenant_access", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(routes, "_load_analytics", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(routes, "_fetch_supabase_entity", lambda *_args, **_kwargs: [])
    assert routes.get_inbox("tenant-a", 200, "Bearer token")["state"] == "empty"

    monkeypatch.setattr(
        routes,
        "_fetch_supabase_entity",
        lambda entity, *_args, **_kwargs: [{"id": "risk-1", "status": "open"}] if entity == "risk" else [],
    )
    assert routes.get_inbox("tenant-a", 200, "Bearer token")["state"] == "available"


def test_alert_status_is_tenant_authorized_and_non_silent(monkeypatch):
    from alerts import routes
    from alerts.channels import email, sms, whatsapp

    verified = []
    monkeypatch.setattr(routes, "verify_tenant_access", lambda auth, tenant: verified.append((auth, tenant)))
    monkeypatch.setattr(email.EmailChannel, "is_configured", lambda _self: False)
    monkeypatch.setattr(whatsapp.WhatsAppChannel, "is_configured", lambda _self: False)
    monkeypatch.setattr(sms.SmsChannel, "is_configured", lambda _self: False)

    response = routes.alerts_status("tenant-a", "Bearer token")

    assert verified == [("Bearer token", "tenant-a")]
    assert response["state"] == "degraded"
    assert response["message"]


def test_graph_audit_status_requires_graph_read(monkeypatch):
    from company_graph import routes

    context = SimpleNamespace()
    required = []
    monkeypatch.setattr(
        routes.SupabaseTenantContextRepository,
        "resolve_context",
        lambda _self, *_args, **_kwargs: context,
    )
    monkeypatch.setattr(
        routes.GraphAuthorizationPolicy,
        "for_context",
        classmethod(lambda _cls, _context: SimpleNamespace(require=lambda permission: required.append(permission))),
    )
    request = SimpleNamespace(state=SimpleNamespace(request_id="request-1"))

    response = routes.graph_audit_status(request, "tenant-a", "Bearer token")

    assert required == ["graph.read"]
    assert response["state"] == "available"
    assert response["audit_recording"] is True
