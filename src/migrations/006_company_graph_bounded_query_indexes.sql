-- Stage 10/11: tenant-first indexes for bounded graph reads.
-- Apply after 004 and 005. Index creation is idempotent.
create index if not exists relationships_company_person_idx on public.relationships(company_id, person_id);
create index if not exists relationships_company_enterprise_idx on public.relationships(company_id, enterprise_id);
create index if not exists relationships_company_secondary_person_idx on public.relationships(company_id, secondary_person_id);
create index if not exists relationships_company_secondary_enterprise_idx on public.relationships(company_id, secondary_enterprise_id);
create index if not exists relationships_company_item_idx on public.relationships(company_id, item_id);
create index if not exists relationships_company_service_idx on public.relationships(company_id, service_id);
create index if not exists tasks_company_enterprise_idx on public.tasks(company_id, enterprise_id);
create index if not exists tasks_company_person_idx on public.tasks(company_id, related_person_id);
create index if not exists transactions_company_enterprise_idx on public.transactions(company_id, enterprise_id);
create index if not exists transactions_company_person_idx on public.transactions(company_id, person_id);
create index if not exists transactions_company_product_idx on public.transactions(company_id, product_id);
create index if not exists products_company_enterprise_idx on public.products(company_id, enterprise_id);
create index if not exists services_company_enterprise_idx on public.services(company_id, enterprise_id);
create index if not exists graph_assertions_company_source_idx on public.graph_assertions(company_id, source_node_id);
create index if not exists graph_assertions_company_target_idx on public.graph_assertions(company_id, target_node_id);
create index if not exists graph_assertion_events_company_key_idx on public.graph_assertion_events(company_id, assertion_key, occurred_at desc);
