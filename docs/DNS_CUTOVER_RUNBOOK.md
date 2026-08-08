# Newsconseen DNS freeze and cutover runbook

**Domain:** `news-con-seen.com`
**DNS provider:** IONOS
**Phase:** 1 - DNS frozen
**Verified:** 2026-08-02

## Protected current records

The following records keep the existing online site available while the new
Newsconseen deployment is built and tested:

| Type | Host | Current value | Public TTL | Phase 1 rule |
|---|---|---|---:|---|
| A | `@` | `216.24.57.1` | 300 | Do not edit or delete |
| CNAME | `www` | `base44.onrender.com` | 300 | Do not edit or delete |
| MX | `@` | `mx00.ionos.com` | 3600 | Never change during app cutover |
| MX | `@` | `mx01.ionos.com` | 3600 | Never change during app cutover |

IONOS mail records, including SPF, DKIM, DMARC and autodiscovery, are outside
the application cutover and must remain unchanged.

## Freeze rule

No person or deployment process may change the root or `www` records until all
of the following evidence exists:

- the replacement frontend is deployed on a temporary staging hostname;
- the replacement Python API is healthy on a temporary staging hostname;
- Supabase Auth permits localhost, staging and intended production redirects;
- automated security, identity, accessibility and graph suites pass;
- administrator, manager, technician and worker acceptance passes online;
- uploads, extraction, imports, alerts, workflows and Idjwi operate without an
  active Base44 network request;
- HTTPS is provisioned for every destination hostname;
- monitoring and a verified database recovery path are available;
- the old values above are copied into the cutover evidence for rollback.

## Permitted work during the freeze

- Modify and test localhost code.
- Remove Base44 dependencies from the replacement codebase.
- Deploy temporary `staging` and `staging-api` services.
- Add new staging DNS records without changing `@`, `www` or mail.
- Add redirect URLs in Supabase Auth without deleting currently working URLs.
- Run online acceptance against the staging hostnames.

## Prohibited work during the freeze

- Point `@` or `www` at a partially configured deployment.
- Delete the existing Base44 destination before acceptance completes.
- Reuse a mail record for application routing.
- Hard-code a trial domain into application business logic.
- Call a DNS change successful before independent public resolution and HTTPS
  checks pass.

## Cutover authority

The project owner must explicitly approve the final cutover after reviewing the
release report. DNS edits are performed in IONOS, one record at a time, with the
previous value recorded. A critical authentication, API or HTTPS failure triggers
rollback to the protected values above.

## Phase 1 completion test

Phase 1 is complete when public DNS resolves to the protected values, those
values are recorded in source control, the mail boundary is documented and no
DNS mutation has been performed.
