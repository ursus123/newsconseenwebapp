# Staging acceptance report

Environment: `https://staging.news-con-seen.com`

API: `https://staging-api.news-con-seen.com`

Date: 2026-08-02

Status: **not release-complete**

| Scenario | Account / role | Expected | Actual | Evidence | Result | Defect | Retest |
|---|---|---|---|---|---|---|---|
| Backend monitoring | System / staging | Sanitized backend event reaches Sentry with staging and request ID | `SENTRY_DSN` is absent in Railway | Railway variable-name inspection | Blocked | ACC-MON-001 | After DSN configuration and deployment |
| Frontend monitoring | Administrator / web | Sanitized frontend event reaches Sentry with staging and request ID | `VITE_SENTRY_DSN` and `VITE_APP_ENV` are absent in Vercel | Vercel environment listing | Blocked | ACC-MON-002 | After variables and deployment |
| Durable backup | System / scheduler | Full backup is uploaded and size-verified in S3-compatible storage | `BACKUP_S3_BUCKET` and credentials are absent | Railway variable-name inspection | Blocked | ACC-BKP-001 | After durable bucket configuration |
| Restore drill | System / scratch DB | Latest durable backup restores into a separate disposable database | `RESTORE_TEST_DATABASE_URL` is absent | Railway variable-name inspection | Blocked | ACC-BKP-002 | After scratch database configuration |
| Desktop administrator | Administrator | Full graph governance and accessible inspection | Backend role checks pass; real browser walkthrough pending | `staging-acceptance-auth-role.json`, a11y tests | Partial | ACC-UX-001 | Real desktop device/browser |
| Desktop manager | Manager | Investigation and permitted approval | Backend graph read passes; real browser approval walkthrough pending | `staging-acceptance-auth-role.json` | Partial | ACC-UX-002 | Real desktop device/browser |
| Mobile manager | Manager | Priority graph and permitted approvals at narrow/rotated sizes | Backend surface tests pass; real device pending | Company Graph tests | Partial | ACC-UX-003 | Real mobile device |
| Mobile worker | Worker | Assignment-only context, evidence capture and correction reporting | Worker receives bounded graph and broad export is rejected; real device pending | `staging-acceptance-auth-role.json` | Partial | ACC-UX-004 | Real mobile device |
| Keyboard and accessible equivalents | All roles | Core investigation works without canvas/pointer | Six automated accessibility tests pass | `npm run test:a11y` | Partial | ACC-UX-005 | Keyboard-only staging walkthrough |
| HTTPS certificates | Public | Valid certificates for web and API | Both valid; current certificate details recorded | `staging-security.json` | Pass | — | Complete |
| API security headers | Public | HSTS, CSP, nosniff, referrer and permissions policies | All required API headers present | `staging-security.json` | Pass | — | Complete |
| Frontend security headers | Public | CSP and frame protection included | Current deployment lacks CSP and `X-Frame-Options` | `staging-security.json` | Fail | ACC-SEC-001 | Redeploy updated `vercel.json` |
| Mixed content | Public | No HTTP subresources | No mixed-content references found | `staging-security.json` | Pass | — | Complete |
| Trusted CORS | Public | Staging web allowed; hostile origin rejected | Trusted preflight allowed, hostile origin denied | `staging-security.json` | Pass | — | Complete |
| Deployed server secrets | Public | No database or service-role credentials in assets | Validator added; final result required after redeployment | `staging-security.json` | Pending | ACC-SEC-002 | Redeploy and rerun |
| Zero legacy-platform traffic/content | All roles | Zero requests and zero bundle references | Current deployed bundle still contains a legacy-platform marker | `staging-security.json` | Fail | ACC-LEG-001 | Redeploy and capture four-role HARs |
| Four-role HAR proof | Administrator, manager, technician, worker | No legacy-platform request during major workflows | HAR files not yet captured | Manual staging runbook | Pending | ACC-LEG-002 | Capture after redeployment |

## Implemented remediation awaiting deployment

- Backend and frontend Sentry environment labeling and credential scrubbing.
- Tenant-safe Sentry context without email addresses or user payloads.
- Controlled, protected staging monitoring event hooks.
- Request identifiers attached to backend Sentry scope and responses.
- Durable backup requirement in staging/production.
- S3 upload size verification and retention pruning.
- Mandatory scratch-database identity check and explicit disposable confirmation.
- Scheduled durable backup execution when its required environment is configured.
- Frontend HSTS, CSP and frame protection.
- Repeatable live TLS, header, CORS, asset, mixed-content, secret and legacy-string validator.

The report must remain failed/blocked until external credentials are configured,
the new build is deployed, Sentry events are visibly received, a full restore is
verified, real-device checks are recorded, and four authenticated HAR files show
zero legacy-platform traffic.
