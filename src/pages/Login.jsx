import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseEntityClient';
import { APP_URL } from '@/config/api';

export default function Login() {
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [notice,   setNotice]   = useState('');

  const handlePasswordReset = async () => {
    setError('');
    setNotice('');
    if (!email) {
      setError('Enter your email address first.');
      return;
    }
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${APP_URL}/ResetPassword`,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setNotice('If that account exists, a password-reset link has been sent.');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // Keep the already-loaded React application alive; AuthContext receives
    // SIGNED_IN and loads the tenant profile without a cold page reload.
    const requestedReturnUrl = sessionStorage.getItem('auth_return_url') || '/app';
    const returnUrl = requestedReturnUrl.toLowerCase() === '/dashboard' ? '/app' : requestedReturnUrl;
    sessionStorage.removeItem('auth_return_url');
    navigate(returnUrl, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-slate-800">Newsconseen</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {notice && (
            <p role="status" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={loading}
            className="w-full text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
          >
            Forgot your password?
          </button>
        </form>
      </div>
    </div>
  );
}
