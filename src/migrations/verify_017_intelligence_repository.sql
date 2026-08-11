-- Verification only: safe to run after 017_intelligence_repository.sql.
SELECT
  to_regclass('public.intelligence_items') AS intelligence_items,
  to_regclass('public.intelligence_evidence_links') AS evidence_links,
  to_regclass('public.intelligence_assignments') AS assignments,
  to_regclass('public.intelligence_status_transitions') AS status_transitions,
  to_regclass('public.intelligence_decision_links') AS decisions,
  to_regclass('public.intelligence_approval_requests') AS approval_requests,
  to_regclass('public.intelligence_actions') AS actions,
  to_regclass('public.intelligence_outcomes') AS outcomes,
  to_regclass('public.intelligence_operator_feedback') AS operator_feedback,
  to_regclass('public.intelligence_deduplication_groups') AS deduplication_groups,
  to_regclass('public.intelligence_audit_events') AS audit_events;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'intelligence_%'
ORDER BY tablename;

SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'intelligence_%'
ORDER BY tablename, policyname;

-- Expected: all eleven canonical tables exist, rowsecurity is true, and the
-- policy query returns no authenticated/browser policy for these tables.
