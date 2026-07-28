-- Company Graph mobile governed actions (Phase 8)

create table if not exists public.graph_field_reports (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  operational_unit_id uuid references public.operational_units(id) on delete set null,
  report_type text not null check (report_type in ('evidence', 'correction')),
  subject_node_id text not null,
  subject_type text not null,
  subject_record_id text not null,
  description text not null,
  evidence jsonb not null default '[]'::jsonb,
  proposed_correction jsonb not null default '{}'::jsonb,
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'accepted', 'rejected', 'resolved')),
  reported_by text not null,
  reported_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  resolution text
);

create index if not exists graph_field_reports_company_subject_idx
  on public.graph_field_reports(company_id, subject_node_id, reported_at desc);

create index if not exists graph_field_reports_company_status_idx
  on public.graph_field_reports(company_id, status, reported_at desc);

alter table public.graph_field_reports enable row level security;

drop policy if exists graph_field_reports_tenant_all on public.graph_field_reports;
create policy graph_field_reports_tenant_all
  on public.graph_field_reports
  for all
  to authenticated
  using (company_id = public.my_company_id())
  with check (company_id = public.my_company_id());

notify pgrst, 'reload schema';
