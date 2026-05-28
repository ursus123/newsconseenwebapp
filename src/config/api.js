export const RAILWAY_URL =
  import.meta.env.VITE_RAILWAY_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://newsconseenwebapp-production.up.railway.app";

export const RAILWAY_API_KEY = import.meta.env.VITE_RAILWAY_API_KEY || "";

export function apiHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}),
    ...extra,
  };
}
