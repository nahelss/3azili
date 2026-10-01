import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';

// Wraps Supabase's session + the app-specific `users` row (full name, role,
// etc.) in one place, so screens don't each have to fetch/subscribe
// separately. `profile` is null until the person has completed sign-up
// (i.e. a `users` row with a role exists for their auth id) — that's the
// signal App.js uses to show the "finish your profile" step instead of the
// main app. `isAdmin` is a separate server-checked flag (is_admin() via
// RPC) — it does not grant anything by itself, App.js just uses it to
// decide whether to show the Admin screen; every actual admin action is
// re-checked server-side regardless.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      setIsAdmin(false);
      return;
    }
    setProfileLoading(true);
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    if (!error) setProfile(data ?? null);
    setProfileLoading(false);

    const { data: adminData } = await supabase.rpc('is_admin');
    setIsAdmin(!!adminData);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      loadProfile(data.session?.user?.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      loadProfile(newSession?.user?.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setIsAdmin(false);
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    profileLoading,
    isAdmin,
    refreshProfile: () => loadProfile(session?.user?.id),
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
