-- Ontology Relationship Closure, Stages E-H.
-- Preserve review metadata needed for explanation, filtering and audit.

ALTER TABLE public.graph_assertions
  ADD COLUMN IF NOT EXISTS candidate_confidence NUMERIC(5,4)
    CHECK (candidate_confidence IS NULL OR candidate_confidence BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS permitted_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_predicate TEXT;

CREATE INDEX IF NOT EXISTS graph_assertions_review_confidence_idx
  ON public.graph_assertions (company_id, assertion_state, candidate_confidence DESC);

NOTIFY pgrst, 'reload schema';
