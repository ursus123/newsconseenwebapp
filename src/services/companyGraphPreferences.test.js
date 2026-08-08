import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_COMPANY_GRAPH_SECTIONS,
  companyGraphDeviceCategory,
  companyGraphSectionPreferenceKey,
  normalizeCompanyGraphSections,
} from "./companyGraphPreferences.js";

test("Company Graph disclosure preferences default to a compact workspace", () => {
  assert.deepEqual(normalizeCompanyGraphSections(null), DEFAULT_COMPANY_GRAPH_SECTIONS);
  assert.equal(normalizeCompanyGraphSections({ briefing: true }).briefing, true);
  assert.equal(normalizeCompanyGraphSections({ briefing: "true" }).briefing, false);
});

test("Company Graph disclosure keys isolate tenant, principal, surface and device", () => {
  const base = { tenantId: "tenant-a", userId: "admin-a", surface: "web", deviceCategory: "desktop" };
  const key = companyGraphSectionPreferenceKey(base);
  assert.notEqual(key, companyGraphSectionPreferenceKey({ ...base, tenantId: "tenant-b" }));
  assert.notEqual(key, companyGraphSectionPreferenceKey({ ...base, userId: "admin-b" }));
  assert.notEqual(key, companyGraphSectionPreferenceKey({ ...base, surface: "desktop" }));
  assert.notEqual(key, companyGraphSectionPreferenceKey({ ...base, deviceCategory: "mobile" }));
  assert.equal(companyGraphSectionPreferenceKey({ ...base, userId: "" }), "");
});

test("Company Graph device categories remain stable at responsive boundaries", () => {
  assert.equal(companyGraphDeviceCategory(390), "mobile");
  assert.equal(companyGraphDeviceCategory(640), "tablet");
  assert.equal(companyGraphDeviceCategory(1024), "desktop");
});
