import { createContext, useState, useContext, useEffect } from 'react';
import { appParams } from '@/lib/app-params';

// Lazy getter — avoids pulling @base44/sdk into the React module init chain
const getNcClient = () => import('@/api/ncClient').then(m => m.ncClient);

const DATA_LAYER = import.meta.env.VITE_DATA_LAYER || 'base44';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    if (DATA_LAYER === 'supabase') {
      _initSupabaseAuth();
    } else {
      checkAppState();
    }
  }, []);

  // ── Supabase auth path ────────────────────────────────────────────────────
  const _loadSupabaseUser = async (authUser) => {
    try {
      const { supabase } = await import('@/api/supabaseEntityClient');
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('company_id, role, full_name')
        .eq('id', authUser.id)
        .single();

      setUser({
        id:         authUser.id,
        email:      authUser.email,
        full_name:  profile?.full_name  || authUser.user_metadata?.full_name || authUser.email,
        company_id: profile?.company_id || authUser.app_metadata?.company_id || null,
        role:       profile?.role       || authUser.app_metadata?.role       || 'user',
        ...authUser.user_metadata,
      });
      setIsAuthenticated(true);
    } catch (e) {
      console.error('Failed to load Supabase user profile:', e);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Could not load user profile' });
    } finally {
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
    }
  };

  const _initSupabaseAuth = async () => {
    const { supabase } = await import('@/api/supabaseEntityClient');

    // Check existing session
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await _loadSupabaseUser(session.user);
    } else {
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    }

    // Keep in sync with Supabase session changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setAuthError(null);
        await _loadSupabaseUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
    });
  };

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      try {
        const headers = { 'X-App-Id': appParams.appId };
        if (appParams.token) headers['Authorization'] = `Bearer ${appParams.token}`;
        const resp = await fetch(`/api/apps/public/prod/public-settings/by-id/${appParams.appId}`, { headers });
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          const err = new Error(data?.message || 'Failed to load app');
          err.status = resp.status;
          err.response = { status: resp.status, data };
          throw err;
        }
        const publicSettings = await resp.json();
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);
        
        // Handle app-level errors
        const errStatus = appError.response?.status ?? appError.status;
        const errReason = appError.response?.data?.extra_data?.reason ?? appError.data?.extra_data?.reason;
        if (errStatus === 403 && errReason) {
          const reason = errReason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const ncClient = await getNcClient();
      const currentUser = await ncClient.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    const ncClient = await getNcClient();
    if (shouldRedirect) {
      ncClient.auth.logout(window.location.href);
    } else {
      ncClient.auth.logout();
    }
  };

  const navigateToLogin = async () => {
    const ncClient = await getNcClient();
    ncClient.auth.redirectToLogin(window.location.origin + "/Dashboard");
  };

  // Refresh user data (e.g. after onboarding_complete is set)
  const refreshUser = async () => {
    try {
      const ncClient = await getNcClient();
      const u = await ncClient.auth.me();
      setUser(u);
    } catch (_) {}
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};