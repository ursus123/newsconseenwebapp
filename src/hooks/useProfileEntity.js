import { useCurrentProfile } from "@/lib/ProfileContext";
import { base44 } from "@/api/base44Client";

/**
 * Hook to query entities scoped to the current profile's enterprise context.
 * If the profile has an enterpriseId, filters queries to that enterprise.
 * 
 * Usage:
 *   const { list, filter } = useProfileEntity("Person");
 *   const people = await list();  // Lists people for current profile's enterprise
 *   const filtered = await filter({ status: "active" });
 */
export function useProfileEntity(entityName) {
  const currentProfile = useCurrentProfile();
  const entityClass = base44.entities[entityName];

  if (!entityClass) {
    throw new Error(`Entity "${entityName}" not found in base44.entities`);
  }

  return {
    // Wrapper around .list() that filters by enterprise if set
    list: (sort, limit) => {
      if (!currentProfile?.enterpriseId) {
        return entityClass.list(sort, limit);
      }
      return entityClass.filter(
        { enterprise_id: currentProfile.enterpriseId },
        sort,
        limit
      );
    },

    // Wrapper around .filter() that adds enterprise context
    filter: (query, sort, limit) => {
      if (!currentProfile?.enterpriseId) {
        return entityClass.filter(query, sort, limit);
      }
      return entityClass.filter(
        { ...query, enterprise_id: currentProfile.enterpriseId },
        sort,
        limit
      );
    },

    // Direct access to full entity class (for mutations, etc)
    entity: entityClass,
  };
}