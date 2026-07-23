-- Newsconseen OS — first-class operational units (Stage 6)
-- Apply after 001_supabase_schema.sql and 003_supabase_entity_expansion.sql.

CREATE TABLE IF NOT EXISTS operational_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  unit_type TEXT NOT NULL CHECK (unit_type IN (
    'department','branch','warehouse','pharmacy','field_team','project',
    'temporary_operation','operational_unit'
  )),
  parent_unit_id UUID REFERENCES operational_units(id) ON DELETE SET NULL,
  manager_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  manager_person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
  jurisdiction JSONB NOT NULL DEFAULT '{}'::jsonb,
  permission_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, unit_name)
);

CREATE TABLE IF NOT EXISTS operational_unit_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  operational_unit_id UUID NOT NULL REFERENCES operational_units(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id UUID REFERENCES persons(id) ON DELETE CASCADE,
  membership_role TEXT NOT NULL DEFAULT 'member' CHECK (membership_role IN ('member','lead','manager','administrator')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','ended')),
  valid_from TIMESTAMPTZ DEFAULT now(),
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR person_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS operational_unit_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  source_unit_id UUID NOT NULL REFERENCES operational_units(id) ON DELETE CASCADE,
  target_unit_id UUID NOT NULL REFERENCES operational_units(id) ON DELETE CASCADE,
  predicate TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source_unit_id <> target_unit_id),
  UNIQUE (company_id, source_unit_id, predicate, target_unit_id)
);

-- Records are owned by an operational unit independently of enterprise links.
DO $ownership$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'persons','products','services','tasks','transactions','relationships',
    'addresses','documents','schedules','signals','channels','territories',
    'animals','plots','observations','insights','recommendations','decisions',
    'risks','opportunities'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS operational_unit_id UUID REFERENCES operational_units(id) ON DELETE SET NULL', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (company_id, operational_unit_id)', table_name || '_unit_idx', table_name);
  END LOOP;
END;
$ownership$;

CREATE INDEX IF NOT EXISTS operational_units_company_idx ON operational_units(company_id, status);
CREATE INDEX IF NOT EXISTS operational_units_parent_idx ON operational_units(company_id, parent_unit_id);
CREATE INDEX IF NOT EXISTS unit_memberships_user_idx ON operational_unit_memberships(company_id, user_id, status);
CREATE INDEX IF NOT EXISTS unit_memberships_person_idx ON operational_unit_memberships(company_id, person_id, status);
CREATE INDEX IF NOT EXISTS unit_relationships_source_idx ON operational_unit_relationships(company_id, source_unit_id);
CREATE INDEX IF NOT EXISTS unit_relationships_target_idx ON operational_unit_relationships(company_id, target_unit_id);

ALTER TABLE operational_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_unit_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_unit_relationships ENABLE ROW LEVEL SECURITY;

DO $policies$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['operational_units','operational_unit_memberships','operational_unit_relationships'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_tenant_all', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (company_id = my_company_id()) WITH CHECK (company_id = my_company_id())',
      table_name || '_tenant_all', table_name
    );
  END LOOP;
END;
$policies$;

DROP TRIGGER IF EXISTS set_operational_units_updated_at ON operational_units;
CREATE TRIGGER set_operational_units_updated_at BEFORE UPDATE ON operational_units
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_unit_memberships_updated_at ON operational_unit_memberships;
CREATE TRIGGER set_unit_memberships_updated_at BEFORE UPDATE ON operational_unit_memberships
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_unit_relationships_updated_at ON operational_unit_relationships;
CREATE TRIGGER set_unit_relationships_updated_at BEFORE UPDATE ON operational_unit_relationships
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
