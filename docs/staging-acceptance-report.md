# Staging acceptance report

Environment: `https://staging.news-con-seen.com`

API: `https://staging-api.news-con-seen.com`

Last evidence update: 2026-08-05

Status: **not release-complete**

| Scenario | Actual | Evidence | Result / next action |
|---|---|---|---|
| Latest frontend | Vercel deployment `dpl_9mMdFDJKbLMkS2vyYE7SUzbimLP4` is ready and aliased to the staging domain | Vercel deployment output | Pass |
| Latest backend | Railway deployment `8731c12f-6ac8-4684-80f0-17da04ec88eb` serves FastAPI health JSON on the staging API domain | `/health` response | Pass |
| Browser security | HTTPS, certificates, required headers, CORS, mixed content, deployed-secret scan and legacy-platform bundle scan all pass | `artifacts/staging-security.json`: 9 passed, 0 failed | Pass |
| Administrator desktop | Sign-in, Company Graph render, keyboard focus and authenticated refresh complete | `artifacts/browser-acceptance/administrator-desktop.har` and screenshot | Pass with API authorization defects recorded below |
| Manager desktop | Sign-in, Company Graph render, keyboard focus and authenticated refresh complete | `artifacts/browser-acceptance/manager-desktop.har` and screenshot | Pass with API authorization defects recorded below |
| Mobile manager | Narrow and rotated layouts captured; authenticated refresh complete | `artifacts/browser-acceptance/manager-mobile-manager.har` and screenshots | Pass with API authorization defects recorded below |
| Technician desktop | Sign-in, Company Graph render, keyboard focus and authenticated refresh complete | `artifacts/browser-acceptance/technician-desktop.har` and screenshot | Pass with API authorization defects recorded below |
| Mobile worker | Narrow and rotated layouts captured; authenticated refresh complete | `artifacts/browser-acceptance/worker-mobile-worker.har` and screenshots | Pass with API authorization defects recorded below |
| Zero Base44 traffic | Five role/surface HAR files contain zero Base44 request matches | `artifacts/browser-acceptance/report.json` | Pass for exercised Company Graph walkthrough |
| Email invitation | Invitation sent to `anewsconseen+invite-20260803@gmail.com` with staging acceptance redirect | Supabase Auth response | Pending manual inbox link completion |
| Email confirmation | Confirmation requested for `anewsconseen+confirm-20260803@gmail.com` with staging redirect | Supabase Auth response | Pending manual inbox link completion |
| Password recovery | Recovery requested for `anewsconseen+recovery-20260803@gmail.com` with `/ResetPassword` redirect | Supabase Auth response | Pending manual inbox link and reset completion |
| Local restore drill | A custom dump restored into a separate disposable PostgreSQL container; enterprise, task and foreign-key checks passed | `artifacts/local-restore-drill/report.json` | Pass for local machinery only |
| Durable offsite backup | No paid S3-compatible bucket is configured | Backend health/configuration | Deferred; local drill does not replace durable backup |
| Backend monitoring | No Sentry DSN is configured | Railway configuration | Deferred until monitoring service is selected |
| Frontend monitoring | No Sentry DSN is configured | Vercel configuration | Deferred until monitoring service is selected |

## Acceptance defects retained

- `ACC-AUTH-001`: authenticated page sessions receive HTTP 401 responses from
  `/alerts/status`, `/agents/approvals/pending`, `/intelligence/inbox`, and
  `/company-graph/audit`. The page and graph render, but these capabilities are
  not accepted until their token/policy contract is corrected and retested.
- `ACC-AUTH-002`: intermittent aborted Supabase `/auth/v1/user` requests were
  observed during automated runs. Session refresh ultimately passed for all
  five role/surface scenarios, but the transient failure should be diagnosed.
- `ACC-EMAIL-001`: invitation, confirmation and recovery initiation are proven;
  delivery and redirect completion require evidence from the Gmail inbox.

## Release boundary

The current evidence establishes a secure staging deployment, a passing
Company Graph layout/session walkthrough, zero Base44 traffic in the captured
HARs, and working local dump/restore mechanics. It does **not** establish full
Phase 6 completion. Email link completion, the authorization defects above,
full workflow coverage, monitoring, and a durable offsite backup remain open.
