import { supabase } from "@/api/supabaseEntityClient";

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

// Current Supabase session's access token — python_layer endpoints that take
// company_id now verify the caller owns it via this bearer token instead of
// trusting the query param alone.
export async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export async function authHeaders(extra = {}) {
  const token = await getAccessToken();
  return apiHeaders({
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  });
}
