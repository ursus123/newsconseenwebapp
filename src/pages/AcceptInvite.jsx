import { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseEntityClient";
import { RAILWAY_URL, RAILWAY_API_KEY } from "@/config/api";

const API_HEADERS = RAILWAY_API_KEY ? { "x-api-key": RAILWAY_API_KEY } : {};

// Consumes a Supabase invite-link hash token (parsed automatically by the
// supabase-js client on load), lets the invited user set a password, then
// materialises their user_profiles row via /onboarding/link-company
// (teammate mode — company_id/role come from their own app_metadata,
// stamped there at invite time by /onboarding/invite-user).
export default function AcceptInvite() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState(null); // null | "saving" | "linking" | "done" | "error"
  const [error, setError] = useState("");

  useEffect(() => {
    // supabase-js parses the invite link's hash tokens on client init and
    // fires SIGNED_IN once the temporary session is established.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
      setChecking(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setChecking(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setStatus("saving");
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw new Error(updateErr.message);

      setStatus("linking");
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${RAILWAY_URL}/onboarding/link-company`, {
        method: "POST",
        headers: { ...API_HEADERS, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not link your account to your team's workspace");
      }

      setStatus("done");
      window.location.href = "/CompanyGraphHome";
    } catch (err) {
      setStatus("error");
      setError(err.message || "Something went wrong. Please try again.");
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center space-y-2">
          <h1 className="text-lg font-semibold text-slate-800">Invite link invalid or expired</h1>
          <p className="text-sm text-slate-500">
            Ask whoever invited you to send a new invitation, or{" "}
            <a href="/login" className="text-emerald-600 hover:underline font-medium">sign in</a> if you already set a password.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-slate-800">Newsconseen</h1>
          <p className="text-sm text-slate-500 mt-1">Set a password to finish joining your team</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="••••••••"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Confirm password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={status === "saving" || status === "linking"}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {status === "saving" ? "Setting password…" :
             status === "linking" ? "Joining your team…" :
             "Set password & join"}
          </button>
        </form>
      </div>
    </div>
  );
}
