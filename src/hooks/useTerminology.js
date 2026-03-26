import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getTermsFromEnterpriseType } from "@/config/enterpriseTerminology";

export function useTerminology(currentUser) {
  const [enterprise, setEnterprise] = useState(null);

  useEffect(() => {
    if (!currentUser?.company_id) return;
    let cancelled = false;

    base44.entities.Enterprise.filter({ company_id: currentUser.company_id })
      .then((results) => {
        if (cancelled) return;
        const found =
          results.find((e) => e.id === currentUser.company_id) ||
          results[0] ||
          null;
        setEnterprise(found);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [currentUser?.company_id]);

  const terms = getTermsFromEnterpriseType(enterprise?.enterprise_type || "other");

  return {
    terms,
    enterpriseType: enterprise?.enterprise_type,
    enterprise,
    t: (key) => terms[key] || key,
  };
}