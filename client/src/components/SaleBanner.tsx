/*
 * SaleBanner.tsx — storefront-wide banner for the active site-wide sale, with a
 * live countdown to the end date. Driven by GET /api/public/site (set in
 * Admin → Promos → Site-wide Sale). Renders nothing when no sale is running.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";

interface Sitewide {
  active: boolean;
  percent?: number;
  label?: string | null;
  ends_at?: string | null;
}

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export default function SaleBanner() {
  const [sale, setSale] = useState<Sitewide | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stale = false;
    fetch("/api/public/site")
      .then((r) => r.json())
      .then((d) => { if (!stale) setSale(d.sitewide ?? { active: false }); })
      .catch(() => {});
    return () => { stale = true; };
  }, []);

  const endsAt = sale?.ends_at ? new Date(sale.ends_at).getTime() : null;

  // Tick once a second only while there's a countdown to show.
  useEffect(() => {
    if (!sale?.active || !endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sale?.active, endsAt]);

  if (!sale?.active) return null;
  if (endsAt && endsAt <= now) return null; // window closed — hide

  const remaining = endsAt ? endsAt - now : null;
  const label = sale.label?.trim() || "Limited-Time Sale";

  return (
    <Link
      href="/shop"
      className="block bg-[oklch(0.40_0.16_260)] text-white hover:bg-[oklch(0.36_0.16_260)] transition-colors"
      aria-label={`${label}: ${sale.percent}% off everything`}
    >
      <div className="container py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-center">
        <span className="text-[0.8125rem] font-bold tracking-wide">
          🔥 {label} — {sale.percent}% OFF everything
        </span>
        {remaining != null && (
          <span className="text-[0.75rem] font-semibold tabular-nums bg-white/15 rounded-full px-2.5 py-0.5">
            Ends in {formatRemaining(remaining)}
          </span>
        )}
        <span className="text-[0.75rem] font-semibold underline underline-offset-2">Shop now →</span>
      </div>
    </Link>
  );
}
