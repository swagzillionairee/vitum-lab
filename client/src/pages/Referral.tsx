/*
 * Referral.tsx — Vitum Lab
 * Self-serve referral program, account-locked:
 *   - Sign in (Google or email magic-link) to get your unique code — it's tied
 *     to your account, so it can't be lost or claimed by anyone else
 *   - Buyers get a % off at checkout; referrer earns a flat bounty per N paid orders
 *   - Signed-in dashboard (stats + progress) + email Claim when a payout is due
 * All numbers come from the store config (Admin → Promos → Referral Program).
 */

import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Check, Copy, ArrowRight, Zap, Share2, DollarSign, Loader2, Mail, ShieldCheck, LogOut } from "lucide-react";
import SEO from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import { authedFetch } from "@/lib/api";

const CLAIM_EMAIL = "orders@vitumlab.com";

interface ReferralConfig { active: boolean; buyer_discount: number; bounty_amount: number; bounty_orders: number; }
interface Stats {
  active: boolean; code: string; link: string; buyer_discount: number;
  paid_orders: number; bounty_orders: number; bounty_amount: number;
  earned: number; toward_next: number; remaining_to_next: number; claimable: boolean;
}

export default function Referral() {
  const { session, user, loading: authLoading, signInWithGoogle, signInWithEmail, signOut } = useAuth();
  const [cfg, setCfg] = useState<ReferralConfig | null>(null);

  // Email magic-link sign-in
  const [email, setEmail] = useState("");
  const [sendingLink, setSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [signinErr, setSigninErr] = useState("");

  // Signed-in dashboard
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsErr, setStatsErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/public/site")
      .then((r) => r.json())
      .then((d) => setCfg(d.referral_program ?? { active: false, buyer_discount: 10, bounty_amount: 100, bounty_orders: 5 }))
      .catch(() => setCfg({ active: false, buyer_discount: 10, bounty_amount: 100, bounty_orders: 5 }));
  }, []);

  const loadStats = useCallback(async () => {
    setStatsErr(""); setLoadingStats(true);
    try {
      const res = await authedFetch("/api/account/referral-program");
      const d = await res.json();
      if (!res.ok) { setStatsErr(d.error ?? "Couldn't load your referral dashboard."); return; }
      setStats(d);
    } catch {
      setStatsErr("Something went wrong — please try again.");
    } finally {
      setLoadingStats(false);
    }
  }, []);

  // Once signed in, pull the account's code + dashboard.
  useEffect(() => {
    if (session) loadStats();
  }, [session, loadStats]);

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigninErr("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setSigninErr("Enter a valid email address."); return; }
    setSendingLink(true);
    try {
      const { error } = await signInWithEmail(email.trim(), "/referral");
      if (error) { setSigninErr(error); return; }
      setLinkSent(true);
    } catch {
      setSigninErr("Something went wrong — please try again.");
    } finally {
      setSendingLink(false);
    }
  };

  const copyCode = () => {
    if (!stats?.code) return;
    navigator.clipboard?.writeText(stats.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});
  };

  const bountyAmount = cfg?.bounty_amount ?? 100;
  const bountyOrders = cfg?.bounty_orders ?? 5;
  const buyerDiscount = cfg?.buyer_discount ?? 10;

  const payoutsDue = stats ? Math.floor(stats.paid_orders / stats.bounty_orders) : 0;
  const claimHref = stats
    ? `mailto:${CLAIM_EMAIL}?subject=${encodeURIComponent(`Referral payout claim — ${stats.code}`)}&body=${encodeURIComponent(
        `Referral code: ${stats.code}\nAccount: ${user?.email ?? ""}\nPaid referrals: ${stats.paid_orders}\nPayouts due: ${payoutsDue}\nAmount earned: $${stats.earned}\n\nRequesting my payout. Preferred method (PayPal / Venmo / crypto): `,
      )}`
    : "#";

  // ── Loading / inactive states ─────────────────────────────────────────────
  if (cfg === null) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[oklch(0.52_0.01_260)]" />
      </div>
    );
  }
  if (!cfg.active) {
    return (
      <div className="min-h-screen bg-[oklch(0.97_0.003_260)] flex items-center justify-center px-6">
        <SEO title="Referral Program" description="Share a code, earn cash. Vitum Lab referral program." />
        <div className="text-center max-w-md">
          <div className="inline-flex items-center gap-2 bg-[oklch(0.93_0.05_260)] text-[oklch(0.35_0.16_260)] text-[0.75rem] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full mb-6">
            <Zap className="w-3.5 h-3.5" /> Coming Soon
          </div>
          <h1 className="text-[2rem] font-bold text-[oklch(0.13_0.01_260)] mb-3">Referral program launching soon</h1>
          <p className="text-[oklch(0.45_0.01_260)]">Check back shortly — you'll be able to grab a code and start earning in seconds.</p>
          <Link href="/shop" className="btn-primary mt-6 inline-flex">Browse the catalog <ArrowRight className="w-4 h-4" /></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.004_255)]">
      <SEO
        title="Referral Program"
        description={`Share your code and earn $${bountyAmount} for every ${bountyOrders} paid orders. Your buyers get ${buyerDiscount}% off. Sign in to grab your code — no application, no cap, no expiry.`}
      />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="text-center px-6 pt-20 pb-14 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-[oklch(0.94_0.04_200)] text-[oklch(0.42_0.11_200)] text-[0.75rem] font-bold tracking-widest uppercase px-3.5 py-1.5 rounded-full mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[oklch(0.55_0.13_200)] inline-block" /> Open to everyone — no application
        </div>
        <h1 className="text-[2.75rem] sm:text-[3.75rem] font-bold leading-[1.05] tracking-tight text-[oklch(0.13_0.02_255)] mb-6">
          Share a Code.<br />Earn <span className="text-[oklch(0.55_0.13_200)]">${bountyAmount}</span> Forever.
        </h1>
        <p className="text-[1.0625rem] text-[oklch(0.45_0.01_260)] leading-relaxed max-w-xl mx-auto">
          Sign in and get your unique referral code in seconds — it's locked to your account, so your earnings can never
          be lost. Every {bountyOrders} orders placed using it = ${bountyAmount} cash. No cap. No expiry.
        </p>

        {/* Stat row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-14">
          {[
            { big: `$${bountyAmount}`, label: `Per ${bountyOrders} referrals` },
            { big: `${buyerDiscount}%`, label: "Off for your buyers" },
            { big: "∞", label: "No earnings cap" },
            { big: "10s", label: "To get started" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-[2rem] font-bold text-[oklch(0.13_0.02_255)] leading-none">{s.big}</p>
              <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-[oklch(0.55_0.01_260)] mt-2">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Sign in / dashboard card ──────────────────────────────────────── */}
      <section className="px-6 pb-20 max-w-2xl mx-auto">
        <div className="bg-white rounded-3xl shadow-[0_8px_40px_oklch(0.13_0.02_255/0.08)] border border-[oklch(0.93_0.004_260)] p-8 sm:p-10">
          {authLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[oklch(0.52_0.01_260)]" /></div>
          ) : !session ? (
            /* ── Signed-out: sign in to claim a code ─────────────────────── */
            <>
              <div className="inline-flex items-center gap-1.5 bg-[oklch(0.95_0.04_155)] text-[oklch(0.40_0.12_155)] text-[0.6875rem] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full mb-4">
                <ShieldCheck className="w-3.5 h-3.5" /> Saved to your account
              </div>
              <h2 className="text-[1.5rem] font-bold text-[oklch(0.13_0.02_255)]">Sign In to Get Your Code</h2>
              <p className="text-[0.9375rem] text-[oklch(0.45_0.01_260)] mt-1.5 mb-6">
                Signing in saves your code to your account, so every order — and every dollar you earn — is tracked
                and always there when you come back. Continue with Google or your email to grab it.
              </p>

              {linkSent ? (
                <div className="rounded-2xl bg-[oklch(0.96_0.03_155)] border border-[oklch(0.85_0.06_155)] p-6 text-center">
                  <Mail className="w-7 h-7 mx-auto text-[oklch(0.42_0.12_155)] mb-2" />
                  <p className="text-[0.9375rem] font-semibold text-[oklch(0.30_0.10_155)]">Check your inbox</p>
                  <p className="text-[0.8125rem] text-[oklch(0.40_0.06_155)] mt-1">
                    We sent a magic sign-in link to <span className="font-semibold">{email}</span>. Click it to open your referral dashboard.
                  </p>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => signInWithGoogle("/referral")}
                    className="w-full flex items-center justify-center gap-2.5 border border-[oklch(0.88_0.004_260)] rounded-xl px-4 py-3 text-[0.9375rem] font-semibold text-[oklch(0.20_0.01_260)] hover:bg-[oklch(0.98_0.003_260)] transition-colors"
                  >
                    <GoogleIcon /> Continue with Google
                  </button>

                  <div className="flex items-center gap-4 my-5">
                    <div className="flex-1 h-px bg-[oklch(0.92_0.004_260)]" />
                    <span className="text-[0.75rem] font-semibold text-[oklch(0.55_0.01_260)]">or</span>
                    <div className="flex-1 h-px bg-[oklch(0.92_0.004_260)]" />
                  </div>

                  <form onSubmit={sendMagicLink} className="flex flex-col sm:flex-row gap-2.5">
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="your@email.com"
                      className="flex-1 border border-[oklch(0.88_0.004_260)] rounded-xl px-4 py-3 text-[0.9375rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.13_200)] focus:border-transparent" />
                    <button type="submit" disabled={sendingLink}
                      className="flex items-center justify-center gap-1.5 bg-[oklch(0.55_0.13_200)] text-white font-semibold text-[0.9375rem] px-6 py-3 rounded-xl hover:bg-[oklch(0.48_0.13_200)] transition-colors disabled:opacity-60">
                      {sendingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Email me a link <ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </form>
                </>
              )}
              {signinErr && <p className="text-[0.8125rem] text-red-500 mt-3">{signinErr}</p>}

              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-6">
                {["Free forever", "No approval needed", "Saved to your account", `Gives buyers ${buyerDiscount}% off`].map((t) => (
                  <span key={t} className="flex items-center gap-1.5 text-[0.8125rem] text-[oklch(0.40_0.10_155)] font-medium">
                    <Check className="w-4 h-4 flex-shrink-0" /> {t}
                  </span>
                ))}
              </div>
            </>
          ) : loadingStats && !stats ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[oklch(0.52_0.01_260)]" /></div>
          ) : statsErr ? (
            <div className="text-center py-6">
              <p className="text-[0.875rem] text-red-500 mb-3">{statsErr}</p>
              <button onClick={loadStats} className="btn-primary inline-flex">Try again</button>
            </div>
          ) : stats && !stats.active ? (
            <div className="text-center py-6">
              <p className="text-[0.9375rem] text-[oklch(0.45_0.01_260)]">The referral program isn't open right now — check back soon.</p>
            </div>
          ) : stats ? (
            /* ── Signed-in: code + dashboard ─────────────────────────────── */
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[1.5rem] font-bold text-[oklch(0.13_0.02_255)]">Your Referral Dashboard</h2>
                  <p className="text-[0.875rem] text-[oklch(0.45_0.01_260)] mt-1">{user?.email}</p>
                </div>
                <button onClick={() => signOut()} className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)] flex-shrink-0">
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>

              {/* Your code */}
              <div className="rounded-2xl bg-[oklch(0.96_0.03_200)] border border-[oklch(0.88_0.05_200)] p-6 text-center mt-5">
                <p className="text-[0.75rem] font-semibold tracking-widest uppercase text-[oklch(0.45_0.08_200)] mb-2">Your code</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-[2rem] font-bold tracking-wide text-[oklch(0.20_0.06_200)] font-mono">{stats.code}</span>
                  <button onClick={copyCode} className="flex items-center gap-1 text-[0.8125rem] font-semibold text-[oklch(0.42_0.11_200)] border border-[oklch(0.80_0.06_200)] rounded-full px-3 py-1.5 hover:bg-white transition-colors">
                    {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                </div>
                <p className="text-[0.8125rem] text-[oklch(0.42_0.03_200)] mt-3">Share it anywhere. Buyers enter it at checkout for {stats.buyer_discount}% off — and it counts toward your ${stats.bounty_amount}.</p>
              </div>

              {/* Stats */}
              <div className="mt-6 rounded-2xl border border-[oklch(0.93_0.004_260)] overflow-hidden">
                <div className="bg-[oklch(0.13_0.02_255)] text-white px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-white/50">Paid referrals</p>
                    <p className="text-[1.25rem] font-bold">{stats.paid_orders}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-white/50">Earned</p>
                    <p className="text-[1.25rem] font-bold text-[oklch(0.80_0.14_155)]">${stats.earned}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 divide-x divide-[oklch(0.93_0.004_260)]">
                  <div className="px-6 py-4 text-center">
                    <p className="text-[1.5rem] font-bold text-[oklch(0.13_0.02_255)]">{payoutsDue}</p>
                    <p className="text-[0.6875rem] font-semibold tracking-wide uppercase text-[oklch(0.55_0.01_260)]">Payouts of ${stats.bounty_amount}</p>
                  </div>
                  <div className="px-6 py-4 text-center">
                    <p className="text-[1.5rem] font-bold text-[oklch(0.13_0.02_255)]">{stats.buyer_discount}%</p>
                    <p className="text-[0.6875rem] font-semibold tracking-wide uppercase text-[oklch(0.55_0.01_260)]">Buyer discount</p>
                  </div>
                </div>
                {/* Progress to next payout */}
                <div className="px-6 py-4 border-t border-[oklch(0.93_0.004_260)]">
                  <div className="flex items-center justify-between text-[0.8125rem] mb-1.5">
                    <span className="text-[oklch(0.45_0.01_260)]">Progress to next ${stats.bounty_amount}</span>
                    <span className="font-semibold text-[oklch(0.13_0.02_255)]">{stats.toward_next} / {stats.bounty_orders}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[oklch(0.93_0.004_260)] overflow-hidden">
                    <div className="h-full rounded-full bg-[oklch(0.55_0.13_200)]" style={{ width: `${(stats.toward_next / stats.bounty_orders) * 100}%` }} />
                  </div>
                  <p className="text-[0.75rem] text-[oklch(0.55_0.01_260)] mt-2">
                    {stats.remaining_to_next === stats.bounty_orders
                      ? `${stats.bounty_orders} more paid orders unlock your next $${stats.bounty_amount}.`
                      : `${stats.remaining_to_next} more paid order${stats.remaining_to_next !== 1 ? "s" : ""} until your next $${stats.bounty_amount}.`}
                  </p>
                </div>
                {/* Claim */}
                <div className="px-6 py-4 border-t border-[oklch(0.93_0.004_260)] bg-[oklch(0.98_0.002_260)]">
                  {stats.claimable ? (
                    <a href={claimHref} className="flex items-center justify-center gap-2 bg-[oklch(0.40_0.14_155)] text-white font-semibold text-[0.9375rem] px-6 py-3 rounded-xl hover:bg-[oklch(0.35_0.14_155)] transition-colors">
                      <DollarSign className="w-4 h-4" /> Claim ${payoutsDue * stats.bounty_amount}
                    </a>
                  ) : (
                    <p className="text-center text-[0.8125rem] text-[oklch(0.55_0.01_260)]">
                      Hit {stats.bounty_orders} paid referrals to unlock your first payout.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="px-6 py-16 bg-white border-y border-[oklch(0.93_0.004_260)]">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-[oklch(0.94_0.04_200)] text-[oklch(0.42_0.11_200)] text-[0.75rem] font-bold tracking-widest uppercase px-3 py-1 rounded-full mb-4">
            <Zap className="w-3.5 h-3.5" /> How it works
          </div>
          <h2 className="text-[2.25rem] font-bold tracking-tight text-[oklch(0.13_0.02_255)] mb-2">Three Steps. No Experience Needed.</h2>
          <p className="text-[oklch(0.45_0.01_260)] mb-10">If you can paste a link, you can earn with this.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { tag: "1", title: "Sign In & Get Your Code", body: `Sign in with Google or your email above. Your personal code — like SARAH or MIKE3 — is ready instantly and tied to your account, so it's never lost.` },
              { tag: "2", title: "Share It Anywhere", body: `Drop it in Reddit threads, Discord servers, forums — anywhere people talk about peptides or research. Your buyers get ${buyerDiscount}% off automatically.` },
              { tag: `$${bountyAmount}`, title: "Get Paid", body: `Every ${bountyOrders} paid orders using your code = $${bountyAmount} cash. Hit Claim on your dashboard and we pay within 48 hours. No cap — ever.` },
            ].map((s) => (
              <div key={s.title} className="bg-[oklch(0.98_0.003_260)] rounded-2xl border border-[oklch(0.93_0.004_260)] p-6">
                <span className="inline-flex items-center justify-center min-w-[3rem] h-12 px-3 rounded-xl bg-[oklch(0.94_0.04_200)] text-[oklch(0.42_0.11_200)] text-[1.125rem] font-bold mb-4">{s.tag}</span>
                <h3 className="text-[1.0625rem] font-bold text-[oklch(0.13_0.02_255)] mb-2">{s.title}</h3>
                <p className="text-[0.875rem] text-[oklch(0.45_0.01_260)] leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Where to share ────────────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-[oklch(0.94_0.04_200)] text-[oklch(0.42_0.11_200)] text-[0.75rem] font-bold tracking-widest uppercase px-3 py-1 rounded-full mb-4">
            <Share2 className="w-3.5 h-3.5" /> Where to share
          </div>
          <h2 className="text-[2.25rem] font-bold tracking-tight text-[oklch(0.13_0.02_255)] mb-10">Your Code Goes Everywhere</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { emoji: "👾", name: "Reddit", body: "r/PeptideScience, r/Nootropics, r/longevity — drop it in threads where people ask where to buy." },
              { emoji: "💬", name: "Discord", body: "Biohacking servers, fitness communities, research groups — pin it or share on request." },
              { emoji: "🎵", name: "TikTok / Instagram", body: "Add it to your bio or drop it in comments on peptide or biohacking content." },
              { emoji: "🐦", name: "X / Twitter", body: "Tweet it, pin it, reply to peptide threads. One viral reply can pay for months." },
            ].map((c) => (
              <div key={c.name} className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6">
                <div className="text-[1.75rem] mb-3">{c.emoji}</div>
                <h3 className="text-[1rem] font-bold text-[oklch(0.13_0.02_255)] mb-1.5">{c.name}</h3>
                <p className="text-[0.8125rem] text-[oklch(0.45_0.01_260)] leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section className="px-6 py-16 bg-white border-t border-[oklch(0.93_0.004_260)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-[2.25rem] font-bold tracking-tight text-[oklch(0.13_0.02_255)] mb-8 text-center">Referral FAQ</h2>
          <div className="space-y-3">
            {[
              { q: `How exactly does the $${bountyAmount} payout work?`, a: `Every ${bountyOrders} paid orders using your code earns you $${bountyAmount} cash. Orders build toward it; the ${ordinal(bountyOrders)} triggers it — then the cycle resets. No cap. ${bountyOrders * 2} referrals = $${bountyAmount * 2}. ${bountyOrders * 10} = $${bountyAmount * 10}.` },
              { q: "Why do I need to sign in?", a: "Your code is locked to your account, so every order it brings in — and every dollar you earn — is tracked to you and can never be lost or claimed by someone else. Sign in once with Google or an email link and your dashboard is always there." },
              { q: "How do I claim my payout?", a: `Once you hit ${bountyOrders} referrals a Claim button appears on your dashboard. Click it — it opens an email to ${CLAIM_EMAIL} with your code and stats pre-filled. Just hit send. We process within 48 hours via PayPal, Venmo, or crypto.` },
              { q: "What does my referral get?", a: `Anyone who enters your code at checkout gets ${buyerDiscount}% off their entire order. That's a real discount that makes people actually want to use your code.` },
              { q: "Does my code expire?", a: "Never. Post it once in a forum — if someone finds it six months later and orders, you get the credit." },
              { q: "Do I need a website or audience?", a: "Not at all. Some of our top earners just leave helpful comments in 2–3 Reddit communities. If you post about peptides anywhere online, you have everything you need." },
              { q: "Is there a minimum order size for referrals to count?", a: "No minimum. Any paid order with your code counts — single vials, kits, anything. As long as it's paid and your code was entered, it counts." },
            ].map((f) => (
              <details key={f.q} className="group bg-[oklch(0.98_0.003_260)] rounded-2xl border border-[oklch(0.93_0.004_260)] p-5">
                <summary className="flex items-center justify-between cursor-pointer list-none text-[0.9375rem] font-semibold text-[oklch(0.13_0.02_255)]">
                  {f.q}
                  <span className="text-[oklch(0.55_0.01_260)] group-open:rotate-45 transition-transform text-[1.25rem] leading-none">+</span>
                </summary>
                <p className="text-[0.875rem] text-[oklch(0.45_0.01_260)] leading-relaxed mt-3">{f.a}</p>
              </details>
            ))}
          </div>

          <p className="mt-10 text-center text-[0.6875rem] text-[oklch(0.65_0.01_260)] leading-relaxed">
            Referral rewards are for sharing only. All products are supplied strictly for in vitro / laboratory research use —
            not for human or veterinary consumption.
          </p>
        </div>
      </section>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
