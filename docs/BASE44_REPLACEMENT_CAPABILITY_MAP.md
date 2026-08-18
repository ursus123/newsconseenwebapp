# Base44 replacement capability map

Every row must have one canonical owner. A replacement is incomplete if it
quietly calls Base44 underneath.

| Capability | Canonical replacement | Owner | Completion evidence |
|---|---|---|---|
| Authentication | Supabase Auth | Auth context and Supabase client | Session and redirect tests |
| User profile and tenant identity | `public.user_profiles` | Tenant-context repository | Identity-alignment and RLS tests |
| Entity reads and writes | Supabase repositories with RLS | Canonical entity registry | CRUD and tenant-isolation tests |
| Governed backend writes | Python tenant-context repositories | Python API | Permission and audit tests |
| File storage | Private Supabase Storage | Governed upload service | Signed-URL, tenant-path and policy tests |
| Document extraction | Python ingestion/document service | Python API | Provenance and failure-state tests |
| LLM invocation | Idjwi Core and optional tenant advisors | Idjwi router | Advisor-truth and audit tests |
| Email | Governed notification service | Python notifications | Delivery, tenant and audit tests |
| Connector configuration | Canonical Supabase tables | Connector repository | Configuration and secret-boundary tests |
| Import mappings | Supabase ontology and mapping registry | Mapping engine | Mapping and registry tests |
| ETL source | Canonical `public.*` tables | Python ETL | Source-zone contract tests |
| Analytics | `raw.*` and `analytics.*` | Python analytics | Lineage and freshness tests |
| Workflows and agents | Governed Python action endpoints | Workflow/action gateway | Approval and outcome tests |
| Alerts | Canonical alert configuration and audit records | Alert service | Role and delivery tests |
| Serverless functions | Python endpoints or database functions | API/database | Endpoint and migration tests |

## Non-negotiable boundaries

- The browser never receives a service-role key.
- Failure of Supabase or the Python API is reported as failure, not empty data.
- Unknown entities fail closed and cannot fall through to another data platform.
- Advisors cannot replace Idjwi, policy, evidence, approval or audit.
- Localhost and hosted environments use environment-specific URLs without
  hard-coded production routing.
