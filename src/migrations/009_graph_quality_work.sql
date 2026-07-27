-- Stage 24: durable tenant-scoped graph-quality findings and resolution history.

CREATE TABLE IF NOT EXISTS public.graph_quality_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  operational_unit_id UUID REFERENCES public.operational_units(id) ON DELETE SET NULL,
  finding_key TEXT NOT NULL,
  issue_code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  affected_count INTEGER NOT NULL DEFAULT 0 CHECK (affected_count >= 0),
  cause TEXT NOT NULL,
  business_consequence TEXT NOT NULL,
  owner_user_id TEXT,
  owner_display_name TEXT,
  suggested_repair TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  bulk_repair_eligible BOOLEAN NOT NULL DEFAULT false,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'failed')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed', 'recurring')),
  alert_state TEXT NOT NULL DEFAULT 'not_required'
    CHECK (alert_state IN ('not_required', 'open', 'acknowledged', 'closed')),
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  recommendation_id UUID REFERENCES public.recommendations(id) ON DELETE SET NULL,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, finding_key)
);

CREATE TABLE IF NOT EXISTS public.graph_quality_resolution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  finding_id UUID NOT NULL REFERENCES public.graph_quality_findings(id) ON DELETE CASCADE,
  finding_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'detected', 'assigned', 'task_created', 'recommendation_created',
    'alert_acknowledged', 'verification_requested', 'verified',
    'verification_failed', 'resolved', 'reopened'
  )),
  from_status TEXT,
  to_status TEXT,
  actor_user_id TEXT NOT NULL,
  reason TEXT,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS graph_quality_findings_scope_idx
  ON public.graph_quality_findings (company_id, scope_type, scope_id, status);
CREATE INDEX IF NOT EXISTS graph_quality_findings_priority_idx
  ON public.graph_quality_findings (company_id, status, severity, last_detected_at DESC);
CREATE INDEX IF NOT EXISTS graph_quality_events_finding_idx
  ON public.graph_quality_resolution_events (company_id, finding_key, occurred_at);

ALTER TABLE public.graph_quality_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_quality_resolution_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS graph_quality_findings_tenant_select ON public.graph_quality_findings;
DROP POLICY IF EXISTS graph_quality_findings_manager_write ON public.graph_quality_findings;
CREATE POLICY graph_quality_findings_tenant_select
  ON public.graph_quality_findings FOR SELECT TO authenticated
  USING (company_id = public.my_company_id());
CREATE POLICY graph_quality_findings_manager_write
  ON public.graph_quality_findings FOR ALL TO authenticated
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

DROP POLICY IF EXISTS graph_quality_events_tenant_select ON public.graph_quality_resolution_events;
DROP POLICY IF EXISTS graph_quality_events_manager_write ON public.graph_quality_resolution_events;
CREATE POLICY graph_quality_events_tenant_select
  ON public.graph_quality_resolution_events FOR SELECT TO authenticated
  USING (company_id = public.my_company_id());
CREATE POLICY graph_quality_events_manager_write
  ON public.graph_quality_resolution_events FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.my_company_id()
    AND COALESCE((SELECT role FROM public.user_profiles WHERE id = auth.uid()), 'user')
      IN ('manager', 'admin', 'super_admin')
  );

DROP TRIGGER IF EXISTS graph_quality_findings_set_updated_at ON public.graph_quality_findings;
CREATE TRIGGER graph_quality_findings_set_updated_at
  BEFORE UPDATE ON public.graph_quality_findings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
