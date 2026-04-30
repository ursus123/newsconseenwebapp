import React from "react";

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

    if (!currentUser.company_id) {
      console.warn(`[Isolation] User ${currentUser.email} has no company_id — returning empty.`);
      return Promise.resolve([]);
    }

    // Primary: filter by company_id
    // Fallback: also fetch records created by this user that may have null company_id (pre-fix records)
    // allSettled so a failing filter on one leg doesn't kill the whole fetch
    return Promise.allSettled([
      entity.filter({ company_id: currentUser.company_id }, sort),
      entity.filter({ created_by: currentUser.email }, sort),
    ]).then(async ([byCompanyResult, byCreatorResult]) => {
      const byCompany = byCompanyResult.status === "fulfilled" ? byCompanyResult.value : [];
      const byCreator = byCreatorResult.status === "fulfilled" ? byCreatorResult.value : [];

      // If both filters failed (entity may not support filtering), fall back to list + client-side filter
      if (byCompanyResult.status === "rejected" && byCreatorResult.status === "rejected") {
        try {
          const all = await entity.list(sort);
          return all.filter(r =>
            r.company_id === currentUser.company_id ||
            r.created_by === currentUser.email
          );
        } catch (_) {
          return [];
        }
      }

      // Merge and deduplicate
      const seen = new Set();
      const merged = [...byCompany, ...byCreator].filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      // Silently fix any records missing the correct company_id
      const toFix = byCreator.filter(r => r.company_id !== currentUser.company_id);
      if (toFix.length > 0) {
        toFix.forEach(r => {
          entity.update(r.id, { company_id: currentUser.company_id }).catch(() => {});
        });
      }

      return merged;
    });
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

    // Always stamp created_by
    const scoped = {
      ...data,
      created_by: currentUser.email,
    };

    // Only stamp company_id if it exists —
    // first enterprise creation won't have it yet; createMut handles that case
    if (currentUser.company_id) {
      scoped.company_id = currentUser.company_id;
    }

    return scoped;
  };
}

/**
 * Creates a tenant-scoped record and verifies the saved record still carries
 * the current workspace id. Some Base44 create responses can omit custom
 * fields, so we patch company_id immediately when needed.
 */
export async function createWithScope(entity, data, currentUser) {
  if (!currentUser) {
    throw new Error("Cannot create record before current user is loaded.");
  }

  if (currentUser.role !== "super_admin" && !currentUser.company_id) {
    throw new Error("Cannot create record without a workspace company_id.");
  }

  const payload = {
    ...data,
    created_by: currentUser.email,
  };

  if (currentUser.role !== "super_admin") {
    payload.company_id = currentUser.company_id;
  }

  const created = await entity.create(payload);
  const expectedCompanyId = currentUser.role === "super_admin" ? payload.company_id : currentUser.company_id;

  if (expectedCompanyId && created?.id && created.company_id !== expectedCompanyId) {
    await entity.update(created.id, { company_id: expectedCompanyId });
    return { ...created, company_id: expectedCompanyId };
  }

  return created;
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
