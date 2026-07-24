-- Governed, tenant-isolated Company Graph saved views (Stage 21).

CREATE TABLE IF NOT EXISTS public.graph_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'private'
    CHECK (audience IN ('private', 'team', 'operational_unit', 'organization')),
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  layout TEXT NOT NULL DEFAULT 'operational_focus',
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  validation_state TEXT NOT NULL DEFAULT 'valid'
    CHECK (validation_state IN ('valid', 'invalid', 'needs_review')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, owner_user_id, name)
);

CREATE INDEX IF NOT EXISTS graph_saved_views_company_owner_idx
  ON public.graph_saved_views (company_id, owner_user_id);
CREATE INDEX IF NOT EXISTS graph_saved_views_company_audience_idx
  ON public.graph_saved_views (company_id, audience);

ALTER TABLE public.graph_saved_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS graph_saved_views_tenant_all ON public.graph_saved_views;
DROP POLICY IF EXISTS graph_saved_views_select ON public.graph_saved_views;
DROP POLICY IF EXISTS graph_saved_views_insert ON public.graph_saved_views;
DROP POLICY IF EXISTS graph_saved_views_update ON public.graph_saved_views;
DROP POLICY IF EXISTS graph_saved_views_delete ON public.graph_saved_views;

CREATE POLICY graph_saved_views_select
  ON public.graph_saved_views FOR SELECT TO authenticated
  USING (
    company_id = public.my_company_id()
    AND (
      owner_user_id = auth.uid()::text
      OR (
        audience = 'organization'
        AND (
          permissions = '[]'::jsonb
          OR permissions ? COALESCE(
            (SELECT role FROM public.user_profiles WHERE id = auth.uid()), 'user'
          )
        )
      )
      OR (
        audience IN ('team', 'operational_unit')
        AND EXISTS (
          SELECT 1
          FROM public.operational_unit_memberships membership
          WHERE membership.company_id = graph_saved_views.company_id
            AND membership.user_id = auth.uid()
            AND membership.status = 'active'
            AND membership.operational_unit_id::text = graph_saved_views.scope->>'id'
        )
        AND (
          permissions = '[]'::jsonb
          OR permissions ? COALESCE(
            (SELECT role FROM public.user_profiles WHERE id = auth.uid()), 'user'
          )
        )
      )
    )
  );

-- Direct authenticated writes cannot forge ownership. Shared views require a
-- manager/admin profile; the Python gateway still performs the richer graph
-- permission, scope and validation checks. Service-role writes bypass RLS.
CREATE POLICY graph_saved_views_insert
  ON public.graph_saved_views FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.my_company_id()
    AND owner_user_id = auth.uid()::text
    AND (
      audience = 'private'
      OR COALESCE(
        (SELECT role FROM public.user_profiles WHERE id = auth.uid()), 'user'
      ) IN ('manager', 'admin', 'super_admin')
    )
  );

CREATE POLICY graph_saved_views_update
  ON public.graph_saved_views FOR UPDATE TO authenticated
  USING (
    company_id = public.my_company_id()
    AND owner_user_id = auth.uid()::text
  )
  WITH CHECK (
    company_id = public.my_company_id()
    AND owner_user_id = auth.uid()::text
    AND (
      audience = 'private'
      OR COALESCE(
        (SELECT role FROM public.user_profiles WHERE id = auth.uid()), 'user'
      ) IN ('manager', 'admin', 'super_admin')
    )
  );

CREATE POLICY graph_saved_views_delete
  ON public.graph_saved_views FOR DELETE TO authenticated
  USING (
    company_id = public.my_company_id()
    AND owner_user_id = auth.uid()::text
  );

DROP TRIGGER IF EXISTS graph_saved_views_set_updated_at ON public.graph_saved_views;
CREATE TRIGGER graph_saved_views_set_updated_at
  BEFORE UPDATE ON public.graph_saved_views
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
