import assert from "node:assert/strict";
import test from "node:test";
import { CAPABILITY_STATES, classifyCapabilityResponse, requestCapability } from "./capabilityState.js";

test("capability responses distinguish unauthorized, unavailable, empty and degraded", () => {
  assert.equal(classifyCapabilityResponse({ status: 401, payload: {} }).state, CAPABILITY_STATES.UNAUTHORIZED);
  assert.equal(classifyCapabilityResponse({ status: 503, payload: {} }).state, CAPABILITY_STATES.UNAVAILABLE);
  assert.equal(classifyCapabilityResponse({ status: 200, payload: {}, collectionKeys: ["items"] }).state, CAPABILITY_STATES.EMPTY);
  assert.equal(classifyCapabilityResponse({ status: 200, payload: { state: "degraded" } }).state, CAPABILITY_STATES.DEGRADED);
});

test("capability request converts network failure into a visible unavailable state", async () => {
  const result = await requestCapability("https://example.invalid", { fetcher: async () => { throw new Error("offline"); } });
  assert.equal(result.state, CAPABILITY_STATES.UNAVAILABLE);
  assert.equal(result.message, "offline");
});
