-- =============================================================================
-- Newsconseen OS — Supabase Entity Expansion
-- Adds real Supabase tables for the 17 entities that were previously only
-- reachable via the Base44 fallback client (ncClient.entities.X). This lets
-- them be registered in src/api/supabaseEntityClient.js.
--
-- Scope: 16 new tables. `User` is intentionally skipped — it wraps the
-- existing user_profiles table (see 001_supabase_schema.sql) and does not
-- get a new table here.
--
-- Depends on 001_supabase_schema.sql having already run (uses its
-- set_updated_at() and my_company_id() helper functions + user_profiles
-- table directly — does not redefine them).
-- Run once against your Supabase project via the SQL Editor or psql.
-- =============================================================================

-- =============================================================================
-- USER — wraps the existing user_profiles table (no new table). Two gaps
-- found when checking real call sites (src/pages/UserManagement.jsx:501,512;
-- Tasks.jsx:677; Billing.jsx:102; FileManager.jsx:77; InviteUser.jsx:38 use
-- .filter/.list/.update — never .create, consistent with users being
-- provisioned via Supabase Auth invite, not a generic entity create):
--   1. .update(userId, { status }) needs a status column that doesn't exist yet.
--   2. .list()/.filter({ company_id }) needs admins to see every user in
--      their company, not just their own row (the existing up_select policy
--      from 001 only allows id = auth.uid()).
-- =============================================================================
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
  CHECK (status IN ('active','inactive','suspended'));

-- Additional SELECT policy (OR'd with the existing up_select "own row" policy):
-- admins/super_admins can list every user_profiles row in their own company.
CREATE POLICY up_admin_select_company ON user_profiles FOR SELECT TO authenticated
  USING (
    company_id = my_company_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles me
      WHERE me.id = auth.uid() AND me.role IN ('admin','super_admin')
    )
  );

-- Matching UPDATE policy so admins can actually call .update(userId, {...})
-- on other users in their company (status changes, company_id moves, etc.).
CREATE POLICY up_admin_update_company ON user_profiles FOR UPDATE TO authenticated
  USING (
    company_id = my_company_id()
    AND EXISTS (
      SELECT 1 FROM user_profiles me
      WHERE me.id = auth.uid() AND me.role IN ('admin','super_admin')
    )
  );

-- =============================================================================
-- ENTITY 1 — ATTENDANCE
-- Daily attendance log (students + staff). Confirmed usage:
-- src/pages/Attendance.jsx:58 (.filter by date/person_name/person_type),
-- src/pages/Attendance.jsx:74 (.create spreads formData + hours_worked + marked_by)
-- formData fields come from the Log Attendance form: date, person_name,
-- person_id, person_type, status, check_in_time, check_out_time, notes.
-- =============================================================================
CREATE TABLE IF NOT EXISTS attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE NOT NULL,
  person_id       UUID,
  person_name     TEXT NOT NULL,
  person_type     TEXT CHECK (person_type IN ('student','staff')),
  status          TEXT NOT NULL CHECK (status IN ('present','absent','late','excused','half_day')),
  check_in_time   TEXT,
  check_out_time  TEXT,
  hours_worked    NUMERIC(6,2),
  marked_by       TEXT,
  notes           TEXT,
  company_id      TEXT NOT NULL,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 2 — CHART_FOLDERS (Base44 entity: ChartFolder)
-- Folder tree for Reports & Charts. Confirmed usage: src/pages/Reports.jsx,
-- src/components/reports/FolderTree.jsx, src/components/reports/WelcomeSetup.jsx,
-- src/components/querybuilder/PinWidgetModal.jsx, src/pages/MarketIntelligence.jsx,
-- src/pages/MarketIntelligencePDF.jsx.
-- =============================================================================
CREATE TABLE IF NOT EXISTS chart_folders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  icon              TEXT,
  color             TEXT,
  parent_folder_id  UUID REFERENCES chart_folders(id) ON DELETE SET NULL,
  status            TEXT DEFAULT 'active' CHECK (status IN ('active','archived')),
  description       TEXT,
  shared_with_roles JSONB DEFAULT '[]'::jsonb,
  notes             TEXT,
  company_id        TEXT NOT NULL,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 3 — CONNECTOR_MAPPINGS (Base44 entity: ConnectorMapping)
-- Operator-confirmed taxonomy mappings for connector field values.
-- Confirmed usage: src/pages/Connectors.jsx:2657-2672 (saveMappingMutation
-- .filter + .update + .create).
-- =============================================================================
CREATE TABLE IF NOT EXISTS connector_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id    TEXT NOT NULL,
  field_name      TEXT NOT NULL,
  source_value    TEXT NOT NULL,
  taxonomy_value  TEXT,
  parent_value    TEXT,
  is_confirmed    BOOLEAN DEFAULT false,
  confirmed_by    TEXT,
  notes           TEXT,
  company_id      TEXT NOT NULL,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 4 — CONNECTOR_RUNS (Base44 entity: ConnectorRun)
-- Fallback run log when python_layer's connectors.run_log (Railway Postgres)
-- is unreachable. Confirmed read usage: src/pages/Connectors.jsx:2605
-- (.filter by company_id) + table render at lines 2989-3017 (run.connector_id,
-- run.status, run.records_extracted/created/updated/skipped/failed,
-- run.started_at, run.completed_at, run.unmapped_values). Schema mirrors
-- python_layer/connectors/routes.py connectors.run_log exactly so the two
-- run-log sources are interchangeable in the UI.
-- =============================================================================
CREATE TABLE IF NOT EXISTS connector_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id        TEXT NOT NULL,
  triggered_by        TEXT DEFAULT 'manual',
  status              TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN (
                        'triggered','running','completed','failed','skipped','needs_review'
                      )),
  records_extracted   INTEGER DEFAULT 0,
  records_created     INTEGER DEFAULT 0,
  records_updated     INTEGER DEFAULT 0,
  records_skipped     INTEGER DEFAULT 0,
  records_failed      INTEGER DEFAULT 0,
  error               TEXT,
  unmapped_values     JSONB DEFAULT '[]'::jsonb,
  started_at          TIMESTAMPTZ DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  notes               TEXT,
  company_id          TEXT NOT NULL,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 5 — DATA_MODELS (Base44 entity: DataModel)
-- Saved QueryBuilder schema snapshots. Confirmed usage:
-- src/components/querybuilder/AddToGraphModal.jsx:30, SaveDataModelModal.jsx:22
-- (.create with name, description, source_script, fields, sample_rows).
-- =============================================================================
CREATE TABLE IF NOT EXISTS data_models (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  source_script   TEXT,
  fields          JSONB DEFAULT '[]'::jsonb,
  sample_rows     JSONB DEFAULT '[]'::jsonb,
  notes           TEXT,
  company_id      TEXT NOT NULL,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 6 — FILE_RECORDS (Base44 entity: FileRecord)
-- File Manager files + folders. Confirmed usage: src/pages/FileManager.jsx
-- (.filter with is_trashed/scope/company_id/folder_id, .create with name,
-- file_type, file_url, size_bytes, mime_type, folder_id, scope, owner_email,
-- owner_name, company_id, is_trashed, .update on folder_id/is_trashed/name).
-- =============================================================================
CREATE TABLE IF NOT EXISTS file_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  file_type     TEXT DEFAULT 'other' CHECK (file_type IN (
                  'folder','report','export','attachment','dashboard','config','other'
                )),
  file_url      TEXT,
  size_bytes    BIGINT,
  mime_type     TEXT,
  folder_id     UUID REFERENCES file_records(id) ON DELETE CASCADE,
  scope         TEXT DEFAULT 'personal' CHECK (scope IN ('personal','enterprise','shared')),
  owner_email   TEXT,
  owner_name    TEXT,
  is_trashed    BOOLEAN DEFAULT false,
  notes         TEXT,
  company_id    TEXT NOT NULL,
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 7 — FILE_SHARES (Base44 entity: FileShare)
-- Per-file sharing grants. Confirmed usage: src/pages/FileManager.jsx:231
-- (.create with file_id, file_name, shared_by_email, shared_with_email,
-- shared_with_name, access_level, company_id).
-- =============================================================================
CREATE TABLE IF NOT EXISTS file_shares (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id             UUID REFERENCES file_records(id) ON DELETE CASCADE,
  file_name           TEXT,
  shared_by_email     TEXT,
  shared_with_email   TEXT NOT NULL,
  shared_with_name    TEXT,
  access_level        TEXT DEFAULT 'view_only' CHECK (access_level IN ('view_only','can_edit')),
  notes               TEXT,
  company_id          TEXT NOT NULL,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 8 — MEDICATION_PROFILES (Base44 entity: MedicationProfile)
-- Per-client medication administration records. Confirmed usage:
-- src/components/medadmin/MedProfileForm.jsx (EMPTY form state + handleSave
-- payload: client_id, client_name, medication_name, strength, dose_amount,
-- route, frequency, schedule_times, prescriber, indication, instructions,
-- start_date, end_date, status, discontinue_reason, pharmacy, rx_number,
-- refills_remaining, notes), also read in MedDashboard.jsx / MedProfileTab.jsx.
-- =============================================================================
CREATE TABLE IF NOT EXISTS medication_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID,
  client_name         TEXT,
  medication_name     TEXT NOT NULL,
  strength            TEXT,
  dose_amount         TEXT,
  route               TEXT DEFAULT 'oral' CHECK (route IN (
                        'oral','sublingual','topical','inhalation','injection',
                        'rectal','ophthalmic','otic','nasal','IV','other'
                      )),
  frequency           TEXT,
  schedule_times      JSONB DEFAULT '[]'::jsonb,
  prescriber          TEXT,
  indication          TEXT,
  instructions        TEXT,
  start_date          DATE,
  end_date            DATE,
  status              TEXT DEFAULT 'active' CHECK (status IN ('active','prn','on_hold','discontinued')),
  discontinue_reason  TEXT,
  pharmacy            TEXT,
  rx_number           TEXT,
  refills_remaining   NUMERIC,
  notes               TEXT,
  company_id          TEXT NOT NULL,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 9 — PENDING_INVITATIONS (Base44 entity: PendingInvitation)
-- NOT linked to user_profiles — the invitee has no auth.users row yet.
-- Confirmed usage: src/pages/UserManagement.jsx:315 (InviteForm .create with
-- email, company_id, role, invited_by). The actual invite send goes through
-- ncClient.users.inviteUser() (Supabase Auth invite), so no token/expiry
-- write site exists in the app today; status/token/expires_at are added as
-- the standard pending-invitation lifecycle columns for when that flow is
-- wired up, matching the "status" pattern used by the actual invite record.
-- =============================================================================
CREATE TABLE IF NOT EXISTS pending_invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  role          TEXT DEFAULT 'user',
  invited_by    TEXT,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','revoked')),
  token         TEXT,
  expires_at    TIMESTAMPTZ,
  accepted_at   TIMESTAMPTZ,
  notes         TEXT,
  company_id    TEXT NOT NULL,
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 10 — QUERY_DEFINITIONS (Base44 entity: QueryDefinition)
-- Saved QueryBuilder SQL queries. Confirmed usage:
-- src/components/querybuilder/SaveQueryModal.jsx:17 (.create with name,
-- description, script, data_source, output_schema, last_run_rows).
-- =============================================================================
CREATE TABLE IF NOT EXISTS query_definitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  script          TEXT,
  data_source     TEXT,
  output_schema   JSONB DEFAULT '[]'::jsonb,
  last_run_rows   INTEGER DEFAULT 0,
  notes           TEXT,
  company_id      TEXT NOT NULL,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 11 — REPORTS (Base44 entity: Report)
-- Confirmed usage across src/pages/Reports.jsx, ReportBuilder.jsx,
-- MarketIntelligence.jsx:902, MarketIntelligencePDF.jsx, WelcomeSetup.jsx,
-- OutputPanel.jsx: title, name (some call sites use "name" instead of
-- "title" — kept as an alias column like enterprises/relationships pattern
-- in 001), description, content, type, status, folder_id, sections (JSONB
-- block array), shared_with_roles, is_public, allow_comments, published_at.
-- =============================================================================
CREATE TABLE IF NOT EXISTS reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT,
  name                TEXT,               -- alias; some pages save "name" instead of "title"
  description         TEXT,
  content             TEXT,
  type                TEXT,
  status              TEXT DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  folder_id           UUID REFERENCES chart_folders(id) ON DELETE SET NULL,
  sections            JSONB DEFAULT '[]'::jsonb,
  shared_with_roles   JSONB DEFAULT '[]'::jsonb,
  is_public           BOOLEAN DEFAULT false,
  allow_comments      BOOLEAN DEFAULT false,
  published_at        TIMESTAMPTZ,
  notes               TEXT,
  company_id          TEXT NOT NULL,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 12 — REPORT_CHARTS (Base44 entity: ReportChart)
-- Confirmed usage — src/components/copilot/copilotchat.jsx:112 writes:
-- title, sql_query, tool_name, tool_params, chart_type, status, company_id,
-- description, table_snapshot, shared_with_roles, source. Additional fields
-- from src/components/reports/ChartBuilder.jsx:430-477 and
-- src/components/reports/WelcomeSetup.jsx DEFAULT_CHARTS: x_axis_key,
-- y_axis_key, color_scheme, folder_id, is_public, tags.
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_charts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  description         TEXT,
  chart_type          TEXT DEFAULT 'bar' CHECK (chart_type IN ('table','bar','pie','line','number','map')),
  sql_query           TEXT,
  tool_name           TEXT,
  tool_params         TEXT,               -- JSON-stringified tool params
  x_axis_key          TEXT,
  y_axis_key          TEXT,
  color_scheme        TEXT DEFAULT 'emerald',
  folder_id           UUID REFERENCES chart_folders(id) ON DELETE SET NULL,
  status              TEXT DEFAULT 'active' CHECK (status IN ('active','archived')),
  is_public           BOOLEAN DEFAULT false,
  shared_with_roles   JSONB DEFAULT '[]'::jsonb,
  tags                JSONB DEFAULT '[]'::jsonb,
  table_snapshot      TEXT,               -- JSON-stringified {headers, rows}
  source              TEXT,               -- entity_analytics | copilot | idjwi | welcome_setup_demo | ...
  notes               TEXT,
  company_id          TEXT NOT NULL,
  created_by          TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 13 — REPORT_COMMENTS (Base44 entity: ReportComment)
-- Confirmed usage: src/components/reports/ReportViewer.jsx:144-166
-- (.filter by report_id, .create with report_id, comment_text, commented_by,
-- commenter_name, company_id).
-- =============================================================================
CREATE TABLE IF NOT EXISTS report_comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         UUID REFERENCES reports(id) ON DELETE CASCADE,
  comment_text      TEXT NOT NULL,
  commented_by      TEXT,
  commenter_name    TEXT,
  notes             TEXT,
  company_id        TEXT NOT NULL,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 14 — ROLE_PERMISSIONS (Base44 entity: RolePermissions)
-- Modeling decision: a grant attached to a user, not a user record itself —
-- carries user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE.
-- Confirmed usage: src/pages/Permissions.jsx (DEFAULT_PERMS shape + saveMut
-- payload): target_role, allowed_pages, data_scope, layer1_master_data,
-- layer2_relationships, layer3_tasks, layer4_transactions, layer5_dashboards
-- (each a JSON object of can_* booleans), can_create, can_edit, can_delete,
-- can_post_transactions, can_trigger_transactions, set_by, company_id.
-- Read confirmed in src/components/shared/usePermissions.jsx:130
-- (.filter by company_id + target_role).
-- NOTE: super_admin currently saves company_id: null (a global default
-- applied across all tenants). This is the exact same shape as
-- master_data_options in 001_supabase_schema.sql (system defaults with
-- NULL company_id) — company_id is nullable here for the same reason, and
-- this table is excluded from the standard RLS policy loop below in favor
-- of the same IS NULL OR = my_company_id() pattern used for
-- master_data_options.
-- =============================================================================
CREATE TABLE IF NOT EXISTS role_permissions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  target_role                 TEXT NOT NULL CHECK (target_role IN ('admin','user')),
  allowed_pages                JSONB DEFAULT '[]'::jsonb,
  data_scope                  TEXT DEFAULT 'own' CHECK (data_scope IN ('own','team')),
  layer1_master_data          JSONB DEFAULT '{}'::jsonb,
  layer2_relationships        JSONB DEFAULT '{}'::jsonb,
  layer3_tasks                JSONB DEFAULT '{}'::jsonb,
  layer4_transactions         JSONB DEFAULT '{}'::jsonb,
  layer5_dashboards           JSONB DEFAULT '{}'::jsonb,
  can_create                  BOOLEAN DEFAULT false,
  can_edit                    BOOLEAN DEFAULT false,
  can_delete                  BOOLEAN DEFAULT false,
  can_post_transactions       BOOLEAN DEFAULT false,
  can_trigger_transactions    BOOLEAN DEFAULT false,
  set_by                      TEXT,
  notes                       TEXT,
  company_id                  TEXT,             -- NULL = global default (set by super_admin)
  created_by                  TEXT,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  updated_at                  TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 15 — SAVED_DASHBOARD_WIDGETS (Base44 entity: SavedDashboardWidget)
-- Confirmed usage: src/components/querybuilder/PinWidgetModal.jsx:31
-- (.create with title, sql, chart_type, created_by, company_id).
-- =============================================================================
CREATE TABLE IF NOT EXISTS saved_dashboard_widgets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  sql           TEXT,
  chart_type    TEXT DEFAULT 'bar',
  notes         TEXT,
  company_id    TEXT NOT NULL,
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ENTITY 16 — USER_APP_ACCESS (Base44 entity: UserAppAccess)
-- Modeling decision: a grant attached to a user, not a user record itself —
-- carries user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE.
-- Confirmed usage: src/pages/UserManagement.jsx:480-490 (saveMut payload:
-- user_email, user_name, allowed_apps, allowed_reports, company_id).
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_app_access (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  user_email        TEXT NOT NULL,
  user_name         TEXT,
  allowed_apps      JSONB DEFAULT '[]'::jsonb,
  allowed_reports   JSONB DEFAULT '[]'::jsonb,
  notes             TEXT,
  company_id        TEXT NOT NULL,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- ROW LEVEL SECURITY — ENABLE ON ALL NEW TABLES
-- =============================================================================
ALTER TABLE attendance              ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_folders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_mappings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_runs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_models             ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_records            ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_shares             ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_invitations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_definitions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_charts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_comments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_dashboard_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_app_access         ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES — STANDARD TENANT ISOLATION
-- Pattern: users see/write only their own company's rows.
-- python_layer ETL uses SERVICE_ROLE key → bypasses RLS automatically.
-- =============================================================================
DO $policies$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'attendance','chart_folders','connector_mappings','connector_runs',
    'data_models','file_records','file_shares','medication_profiles',
    'pending_invitations','query_definitions','reports','report_charts',
    'report_comments','saved_dashboard_widgets',
    'user_app_access'
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

-- role_permissions — mirrors master_data_options: system/global defaults
-- (company_id IS NULL, set by super_admin) are readable by everyone, but
-- only their own tenant's rows are writable by regular admins.
CREATE POLICY rp_select ON role_permissions FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = my_company_id());
CREATE POLICY rp_insert ON role_permissions FOR INSERT TO authenticated
  WITH CHECK (company_id = my_company_id());
CREATE POLICY rp_update ON role_permissions FOR UPDATE TO authenticated
  USING (company_id = my_company_id());
CREATE POLICY rp_delete ON role_permissions FOR DELETE TO authenticated
  USING (company_id = my_company_id());

-- =============================================================================
-- INDEXES — performance on company_id + common filter columns
-- =============================================================================
CREATE INDEX IF NOT EXISTS attendance_company_idx              ON attendance              (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_date_idx                 ON attendance              (company_id, date);
CREATE INDEX IF NOT EXISTS chart_folders_company_idx            ON chart_folders           (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chart_folders_parent_idx             ON chart_folders           (parent_folder_id);
CREATE INDEX IF NOT EXISTS connector_mappings_company_idx       ON connector_mappings      (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS connector_mappings_lookup_idx        ON connector_mappings      (company_id, connector_id, field_name);
CREATE INDEX IF NOT EXISTS connector_runs_company_idx           ON connector_runs          (company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS connector_runs_connector_idx         ON connector_runs          (company_id, connector_id);
CREATE INDEX IF NOT EXISTS data_models_company_idx              ON data_models             (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS data_models_name_idx                 ON data_models             (company_id, name);
CREATE INDEX IF NOT EXISTS file_records_company_idx             ON file_records            (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS file_records_folder_idx              ON file_records            (folder_id);
CREATE INDEX IF NOT EXISTS file_shares_company_idx              ON file_shares             (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS file_shares_file_idx                 ON file_shares             (file_id);
CREATE INDEX IF NOT EXISTS medication_profiles_company_idx      ON medication_profiles     (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS medication_profiles_client_idx       ON medication_profiles     (client_id);
CREATE INDEX IF NOT EXISTS pending_invitations_company_idx      ON pending_invitations     (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pending_invitations_email_idx        ON pending_invitations     (company_id, email);
CREATE INDEX IF NOT EXISTS query_definitions_company_idx        ON query_definitions       (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS query_definitions_name_idx           ON query_definitions       (company_id, name);
CREATE INDEX IF NOT EXISTS reports_company_idx                  ON reports                 (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_folder_idx                   ON reports                 (folder_id);
CREATE INDEX IF NOT EXISTS report_charts_company_idx            ON report_charts           (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS report_charts_folder_idx             ON report_charts           (folder_id);
CREATE INDEX IF NOT EXISTS report_comments_company_idx          ON report_comments         (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS report_comments_report_idx           ON report_comments         (report_id);
CREATE INDEX IF NOT EXISTS role_permissions_company_idx         ON role_permissions        (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS role_permissions_role_idx            ON role_permissions        (company_id, target_role);
CREATE INDEX IF NOT EXISTS saved_dashboard_widgets_company_idx  ON saved_dashboard_widgets (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS saved_dashboard_widgets_type_idx     ON saved_dashboard_widgets (company_id, chart_type);
CREATE INDEX IF NOT EXISTS user_app_access_company_idx          ON user_app_access         (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_app_access_user_idx             ON user_app_access         (user_id);

-- =============================================================================
-- UPDATED_AT TRIGGERS — applied to all new tables
-- =============================================================================
DO $triggers$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'attendance','chart_folders','connector_mappings','connector_runs',
    'data_models','file_records','file_shares','medication_profiles',
    'pending_invitations','query_definitions','reports','report_charts',
    'report_comments','role_permissions','saved_dashboard_widgets',
    'user_app_access'
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
--   1. Register each of the 16 new tables, plus User → user_profiles, in
--      src/api/supabaseEntityClient.js (entity name → table name mapping).
--   2. Re-run this file's RLS/trigger DO blocks only once — CREATE POLICY
--      is not IF NOT EXISTS safe; re-running requires dropping the old
--      policies/triggers first (same caveat as 001_supabase_schema.sql).
-- =============================================================================
