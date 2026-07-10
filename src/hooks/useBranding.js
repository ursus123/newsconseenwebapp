import { useQuery } from "@tanstack/react-query";
import { ncClient } from "@/api/ncClient";

export function useBranding(currentUser) {
  const { data: enterprise } = useQuery({
    queryKey: ["branding", currentUser?.company_id],
    queryFn: () =>
      currentUser?.role === "super_admin"
        ? Promise.resolve(null)
        : ncClient.entities.Enterprise.filter({ enterprise_name: currentUser.company_id })
            .then((results) => results[0] || null),
    enabled: !!currentUser?.company_id,
    staleTime: 5 * 60 * 1000,
  });

  return {
    enterprise,
    appName: enterprise?.brand_name || "Newsconseen",
    tagline: enterprise?.brand_tagline || "",
    logoUrl: enterprise?.brand_logo_url || null,
    primaryColor: enterprise?.brand_primary_color || "#10b981",
    secondaryColor: enterprise?.brand_secondary_color || "#1e293b",
    accentColor: enterprise?.brand_accent_color || "#6366f1",
    hideNewsconseen: enterprise?.brand_hide_newsconseen || false,
    supportEmail: enterprise?.brand_support_email || "support@newsconseen.com",
    customDomain: enterprise?.brand_custom_domain || null,
    faviconUrl: enterprise?.brand_favicon_url || null,
    tier: enterprise?.subscription_tier || "professional",
  };
}