/*
 * shared.tsx — constants, formatters, and small presentational components
 * shared across the admin dashboard tabs (Kpi tile, revenue chart, Field).
 */

import { useState, type ReactNode } from "react";
import { BarChart3, type LucideIcon } from "lucide-react";
import type { ShippingAddress } from "./types";

export const BADGE_OPTIONS = ["", "Best Seller", "New", "Limited", "Out of Stock", "Sale"];
export const CATEGORY_OPTIONS = [
  "Metabolic Research",
  "Cosmetic / Tissue Research",
  "Cellular Research",
  "Reconstitution",
];

export const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]",
  finished: "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]",
  failed: "bg-[oklch(0.93_0.04_25)] text-[oklch(0.50_0.18_25)]",
  pending: "bg-[oklch(0.95_0.04_85)] text-[oklch(0.50_0.12_85)]",
  cancelled: "bg-[oklch(0.92_0.005_260)] text-[oklch(0.45_0.01_260)]",
};

export const FULFILLMENT_COLORS: Record<string, string> = {
  unfulfilled: "bg-[oklch(0.95_0.04_85)] text-[oklch(0.50_0.12_85)]",
  shipped: "bg-[oklch(0.93_0.05_260)] text-[oklch(0.40_0.16_260)]",
  delivered: "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]",
};

// Eastern time, 12-hour with AM/PM (auto-handles EST/EDT). e.g. "Jun 7, 2026, 1:32 PM ET"
export function formatDateEST(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }) + " ET";
}

const PAY_CURRENCY_LABELS: Record<string, string> = {
  btc: "Bitcoin (BTC)", eth: "Ethereum (ETH)", ltc: "Litecoin (LTC)",
  sol: "Solana (SOL)", bnb: "BNB", xrp: "XRP", doge: "Dogecoin (DOGE)",
  usdc: "USDC", usdttrc20: "USDT (TRC-20)", usdterc20: "USDT (ERC-20)",
  usdtsol: "USDT (Solana)", usdtbsc: "USDT (BSC)", usdcsol: "USDC (Solana)",
};
export function payLabel(code?: string | null): string | null {
  if (!code) return null;
  return PAY_CURRENCY_LABELS[code.toLowerCase()] ?? code.toUpperCase();
}

export function money(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function addressLines(a?: ShippingAddress | null): string[] {
  if (!a || !a.line1) return [];
  return [
    a.name,
    a.line1,
    a.line2,
    [a.city, a.state].filter(Boolean).join(", ") + (a.postal_code ? ` ${a.postal_code}` : ""),
    a.country,
    a.phone,
  ].filter((l): l is string => Boolean(l && l.trim()));
}

// ─── Color-coded KPI tile ──────────────────────────────────────────────────────
// tone drives the tint: good = green, warn = amber, urgent = red, info = cobalt.
export type Tone = "neutral" | "good" | "warn" | "urgent" | "info";

const TONE: Record<Tone, { card: string; icon: string; value: string }> = {
  neutral: { card: "bg-white border-[oklch(0.93_0.004_260)]", icon: "text-[oklch(0.52_0.01_260)]", value: "text-[oklch(0.13_0.01_260)]" },
  good:    { card: "bg-[oklch(0.98_0.02_155)] border-[oklch(0.89_0.05_155)]", icon: "text-[oklch(0.48_0.13_155)]", value: "text-[oklch(0.32_0.12_155)]" },
  warn:    { card: "bg-[oklch(0.98_0.03_85)] border-[oklch(0.89_0.06_85)]", icon: "text-[oklch(0.52_0.12_85)]", value: "text-[oklch(0.42_0.12_85)]" },
  urgent:  { card: "bg-[oklch(0.97_0.025_25)] border-[oklch(0.89_0.05_25)]", icon: "text-[oklch(0.55_0.18_25)]", value: "text-[oklch(0.48_0.18_25)]" },
  info:    { card: "bg-[oklch(0.98_0.02_260)] border-[oklch(0.90_0.04_260)]", icon: "text-[oklch(0.45_0.16_260)]", value: "text-[oklch(0.30_0.14_260)]" },
};

export function Kpi({
  icon: Icon, label, value, tone = "neutral", size = "lg", children,
}: {
  icon: LucideIcon; label: string; value: ReactNode; tone?: Tone;
  size?: "lg" | "md"; children?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className={`rounded-2xl border p-5 ${t.card}`}>
      <div className="flex items-center gap-2 mb-2 text-[oklch(0.52_0.01_260)]">
        <Icon className={`w-4 h-4 ${t.icon}`} />
        <span className="text-[0.75rem] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`${size === "lg" ? "text-[1.75rem]" : "text-[1.5rem]"} font-bold leading-none ${t.value}`}>{value}</p>
      {children && <div className="mt-2 text-[0.75rem] text-[oklch(0.55_0.01_260)]">{children}</div>}
    </div>
  );
}

// ─── Daily revenue bar chart (selectable 10 / 30 / 60 / 90-day window) ──────────
const REV_RANGES = [10, 30, 60, 90] as const;
type RevRange = (typeof REV_RANGES)[number];

export function RevenueChart({ data }: { data?: { date: string; revenue: number }[] }) {
  const [range, setRange] = useState<RevRange>(30);
  const series = (data ?? []).slice(-range);
  const max = Math.max(1, ...series.map((d) => d.revenue));
  const total = series.reduce((s, d) => s + d.revenue, 0);
  const fmtDay = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${Number(m)}/${Number(d)}`;
  };

  return (
    <section className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[oklch(0.45_0.16_260)]" />
          <div>
            <h3 className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)] leading-none">Revenue</h3>
            <p className="text-[0.75rem] text-[oklch(0.55_0.01_260)] mt-1">
              <span className="font-semibold text-[oklch(0.32_0.12_155)]">{money(total)}</span> in the last {range} days
            </p>
          </div>
        </div>
        <div className="flex gap-1 bg-[oklch(0.96_0.003_260)] rounded-full p-1">
          {REV_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-full text-[0.75rem] font-semibold transition-colors ${
                range === r
                  ? "bg-[oklch(0.40_0.16_260)] text-white"
                  : "text-[oklch(0.45_0.01_260)] hover:text-[oklch(0.13_0.01_260)]"
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <div className="h-40 flex items-center justify-center text-[0.8125rem] text-[oklch(0.55_0.01_260)]">
          No paid revenue in this window yet.
        </div>
      ) : (
        <>
          <div className="flex items-end gap-[2px] h-40">
            {series.map((d) => (
              <div key={d.date} className="group relative flex-1 h-full flex items-end">
                <div
                  className="w-full rounded-t-[3px] bg-[oklch(0.62_0.13_260)] group-hover:bg-[oklch(0.45_0.16_260)] transition-colors"
                  style={{ height: `${Math.max(d.revenue > 0 ? 3 : 0.5, (d.revenue / max) * 100)}%` }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10 whitespace-nowrap rounded-lg bg-[oklch(0.13_0.01_260)] px-2 py-1 text-[0.6875rem] font-semibold text-white shadow-lg">
                  {fmtDay(d.date)} · {money(d.revenue)}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[0.6875rem] text-[oklch(0.60_0.01_260)]">
            <span>{series[0] ? fmtDay(series[0].date) : ""}</span>
            <span>Today</span>
          </div>
        </>
      )}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] mb-1">{label}</p>
      {children}
    </div>
  );
}
