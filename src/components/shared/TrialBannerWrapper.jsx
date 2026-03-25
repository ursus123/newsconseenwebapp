import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import TrialBanner from "@/components/shared/TrialBanner";

export default function TrialBannerWrapper({ currentUser }) {
  const { data: trialEnterprises = [] } = useQuery({
    queryKey: ["trial_enterprise", currentUser?.company_id],
    queryFn: () => base44.entities.Enterprise.filter({ enterprise_name: currentUser.company_id }),
    enabled: !!currentUser?.company_id && currentUser?.role !== "super_admin",
  });
  const trialEnterprise = trialEnterprises.find((e) => e.enterprise_name === currentUser?.company_id) || trialEnterprises[0];

  return <TrialBanner enterprise={trialEnterprise} userRole={currentUser?.role} />;
}