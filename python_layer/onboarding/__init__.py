"""
onboarding/
-----------
Tenant provisioning automation for Newsconseen.

Handles self-serve setup for new operators:
  - Seed industry-specific MasterDataOption taxonomy templates (returned to frontend)
  - Auto-create default Workflows per enterprise_type cluster
  - Compute initial AI readiness baseline score
  - Log provisioning events to analytics.onboarding_log

Exposed via:
  POST /onboarding/provision        — called once from the wizard after Enterprise creation
  GET  /onboarding/status/{company_id} — check if provisioning has run
  GET  /onboarding/industries       — list all industry clusters with recommendations
"""