import { RAILWAY_URL, RAILWAY_API_KEY, authHeaders } from "@/config/api";

export async function idjwiHeaders(user) {
  return {
    ...(await authHeaders()),
    ...(RAILWAY_API_KEY ? { "x-idjwi-api-key": RAILWAY_API_KEY } : {}),
    ...(user?.email ? { "x-idjwi-user": user.email } : {}),
    ...(user?.role ? { "x-idjwi-role": user.role } : {}),
  };
}

export async function saveIdjwiMemory({
  user,
  companyId,
  key,
  value,
  memoryType = "business_rule",
  source = "operator_stated",
  reviewStatus = "confirmed",
  confidence = 1,
  metadata = {},
  expiresAt = null,
}) {
  if (!companyId) throw new Error("company_id is required");
  if (!key?.trim()) throw new Error("memory key is required");

  const res = await fetch(`${RAILWAY_URL}/copilot/idjwi-memory`, {
    method: "POST",
    headers: await idjwiHeaders(user),
    body: JSON.stringify({
      company_id: companyId,
      key: key.trim(),
      value,
      memory_type: memoryType,
      source,
      review_status: reviewStatus,
      confidence,
      metadata,
      expires_at: expiresAt || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Memory save failed (${res.status})`);
  return data;
}

export async function updateIdjwiMemory({ user, companyId, memoryId, patch }) {
  const res = await fetch(`${RAILWAY_URL}/copilot/idjwi-memory/${memoryId}`, {
    method: "PATCH",
    headers: await idjwiHeaders(user),
    body: JSON.stringify({ company_id: companyId, patch }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Memory update failed (${res.status})`);
  return data;
}

export async function searchIdjwiMemory({ user, companyId, q = "", status = "all", memoryType = "all", limit = 200 }) {
  const params = new URLSearchParams({ company_id: companyId, limit: String(limit) });
  if (q) params.set("q", q);
  if (status && status !== "all") params.set("review_status", status);
  if (memoryType && memoryType !== "all") params.set("memory_type", memoryType);
  const res = await fetch(`${RAILWAY_URL}/copilot/idjwi-memory?${params}`, {
    headers: await idjwiHeaders(user),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Memory search failed (${res.status})`);
  return data;
}

export async function fetchIdjwiConflicts({ user, companyId }) {
  const params = new URLSearchParams({ company_id: companyId });
  const res = await fetch(`${RAILWAY_URL}/copilot/idjwi-memory/conflicts?${params}`, {
    headers: await idjwiHeaders(user),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Conflict fetch failed (${res.status})`);
  return data;
}
