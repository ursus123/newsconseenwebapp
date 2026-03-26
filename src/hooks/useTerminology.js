import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getTermsFromEnterpriseType } from "@/config/enterpriseTerminology";

export function useTerminology(currentUser) {
  const [enterprise, setEnterprise] = useState(null);

  useEffect(() => {
    if (!currentUser?.company_id) return;
    base44.entities.Enterprise.filter({ company_id: currentUser.company_id })
      .then((results) => {
        const match = results.find(e => e.id === currentUser.company_id) || results[0] || null;
        setEnterprise(match);
      })
      .catch(() => {});
  }, [currentUser?.company_id]);

  const terms = getTermsFromEnterpriseType(enterprise?.enterprise_type || "other");

  return {
    terms,
    enterpriseType: enterprise?.enterprise_type,
    enterprise,
    t: (key) => terms[key] || key,
  };
}