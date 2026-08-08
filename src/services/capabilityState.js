export const CAPABILITY_STATES = Object.freeze({
  AVAILABLE: "available",
  UNAUTHORIZED: "unauthorized",
  UNAVAILABLE: "unavailable",
  EMPTY: "empty",
  DEGRADED: "degraded",
});

const VALID_STATES = new Set(Object.values(CAPABILITY_STATES));

export function classifyCapabilityResponse({ status, payload, collectionKeys = [], availableWhen = null }) {
  if (status === 401 || status === 403) return { state: CAPABILITY_STATES.UNAUTHORIZED, message: payload?.detail?.message || payload?.detail || "You are not authorized to use this capability." };
  if (status >= 500 || status === 0) return { state: CAPABILITY_STATES.UNAVAILABLE, message: payload?.detail?.message || payload?.detail || "The supporting service is unavailable." };
  if (status >= 400) return { state: CAPABILITY_STATES.DEGRADED, message: payload?.detail?.message || payload?.detail || "The capability returned an incomplete result." };
  if (VALID_STATES.has(payload?.state)) return { state: payload.state, message: payload.message || null };
  if (availableWhen?.(payload)) return { state: CAPABILITY_STATES.AVAILABLE, message: null };
  if (collectionKeys.length) {
    const count = collectionKeys.reduce((total, key) => total + (Array.isArray(payload?.[key]) ? payload[key].length : 0), 0);
    return { state: count ? CAPABILITY_STATES.AVAILABLE : CAPABILITY_STATES.EMPTY, message: null };
  }
  return { state: CAPABILITY_STATES.AVAILABLE, message: null };
}

export async function requestCapability(url, { headers, collectionKeys = [], availableWhen = null, fetcher = fetch, timeoutMs = 10_000 } = {}) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetcher(url, { headers, signal: controller?.signal });
    const payload = await response.json().catch(() => ({}));
    return { ...classifyCapabilityResponse({ status: response.status, payload, collectionKeys, availableWhen }), status: response.status, payload };
  } catch (error) {
    return { state: CAPABILITY_STATES.UNAVAILABLE, status: 0, payload: {}, message: error?.message || "The supporting service could not be reached." };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
