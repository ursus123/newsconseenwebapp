const RLS_TABLES = ["enterprises", "persons", "tasks", "transactions"];

export async function probeTenantRls(supabase, companyId) {
  if (!supabase || !companyId) return {
    state: "not_checked", tables: {}, foreignRowsVisible: null,
  };

  const checks = await Promise.all(RLS_TABLES.map(async table => {
    const { data, error } = await supabase
      .from(table)
      .select("id,company_id")
      .neq("company_id", companyId)
      .limit(1);
    return [table, {
      state: error ? "error" : (data || []).length ? "failed" : "isolated",
      foreignRowsVisible: error ? null : (data || []).length > 0,
      errorCode: error?.code || null,
    }];
  }));

  const tables = Object.fromEntries(checks);
  const states = Object.values(tables).map(item => item.state);
  const foreignRowsVisible = Object.values(tables).some(item => item.foreignRowsVisible === true);
  return {
    state: foreignRowsVisible ? "failed" : states.every(state => state === "isolated") ? "observed" : "indeterminate",
    tables,
    foreignRowsVisible,
    note: "Black-box authenticated query; deployed policy definitions still require database-level inspection.",
  };
}

export function summarizeIdentityChain(chain = {}, rlsProbe = {}) {
  return [
    ["Supabase project", chain.projects_match ? "Matched" : "Mismatch", !!chain.projects_match],
    ["Authenticated user", chain.authenticated_user_verified ? "Verified" : "Not verified", !!chain.authenticated_user_verified],
    ["User profile", chain.profile_user_id_matches ? "Matched" : chain.profile_found ? "Mismatch" : "Missing", !!chain.profile_user_id_matches],
    ["Tenant identity", chain.profile_tenant_matches_request ? "Matched" : "Mismatch", !!chain.profile_tenant_matches_request],
    ["Tenant record scope", chain.record_company_ids_match_request ? "Matched" : "Partial", !!chain.record_company_ids_match_request],
    ["RLS isolation", rlsProbe.state === "observed" ? "Observed" : rlsProbe.state === "failed" ? "Failed" : "Not confirmed", rlsProbe.state === "observed"],
  ];
}
