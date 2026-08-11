-- Newsconseen governed Intelligence Repository (Intelligence Inbox Phase 4)
-- Apply after 004_operational_units_and_relationship_registry.sql.
-- raw.* and analytics.* remain source/derivation layers. Only records in these
-- canonical public tables may be presented as governed Intelligence Inbox work.

CREATE TABLE IF NOT EXISTS public.intelligence_deduplication_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  operational_unit_id UUID REFERENCES public.operational_units(id) ON DELETE SET NULL,
  correlation_key TEXT NOT NULL,
  condition_key TEXT NOT NULL,
  affected_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  affected_records JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_fingerprints JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_identities JSONB NOT NULL DEFAULT '[]'::jsonb,
  window_started_at TIMESTAMPTZ NOT NULL,
  window_ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','expired','superseded')),
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  source_count INTEGER NOT NULL DEFAULT 1 CHECK (source_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intelligence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  operational_unit_id UUID REFERENCES public.operational_units(id) ON DELETE SET NULL,
  deduplication_group_id UUID REFERENCES public.intelligence_deduplication_groups(id) ON DELETE SET NULL,
  item_key TEXT NOT NULL,
  contract_version TEXT NOT NULL DEFAULT 'intelligence-item.v1',
  intelligence_type TEXT NOT NULL CHECK (intelligence_type IN ('finding','risk','opportunity','prediction','recommendation')),
  subtype TEXT,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'detected',
  operational_impact TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  assertion_class TEXT NOT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'graph-safe' CHECK (sensitivity IN ('graph-safe','role-restricted','sensitive','prohibited')),
  confidence NUMERIC(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  uncertainty TEXT,
  contract_payload JSONB NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  source_count INTEGER NOT NULL DEFAULT 1 CHECK (source_count > 0),
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, item_key)
);

CREATE TABLE IF NOT EXISTS public.intelligence_evidence_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  intelligence_item_id UUID NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  label TEXT,
  source_identity TEXT,
  evidence_fingerprint TEXT NOT NULL,
  observed_at TIMESTAMPTZ,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  sensitivity TEXT NOT NULL DEFAULT 'graph-safe',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, intelligence_item_id, evidence_fingerprint)
);

CREATE TABLE IF NOT EXISTS public.intelligence_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id TEXT NOT NULL,
  intelligence_item_id UUID NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  assignee_type TEXT NOT NULL, assignee_id TEXT NOT NULL, assigned_by TEXT,
  status TEXT NOT NULL DEFAULT 'active', assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ, reason TEXT
);

CREATE TABLE IF NOT EXISTS public.intelligence_status_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id TEXT NOT NULL,
  intelligence_item_id UUID NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL, actor_id TEXT, reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.intelligence_decision_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id TEXT NOT NULL,
  intelligence_item_id UUID NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  decision_id UUID REFERENCES public.decisions(id) ON DELETE SET NULL,
  decision_summary TEXT, linked_by TEXT, linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intelligence_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id TEXT NOT NULL,
  intelligence_item_id UUID NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  requested_by TEXT, eligible_approver JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','cancelled','expired')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ,
  decided_by TEXT, rationale TEXT
);

CREATE TABLE IF NOT EXISTS public.intelligence_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id TEXT NOT NULL,
  intelligence_item_id UUID NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, target JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by TEXT, approval_request_id UUID REFERENCES public.intelligence_approval_requests(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'requested', execution_reference JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.intelligence_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id TEXT NOT NULL,
  intelligence_item_id UUID NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  action_id UUID REFERENCES public.intelligence_actions(id) ON DELETE SET NULL,
  outcome_type TEXT NOT NULL, summary TEXT NOT NULL, observed_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(), source_reference JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified_by TEXT, verified_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.intelligence_operator_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id TEXT NOT NULL,
  intelligence_item_id UUID NOT NULL REFERENCES public.intelligence_items(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('accurate','inaccurate','useful','not_useful','correction','comment')),
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb, actor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intelligence_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id TEXT NOT NULL,
  intelligence_item_id UUID REFERENCES public.intelligence_items(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, actor_id TEXT, request_id TEXT,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intelligence_items_tenant_status_idx ON public.intelligence_items(company_id, status, priority, updated_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_items_unit_idx ON public.intelligence_items(company_id, operational_unit_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_items_group_idx ON public.intelligence_items(deduplication_group_id);
CREATE INDEX IF NOT EXISTS intelligence_groups_open_idx ON public.intelligence_deduplication_groups(company_id, condition_key, window_ends_at DESC) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_groups_one_open_case_idx ON public.intelligence_deduplication_groups(company_id, correlation_key) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS intelligence_evidence_item_idx ON public.intelligence_evidence_links(company_id, intelligence_item_id);
CREATE INDEX IF NOT EXISTS intelligence_assignments_item_idx ON public.intelligence_assignments(company_id, intelligence_item_id, status);
CREATE INDEX IF NOT EXISTS intelligence_transitions_item_idx ON public.intelligence_status_transitions(company_id, intelligence_item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS intelligence_audit_item_idx ON public.intelligence_audit_events(company_id, intelligence_item_id, occurred_at DESC);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'intelligence_deduplication_groups','intelligence_items','intelligence_evidence_links',
    'intelligence_assignments','intelligence_status_transitions','intelligence_decision_links',
    'intelligence_approval_requests','intelligence_actions','intelligence_outcomes',
    'intelligence_operator_feedback','intelligence_audit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

-- Deliberately no authenticated/browser policies. Governed intelligence is read
-- and mutated through the Python policy boundary; the service role bypasses RLS.
-- This prevents direct REST reads from bypassing role, unit, and field redaction.

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'intelligence_deduplication_groups','intelligence_items','intelligence_assignments',
    'intelligence_status_transitions','intelligence_approval_requests','intelligence_actions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_%I_updated_at ON public.%I', table_name, table_name);
    IF table_name IN ('intelligence_deduplication_groups','intelligence_items') THEN
      EXECUTE format('CREATE TRIGGER set_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', table_name, table_name);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
