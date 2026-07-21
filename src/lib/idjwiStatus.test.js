import test from "node:test";
import assert from "node:assert/strict";
import { classifySnapshot, fetchRequestError, httpRequestError } from "./idjwiStatus.js";

const rejected = reason => ({ status: "rejected", reason });
const fulfilled = value => ({ status: "fulfilled", value });

test("network failure leaves authorization indeterminate", () => {
  const error = fetchRequestError(new TypeError("fetch failed"));
  const result = classifySnapshot([rejected(error), rejected(error), rejected(error)]);
  assert.equal(result.backend.state, "unreachable");
  assert.equal(result.authorization.state, "indeterminate");
  assert.equal(result.tenantContext.state, "unavailable");
});

test("aborted request is classified as a retryable timeout", () => {
  const error = fetchRequestError({ name: "AbortError" }, "/copilot/context");
  assert.equal(error.code, "backend_timeout");
  assert.equal(error.retryable, true);
  assert.equal(error.cause, "timeout");
});

test("401 is classified as unauthenticated", () => {
  const error = httpRequestError({ response: { status: 401, headers: new Headers() }, body: {} });
  const result = classifySnapshot([fulfilled({ idjwi_core: "ready" }), rejected(error), fulfilled({ connections: [] })]);
  assert.equal(result.authorization.state, "unauthenticated");
  assert.equal(result.tenantContext.state, "not_authorized");
});

test("403 tenant mismatch is distinct from an empty tenant", () => {
  const error = httpRequestError({ response: { status: 403, headers: new Headers() }, body: { detail: { code: "tenant_mismatch", category: "authorization" } } });
  const forbidden = classifySnapshot([fulfilled({}), rejected(error), fulfilled({})]);
  const empty = classifySnapshot([fulfilled({}), fulfilled({ tenant_authorized: true, context_state: "empty", records_available: false }), fulfilled({})]);
  assert.equal(forbidden.authorization.state, "tenant_forbidden");
  assert.equal(empty.authorization.state, "authorized");
  assert.equal(empty.tenantContext.state, "empty");
});

test("partial and available context remain explicit", () => {
  const partial = classifySnapshot([fulfilled({}), fulfilled({ tenant_authorized: true, context_state: "partial" }), fulfilled({})]);
  const available = classifySnapshot([fulfilled({}), fulfilled({ tenant_authorized: true, context_state: "available", records_available: true }), fulfilled({})]);
  assert.equal(partial.tenantContext.state, "partial");
  assert.equal(available.tenantContext.state, "available");
});

test("advisor failure does not degrade Idjwi Core", () => {
  const advisorError = httpRequestError({ response: { status: 503, headers: new Headers() }, body: {} });
  const result = classifySnapshot([
    fulfilled({ idjwi_core: "ready" }),
    fulfilled({ tenant_authorized: true, context_state: "available", records_available: true }),
    rejected(advisorError),
  ]);
  assert.equal(result.backend.state, "connected");
  assert.equal(result.tenantContext.state, "available");
  assert.equal(result.advisorService.state, "unavailable");
});
