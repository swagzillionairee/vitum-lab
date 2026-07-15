/*
 * Login.tsx — Vitum Lab customer login (/login)
 * Google OAuth + magic link. After auth, role is resolved via /api/me:
 * admins land on /admin, everyone else on /account. A secondary button
 * routes affiliates to their dedicated login.
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Mail, LogIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authedFetch } from "@/lib/api";
import SEO from "@/components/SEO";

export default function Login() {
  const { session, loading, signInWithGoogle, signInWithEmail } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Optional post-login destination (e.g. /checkout). Reject protocol-relative
  // and backslash variants that browsers can resolve as cross-origin URLs.
  const rawRedirect = new URLSearchParams(window.location.search).get("redirect");
  const redirect =
    rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.startsWith("/\\")
      ? rawRedirect
      : null;
  // Preserve the redirect across the OAuth / magic-link round trip.
  const authReturn = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login";

  // Once logged in, resolve role and route accordingly.
  useEffect(() => {
    if (loading || !session) return;
    (async () => {
      // An explicit redirect (e.g. returning to checkout) takes priority.
      if (redirect) return navigate(redirect);
      try {
        const res = await authedFetch("/api/me");
        if (res.ok) {
          const me = await res.json();
          if (me.isAdmin) return navigate("/admin");
          if (me.isAffiliate) return navigate("/affiliate/dashboard");
        }
      } catch {
        /* fall through to account */
      }
      navigate("/account");
    })();
  }, [loading, session, navigate, redirect]);

  const handleMagicLink = async () => {
    if (!email.includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await signInWithEmail(email, authReturn);
    setBusy(false);
    if (error) setError(error);
    else setSent(true);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 bg-page">
      <SEO title="Login" description="Sign in to your Vitum Lab account to view order history and shipping status." />
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-[0_2px_16px_oklch(0.13_0.01_260/0.1)] p-8">
        <div className="flex items-center gap-2 mb-1">
          <LogIn className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
          <h1 className="text-[1.25rem] font-bold text-[oklch(0.13_0.01_260)]">Sign in</h1>
        </div>
        <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-6">
          {redirect?.startsWith("/checkout")
            ? "Sign in to complete your checkout."
            : "Access your order history and shipping status."}
        </p>

        <button
          onClick={() => signInWithGoogle(authReturn)}
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
            <p className="text-[0.75rem] text-[oklch(0.52_0.01_260)] mt-1">We sent a magic link to {email}.</p>
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
            <button onClick={handleMagicLink} disabled={busy} className="w-full btn-primary py-2.5 text-[0.875rem] disabled:opacity-60">
              {busy ? "Sending…" : "Email me a magic link"}
            </button>
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-[oklch(0.93_0.004_260)] text-center">
          <p className="text-[0.75rem] text-[oklch(0.60_0.01_260)] mb-2">Are you a partner?</p>
          <Link
            href="/affiliate/login"
            className="inline-block w-full py-2.5 rounded-xl border border-[oklch(0.88_0.004_260)] text-[0.8125rem] font-semibold text-[oklch(0.35_0.15_260)] hover:bg-[oklch(0.98_0.002_260)] transition-colors"
          >
            Affiliate Login
          </Link>
        </div>
      </div>
    </div>
  );
}
