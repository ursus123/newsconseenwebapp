# Company Graph verification and release

**Contract:** `company-graph-release-validation.v1`
**Phase:** 9, stages 29–32
**Release rule:** Company Graph is not complete because a frontend bundle builds.

## Automated regression gate

Run:

```powershell
npm.cmd run test:company-graph:frontend
npm.cmd run test:a11y
..\.venv311\Scripts\python.exe -m pytest `
  tests/test_company_graph.py `
  tests/test_company_graph_cache.py `
  tests/test_idjwi_graph_intents.py `
  tests/test_idjwi_response_identity.py `
  tests/test_graph_explanations_learning.py `
  tests/test_external_observations.py `
  tests/test_company_graph_release.py `
  tests/test_company_graph_operator_acceptance.py
```

The traceability registry in
`python_layer/company_graph/release_contract.py` maps every Stage 29 concern to
behavioral coverage. A named test is not a waiver: security tests exercise backend
policy and do not rely on hidden frontend controls.

## Operator acceptance

The same registry defines all 15 required scenarios and the roles permitted to
perform them. Local automated acceptance validates intent, endpoint, evidence,
audit, refresh, advisor-truth and denial contracts. Before production, repeat the
scenarios against a synthetic staging tenant using separate administrator,
manager, worker and technician accounts.

For every scenario record:

- role, tenant, operational unit and surface;
- expected and actual result;
- displayed explanation and permitted next action;
- cited evidence and provenance;
- audit event;
- advisor contribution state;
- screenshot or response identifier;
- operator pass, fail or blocked decision.

Worker accounts must never be temporarily elevated to make a scenario pass.

## Environment gate

The read-only validator never prints secrets:

```powershell
..\.venv311\Scripts\python.exe scripts/validate_company_graph_release.py --environment local --strict
..\.venv311\Scripts\python.exe scripts/validate_company_graph_release.py --environment staging --strict
```

Staging uses these process-level variables:

- `NEWSCONSEEN_STAGING_WEB_URL`
- `NEWSCONSEEN_STAGING_API_URL`
- `NEWSCONSEEN_STAGING_ADMIN_TOKEN`
- `NEWSCONSEEN_STAGING_MANAGER_TOKEN`
- `NEWSCONSEEN_STAGING_WORKER_TOKEN`
- `NEWSCONSEEN_STAGING_TECHNICIAN_TOKEN`

Tokens are never command-line parameters, repository files or report fields.

## Migration and rollback

Apply migrations transactionally with `scripts/apply_sql_migration.py`. Verify the
schema, RLS, indexes, policies and triggers after every application. Rollback is
not an improvised destructive down-script. Before staging or production:

1. create and verify a recoverable Supabase backup or point-in-time restore point;
2. record the migration filename and deployment identifier;
3. test restoration in a non-production project;
4. prefer a forward corrective migration for compatible defects;
5. restore only through the approved database recovery process when data integrity
   cannot be preserved forward.

## Release decision

Local, staging, desktop and both mobile surfaces must pass. A missing staging
domain, acceptance identity, monitoring connection, backup proof or device test is
`blocked`, never `passed` or silently omitted.

The final cross-page review is recorded in
`COMPANY_GRAPH_EARLIER_PAGE_REUSE_REVIEW.md`. It identifies current shared owners,
adoption gaps and the page-by-page rollout order so graph capabilities are not
copied into unrelated local implementations.
