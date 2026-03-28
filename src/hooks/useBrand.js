import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const DEFAULTS = {
  brand_name:             "Newsconseen",
  brand_tagline:          "The SME version of Palantir Foundry",
  brand_logo_url:         null,
  brand_favicon_url:      null,
  brand_primary_color:    "#10b981",
  brand_secondary_color:  "#1e293b",
  brand_accent_color:     "#6366f1",
  brand_custom_domain:    null,
  brand_hide_newsconseen: false,
  brand_support_email:    null,
};

export function useBrand(currentUser) {
  const [brand, setBrand] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.company_id) { setLoading(false); return; }

    base44.entities.Enterprise.get(currentUser.company_id)
      .then(enterprise => {
        const merged = { ...DEFAULTS };
        Object.keys(DEFAULTS).forEach(key => {
          if (enterprise[key] !== undefined && enterprise[key] !== null && enterprise[key] !== "") {
            merged[key] = enterprise[key];
          }
        });
        setBrand(merged);

        // Inject CSS variables so any component can use var(--brand-primary)
        const root = document.documentElement;
        root.style.setProperty("--brand-primary",   merged.brand_primary_color);
        root.style.setProperty("--brand-secondary", merged.brand_secondary_color);
        root.style.setProperty("--brand-accent",    merged.brand_accent_color);

        // Update page title
        document.title = merged.brand_name;

        // Update favicon
        if (merged.brand_favicon_url) {
          let link = document.querySelector("link[rel~='icon']");
          if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
          link.href = merged.brand_favicon_url;
        }
      })
      .catch(() => setBrand(DEFAULTS))
      .finally(() => setLoading(false));
  }, [currentUser?.company_id]);

  return { brand, loading };
}