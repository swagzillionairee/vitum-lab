/*
 * AuthContext.tsx — Vitum Lab
 * Wraps Supabase Auth session state for the React app.
 * Used by admin (and later affiliate/customer) login flows.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

// Supabase's browser client is sizeable and auth is not needed to paint the
// public storefront. Load it after React mounts so new visitors can render the
// landing page without parsing the auth SDK on the critical path.
async function loadSupabase() {
  return (await import("@/lib/supabase")).supabase;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle: (redirectTo: string) => Promise<void>;
  signInWithEmail: (email: string, redirectTo: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void loadSupabase()
      .then(async (supabase) => {
        if (!active || !supabase) {
          if (active) setLoading(false);
          return;
        }

        const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          if (active) setSession(nextSession);
        });
        unsubscribe = () => sub.subscription.unsubscribe();

        const { data } = await supabase.auth.getSession();
        if (active) {
          setSession(data.session);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const signInWithGoogle = async (redirectTo: string) => {
    const supabase = await loadSupabase();
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${redirectTo}` },
    });
  };

  const signInWithEmail = async (email: string, redirectTo: string) => {
    const supabase = await loadSupabase();
    if (!supabase) return { error: "Auth not configured" };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${redirectTo}` },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    const supabase = await loadSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
