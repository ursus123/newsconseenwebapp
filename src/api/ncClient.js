import { supabaseEntities, supabase } from "@/api/supabaseEntityClient";
import { authHeaders, RAILWAY_URL } from "@/config/api";

const STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "tenant-files";

const auth = {
  async me() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error("Not authenticated");
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("company_id, role, full_name")
      .eq("id", user.id)
      .single();
    if (profileError && profileError.code !== "PGRST116") throw profileError;
    const metadata = user.user_metadata || {};
    const onboardingComplete = Boolean(
      metadata.setup_complete ?? metadata.onboarding_complete ?? false
    );
    return {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name || user.user_metadata?.full_name || user.email,
      company_id: profile?.company_id || user.app_metadata?.company_id || null,
      role: profile?.role || user.app_metadata?.role || "user",
      ...metadata,
      setup_complete: onboardingComplete,
      onboarding_complete: onboardingComplete,
    };
  },
  async logout(redirectUrl) {
    await supabase.auth.signOut();
    if (redirectUrl) window.location.href = redirectUrl;
  },
  redirectToLogin(returnUrl) {
    if (returnUrl) sessionStorage.setItem("auth_return_url", returnUrl);
    window.location.href = "/login";
  },
  async updateMe(data) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { role: _role, company_id: _companyId, password: _password, ...safe } = data;
    const metadata = Object.fromEntries(
      Object.entries(safe).filter(([key]) => ["full_name", "onboarding_complete", "setup_complete", "avatar_url"].includes(key)),
    );
    if (Object.keys(metadata).length) {
      const { error } = await supabase.auth.updateUser({ data: metadata });
      if (error) throw error;
    }
    const { error } = await supabase.from("user_profiles").update({ ...safe, updated_at: new Date().toISOString() }).eq("id", user.id);
    if (error) throw error;
    return { id: user.id, email: user.email, ...safe };
  },
  updateProfile(data) { return this.updateMe(data); },
  async changePassword({ newPassword }) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },
  updatePassword(payload) { return this.changePassword(payload); },
  async verifyPassword({ password }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) throw new Error("Not authenticated");
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (error) throw new Error("Invalid password");
    return true;
  },
};

function safeFileName(name = "upload") {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
}

async function uploadFile({ file }) {
  if (!file) throw new Error("A file is required");
  const user = await auth.me();
  if (!user.company_id) throw new Error("A tenant identity is required before uploading files");
  const path = `${user.company_id}/${user.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
  const { data, error: signedError } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 60 * 60 * 24);
  if (signedError) throw new Error(`Could not authorize uploaded file: ${signedError.message}`);
  return { file_url: data.signedUrl, storage_path: path, bucket: STORAGE_BUCKET };
}

async function governedIntegration(path, body) {
  const user = await auth.me();
  const response = await fetch(`${RAILWAY_URL}${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ company_id: user.company_id, ...body }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.detail?.message || result?.detail || `Governed service returned ${response.status}`);
  return result;
}

const entities = new Proxy(supabaseEntities, {
  get(target, name) {
    if (name in target) return target[name];
    throw new Error(`Entity "${String(name)}" has no canonical Supabase mapping.`);
  },
});

const integrations = {
  Core: {
    UploadFile: uploadFile,
    InvokeLLM: (payload) => governedIntegration("/integrations/idjwi-invoke", payload),
    ExtractDataFromUploadedFile: (payload) => governedIntegration("/integrations/document-extract", payload),
    SendEmail: (payload) => governedIntegration("/integrations/send-email", payload),
  },
};

const functions = {
  async invoke(name, payload = {}) {
    const response = await governedIntegration(`/integrations/function/${encodeURIComponent(name)}`, payload);
    return { data: response };
  },
};

export const ncClient = { entities, auth, integrations, functions };
