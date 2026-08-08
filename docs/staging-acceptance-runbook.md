# Staging acceptance runbook

This runbook applies only to the synthetic tenants `newsconseen-acceptance`
and `newsconseen-isolation`. Never use customer records for these scenarios.

## Automated foundation

Seed or refresh the deterministic fixtures:

```powershell
cd python_layer
..\.venv311\Scripts\python.exe acceptance_seed.py
```

Run authentication, role, tenant, export, session, and cache checks:

```powershell
cd python_layer
..\.venv311\Scripts\python.exe scripts\run_staging_acceptance.py
```

The result is written to `artifacts/staging-acceptance-auth-role.json`. Tokens,
service-role keys, and passwords are never persisted in the report.

## Required inbox evidence

Use a real inbox controlled by the tester. Record the message timestamp and a
redacted screenshot; never store a token-bearing email link in Git.

1. Invite a new acceptance-only email from the administrator interface.
2. Open the invitation and confirm it lands on
   `https://staging.news-con-seen.com/AcceptInvite`.
3. Register another acceptance-only address with email confirmation enabled.
4. Confirm that its link returns to an allowlisted staging route.
5. Request password recovery from staging sign-in.
6. Confirm the link opens `/ResetPassword`, set a temporary new password, sign
   in with it, and then rotate it again.
7. Attempt an authentication request with a non-allowlisted `redirect_to` URL.
   It must not send the user to that host.

## Role checks

- Administrator: configure scope, export, and govern assertions.
- Manager: investigate the operational unit and approve a permitted decision.
- Technician: inspect source availability, mapping coverage, and graph quality.
- Worker: view only assigned task context, capture evidence, and report a
  correction. Broad graph export must return an authorization error.
- Isolation worker: requests for `newsconseen-acceptance` must be rejected.

The acceptance report must contain backend HTTP results. A hidden frontend
button is not authorization evidence.

## Operational workflow

Perform these through `https://staging.news-con-seen.com` with browser Network
and Console panels recording redacted evidence:

1. Create and update an acceptance Enterprise, Person, Task, Transaction,
   Product, and Service. Confirm each appears in Idjwi and Company Graph after
   refresh without an ETL dependency.
2. Upload an acceptance-only file to the private `tenant-files` bucket. Confirm
   download and deletion work for its owner and fail for the isolation user.
3. Import a small CSV, approve its mapping, load it, and inspect canonical rows,
   provenance, ingestion run, and failed-row records.
4. Extract a synthetic document containing no private information. Confirm the
   proposed mapping before loading it.
5. Open Company Graph and inspect the seeded connected edge, disconnected
   records, proposed assertion, expired assertion, and rejected inference.
6. Explain a node and edge. Every material claim must cite visible evidence.
7. Confirm one proposal and reject a separate proposal. Verify graph refresh,
   audit history, assertion events, and Idjwi correction memory.
8. Ask Idjwi with advisors disabled. Then enable an actually configured tenant
   advisor and ask again. The response and audit metadata must agree on whether
   the advisor was consulted.
9. Request the seeded governed purchase-order action, approve it as the manager,
   and verify the resulting task/workflow and audit entry.
10. Trigger an acceptance alert, inspect delivery/audit state, resolve it, and
    confirm it no longer appears as open.

Use only clearly labelled acceptance fixtures and remove uploaded test files
after evidence is captured.
