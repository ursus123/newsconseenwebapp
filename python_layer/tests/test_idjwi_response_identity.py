from types import SimpleNamespace

from copilot.advisor_policy import AdvisorSelection
from copilot.response_identity import build_response_identity
from copilot.routes import _finalize_idjwi_response


def request(*, enabled=False, mode=None):
    return SimpleNamespace(advisor_enabled=enabled, advisor_mode=mode)


def selection(**overrides):
    value = {
        "mode": "core", "model_id": None, "comparison_models": [],
        "source": "tenant_policy",
    }
    value.update(overrides)
    return value


def test_core_identity_has_no_advisor_contribution():
    identity = build_response_identity(
        request=request(), advisor_selection=selection(),
        result={"mode": "autonomous"},
    )
    assert identity["visible_identity"] == "Idjwi"
    assert identity["response_state"] == "Idjwi Core"
    assert identity["advisor_consulted"] is False


def test_requested_toggle_is_not_proof_of_advisor_contribution():
    identity = build_response_identity(
        request=request(enabled=True, mode="automatic"),
        advisor_selection=selection(
            mode="automatic", model_id="claude", source="tenant_connection",
        ),
        result={"mode": "autonomous"},
    )
    assert identity["response_state"] == "advisor requested"
    assert identity["advisor_consulted"] is False


def test_successful_advisor_and_comparison_are_proof_derived():
    single = build_response_identity(
        request=request(enabled=True, mode="automatic"),
        advisor_selection=selection(
            mode="automatic", model_id="claude", source="tenant_connection",
        ),
        result={"mode": "advisor"},
    )
    assert single["response_state"] == "advisor consulted"
    assert single["consulted_advisors"] == ["claude"]

    multiple = build_response_identity(
        request=request(enabled=True, mode="compare"),
        advisor_selection=selection(
            mode="compare", model_id="claude",
            comparison_models=["claude", "codex"], source="tenant_policy",
        ),
        result={
            "mode": "advisor",
            "advisor_contributions": [
                {"model_id": "claude"}, {"model_id": "codex"},
            ],
        },
    )
    assert multiple["response_state"] == "multiple advisors consulted"
    assert multiple["multiple_advisors_consulted"] is True


def test_fallback_and_required_unavailable_are_distinct():
    fallback = build_response_identity(
        request=request(enabled=True, mode="automatic"),
        advisor_selection=selection(source="fallback"),
        result={"mode": "autonomous"},
    )
    assert fallback["response_state"] == "Core fallback used"
    assert fallback["advisor_unavailable"] is True

    required = build_response_identity(
        request=request(enabled=True, mode="required"),
        advisor_selection=selection(source="fallback"),
        result={"mode": "autonomous"},
    )
    assert required["response_state"] == "advisor required but unavailable"
    assert required["advisor_required_but_unavailable"] is True


def test_response_and_audit_receive_the_same_identity(monkeypatch):
    captured = {}

    def capture_event(*args, **kwargs):
        captured.update(kwargs)

    monkeypatch.setattr("copilot.idjwi_observability.log_event", capture_event)
    req = SimpleNamespace(
        company_id="tenant-a", advisor_enabled=True, advisor_mode="automatic",
    )
    selected = AdvisorSelection(
        mode="automatic", profile="balanced", model_id="claude",
        provider="anthropic", reason="test", source="tenant_connection",
    )
    result = _finalize_idjwi_response(
        result={"mode": "advisor", "intent": "explain_node", "data": {
            "graph_semantic_summary": {
                "node_count": 2, "edge_count": 1,
                "disconnected_count": 0, "unavailable_source_count": 0,
            },
        }},
        request=req, advisor_selection=selected,
        access={"authorized": True, "diagnostics": {}},
        principal=SimpleNamespace(user_id="user-1"),
    )
    assert result["response_identity"] == captured["metadata"]["response_identity"]
    assert result["advisor_enabled"] is True
    assert captured["metadata"]["graph_semantic_summary"] == result["data"]["graph_semantic_summary"]
