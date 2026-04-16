"""
admin/
------
Platform-level multi-tenant administration API.

Used exclusively by Newsconseen super_admin users — not visible to
any individual operator. Allows Newsconseen staff to:

  - List all tenants (companies) with health signals
  - Manually provision a new tenant (same as /onboarding/provision but
    invokable without the self-serve wizard)
  - Suspend / reactivate a tenant
  - Trigger ETL for a specific company
  - View per-tenant analytics health (last ETL, enrichment coverage, AI score)
  - See user counts and subscription status per tenant

All endpoints require the x-admin-secret header (ADMIN_SECRET env var).
"""
