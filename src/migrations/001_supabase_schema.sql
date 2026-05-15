-- =============================================================================
-- Newsconseen OS — Supabase Schema Migration
-- All 15 canonical entities + MasterDataOption + Service + 6 Intelligence entities
-- Run once against your Supabase project via the SQL Editor or psql
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- optional; needed for Territory boundaries

-- =============================================================================
-- Helper: auto-update updated_at on every mutation
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- AUTH BRIDGE
-- Maps Supabase auth.uid() → company_id + role.
-- Set company_id here after provisioning each user.
-- ETL python_layer uses SERVICE ROLE key and bypasses RLS entirely.
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT,
  full_name    TEXT,
  company_id   TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'user',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_email_idx ON user_profiles (email);

-- Convenience function — avoids a join in every RLS policy
CREATE OR REPLACE FUNCTION my_company_id() RETURNS TEXT
  LANGUAGE sql STABLE AS $$
    SELECT company_id FROM user_profiles WHERE id = auth.uid()
  $$;

-- =============================================================================
-- CORE ENTITY 1 — PERSONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS persons (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  preferred_name      TEXT,
  person_type         TEXT CHECK (person_type IN ('staff','client','contact','volunteer')),
  person_subtype      TEXT,
  primary_role        TEXT,
  engagement_model    TEXT CHECK (engagement_model IN (
                        'employed','contracted','freelance','volunteer',
                        'elected','appointed','enrolled','subscribed'
                      )),
  status              TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','on_leave')),
  availability_status TEXT DEFAULT 'available' CHECK (availability_status IN (
                        'available','busy','on_leave','unavailable'
                      )),
  start_date          DATE,
  end_date            DATE,
  phone               TEXT,
  email               TEXT,
  address             TEXT,
  city                TEXT,
  region              TEXT,
  country             TEXT,
  latitude            NUMERIC(10,7),
  longitude           NUMERIC(10,7),
  notes               TEXT,
  photo_url           TEXT,
  company_id          TEXT NOT NULL,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- CORE ENTITY 2 — ENTERPRISES
-- =============================================================================
CREATE TABLE IF NOT EXISTS enterprises (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_name      TEXT NOT NULL,
  enterprise_type      TEXT CHECK (enterprise_type IN (
                         'commercial','nonprofit','government',
                         'household','cooperative','trust'
                       )),
  enterprise_subtype   TEXT,
  sic_sector_id        INTEGER,
  sic_sector_name      TEXT,
  enterprise_tier      TEXT CHECK (enterprise_tier IN (
                         'headquarters','regional_office','branch','subsidiary',
                         'franchise','department','unit','project'
                       )),
  parent_enterprise_id UUID REFERENCES enterprises(id) ON DELETE SET NULL,
  status               TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','prospect','archived')),
  operating_status     TEXT DEFAULT 'open' CHECK (operating_status IN (
                         'open','closed','temporarily_closed','seasonal'
                       )),
  phone                TEXT,
  email                TEXT,
  website              TEXT,
  address              TEXT,
  city                 TEXT,
  region               TEXT,
  country              TEXT,
  latitude             NUMERIC(10,7),
  longitude            NUMERIC(10,7),
  brand_name           TEXT,
  brand_logo_url       TEXT,
  brand_primary_color  TEXT,
  brand_secondary_color TEXT,
  brand_accent_color   TEXT,
  brand_tagline        TEXT,
  brand_hide_newsconseen BOOLEAN DEFAULT false,
  brand_favicon_url    TEXT,
  brand_support_email  TEXT,
  notes                TEXT,
  company_id           TEXT NOT NULL,
  created_by           TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- CORE ENTITY 3 — PRODUCTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name   TEXT NOT NULL,
  item_name      TEXT,               -- alias; some code uses item_name
  item_type      TEXT CHECK (item_type IN (
                   'physical','living','digital','service_package','financial_instrument'
                 )),
  item_subtype   TEXT,
  item_class     TEXT CHECK (item_class IN (
                   'perishable','non_perishable','hazardous','controlled','regulated',
                   'unrestricted','serialized','non_serialized','consumable','reusable','returnable'
                 )),
  item_brand     TEXT,
  item_variant   TEXT,
  unit_of_measure TEXT,
  stock_quantity  NUMERIC DEFAULT 0,
  reorder_level   NUMERIC DEFAULT 0,
  expiry_date     DATE,
  price           NUMERIC(12,2),
  cost            NUMERIC(12,2),
  sku             TEXT,
  barcode         TEXT,
  description     TEXT,
  image_url       TEXT,
  enterprise_id   UUID,
  company_id      TEXT NOT NULL,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- CORE ENTITY 4 — TASKS
-- =============================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  description       TEXT,
  task_type         TEXT,
  status            TEXT DEFAULT 'open' CHECK (status IN (
                      'open','pending','in_progress','completed','cancelled'
                    )),
  priority          TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  due_date          DATE,
  scheduled_time    TEXT,
  completed_at      TIMESTAMPTZ,
  assigned_to_email TEXT,
  assigned_to_name  TEXT,
  enterprise_id     UUID,
  enterprise        TEXT,              -- enterprise_name denorm
  related_person    TEXT,              -- person_name denorm
  related_person_id UUID,
  outcome           TEXT,
  outcome_notes     TEXT,
  notes             TEXT,
  company_id        TEXT NOT NULL,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- CORE ENTITY 5 — TRANSACTIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number  TEXT,
  description       TEXT,
  transaction_type  TEXT,
  status            TEXT DEFAULT 'draft' CHECK (status IN (
                      'draft','posted','reconciled','voided','void'
                    )),
  payment_status    TEXT DEFAULT 'unpaid' CHECK (payment_status IN (
                      'unpaid','partial','paid','waived'
                    )),
  amount            NUMERIC(14,2),
  amount_paid       NUMERIC(14,2),
  net_amount        NUMERIC(14,2),
  currency          TEXT DEFAULT 'USD',
  date              DATE,
  due_date          DATE,
  enterprise_id     UUID,
  enterprise        TEXT,              -- enterprise_name denorm
  person_id         UUID,
  person_name       TEXT,
  product_id        UUID,
  product_name      TEXT,
  line_items        JSONB,
  notes             TEXT,
  company_id        TEXT NOT NULL,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- CORE ENTITY 6 — RELATIONSHIPS
-- =============================================================================
CREATE TABLE IF NOT EXISTS relationships (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_type      TEXT NOT NULL,         -- person_enterprise, person_person, etc.
  person_id              UUID,
  person_name            TEXT,                  -- person denorm
  person                 TEXT,                  -- alias used by some pages
  secondary_person_id    UUID,
  secondary_person       TEXT,
  enterprise_id          UUID,
  enterprise_name        TEXT,                  -- enterprise denorm
  enterprise             TEXT,                  -- alias
  secondary_enterprise_id UUID,
  secondary_enterprise   TEXT,
  item_id                UUID,
  item_name              TEXT,
  service_id             UUID,
  service_name           TEXT,
  role                   TEXT,
  status                 TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','ended')),
  start_date             DATE,
  end_date               DATE,
  notes                  TEXT,
  company_id             TEXT NOT NULL,
  created_by             TEXT,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- CORE ENTITY 7 — ADDRESSES
-- =============================================================================
CREATE TABLE IF NOT EXISTS addresses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address_line1   TEXT,
  address_line2   TEXT,
  city            TEXT,
  region          TEXT,
  country         TEXT,
  postal_code     TEXT,
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  address_type    TEXT,               -- primary, billing, delivery, etc.
  entity_ref_type TEXT,               -- person, enterprise, etc.
  entity_ref_id   UUID,
  is_primary      BOOLEAN DEFAULT false,
  notes           TEXT,
  company_id      TEXT NOT NULL,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- TAXONOMY — MASTER DATA OPTIONS
-- company_id IS NULL = system defaults visible to all tenants
-- =============================================================================
CREATE TABLE IF NOT EXISTS master_data_options (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       TEXT NOT NULL,    -- person, enterprise, item, task, etc.
  field_name        TEXT NOT NULL,    -- person_subtype, enterprise_subtype, task_type, etc.
  value             TEXT NOT NULL,
  label             TEXT NOT NULL,
  parent_value      TEXT,             -- filters by parent type e.g. person_type = 'staff'
  sector_id         INTEGER,
  sector_name       TEXT,
  sort_order        INTEGER DEFAULT 0,
  is_system_default BOOLEAN DEFAULT false,
  is_active         BOOLEAN DEFAULT true,
  company_id        TEXT,             -- NULL for system defaults
  created_by        TEXT,
  usage_count       INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- SERVICE ENTITY (parallel to Product but for offered services)
-- =============================================================================
CREATE TABLE IF NOT EXISTS services (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  service_name      TEXT,             -- alias
  description       TEXT,
  service_type      TEXT,
  service_subtype   TEXT,
  price             NUMERIC(12,2),
  unit_of_measure   TEXT,
  duration_minutes  INTEGER,
  is_active         BOOLEAN DEFAULT true,
  enterprise_id     UUID,
  company_id        TEXT NOT NULL,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- PHASE 9 — OPERATIONAL EXTENSION ENTITY 1: DOCUMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  file_name       TEXT,
  file_url        TEXT,
  document_type   TEXT,
  entity_ref_type TEXT,               -- person, enterprise, etc.
  entity_ref_id   UUID,
  issue_date      DATE,
  expiry_date     DATE,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','expired','archived','pending')),
  notes           TEXT,
  company_id      TEXT NOT NULL,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- PHASE 9 — OPERATIONAL EXTENSION ENTITY 2: SCHEDULES
-- =============================================================================
CREATE TABLE IF NOT EXISTS schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  title           TEXT,               -- alias
  schedule_type   TEXT,
  frequency       TEXT CHECK (frequency IN ('once','daily','weekly','monthly','quarterly','annual')),
  day_of_week     INTEGER,            -- 0=Sun … 6=Sat
  day_of_month    INTEGER,
  start_time      TEXT,
  end_time        TEXT,
  start_date      DATE,
  end_date        DATE,
  is_active       BOOLEAN DEFAULT true,
  entity_ref_type TEXT,
  entity_ref_id   UUID,
  notes           TEXT,
  company_id      TEXT NOT NULL,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- PHASE 9 — OPERATIONAL EXTENSION ENTITY 3: SIGNALS
-- =============================================================================
CREATE TABLE IF NOT EXISTS signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT,
  signal_type     TEXT NOT NULL,
  numeric_value   NUMERIC,
  text_value      TEXT,
  unit            TEXT,
  source          TEXT,
  entity_ref_type TEXT,
  entity_ref_id   UUID,
  is_anomaly      BOOLEAN DEFAULT false,
  recorded_at     TIMESTAMPTZ DEFAULT now(),
  notes           TEXT,
  company_id      TEXT NOT NULL,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- PHASE 9 — OPERATIONAL EXTENSION ENTITY 4: CHANNELS
-- =============================================================================
CREATE TABLE IF NOT EXISTS channels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  channel_name      TEXT,             -- alias
  channel_type      TEXT CHECK (channel_type IN ('whatsapp','email','sms','push','webhook')),
  target_identifier TEXT,             -- phone number, email, group ID, URL
  is_active         BOOLEAN DEFAULT true,
  notes             TEXT,
  company_id        TEXT NOT NULL,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- PHASE 9 — OPERATIONAL EXTENSION ENTITY 5: TERRITORIES
-- =============================================================================
CREATE TABLE IF NOT EXISTS territories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  territory_name      TEXT,           -- alias
  territory_type      TEXT,
  boundary_geojson    JSONB,
  parent_territory_id UUID REFERENCES territories(id) ON DELETE SET NULL,
  area_km2            NUMERIC(14,4),
  notes               TEXT,
  company_id          TEXT NOT NULL,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- PHASE 10 — DOMAIN-NATIVE ENTITY 1: ANIMALS
-- =============================================================================
CREATE TABLE IF NOT EXISTS animals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT,
  animal_type    TEXT,                -- livestock, poultry, aquatic, companion, lab
  species        TEXT,
  breed          TEXT,
  sex            TEXT CHECK (sex IN ('male','female','unknown')),
  date_of_birth  DATE,
  weight_kg      NUMERIC(8,3),
  status         TEXT DEFAULT 'active' CHECK (status IN ('active','sold','deceased','transferred')),
  enterprise_id  UUID,
  plot_id        UUID,
  product_id     UUID,                -- linked Product record if tracked as stock
  notes          TEXT,
  company_id     TEXT NOT NULL,
  created_by     TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- PHASE 10 — DOMAIN-NATIVE ENTITY 2: PLOTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS plots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  plot_type     TEXT,                 -- field, greenhouse, pond, paddock, orchard
  land_use      TEXT,
  crop_type     TEXT,
  area_ha       NUMERIC(10,4),
  latitude      NUMERIC(10,7),
  longitude     NUMERIC(10,7),
  status        TEXT DEFAULT 'active' CHECK (status IN ('active','fallow','inactive')),
  parent_plot_id UUID REFERENCES plots(id) ON DELETE SET NULL,
  enterprise_id  UUID,
  notes          TEXT,
  company_id     TEXT NOT NULL,
  created_by     TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- PHASE 10 — DOMAIN-NATIVE ENTITY 3: OBSERVATIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS observations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_type TEXT NOT NULL,
  subject_type     TEXT,              -- animal, plot, person, product, etc.
  subject_id       UUID,
  numeric_value    NUMERIC,
  text_value       TEXT,
  unit_of_measure  TEXT,
  is_anomaly       BOOLEAN DEFAULT false,
  observed_at      TIMESTAMPTZ DEFAULT now(),
  notes            TEXT,
  company_id       TEXT NOT NULL,
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- INTELLIGENCE LAYER — INSIGHT
-- =============================================================================
CREATE TABLE IF NOT EXISTS insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  body            TEXT,
  insight_type    TEXT,
  severity        TEXT DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  entity_ref_type TEXT,
  entity_ref_id   UUID,
  is_actioned     BOOLEAN DEFAULT false,
  is_dismissed    BOOLEAN DEFAULT false,
  actioned_at     TIMESTAMPTZ,
  actioned_by     TEXT,
  company_id      TEXT NOT NULL,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- INTELLIGENCE LAYER — RECOMMENDATION
-- =============================================================================
CREATE TABLE IF NOT EXISTS recommendations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  body                TEXT,
  recommendation_type TEXT,
  priority            TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  entity_ref_type     TEXT,
  entity_ref_id       UUID,
  is_actioned         BOOLEAN DEFAULT false,
  is_dismissed        BOOLEAN DEFAULT false,
  action_taken        TEXT,
  actioned_at         TIMESTAMPTZ,
  actioned_by         TEXT,
  company_id          TEXT NOT NULL,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- INTELLIGENCE LAYER — DECISION
-- =============================================================================
CREATE TABLE IF NOT EXISTS decisions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision        TEXT NOT NULL,
  context         TEXT,
  decision_type   TEXT,
  outcome         TEXT,
  outcome_notes   TEXT,
  decided_by      TEXT,
  decided_at      TIMESTAMPTZ,
  entity_ref_type TEXT,
  entity_ref_id   UUID,
  company_id      TEXT NOT NULL,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- INTELLIGENCE LAYER — RISK
-- =============================================================================
CREATE TABLE IF NOT EXISTS risks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  description      TEXT,
  risk_type        TEXT,
  severity         TEXT DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  likelihood       TEXT CHECK (likelihood IN ('low','medium','high')),
  impact           TEXT CHECK (impact IN ('low','medium','high')),
  status           TEXT DEFAULT 'open' CHECK (status IN ('open','mitigated','closed','accepted')),
  mitigation_notes TEXT,
  entity_ref_type  TEXT,
  entity_ref_id    UUID,
  company_id       TEXT NOT NULL,
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- INTELLIGENCE LAYER — OPPORTUNITY
-- =============================================================================
CREATE TABLE IF NOT EXISTS opportunities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  description      TEXT,
  opportunity_type TEXT,
  estimated_value  NUMERIC(14,2),
  confidence       NUMERIC(5,2),      -- 0-100 %
  status           TEXT DEFAULT 'open' CHECK (status IN ('open','pursuing','won','lost','deferred')),
  entity_ref_type  TEXT,
  entity_ref_id    UUID,
  company_id       TEXT NOT NULL,
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- INTELLIGENCE LAYER — METRIC DEFINITION
-- =============================================================================
CREATE TABLE IF NOT EXISTS metric_definitions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  description         TEXT,
  metric_type         TEXT,
  unit                TEXT,
  formula             TEXT,
  entity_type         TEXT,           -- which entity this metric applies to
  threshold_warning   NUMERIC,
  threshold_critical  NUMERIC,
  is_active           BOOLEAN DEFAULT true,
  company_id          TEXT NOT NULL,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ROW LEVEL SECURITY — ENABLE ON ALL TABLES
-- =============================================================================
ALTER TABLE user_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons               ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprises           ENABLE ROW LEVEL SECURITY;
ALTER TABLE products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships         ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_data_options   ENABLE ROW LEVEL SECURITY;
ALTER TABLE services              ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels              ENABLE ROW LEVEL SECURITY;
ALTER TABLE territories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE animals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE plots                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights              ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE risks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_definitions    ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES — STANDARD TENANT ISOLATION
-- Pattern: users see/write only their own company's rows.
-- python_layer ETL uses SERVICE_ROLE key → bypasses RLS automatically.
-- user_profiles: each user only sees/edits their own row.
-- master_data_options: system defaults (company_id IS NULL) visible to all.
-- =============================================================================

-- user_profiles — own row only
CREATE POLICY up_select ON user_profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY up_insert ON user_profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY up_update ON user_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- Macro for all standard entity tables (company_id = my_company_id())
DO $policies$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'persons','enterprises','products','tasks','transactions',
    'relationships','addresses','services',
    'documents','schedules','signals','channels','territories',
    'animals','plots','observations',
    'insights','recommendations','decisions','risks','opportunities',
    'metric_definitions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated
         USING (company_id = my_company_id())',
      t || '_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO authenticated
         WITH CHECK (company_id = my_company_id())',
      t || '_insert', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO authenticated
         USING (company_id = my_company_id())',
      t || '_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO authenticated
         USING (company_id = my_company_id())',
      t || '_delete', t
    );
  END LOOP;
END;
$policies$;

-- master_data_options — system defaults (NULL company_id) + own tenant rows
CREATE POLICY mdo_select ON master_data_options FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = my_company_id());
CREATE POLICY mdo_insert ON master_data_options FOR INSERT TO authenticated
  WITH CHECK (company_id = my_company_id());
CREATE POLICY mdo_update ON master_data_options FOR UPDATE TO authenticated
  USING (company_id = my_company_id());
CREATE POLICY mdo_delete ON master_data_options FOR DELETE TO authenticated
  USING (company_id = my_company_id() AND is_system_default = false);

-- =============================================================================
-- INDEXES — performance on company_id + common filter columns
-- =============================================================================
CREATE INDEX IF NOT EXISTS persons_company_idx         ON persons          (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS persons_type_idx            ON persons          (company_id, person_type);
CREATE INDEX IF NOT EXISTS enterprises_company_idx     ON enterprises      (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS enterprises_type_idx        ON enterprises      (company_id, enterprise_type);
CREATE INDEX IF NOT EXISTS products_company_idx        ON products         (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS products_type_idx           ON products         (company_id, item_type);
CREATE INDEX IF NOT EXISTS tasks_company_idx           ON tasks            (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tasks_status_idx            ON tasks            (company_id, status);
CREATE INDEX IF NOT EXISTS tasks_assignee_idx          ON tasks            (company_id, assigned_to_email);
CREATE INDEX IF NOT EXISTS transactions_company_idx    ON transactions     (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_type_idx       ON transactions     (company_id, transaction_type);
CREATE INDEX IF NOT EXISTS transactions_status_idx     ON transactions     (company_id, status);
CREATE INDEX IF NOT EXISTS relationships_company_idx   ON relationships    (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS relationships_type_idx      ON relationships    (company_id, relationship_type);
CREATE INDEX IF NOT EXISTS addresses_company_idx       ON addresses        (company_id);
CREATE INDEX IF NOT EXISTS mdo_lookup_idx              ON master_data_options (entity_type, field_name, parent_value);
CREATE INDEX IF NOT EXISTS mdo_company_idx             ON master_data_options (company_id);
CREATE INDEX IF NOT EXISTS services_company_idx        ON services         (company_id);
CREATE INDEX IF NOT EXISTS documents_company_idx       ON documents        (company_id, expiry_date);
CREATE INDEX IF NOT EXISTS schedules_company_idx       ON schedules        (company_id);
CREATE INDEX IF NOT EXISTS signals_company_idx         ON signals          (company_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS channels_company_idx        ON channels         (company_id);
CREATE INDEX IF NOT EXISTS territories_company_idx     ON territories      (company_id);
CREATE INDEX IF NOT EXISTS animals_company_idx         ON animals          (company_id);
CREATE INDEX IF NOT EXISTS plots_company_idx           ON plots            (company_id);
CREATE INDEX IF NOT EXISTS observations_company_idx    ON observations     (company_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS insights_company_idx        ON insights         (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recommendations_company_idx ON recommendations  (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS decisions_company_idx       ON decisions        (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS risks_company_idx           ON risks            (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS opportunities_company_idx   ON opportunities    (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS metric_defs_company_idx     ON metric_definitions (company_id);

-- =============================================================================
-- UPDATED_AT TRIGGERS — applied to all entity tables
-- =============================================================================
DO $triggers$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'user_profiles','persons','enterprises','products','tasks','transactions',
    'relationships','addresses','master_data_options','services',
    'documents','schedules','signals','channels','territories',
    'animals','plots','observations',
    'insights','recommendations','decisions','risks','opportunities',
    'metric_definitions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER %I
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      'set_' || t || '_updated_at', t
    );
  END LOOP;
END;
$triggers$;

-- =============================================================================
-- DONE
-- Next steps:
--   1. In Supabase Dashboard → Authentication → Users: set app_metadata.company_id
--      on every user you provision (or do it via the Admin API / edge function).
--   2. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local
--   3. Add SUPABASE_SERVICE_ROLE_KEY to python_layer Railway env for ETL writes
--   4. Set VITE_DATA_LAYER=supabase in .env.local to activate the Supabase path
-- =============================================================================
