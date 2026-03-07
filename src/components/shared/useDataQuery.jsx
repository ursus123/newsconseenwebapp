/**
 * Shared data-scoping logic.
 *
 * Rules:
 *  - super_admin  → sees ALL records (no filter)
 *  - admin with company_id → sees records scoped to their company_id
 *  - admin without company_id → sees records they created (created_by = their email)
 *  - regular user  → same as admin (their own records)
 */
export function buildQuery(currentUser, extraFilters = {}) {
  if (!currentUser) return null;
  const isSuperAdmin = currentUser.role === "super_admin";
  if (isSuperAdmin) return extraFilters; // no scope restriction
  if (currentUser.company_id) return { company_id: currentUser.company_id, ...extraFilters };
  return { created_by: currentUser.email, ...extraFilters };
}

/**
 * Returns a function that fetches an entity list with the correct scope.
 * Usage: listFn(base44.entities.Person)
 */
export function useEntityListFn(currentUser) {
  return (entity, sort = "-created_date") => {
    if (!currentUser) return Promise.resolve([]);
    const isSuperAdmin = currentUser.role === "super_admin";
    if (isSuperAdmin) return entity.list(sort);
    if (currentUser.company_id) return entity.filter({ company_id: currentUser.company_id }, sort);
    return entity.filter({ created_by: currentUser.email }, sort);
  };
}

/**
 * Returns a decorator that stamps new records with the right ownership field.
 */
export function useWithScope(currentUser) {
  return (data) => {
    if (!currentUser || currentUser.role === "super_admin") return data;
    if (currentUser.company_id) return { ...data, company_id: currentUser.company_id };
    // No company_id — created_by is stamped automatically by the platform, nothing extra needed
    return data;
  };
}