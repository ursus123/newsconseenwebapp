import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { supabaseEntities, supabase } from '@/api/supabaseEntityClient';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Real Base44 client — always initialised.
// When DATA_LAYER=supabase it is only used for integrations
// (UploadFile, InvokeLLM, SendEmail) which have no Supabase equivalent yet.
const _real = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl,
});

// ── Feature flag ──────────────────────────────────────────────────────────────
// Set VITE_DATA_LAYER=supabase in .env to activate.
// Leave unset (or set to "base44") to use Base44 as before.
const DATA_LAYER = import.meta.env.VITE_DATA_LAYER || 'base44';

// ── Supabase auth shim — full base44.auth.* surface ───────────────────────────
const _supabaseAuth = {
  // Most-used call — get current user from Supabase session + user_profiles
  async me() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error('Not authenticated');

    // Prefer user_profiles for company_id/role (server-authoritative)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('company_id, role, full_name')
      .eq('id', user.id)
      .single();

    return {
      id:               user.id,
      email:            user.email,
      full_name:        profile?.full_name  || user.user_metadata?.full_name || user.email,
      company_id:       profile?.company_id || user.app_metadata?.company_id || null,
      role:             profile?.role       || user.app_metadata?.role       || 'user',
      // Pass through any extra metadata pages might read
      ...user.user_metadata,
    };
  },

  // Sign out and optionally redirect
  logout(redirectUrl) {
    supabase.auth.signOut().then(() => {
      window.location.href = redirectUrl || window.location.origin;
    });
  },

  // Redirect to Supabase login page; store return URL in sessionStorage
  redirectToLogin(returnUrl) {
    if (returnUrl) sessionStorage.setItem('auth_return_url', returnUrl);
    window.location.href = '/login';
  },

  // Update user profile fields — role and company_id are server-only, never writable by the user
  async updateMe(data) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Strip privileged fields — callers like Enterprises.jsx pass company_id via updateMe
    // but in Supabase those are set server-side (user_profiles INSERT by admin, not self-service)
    const { role: _r, company_id: _c, ...safeData } = data;

    // Update Supabase user metadata (full_name, onboarding_complete, setup_complete, etc.)
    const metaFields = {};
    const META_ALLOWED = ['full_name', 'onboarding_complete', 'setup_complete', 'avatar_url'];
    for (const k of META_ALLOWED) {
      if (safeData[k] !== undefined) metaFields[k] = safeData[k];
    }
    if (Object.keys(metaFields).length) {
      await supabase.auth.updateUser({ data: metaFields });
    }

    // Write non-privileged profile fields to user_profiles
    const profileFields = { ...safeData };
    delete profileFields.password;
    if (Object.keys(profileFields).length) {
      await supabase.from('user_profiles').update({
        ...profileFields,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);
    }

    return { id: user.id, email: user.email, ...safeData };
  },

  // Alias — some pages call updateProfile instead of updateMe
  async updateProfile(data) {
    return this.updateMe(data);
  },

  // Change password via Supabase auth
  async changePassword({ currentPassword, newPassword }) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },

  // Alias — some pages call updatePassword
  async updatePassword({ currentPassword, newPassword }) {
    return this.changePassword({ currentPassword, newPassword });
  },

  // Verify password — used by LockScreen PIN check
  async verifyPassword({ password }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) throw new Error('Not authenticated');
    const { error } = await supabase.auth.signInWithPassword({
      email:    user.email,
      password,
    });
    if (error) throw new Error('Invalid password');
    return true;
  },
};

// ── Entity Proxy — intercepts every base44.entities.Xyz access ───────────────
// Unknown entity names fall back to the real Base44 entity so nothing breaks
// while the migration is in progress.
const _entityProxy = new Proxy({}, {
  get(_, name) {
    const supabaseEntity = supabaseEntities[name];
    if (supabaseEntity) return supabaseEntity;
    // Explicit fallback — logs clearly so split-brain data paths are visible in console.
    // These entities are intentionally staying on Base44 until their Supabase tables
    // are created and mapped. Check MIGRATION_STATUS in supabaseEntityClient.js.
    console.warn(
      `[base44→supabase] "${name}" has no Supabase table yet — reads/writes go to Base44. ` +
      `Data written here will NOT appear in Supabase analytics or RLS-scoped queries.`
    );
    return _real.entities?.[name];
  },
});

// ── Final export ──────────────────────────────────────────────────────────────
// When DATA_LAYER=supabase:
//   base44.entities.*     → Supabase (all 23 entities via _entityProxy)
//   base44.auth.*         → Supabase (_supabaseAuth shim)
//   base44.integrations.* → Base44 real client (UploadFile / InvokeLLM / SendEmail)
//
// When DATA_LAYER=base44 (default):
//   Everything routes to the real Base44 client — zero behaviour change.
export const base44 = DATA_LAYER === 'supabase'
  ? {
      entities:     _entityProxy,
      auth:         _supabaseAuth,
      integrations: _real.integrations,   // file upload + LLM stay on Base44 for now
    }
  : _real;
