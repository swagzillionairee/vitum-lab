/*
 * AdminLogin.tsx — Vitum Lab
 * Admin authentication via Supabase Auth (Google OAuth + magic link fallback).
 * After login, redirects to /admin. Access is gated server-side by the
 * admins table — non-admins land on the dashboard's "not authorized" state.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import SEO from "@/components/SEO";

export default function AdminLogin() {
  const { session, loading, signInWithGoogle, signInWithEmail } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate("/admin");
  }, [loading, session, navigate]);

  const handleMagicLink = async () => {
    if (!email.includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await signInWithEmail(email, "/admin");
    setBusy(false);
    if (error) setError(error);
    else setSent(true);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 bg-[oklch(0.98_0.002_260)]">
      <SEO title="Admin Login" description="Vitum Lab admin." />
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-[0_2px_16px_oklch(0.13_0.01_260/0.1)] p-8">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
          <h1 className="text-[1.25rem] font-bold text-[oklch(0.13_0.01_260)]">Admin Access</h1>
        </div>
        <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-6">
          Sign in to manage inventory and orders.
        </p>

        <button
          onClick={() => signInWithGoogle("/admin")}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-[oklch(0.88_0.004_260)] text-[oklch(0.20_0.01_260)] font-semibold text-[0.875rem] hover:bg-[oklch(0.98_0.002_260)] transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-[oklch(0.91_0.004_260)]" />
          <span className="text-[0.6875rem] text-[oklch(0.65_0.01_260)] uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-[oklch(0.91_0.004_260)]" />
        </div>

        {sent ? (
          <div className="text-center py-4">
            <Mail className="w-8 h-8 text-[oklch(0.35_0.15_260)] mx-auto mb-2" />
            <p className="text-[0.875rem] font-semibold text-[oklch(0.13_0.01_260)]">Check your email</p>
            <p className="text-[0.75rem] text-[oklch(0.52_0.01_260)] mt-1">
              We sent a magic link to {email}.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="you@example.com"
              className="w-full border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2.5 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
            />
            {error && <p className="text-[0.75rem] text-red-500">{error}</p>}
            <button
              onClick={handleMagicLink}
              disabled={busy}
              className="w-full btn-primary py-2.5 text-[0.875rem] disabled:opacity-60"
            >
              {busy ? "Sending…" : "Email me a magic link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
