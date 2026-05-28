/**
 * Assistant Gateway client.
 *
 * One frontend entry point for Ruflo-style decomposition, Open Design-style
 * artifacts, QField-style field sync, and OpenClaw-style channel routing.
 */

import { RAILWAY_API_KEY, RAILWAY_URL } from "@/config/api";

const headers = () => ({
  "Content-Type": "application/json",
  ...(RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {}),
});

async function request(path, options = {}) {
  const res = await fetch(`${RAILWAY_URL}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`Gateway request failed: ${res.status}`);
  return res.json();
}

export async function sendGatewayMessage({
  companyId,
  user,
  channel = "web",
  sessionId = "",
  message,
  context = {},
  dryRun = true,
}) {
  return request("/gateway/message", {
    method: "POST",
    body: JSON.stringify({
      company_id: companyId || user?.company_id,
      user_email: user?.email,
      user_role: user?.role,
      channel,
      session_id: sessionId,
      message,
      context,
      dry_run: dryRun,
    }),
  });
}

export async function previewArtifact({ companyId, artifactType, title, prompt = "", sourceContext = {} }) {
  return request("/gateway/artifacts/preview", {
    method: "POST",
    body: JSON.stringify({
      company_id: companyId,
      artifact_type: artifactType,
      title,
      prompt,
      source_context: sourceContext,
    }),
  });
}

export async function getFieldProfiles(appId) {
  const qs = appId ? `?app_id=${encodeURIComponent(appId)}` : "";
  return request(`/gateway/field/profiles${qs}`);
}

export async function syncFieldCapture({ companyId, appId, user, deviceId, records }) {
  return request("/gateway/field/sync", {
    method: "POST",
    body: JSON.stringify({
      company_id: companyId || user?.company_id,
      app_id: appId,
      user_email: user?.email,
      device_id: deviceId,
      records,
    }),
  });
}

const assistantGatewayService = {
  sendGatewayMessage,
  previewArtifact,
  getFieldProfiles,
  syncFieldCapture,
};

export default assistantGatewayService;
