"""Outcome-based Idjwi learning for governed graph corrections.

Only governed assertion decisions and observed outcomes enter this channel.
Chat text is never accepted as a graph fact.
"""

from __future__ import annotations

from copilot.idjwi_memory import remember


def record_correction_memory(company_id: str, *, assertion: dict, outcome: str,
                             actor: str, event: dict | None = None,
                             observed_evidence: list | None = None) -> dict:
    assertion_key = str(assertion.get("assertion_key") or "")
    if not assertion_key:
        return {"saved": False, "reason": "assertion key unavailable"}
    value = {
        "assertion_key": assertion_key,
        "relationship_rule_id": assertion.get("relationship_rule_id"),
        "source": assertion.get("source_node_id"),
        "predicate": assertion.get("predicate"),
        "target": assertion.get("target_node_id"),
        "outcome": outcome,
        "assertion_state": assertion.get("assertion_state"),
        "evidence_version": assertion.get("evidence_version") or 1,
        "observed_evidence": observed_evidence or [],
    }
    return remember(
        company_id=company_id,
        key=f"graph_correction:{assertion_key}",
        value=value,
        memory_type="correction",
        scope="company",
        owner="idjwi",
        confidence=1.0 if outcome in {"confirmed", "edited_confirmed", "rejected", "supported", "refuted"} else 0.6,
        source="governed_graph_outcome",
        review_status="confirmed" if outcome in {"confirmed", "edited_confirmed", "rejected", "supported", "refuted"} else "pending",
        layer="correction",
        subject_type="graph_assertion",
        subject_id=assertion_key,
        provenance={
            "assertion_id": assertion.get("id"),
            "event_id": (event or {}).get("id"),
            "actor": actor,
            "decision_channel": "company_graph_governance",
            "arbitrary_chat_accepted": False,
        },
        metadata={
            "relationship_rule_id": assertion.get("relationship_rule_id"),
            "predicate": assertion.get("predicate"),
            "outcome": outcome,
        },
    )
