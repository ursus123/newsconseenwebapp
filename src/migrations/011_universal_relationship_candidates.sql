-- Ontology Relationship Closure, Stages A-D.
-- Extend graph assertions into the persistent universal relationship-review queue.

ALTER TABLE public.graph_assertions
  ADD COLUMN IF NOT EXISTS carrier_type TEXT,
  ADD COLUMN IF NOT EXISTS carrier_record_id TEXT,
  ADD COLUMN IF NOT EXISTS matching_method TEXT,
  ADD COLUMN IF NOT EXISTS candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  ADD COLUMN IF NOT EXISTS proposed_operation TEXT,
  ADD COLUMN IF NOT EXISTS proposed_patch JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bulk_group_key TEXT,
  ADD COLUMN IF NOT EXISTS evidence_hash TEXT,
  ADD COLUMN IF NOT EXISTS business_consequence TEXT,
  ADD COLUMN IF NOT EXISTS last_evaluated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS graph_assertions_review_queue_idx
  ON public.graph_assertions (company_id, assertion_state, matching_method, last_evaluated_at DESC);
CREATE INDEX IF NOT EXISTS graph_assertions_carrier_idx
  ON public.graph_assertions (company_id, carrier_type, carrier_record_id);
CREATE INDEX IF NOT EXISTS graph_assertions_bulk_group_idx
  ON public.graph_assertions (company_id, bulk_group_key)
  WHERE bulk_group_key IS NOT NULL AND assertion_state = 'proposed';
CREATE INDEX IF NOT EXISTS graph_assertions_evidence_hash_idx
  ON public.graph_assertions (company_id, evidence_hash);

COMMENT ON COLUMN public.graph_assertions.proposed_patch IS
  'Governed preview only. It must never be executed without current authorization, evidence revalidation, and an approved mutation recipe.';
COMMENT ON COLUMN public.graph_assertions.evidence_hash IS
  'Stable hash used to suppress unchanged rejected proposals and reopen only when evidence changes.';

NOTIFY pgrst, 'reload schema';
