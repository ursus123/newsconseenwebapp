-- Patch: allow "open" as a valid task status (frontend uses it as the default)
-- Run this in Supabase SQL Editor if you already applied 001_supabase_schema.sql

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('open','pending','in_progress','completed','cancelled'));

-- Set default to "open" to match the frontend default
ALTER TABLE tasks ALTER COLUMN status SET DEFAULT 'open';
