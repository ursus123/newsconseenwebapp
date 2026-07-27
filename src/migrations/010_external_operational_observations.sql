-- Stage 25: governed external operational observations.
-- External facts and their matches remain separate from canonical records.

CREATE TABLE IF NOT EXISTS public.external_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  operational_unit_id UUID REFERENCES public.operational_units(id) ON DELETE SET NULL,
  observation_type TEXT NOT NULL CHECK (observation_type IN (
    'severe_weather', 'closure', 'recall', 'traffic', 'supply_disruption',
    'public_holiday', 'regulatory_change'
  )),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'withdrawn', 'superseded')),
  source_name TEXT NOT NULL,
  source_url TEXT,
  source_record_id TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL,
  freshness_at TIMESTAMPTZ NOT NULL,
  location JSONB NOT NULL DEFAULT '{}'::jsonb,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ,
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  expires_at TIMESTAMPTZ NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_payload_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, source_name, source_record_id)
);

CREATE TABLE IF NOT EXISTS public.external_observation_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  observation_id UUID NOT NULL REFERENCES public.external_observations(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'enterprise', 'operational_unit', 'task', 'product', 'schedule', 'address', 'territory'
  )),
  target_id TEXT NOT NULL,
  predicate TEXT NOT NULL DEFAULT 'may_affect'
    CHECK (predicate IN ('may_affect', 'may_disrupt', 'requires_alternative')),
  matching_method TEXT NOT NULL CHECK (matching_method IN (
    'explicit_reference', 'product_identifier', 'coordinates_radius',
    'address_region', 'schedule_window', 'ontology_rule'
  )),
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  verification_status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (verification_status IN ('proposed', 'verified', 'rejected', 'disputed')),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, observation_id, target_type, target_id, predicate)
);

CREATE INDEX IF NOT EXISTS external_observations_active_idx
  ON public.external_observations (company_id, status, expires_at);
CREATE INDEX IF NOT EXISTS external_observations_unit_idx
  ON public.external_observations (company_id, operational_unit_id, valid_from);
CREATE INDEX IF NOT EXISTS external_observation_matches_target_idx
  ON public.external_observation_matches (company_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS external_observation_matches_observation_idx
  ON public.external_observation_matches (company_id, observation_id);

ALTER TABLE public.external_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_observation_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS external_observations_tenant_select ON public.external_observations;
DROP POLICY IF EXISTS external_observations_manager_write ON public.external_observations;
CREATE POLICY external_observations_tenant_select
  ON public.external_observations FOR SELECT TO authenticated
  USING (company_id = public.my_company_id());
CREATE POLICY external_observations_manager_write
  ON public.external_observations FOR ALL TO authenticated
  USING (
    company_id = public.my_company_id()
    AND COALESCE((SELECT role FROM public.user_profiles WHERE id = auth.uid()), 'user')
      IN ('manager', 'admin', 'super_admin')
  )
  WITH CHECK (
    company_id = public.my_company_id()
    AND COALESCE((SELECT role FROM public.user_profiles WHERE id = auth.uid()), 'user')
      IN ('manager', 'admin', 'super_admin')
  );

DROP POLICY IF EXISTS external_observation_matches_tenant_select ON public.external_observation_matches;
DROP POLICY IF EXISTS external_observation_matches_manager_write ON public.external_observation_matches;
CREATE POLICY external_observation_matches_tenant_select
  ON public.external_observation_matches FOR SELECT TO authenticated
  USING (company_id = public.my_company_id());
CREATE POLICY external_observation_matches_manager_write
  ON public.external_observation_matches FOR ALL TO authenticated
  USING (
    company_id = public.my_company_id()
    AND COALESCE((SELECT role FROM public.user_profiles WHERE id = auth.uid()), 'user')
      IN ('manager', 'admin', 'super_admin')
  )
  WITH CHECK (
    company_id = public.my_company_id()
    AND COALESCE((SELECT role FROM public.user_profiles WHERE id = auth.uid()), 'user')
      IN ('manager', 'admin', 'super_admin')
  );

DROP TRIGGER IF EXISTS external_observations_set_updated_at ON public.external_observations;
CREATE TRIGGER external_observations_set_updated_at
  BEFORE UPDATE ON public.external_observations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS external_observation_matches_set_updated_at ON public.external_observation_matches;
CREATE TRIGGER external_observation_matches_set_updated_at
  BEFORE UPDATE ON public.external_observation_matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
