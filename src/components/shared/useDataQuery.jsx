/**
 * Shared data-scoping logic — enforces multi-tenant isolation.
 *
 * Rules (per spec):
 *  - super_admin  → sees ALL records across all enterprises (no filter)
 *  - admin        → scoped to their own enterprise (company_id). If no company_id set, sees only their own created records.
 *  - user         → scoped to their own enterprise (company_id). If no company_id set, sees only their own created records.
 */

export function useEntityListFn(currentUser) {
  return (entity, sort = "-created_date") => {
    if (!currentUser) return Promise.resolve([]);
    if (currentUser.role === "super_admin") return entity.list(sort);
    if (currentUser.company_id) {
      // Return records scoped to this company OR created by this user
      return Promise.all([
        entity.filter({ company_id: currentUser.company_id }, sort),
        entity.filter({ created_by: currentUser.email }, sort),
      ]).then(([byCompany, byUser]) => {
        const seen = new Set();
        return [...byCompany, ...byUser].filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        });
      });
    }
    // Fallback: no enterprise assigned yet — show only own records
    return entity.filter({ created_by: currentUser.email }, sort);
  };
}

/**
 * Stamps new records with the enterprise (company_id) of the creating user.
 * super_admin records are NOT stamped — they are platform-level.
 */
export function useWithScope(currentUser) {
  return (data) => {
    if (!currentUser || currentUser.role === "super_admin") return data;
    if (currentUser.company_id) return { ...data, company_id: currentUser.company_id };
    return data;
  };
}

/**
 * Returns a plain filter object for use outside of hooks (e.g. manual queries).
 */
export function buildQuery(currentUser, extraFilters = {}) {
  if (!currentUser) return null;
  if (currentUser.role === "super_admin") return extraFilters;
  if (currentUser.company_id) return { company_id: currentUser.company_id, ...extraFilters };
  return { created_by: currentUser.email, ...extraFilters };
}