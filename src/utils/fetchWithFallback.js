/**
 * fetchWithFallback — Three-tier data fallback utility
 *
 * Implements the Newsconseen data access contract (ARCHITECTURE.md § 4):
 *
 *   Tier 1 — python_layer analytics endpoint
 *     GET /{analyticsEndpoint}?company_id=X
 *     Pre-aggregated summaries from the python_layer transformation pipeline.
 *     Fastest for stat cards; returned shape is entity-specific (e.g. PeopleSummary[]).
 *
 *   Tier 2 — python_layer raw endpoint
 *     GET /raw/{rawEntity}?company_id=X&limit=N
 *     Full records from raw.* PostgreSQL tables (populated by ETL).
 *     Falls here when Tier 1 is unreachable OR returns empty data.
 *     Useful when Base44 is slow but PostgreSQL has a recent snapshot.
 *
 *   Tier 3 — Base44 live entity query
 *     Calls base44Fn() directly — always available.
 *     Falls here when both Tier 1 and Tier 2 fail or return empty.
 *
 * Return value: { data: any[], tier: 1|2|3, source: "analytics"|"raw"|"base44" }
 *
 * The caller is responsible for aggregating Tier 2/3 records in the same way
 * (raw PostgreSQL and Base44 records share the same schema).
 *
 * Usage:
 *   const result = await fetchWithFallback({
 *     analyticsEndpoint: "/people-summary",
 *     rawEntity:         "people",
 *     base44Fn:          () => ncClient.entities.Person.filter({ company_id }),
 *     companyId,
 *   });
 *   // result.source === "analytics" → use pre-aggregated summary fields
 *   // result.source === "raw"       → aggregate from full records
 *   // result.source === "base44"    → aggregate from full records (same shape as raw)
 */

export const RAILWAY_URL = "https://newsconseenwebapp-production.up.railway.app";

const TIMEOUT_MS   = 8_000;  // 8 s per attempt
const RETRY_DELAY  = 800;    // ms between retries on the same tier

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Attempt an async fn up to (1 + retries) times.
 * Returns the result of the first successful call, or null if all fail.
 */
async function attempt(fn, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const result = await fn();
      if (result !== null && result !== undefined) return result;
    } catch (_) {
      // swallow — fall through to retry or next tier
    }
    if (i < retries) await sleep(RETRY_DELAY);
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isEmpty(data) {
  if (!data) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === "object") return Object.keys(data).length === 0;
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * fetchWithFallback
 *
 * @param {object} opts
 * @param {string}   opts.analyticsEndpoint  e.g. "/people-summary"
 * @param {string}   [opts.rawEntity]        e.g. "people" — omit to skip Tier 2
 * @param {Function} opts.base44Fn           async () => records[] — Tier 3
 * @param {string}   opts.companyId
 * @param {number}   [opts.retries=1]        retries per tier before moving on
 * @param {number}   [opts.rawLimit=1000]    max raw records to fetch
 *
 * @returns {Promise<{ data: any[], tier: number, source: string }>}
 */
export async function fetchWithFallback({
  analyticsEndpoint,
  rawEntity,
  base44Fn,
  companyId,
  retries    = 1,
  rawLimit   = 1000,
}) {
  // ── Tier 1: analytics endpoint ──────────────────────────────────────────────
  if (analyticsEndpoint && companyId) {
    const data = await attempt(async () => {
      const url = `${RAILWAY_URL}${analyticsEndpoint}?company_id=${encodeURIComponent(companyId)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return null;
      const json = await res.json();
      // Analytics endpoints return an array directly or {data: [...]}
      const arr = Array.isArray(json) ? json : (json?.data ?? []);
      return isEmpty(arr) ? null : arr;
    }, retries);

    if (data) return { data, tier: 1, source: "analytics" };
  }

  // ── Tier 2: raw PostgreSQL endpoint ─────────────────────────────────────────
  if (rawEntity && companyId) {
    const data = await attempt(async () => {
      const params = new URLSearchParams({
        company_id: companyId,
        limit:      String(rawLimit),
      });
      const url = `${RAILWAY_URL}/raw/${rawEntity}?${params}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return null;
      const json = await res.json();
      // /raw/{entity} returns { data: [...], count, columns, ... }
      const arr = json?.data ?? [];
      return isEmpty(arr) ? null : arr;
    }, retries);

    if (data) return { data, tier: 2, source: "raw" };
  }

  // ── Tier 3: Base44 live ──────────────────────────────────────────────────────
  const data = await attempt(async () => {
    const records = await base44Fn();
    return Array.isArray(records) ? records : [];
  }, retries);

  return { data: data ?? [], tier: 3, source: "base44" };
}

// ── Convenience wrappers for the 5 core entities ──────────────────────────────
// Each wraps fetchWithFallback with the canonical endpoint + raw entity name.

export const fetchPeopleFallback = (companyId, base44Fn, opts = {}) =>
  fetchWithFallback({ analyticsEndpoint: "/people-summary",      rawEntity: "people",       base44Fn, companyId, ...opts });

export const fetchTasksFallback = (companyId, base44Fn, opts = {}) =>
  fetchWithFallback({ analyticsEndpoint: "/task-summary",         rawEntity: "tasks",        base44Fn, companyId, ...opts });

export const fetchProductsFallback = (companyId, base44Fn, opts = {}) =>
  fetchWithFallback({ analyticsEndpoint: "/product-summary",      rawEntity: "products",     base44Fn, companyId, ...opts });

export const fetchTransactionsFallback = (companyId, base44Fn, opts = {}) =>
  fetchWithFallback({ analyticsEndpoint: "/transaction-summary",  rawEntity: "transactions", base44Fn, companyId, ...opts });

export const fetchEnterprisesFallback = (companyId, base44Fn, opts = {}) =>
  fetchWithFallback({ analyticsEndpoint: "/enterprise-summary",   rawEntity: "enterprises",  base44Fn, companyId, ...opts });

// ── Intelligence analytics (analytics-only, no raw fallback entity) ───────────
// These tables have no equivalent raw.* entity — they are derived aggregates.
// The fallback is the GET endpoint itself which recomputes live from Base44.

export const fetchKpiSnapshot = async (companyId) => {
  try {
    const r = await fetch(`${RAILWAY_URL}/analytics/kpi-summary?company_id=${encodeURIComponent(companyId)}`);
    if (r.ok) { const d = await r.json(); if (d?.length > 0) return d[0]; }
  } catch (_) {}
  return null;
};

export const fetchTopClients = async (companyId, { topN = 20, segment } = {}) => {
  try {
    let url = `${RAILWAY_URL}/analytics/client-value?company_id=${encodeURIComponent(companyId)}`;
    const r = await fetch(url);
    if (r.ok) { const d = await r.json(); return d || []; }
  } catch (_) {}
  return [];
};

export const fetchStaffPerformance = async (companyId) => {
  try {
    const r = await fetch(`${RAILWAY_URL}/analytics/staff-performance?company_id=${encodeURIComponent(companyId)}`);
    if (r.ok) { const d = await r.json(); return d || []; }
  } catch (_) {}
  return [];
};

export const fetchArAgingSummary = async (companyId) => {
  try {
    const r = await fetch(`${RAILWAY_URL}/analytics/ar-aging-summary?company_id=${encodeURIComponent(companyId)}`);
    if (r.ok) { const d = await r.json(); return d?.[0] || null; }
  } catch (_) {}
  return null;
};

export const fetchProductVelocity = async (companyId) => {
  try {
    const r = await fetch(`${RAILWAY_URL}/analytics/product-velocity?company_id=${encodeURIComponent(companyId)}`);
    if (r.ok) { const d = await r.json(); return d || []; }
  } catch (_) {}
  return [];
};

export const fetchNetworkSummary = async (companyId) => {
  try {
    const r = await fetch(`${RAILWAY_URL}/analytics/network-summary?company_id=${encodeURIComponent(companyId)}`);
    if (r.ok) { const d = await r.json(); return d || []; }
  } catch (_) {}
  return [];
};

export const fetchConcentrationRisk = async (companyId) => {
  try {
    const r = await fetch(`${RAILWAY_URL}/analytics/concentration-risk?company_id=${encodeURIComponent(companyId)}`);
    if (r.ok) { const d = await r.json(); return d?.[0] || null; }
  } catch (_) {}
  return null;
};
