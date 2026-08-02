-- Phase 2: tenant-scoped replacement file storage.
-- Apply in the same Supabase project used by VITE_SUPABASE_URL.

insert into storage.buckets (id, name, public, file_size_limit)
values ('tenant-files', 'tenant-files', false, 26214400)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

drop policy if exists tenant_files_select on storage.objects;
create policy tenant_files_select on storage.objects
for select to authenticated
using (
  bucket_id = 'tenant-files'
  and (storage.foldername(name))[1] = (
    select company_id from public.user_profiles where id = auth.uid()
  )
);

drop policy if exists tenant_files_insert on storage.objects;
create policy tenant_files_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'tenant-files'
  and (storage.foldername(name))[1] = (
    select company_id from public.user_profiles where id = auth.uid()
  )
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists tenant_files_update on storage.objects;
create policy tenant_files_update on storage.objects
for update to authenticated
using (
  bucket_id = 'tenant-files'
  and (storage.foldername(name))[1] = (
    select company_id from public.user_profiles where id = auth.uid()
  )
)
with check (
  bucket_id = 'tenant-files'
  and (storage.foldername(name))[1] = (
    select company_id from public.user_profiles where id = auth.uid()
  )
);

drop policy if exists tenant_files_delete on storage.objects;
create policy tenant_files_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'tenant-files'
  and (storage.foldername(name))[1] = (
    select company_id from public.user_profiles where id = auth.uid()
  )
);
