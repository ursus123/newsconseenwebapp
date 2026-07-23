-- Newsconseen OS — temporal assertion governance (Stage 8)
-- Apply after 004_operational_units_and_relationship_registry.sql.

CREATE TABLE IF NOT EXISTS graph_assertions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  operational_unit_id UUID REFERENCES operational_units(id) ON DELETE SET NULL,
  assertion_key TEXT NOT NULL,
  relationship_rule_id TEXT,
  source_node_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  assertion_class TEXT NOT NULL,
  assertion_state TEXT NOT NULL DEFAULT 'proposed' CHECK (assertion_state IN (
    'proposed','confirmed','rejected','disputed','active','expired','superseded'
  )),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  observed_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES graph_assertions(id) ON DELETE SET NULL,
  evidence_version INTEGER NOT NULL DEFAULT 1 CHECK (evidence_version > 0),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, assertion_key)
);

CREATE TABLE IF NOT EXISTS graph_assertion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  assertion_id UUID NOT NULL REFERENCES graph_assertions(id) ON DELETE CASCADE,
  assertion_key TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL CHECK (to_state IN (
    'proposed','confirmed','rejected','disputed','active','expired','superseded'
  )),
  reason TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  evidence_version INTEGER NOT NULL DEFAULT 1,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS graph_assertions_key_idx ON graph_assertions(company_id, assertion_key);
CREATE INDEX IF NOT EXISTS graph_assertions_scope_idx ON graph_assertions(company_id, operational_unit_id, assertion_state);
CREATE INDEX IF NOT EXISTS graph_assertion_events_history_idx ON graph_assertion_events(company_id, assertion_id, occurred_at DESC);

ALTER TABLE graph_assertions ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_assertion_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS graph_assertions_tenant_all ON graph_assertions;
CREATE POLICY graph_assertions_tenant_all ON graph_assertions FOR ALL TO authenticated
  USING (company_id = my_company_id()) WITH CHECK (company_id = my_company_id());
DROP POLICY IF EXISTS graph_assertion_events_tenant_all ON graph_assertion_events;
CREATE POLICY graph_assertion_events_tenant_all ON graph_assertion_events FOR ALL TO authenticated
  USING (company_id = my_company_id()) WITH CHECK (company_id = my_company_id());

DROP TRIGGER IF EXISTS set_graph_assertions_updated_at ON graph_assertions;
CREATE TRIGGER set_graph_assertions_updated_at BEFORE UPDATE ON graph_assertions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
