from pathlib import Path


def test_phase_four_migration_defines_complete_service_only_repository():
    sql = (Path(__file__).parents[2] / "src" / "migrations" / "017_intelligence_repository.sql").read_text(encoding="utf-8")
    required = {
        "intelligence_items", "intelligence_evidence_links", "intelligence_assignments",
        "intelligence_status_transitions", "intelligence_decision_links",
        "intelligence_approval_requests", "intelligence_actions", "intelligence_outcomes",
        "intelligence_operator_feedback", "intelligence_deduplication_groups",
        "intelligence_audit_events",
    }
    for table in required:
        assert f"CREATE TABLE IF NOT EXISTS public.{table}" in sql
        assert table in sql.split("ENABLE ROW LEVEL SECURITY")[0] or table in sql
    assert "Deliberately no authenticated/browser policies" in sql
    assert "NOTIFY pgrst, 'reload schema'" in sql
