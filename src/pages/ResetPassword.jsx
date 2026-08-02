import { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseEntityClient";

export default function ResetPassword() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setHasSession(true);
      setChecking(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setChecking(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setComplete(true);
  };

  if (checking) {
    return <div className="min-h-screen grid place-items-center bg-slate-50" role="status">Verifying recovery link…</div>;
  }

  if (!hasSession) {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-50 p-4">
        <section className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Recovery link invalid or expired</h1>
          <p className="mt-2 text-sm text-slate-600">Request a new password-reset link from the sign-in page.</p>
          <a className="mt-4 inline-block text-sm font-semibold text-emerald-700 hover:underline" href="/login">Return to sign in</a>
        </section>
      </main>
    );
  }

  if (complete) {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-50 p-4">
        <section className="w-full max-w-sm rounded-xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Password updated</h1>
          <p className="mt-2 text-sm text-slate-600">Your new password is ready to use.</p>
          <a className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" href="/login">Continue to sign in</a>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center bg-slate-50 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Choose a new password</h1>
          <p className="mt-1 text-sm text-slate-500">Use at least eight characters.</p>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          New password
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Confirm new password
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </label>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <button className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={saving} type="submit">
          {saving ? "Updating password…" : "Update password"}
        </button>
      </form>
    </main>
  );
}
