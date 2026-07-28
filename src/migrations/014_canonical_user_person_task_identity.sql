-- Canonical authenticated user -> Person -> assigned Task identity.
-- Email remains a display/import compatibility field, never an authorization key.

create unique index if not exists persons_id_company_identity_idx
  on public.persons(id, company_id);

alter table public.user_profiles
  add column if not exists person_id uuid;

alter table public.tasks
  add column if not exists assigned_to_person_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_profiles_person_tenant_fk'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_person_tenant_fk
      foreign key (person_id, company_id)
      references public.persons(id, company_id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_assignee_person_tenant_fk'
  ) then
    alter table public.tasks
      add constraint tasks_assignee_person_tenant_fk
      foreign key (assigned_to_person_id, company_id)
      references public.persons(id, company_id)
      on delete set null;
  end if;
end $$;

create unique index if not exists user_profiles_company_person_identity_idx
  on public.user_profiles(company_id, person_id)
  where person_id is not null;

create index if not exists tasks_company_assignee_person_idx
  on public.tasks(company_id, assigned_to_person_id, status);

-- Bootstrap only unambiguous tenant-local identities. Ambiguous or missing
-- matches remain null and therefore fail closed until an operator resolves them.
with unique_people as (
  select company_id, lower(trim(email)) as normalized_email, min(id::text)::uuid as person_id
  from public.persons
  where nullif(trim(email), '') is not null
  group by company_id, lower(trim(email))
  having count(*) = 1
)
update public.user_profiles profile
set person_id = person.person_id
from unique_people person
where profile.person_id is null
  and nullif(trim(profile.email), '') is not null
  and profile.company_id = person.company_id
  and lower(trim(profile.email)) = person.normalized_email
  and not exists (
    select 1 from public.user_profiles other
    where other.company_id = profile.company_id
      and other.person_id = person.person_id
  );

with unique_people as (
  select company_id, lower(trim(email)) as normalized_email, min(id::text)::uuid as person_id
  from public.persons
  where nullif(trim(email), '') is not null
  group by company_id, lower(trim(email))
  having count(*) = 1
)
update public.tasks task
set assigned_to_person_id = person.person_id
from unique_people person
where task.assigned_to_person_id is null
  and nullif(trim(task.assigned_to_email), '') is not null
  and task.company_id = person.company_id
  and lower(trim(task.assigned_to_email)) = person.normalized_email;

notify pgrst, 'reload schema';
