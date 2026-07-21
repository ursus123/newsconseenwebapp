import test from "node:test";
import assert from "node:assert/strict";
import { probeTenantRls, summarizeIdentityChain } from "./tenantIdentity.js";

function fakeSupabase(resultByTable) {
  return {
    from(table) {
      return {
        select() { return this; },
        neq() { return this; },
        async limit() { return resultByTable[table]; },
      };
    },
  };
}

test("RLS probe reports observed isolation when no foreign rows are visible", async () => {
  const empty = { data: [], error: null };
  const result = await probeTenantRls(fakeSupabase({ enterprises: empty, persons: empty, tasks: empty, transactions: empty }), "tenant-1");
  assert.equal(result.state, "observed");
  assert.equal(result.foreignRowsVisible, false);
});

test("RLS probe reports failure when a foreign tenant row is visible", async () => {
  const empty = { data: [], error: null };
  const result = await probeTenantRls(fakeSupabase({
    enterprises: { data: [{ id: "e2", company_id: "tenant-2" }], error: null },
    persons: empty, tasks: empty, transactions: empty,
  }), "tenant-1");
  assert.equal(result.state, "failed");
  assert.equal(result.foreignRowsVisible, true);
});

test("identity summary keeps project, profile, tenant and records separate", () => {
  const summary = summarizeIdentityChain({
    projects_match: true,
    authenticated_user_verified: true,
    profile_found: true,
    profile_user_id_matches: true,
    profile_tenant_matches_request: false,
    record_company_ids_match_request: true,
  }, { state: "observed" });
  assert.equal(summary[0][2], true);
  assert.equal(summary[3][2], false);
});
