-- Canonical runtime replacements for notification and network records.

CREATE TABLE IF NOT EXISTS public.alert_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  config_key TEXT NOT NULL,
  config_value JSONB NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, config_key)
);

CREATE TABLE IF NOT EXISTS public.alert_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  enterprise_id TEXT,
  severity TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_to JSONB NOT NULL DEFAULT '[]'::jsonb,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery_status TEXT NOT NULL DEFAULT 'sent',
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.network_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  network_company_id TEXT NOT NULL,
  child_company_id TEXT NOT NULL,
  child_name TEXT,
  child_enterprise_type TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (network_company_id, child_company_id)
);

CREATE TABLE IF NOT EXISTS public.network_join_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  network_company_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $rls$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'alert_configurations', 'alert_delivery_log',
    'network_memberships', 'network_join_codes'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_tenant_all', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (company_id = public.my_company_id()) WITH CHECK (company_id = public.my_company_id())',
      table_name || '_tenant_all', table_name
    );
  END LOOP;
END $rls$;

CREATE INDEX IF NOT EXISTS alert_delivery_log_tenant_recent_idx
  ON public.alert_delivery_log (company_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS network_memberships_network_idx
  ON public.network_memberships (network_company_id, is_active);

DROP TRIGGER IF EXISTS alert_configurations_set_updated_at ON public.alert_configurations;
CREATE TRIGGER alert_configurations_set_updated_at
  BEFORE UPDATE ON public.alert_configurations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS network_memberships_set_updated_at ON public.network_memberships;
CREATE TRIGGER network_memberships_set_updated_at
  BEFORE UPDATE ON public.network_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
