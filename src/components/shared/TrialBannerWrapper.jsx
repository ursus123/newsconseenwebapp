import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import TrialBanner from "@/components/shared/TrialBanner";

export default function TrialBannerWrapper({ currentUser }) {
  const [trialEnterprise, setTrialEnterprise] = useState(null);

  useEffect(() => {
    if (!currentUser?.company_id || currentUser?.role === "super_admin") return;
    base44.entities.Enterprise.filter({ enterprise_name: currentUser.company_id })
      .then((results) => {
        const match = results.find((e) => e.enterprise_name === currentUser.company_id) || results[0];
        setTrialEnterprise(match || null);
      })
      .catch(() => {});
  }, [currentUser?.company_id, currentUser?.role]);

  return <TrialBanner enterprise={trialEnterprise} userRole={currentUser?.role} />;
}