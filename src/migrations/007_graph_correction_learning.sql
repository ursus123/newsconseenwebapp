-- Newsconseen OS — governed graph correction outcomes (Stages 15–16)
-- Apply after 005_graph_assertion_governance.sql.

CREATE TABLE IF NOT EXISTS graph_assertion_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  assertion_id UUID NOT NULL REFERENCES graph_assertions(id) ON DELETE CASCADE,
  assertion_key TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('supported','refuted','inconclusive')),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS graph_assertion_outcomes_history_idx
  ON graph_assertion_outcomes(company_id, assertion_key, observed_at DESC);

ALTER TABLE graph_assertion_outcomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS graph_assertion_outcomes_tenant_all ON graph_assertion_outcomes;
CREATE POLICY graph_assertion_outcomes_tenant_all ON graph_assertion_outcomes
  FOR ALL TO authenticated
  USING (company_id = my_company_id())
  WITH CHECK (company_id = my_company_id());
