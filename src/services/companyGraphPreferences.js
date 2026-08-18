export const DEFAULT_COMPANY_GRAPH_SECTIONS = Object.freeze({
  briefing: false,
  relationshipReview: false,
  graphQuality: false,
  pageGuide: false,
  graphStatus: false,
  relationshipLegend: false,
});

export function companyGraphDeviceCategory(width) {
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function companyGraphSectionPreferenceKey({ tenantId, userId, surface, deviceCategory }) {
  if (!tenantId || !userId) return "";
  return `newsconseen:company-graph:sections:${tenantId}:${userId}:${surface || "web"}:${deviceCategory || "desktop"}`;
}

export function normalizeCompanyGraphSections(stored) {
  const candidate = stored && typeof stored === "object" ? stored : {};
  return Object.fromEntries(Object.entries(DEFAULT_COMPANY_GRAPH_SECTIONS).map(([section, defaultValue]) => [
    section,
    typeof candidate[section] === "boolean" ? candidate[section] : defaultValue,
  ]));
}
