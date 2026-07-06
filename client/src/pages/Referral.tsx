/*
 * Referral.tsx — Vitum Lab
 * Public, self-serve referral program (no application, no login):
 *   - Get a code instantly (name + email)
 *   - Buyers get a % off at checkout; referrer earns a flat bounty per N paid orders
 *   - Code-based dashboard (enter code → stats) + email Claim when a payout is due
 * All numbers come from the store config (Admin → Promos → Referral Program).
 */

import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Check, Copy, ArrowRight, Zap, Share2, DollarSign, Loader2 } from "lucide-react";
import SEO from "@/components/SEO";

const CLAIM_EMAIL = "orders@vitumlab.com";

interface ReferralConfig { active: boolean; buyer_discount: number; bounty_amount: number; bounty_orders: number; }
interface Stats {
  code: string; name: string | null; buyer_discount: number;
  paid_orders: number; bounty_orders: number; bounty_amount: number;
  earned: number; toward_next: number; remaining_to_next: number; claimable: boolean;
}

export default function Referral() {
  const [cfg, setCfg] = useState<ReferralConfig | null>(null);

  // Signup
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [signingUp, setSigningUp] = useState(false);
  const [signupErr, setSignupErr] = useState("");
  const [myCode, setMyCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Dashboard lookup
  const [lookupCode, setLookupCode] = useState("");
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsErr, setStatsErr] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/public/site")
      .then((r) => r.json())
      .then((d) => setCfg(d.referral_program ?? { active: false, buyer_discount: 10, bounty_amount: 100, bounty_orders: 5 }))
      .catch(() => setCfg({ active: false, buyer_discount: 10, bounty_amount: 100, bounty_orders: 5 }));
  }, []);

  const loadStats = async (code: string) => {
    setStatsErr(""); setLoadingStats(true); setStats(null);
    try {
      const res = await fetch(`/api/public/referral-stats?code=${encodeURIComponent(code.trim().toUpperCase())}`);
      const d = await res.json();
      if (!res.ok) { setStatsErr(d.error ?? "Couldn't load that code."); return; }
      setStats(d);
    } catch {
      setStatsErr("Something went wrong — please try again.");
    } finally {
      setLoadingStats(false);
    }
  };

  const signup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupErr("");
    if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setSignupErr("Enter your name and a valid email."); return; }
    setSigningUp(true);
    try {
      const res = await fetch("/api/public/referral-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { setSignupErr(d.error ?? "Couldn't create your code."); return; }
      setMyCode(d.code);
      setLookupCode(d.code);
      loadStats(d.code);
    } catch {
      setSignupErr("Something went wrong — please try again.");
    } finally {
      setSigningUp(false);
    }
  };

  const copyCode = () => {
    if (!myCode) return;
    navigator.clipboard?.writeText(myCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});
  };

  const claimHref = stats
    ? `mailto:${CLAIM_EMAIL}?subject=${encodeURIComponent(`Referral payout claim — ${stats.code}`)}&body=${encodeURIComponent(
        `Referral code: ${stats.code}\nName: ${stats.name ?? ""}\nPaid referrals: ${stats.paid_orders}\nPayouts due: ${Math.floor(stats.paid_orders / stats.bounty_orders)}\nAmount earned: $${stats.earned}\n\nRequesting my payout. Preferred method (PayPal / Venmo / crypto): `,
      )}`
    : "#";

  const bountyAmount = cfg?.bounty_amount ?? 100;
  const bountyOrders = cfg?.bounty_orders ?? 5;
  const buyerDiscount = cfg?.buyer_discount ?? 10;

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

  const payoutsDue = stats ? Math.floor(stats.paid_orders / stats.bounty_orders) : 0;

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.004_255)]">
      <SEO
        title="Referral Program"
        description={`Share your code and earn $${bountyAmount} for every ${bountyOrders} paid orders. Your buyers get ${buyerDiscount}% off. No application, no cap, no expiry.`}
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
          Get your unique referral code in seconds. Every {bountyOrders} orders placed using it = ${bountyAmount} cash.
          No cap. No expiry. Just share and earn.
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

      {/* ── Get code + dashboard card ─────────────────────────────────────── */}
      <section className="px-6 pb-20 max-w-2xl mx-auto">
        <div className="bg-white rounded-3xl shadow-[0_8px_40px_oklch(0.13_0.02_255/0.08)] border border-[oklch(0.93_0.004_260)] p-8 sm:p-10">
          <h2 className="text-[1.5rem] font-bold text-[oklch(0.13_0.02_255)]">Get Your Referral Code</h2>
          <p className="text-[0.9375rem] text-[oklch(0.45_0.01_260)] mt-1.5 mb-6">
            Enter your name and email — your personal code is created instantly and works at checkout right away.
          </p>

          {myCode ? (
            <div className="rounded-2xl bg-[oklch(0.96_0.03_200)] border border-[oklch(0.88_0.05_200)] p-6 text-center">
              <p className="text-[0.75rem] font-semibold tracking-widest uppercase text-[oklch(0.45_0.08_200)] mb-2">Your code</p>
              <div className="flex items-center justify-center gap-3">
                <span className="text-[2rem] font-bold tracking-wide text-[oklch(0.20_0.06_200)] font-mono">{myCode}</span>
                <button onClick={copyCode} className="flex items-center gap-1 text-[0.8125rem] font-semibold text-[oklch(0.42_0.11_200)] border border-[oklch(0.80_0.06_200)] rounded-full px-3 py-1.5 hover:bg-white transition-colors">
                  {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                </button>
              </div>
              <p className="text-[0.8125rem] text-[oklch(0.42_0.03_200)] mt-3">Share it anywhere. Buyers enter it at checkout for {buyerDiscount}% off — and it counts toward your ${bountyAmount}.</p>
            </div>
          ) : (
            <form onSubmit={signup} className="flex flex-col sm:flex-row gap-2.5">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First name"
                className="flex-1 border border-[oklch(0.88_0.004_260)] rounded-xl px-4 py-3 text-[0.9375rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.13_200)] focus:border-transparent" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="your@email.com"
                className="flex-1 border border-[oklch(0.88_0.004_260)] rounded-xl px-4 py-3 text-[0.9375rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.13_200)] focus:border-transparent" />
              <button type="submit" disabled={signingUp}
                className="flex items-center justify-center gap-1.5 bg-[oklch(0.55_0.13_200)] text-white font-semibold text-[0.9375rem] px-6 py-3 rounded-xl hover:bg-[oklch(0.48_0.13_200)] transition-colors disabled:opacity-60">
                {signingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Get Code <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}
          {signupErr && <p className="text-[0.8125rem] text-red-500 mt-3">{signupErr}</p>}

          {!myCode && (
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-5">
              {["Free forever", "No approval needed", "Works at checkout instantly", `Gives buyers ${buyerDiscount}% off`].map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-[0.8125rem] text-[oklch(0.40_0.10_155)] font-medium">
                  <Check className="w-4 h-4 flex-shrink-0" /> {t}
                </span>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-px bg-[oklch(0.92_0.004_260)]" />
            <span className="text-[0.75rem] font-semibold text-[oklch(0.55_0.01_260)]">Already have a code?</span>
            <div className="flex-1 h-px bg-[oklch(0.92_0.004_260)]" />
          </div>

          {/* Dashboard lookup */}
          <h3 className="text-[1.125rem] font-bold text-[oklch(0.13_0.02_255)]">Check Your Dashboard</h3>
          <p className="text-[0.875rem] text-[oklch(0.45_0.01_260)] mt-1 mb-4">Enter your referral code to view your stats, referrals, and earnings.</p>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input value={lookupCode} onChange={(e) => setLookupCode(e.target.value.toUpperCase())} placeholder="E.G. MARCUS OR SARAH2"
              className="flex-1 border border-[oklch(0.88_0.004_260)] rounded-xl px-4 py-3 text-[0.9375rem] font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[oklch(0.55_0.13_200)] focus:border-transparent" />
            <button onClick={() => loadStats(lookupCode)} disabled={loadingStats || !lookupCode.trim()}
              className="flex items-center justify-center gap-1.5 border border-[oklch(0.55_0.13_200)] text-[oklch(0.42_0.11_200)] font-semibold text-[0.9375rem] px-6 py-3 rounded-xl hover:bg-[oklch(0.97_0.02_200)] transition-colors disabled:opacity-50">
              {loadingStats ? <Loader2 className="w-4 h-4 animate-spin" /> : <>View Stats <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
          {statsErr && <p className="text-[0.8125rem] text-red-500 mt-3">{statsErr}</p>}

          {/* Stats result */}
          {stats && (
            <div className="mt-6 rounded-2xl border border-[oklch(0.93_0.004_260)] overflow-hidden">
              <div className="bg-[oklch(0.13_0.02_255)] text-white px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-white/50">Referral code</p>
                  <p className="text-[1.25rem] font-bold font-mono">{stats.code}</p>
                </div>
                <div className="text-right">
                  <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-white/50">Earned</p>
                  <p className="text-[1.25rem] font-bold text-[oklch(0.80_0.14_155)]">${stats.earned}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-[oklch(0.93_0.004_260)]">
                <div className="px-6 py-4 text-center">
                  <p className="text-[1.5rem] font-bold text-[oklch(0.13_0.02_255)]">{stats.paid_orders}</p>
                  <p className="text-[0.6875rem] font-semibold tracking-wide uppercase text-[oklch(0.55_0.01_260)]">Paid referrals</p>
                </div>
                <div className="px-6 py-4 text-center">
                  <p className="text-[1.5rem] font-bold text-[oklch(0.13_0.02_255)]">{payoutsDue}</p>
                  <p className="text-[0.6875rem] font-semibold tracking-wide uppercase text-[oklch(0.55_0.01_260)]">Payouts of ${stats.bounty_amount}</p>
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
          )}
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
              { tag: "1", title: "Get Your Code", body: `Enter your name and email above. Your personal code — like SARAH or MIKE3 — is ready instantly. No waiting, no approval.` },
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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
