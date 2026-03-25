import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getTermsFromEnterpriseType } from "@/config/enterpriseTerminology";

export function useTerminology(currentUser) {
  const { data: enterprise } = useQuery({
    queryKey: ["primary_enterprise", currentUser?.company_id],
    queryFn: async () => {
      if (!currentUser?.company_id) return null;
      const results = await base44.entities.Enterprise.filter({
        company_id: currentUser.company_id,
      });
      return results.find(e => e.id === currentUser.company_id) || results[0] || null;
    },
    enabled: !!currentUser?.company_id,
    staleTime: 5 * 60 * 1000,
  });

  const terms = getTermsFromEnterpriseType(enterprise?.enterprise_type || "other");

  return {
    terms,
    enterpriseType: enterprise?.enterprise_type,
    enterprise,
    t: (key) => terms[key] || key,
  };
}