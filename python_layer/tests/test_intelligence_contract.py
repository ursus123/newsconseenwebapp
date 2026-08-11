from intelligence.contracts import INTELLIGENCE_INBOX_CONTRACT, INTELLIGENCE_ITEM_CONTRACT
from intelligence.projector import build_envelope, project_item


PRINCIPAL = {"id": "user-1", "role": "admin", "company_id": "tenant-a"}


def test_governed_item_is_versioned_and_minimized():
    row = {
        "id": "finding-1", "company_id": "tenant-a", "title": "Delivery at risk",
        "body": "A supplier delay may affect tomorrow's delivery.", "severity": "high",
        "source": "analytics", "source_run_id": "run-7", "subject_type": "enterprise",
        "subject_id": "supplier-1", "subject_name": "Supplier A",
        "evidence": [{"id": "fact-1", "type": "analytical_fact", "label": "Late dispatch"}],
        "confidence": 0.81, "detected_at": "2026-08-08T10:00:00Z",
        "private_notes": "must never leave the repository", "raw_prompt": "secret prompt",
    }
    item = project_item(row, "insight", "tenant-a", PRINCIPAL)
    payload = item.model_dump(mode="json")
    assert payload["contract"] == INTELLIGENCE_ITEM_CONTRACT
    assert payload["source"]["type"] == "analytical_calculation"
    assert payload["source"]["assertion_class"] == "analytical_finding"
    assert payload["idjwi_context"]["item_id"] == payload["audit_context"]["item_id"] == item.id
    assert "private_notes" not in str(payload)
    assert "raw_prompt" not in str(payload)


def test_advisor_output_remains_a_proposal_without_contribution_proof():
    item = project_item({
        "id": "advisor-1", "title": "Consider changing supplier", "body": "Advisor suggestion",
        "source": "advisor", "source_id": "tenant-claude", "status": "new",
    }, "insight", "tenant-a", PRINCIPAL)
    assert item.source.type == "tenant_llm_advisor"
    assert item.source.assertion_class == "advisor_proposal"
    assert item.source.authority == "proposal"
    assert item.advisor.state == "requested"
    assert item.advisor.contribution_proven is False


def test_envelope_shares_contract_with_idjwi_and_audit():
    envelope = build_envelope("tenant-a", PRINCIPAL, {
        "insight": [{"id": "i-1", "title": "Finding", "source": "rule"}],
        "risk": [], "opportunity": [], "recommendation": [],
    }, 20)
    payload = envelope.model_dump(mode="json")
    assert payload["contract"] == INTELLIGENCE_INBOX_CONTRACT
    assert payload["item_contract"] == INTELLIGENCE_ITEM_CONTRACT
    assert payload["idjwi_context"]["item_ids"] == payload["audit_context"]["item_ids"]
    assert payload["items"][0]["idjwi_context"]["contract"] == INTELLIGENCE_ITEM_CONTRACT
    assert payload["items"][0]["audit_context"]["contract"] == INTELLIGENCE_ITEM_CONTRACT
