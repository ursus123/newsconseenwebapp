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
    
    // super_admin sees everything
    if (currentUser.role === "super_admin") {
      return entity.list(sort);
    }
    
    // All other roles MUST have company_id to see any data
    if (!currentUser.company_id) {
      // User has no enterprise assigned — show empty
      // This prevents data leaks for unassigned users
      console.warn("User has no company_id — returning empty dataset");
      return Promise.resolve([]);
    }
    
    // Strict company_id filter only — no created_by fallback
    return entity.filter({ company_id: currentUser.company_id }, sort);
  };
}

/**
 * Stamps new records with the enterprise (company_id) of the creating user.
 * super_admin records are NOT stamped — they are platform-level.
 * CRITICAL: Throws error if user has no company_id — blocks unassigned users.
 */
export function useWithScope(currentUser) {
  return (data) => {
    // super_admin records are platform-level, not stamped
    if (!currentUser || currentUser.role === "super_admin") {
      return data;
    }
    
    // Block writes if user has no company_id
    if (!currentUser.company_id) {
      throw new Error(
        "Cannot create records: your account is not assigned to an enterprise. Contact your administrator."
      );
    }
    
    // Always stamp with company_id
    return { 
      ...data, 
      company_id: currentUser.company_id,
      created_by: currentUser.email,
    };
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