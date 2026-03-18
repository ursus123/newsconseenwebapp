/**
 * useDataQuery.js
 * Multi-tenant data isolation — enforces company_id scoping.
 *
 * Rules:
 *  - super_admin  → sees ALL records (no filter)
 *  - admin        → strictly scoped to company_id
 *  - user         → strictly scoped to company_id
 *  - no company_id → sees NOTHING (empty array)
 *
 * The created_by fallback has been removed — it was a
 * data leak vector. company_id is the ONLY isolation boundary.
 */

export function useEntityListFn(currentUser) {
  return (entity, sort = "-created_date") => {
    if (!currentUser) return Promise.resolve([]);

    // super_admin sees everything — no filter
    if (currentUser.role === "super_admin") {
      return entity.list(sort);
    }

    // All other roles MUST have company_id
    // If not set, return empty — never leak other tenants' data
    if (!currentUser.company_id) {
      console.warn(
        `[Isolation] User ${currentUser.email} has no company_id — ` +
        `returning empty dataset to prevent data leak.`
      );
      return Promise.resolve([]);
    }

    // Strict company_id filter only
    return entity.filter({ company_id: currentUser.company_id }, sort);
  };
}

/**
 * Stamps new/updated records with the current tenant's company_id.
 * Throws if a non-super_admin user has no company_id assigned —
 * this prevents unscoped records from being created.
 */
export function useWithScope(currentUser) {
  return (data) => {
    // super_admin records are platform-level, never stamped
    if (!currentUser || currentUser.role === "super_admin") {
      return data;
    }

    // Hard block — cannot write without a tenant
    if (!currentUser.company_id) {
      throw new Error(
        "Your account is not assigned to an enterprise workspace. " +
        "Contact your administrator before creating records."
      );
    }

    return {
      ...data,
      company_id: currentUser.company_id,
      created_by: currentUser.email,
    };
  };
}

/**
 * Builds a plain filter object for use outside React hooks.
 * Used in non-hook contexts like event handlers or utilities.
 */
export function buildQuery(currentUser, extraFilters = {}) {
  if (!currentUser) return null;
  if (currentUser.role === "super_admin") return extraFilters;
  if (!currentUser.company_id) return null; // block unscoped queries
  return { company_id: currentUser.company_id, ...extraFilters };
}

/**
 * Returns true if the current user is properly scoped to a tenant.
 * Use this to gate UI features that require tenant assignment.
 */
export function useIsTenantScoped(currentUser) {
  if (!currentUser) return false;
  if (currentUser.role === "super_admin") return true;
  return !!currentUser.company_id;
}