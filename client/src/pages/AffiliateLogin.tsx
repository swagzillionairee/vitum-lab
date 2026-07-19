/*
 * AffiliateLogin.tsx — Vitum Lab affiliate login (/affiliate/login)
 * Magic-link email only (small closed group, no Google). After auth,
 * redirects to the affiliate dashboard.
 */

import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Mail, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import SEO from "@/components/SEO";

export default function AffiliateLogin() {
  const { session, loading, signInWithEmail } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate("/affiliate/dashboard");
  }, [loading, session, navigate]);

  const handleMagicLink = async () => {
    if (!email.includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await signInWithEmail(email, "/affiliate/dashboard");
    setBusy(false);
    if (error) setError(error);
    else setSent(true);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 bg-[oklch(0.98_0.002_260)]">
      <SEO title="Affiliate Login" description="Vitum Lab affiliate portal." />
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-[0_2px_16px_oklch(0.13_0.01_260/0.1)] p-8">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
          <h1 className="text-[1.25rem] font-bold text-[oklch(0.13_0.01_260)]">Affiliate Portal</h1>
        </div>
        <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-6">
          Enter your registered email to receive a sign-in link.
        </p>

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
            {error && <p className="text-[0.75rem] text-red-600">{error}</p>}
            <button onClick={handleMagicLink} disabled={busy} className="w-full btn-primary py-2.5 text-[0.875rem] disabled:opacity-60">
              {busy ? "Sending…" : "Email me a magic link"}
            </button>
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-[oklch(0.93_0.004_260)] text-center">
          <Link href="/login" className="text-[0.75rem] text-[oklch(0.60_0.01_260)] hover:text-[oklch(0.13_0.01_260)]">
            ← Customer login
          </Link>
        </div>
      </div>
    </div>
  );
}
