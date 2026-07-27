from company_graph.external_observations import (
    CONTRACT_VERSION,
    governed_alternatives,
    normalize_matches,
    normalize_observation,
)


def _payload():
    return {
        "observation_type": "closure",
        "title": "Pharmacy closed",
        "summary": "The dispensing location is temporarily closed.",
        "severity": "high",
        "source_name": "County health directory",
        "source_url": "https://example.test/closure/17",
        "source_record_id": "closure-17",
        "retrieved_at": "2026-07-27T12:00:00Z",
        "freshness_at": "2026-07-27T11:55:00Z",
        "location": {"city": "Madison", "region": "WI"},
        "valid_from": "2026-07-27T10:00:00Z",
        "valid_until": "2026-07-29T10:00:00Z",
        "confidence": 0.94,
        "expires_at": "2026-07-29T12:00:00Z",
        "source_payload": {"provider_id": "closure-17", "state": "closed"},
    }


def test_normalized_observation_has_provenance_and_no_raw_payload():
    normalized = normalize_observation(_payload(), actor="operator-1")
    assert normalized["provenance"]["contract_version"] == CONTRACT_VERSION
    assert normalized["source_payload_hash"]
    assert "source_payload" not in normalized


def test_matches_are_proposals_and_do_not_write_canonical_records():
    observation = normalize_observation(_payload(), actor="operator-1")
    matches = normalize_matches([{
        "target_type": "enterprise",
        "target_id": "pharmacy-1",
        "predicate": "requires_alternative",
        "matching_method": "explicit_reference",
        "confidence": 0.91,
    }], observation, observation_id="observation-1", actor="operator-1")
    assert matches[0]["verification_status"] == "proposed"
    alternatives = governed_alternatives(observation, matches)
    assert alternatives[0]["requires_approval"] is True
    assert alternatives[0]["writes_canonical_record"] is False


def test_invalid_type_and_expiry_are_rejected():
    payload = _payload()
    payload["observation_type"] = "social_media_rumor"
    try:
        normalize_observation(payload, actor="operator-1")
        assert False, "unsupported observation types must fail"
    except ValueError:
        pass
    payload = _payload()
    payload["expires_at"] = payload["valid_from"]
    try:
        normalize_observation(payload, actor="operator-1")
        assert False, "non-future expiry must fail"
    except ValueError:
        pass
