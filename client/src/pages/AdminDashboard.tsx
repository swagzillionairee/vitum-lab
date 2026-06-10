/*
 * AdminDashboard.tsx — Vitum Lab
 * Owner-only dashboard. Tabs: Products | Inventory | Orders
 * - Products: add/edit/delete products, manage variants (price, sale, image), badge, visibility
 * - Inventory: edit stock levels, toggle active/inactive per cart_code
 * - Orders: paginated order table with status badges
 */

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useLocation } from "wouter";
import {
  Package, ClipboardList, LogOut, Loader2, Check, Plus,
  Pencil, Trash2, X, Upload, ShoppingBag, ImageOff,
  Truck, RefreshCw, Ban, CheckCircle2, ChevronDown,
  LayoutDashboard, DollarSign, Clock, AlertTriangle, TrendingUp,
  Wallet, Repeat, XCircle, BarChart3, Users, Mail, Tag, UserRound,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authedFetch } from "@/lib/api";
import { invalidateProductsCache } from "@/hooks/useProducts";
import OrderTimeline from "@/components/OrderTimeline";
import SEO from "@/components/SEO";

// ─── Types ────────────────────────────────────────────────────────────────────
interface InventoryRow {
  cart_code: string;
  stock: number;
  is_active: boolean;
  updated_at: string;
}

interface OrderItem {
  name: string;
  dose: string;
  quantity: number;
  cartCode: string;
  price: number;
}

interface ShippingAddress {
  name?: string; line1?: string; line2?: string; city?: string;
  state?: string; postal_code?: string; country?: string; phone?: string;
}

interface OrderRow {
  id: string;
  email: string;
  net_amount: number;
  gross_amount?: number;
  discount_amount?: number;
  discount_code?: string | null;
  commission_amount?: number | null;
  status: string;
  created_at: string;
  items?: OrderItem[];
  fulfillment_status?: string;
  tracking_number?: string | null;
  carrier?: string | null;
  cancel_reason?: string | null;
  pay_currency?: string | null;
  pay_amount?: number | null;
  confirmed_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  shipping_address?: ShippingAddress | null;
  emails_sent?: Record<string, string> | null;
}

interface AffiliatePayout { id: string; affiliate_id: string; amount: number; note: string | null; created_at: string }
interface AffiliateRow {
  id: string;
  email: string;
  code: string;
  name: string | null;
  discount_percent: number;
  commission_percent: number;
  orders: number;
  earned: number;
  paid: number;
  owed: number;
  payouts: AffiliatePayout[];
}

interface PromoRow {
  id: string;
  code: string;
  percent_off: number;
  min_subtotal: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface Variant {
  id: string;
  dose: string;
  lot: string;
  price: number;
  sale_price: number | null;
  sale_ends_at: string | null;
  image_url: string;
  cart_code: string;
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  full_name: string;
  category: string;
  tagline: string;
  description: string;
  long_description: string;
  card_bg: string;
  badge: string | null;
  variants: Variant[];
  specs: { label: string; value: string }[];
  storage_instructions: string;
  reconstitution_note: string | null;
  research_notes: string[];
  coa_href: string;
  is_active: boolean;
  display_order: number;
}

const BADGE_OPTIONS = ["", "Best Seller", "New", "Limited", "Out of Stock", "Sale"];
const CATEGORY_OPTIONS = [
  "Metabolic Research",
  "Cosmetic / Tissue Research",
  "Cellular Research",
  "Reconstitution",
];

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]",
  finished: "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]",
  failed: "bg-[oklch(0.93_0.04_25)] text-[oklch(0.50_0.18_25)]",
  pending: "bg-[oklch(0.95_0.04_85)] text-[oklch(0.50_0.12_85)]",
  cancelled: "bg-[oklch(0.92_0.005_260)] text-[oklch(0.45_0.01_260)]",
};

const FULFILLMENT_COLORS: Record<string, string> = {
  unfulfilled: "bg-[oklch(0.95_0.04_85)] text-[oklch(0.50_0.12_85)]",
  shipped: "bg-[oklch(0.93_0.05_260)] text-[oklch(0.40_0.16_260)]",
  delivered: "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]",
};

// Eastern time, 12-hour with AM/PM (auto-handles EST/EDT). e.g. "Jun 7, 2026, 1:32 PM ET"
function formatDateEST(iso: string): string {
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
function payLabel(code?: string | null): string | null {
  if (!code) return null;
  return PAY_CURRENCY_LABELS[code.toLowerCase()] ?? code.toUpperCase();
}

function money(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function addressLines(a?: ShippingAddress | null): string[] {
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
type Tone = "neutral" | "good" | "warn" | "urgent" | "info";

const TONE: Record<Tone, { card: string; icon: string; value: string }> = {
  neutral: { card: "bg-white border-[oklch(0.93_0.004_260)]", icon: "text-[oklch(0.52_0.01_260)]", value: "text-[oklch(0.13_0.01_260)]" },
  good:    { card: "bg-[oklch(0.98_0.02_155)] border-[oklch(0.89_0.05_155)]", icon: "text-[oklch(0.48_0.13_155)]", value: "text-[oklch(0.32_0.12_155)]" },
  warn:    { card: "bg-[oklch(0.98_0.03_85)] border-[oklch(0.89_0.06_85)]", icon: "text-[oklch(0.52_0.12_85)]", value: "text-[oklch(0.42_0.12_85)]" },
  urgent:  { card: "bg-[oklch(0.97_0.025_25)] border-[oklch(0.89_0.05_25)]", icon: "text-[oklch(0.55_0.18_25)]", value: "text-[oklch(0.48_0.18_25)]" },
  info:    { card: "bg-[oklch(0.98_0.02_260)] border-[oklch(0.90_0.04_260)]", icon: "text-[oklch(0.45_0.16_260)]", value: "text-[oklch(0.30_0.14_260)]" },
};

function Kpi({
  icon: Icon, label, value, tone = "neutral", size = "lg", children,
}: {
  icon: LucideIcon; label: string; value: React.ReactNode; tone?: Tone;
  size?: "lg" | "md"; children?: React.ReactNode;
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

function RevenueChart({ data }: { data?: { date: string; revenue: number }[] }) {
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

// ─── Variant editor sub-component ─────────────────────────────────────────────
function VariantEditor({
  variants,
  onChange,
}: {
  variants: Variant[];
  onChange: (v: Variant[]) => void;
}) {
  const update = (i: number, patch: Partial<Variant>) => {
    const copy = variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v));
    onChange(copy);
  };

  const add = () =>
    onChange([
      ...variants,
      { id: `variant-${Date.now()}`, dose: "", lot: "", price: 0, sale_price: null, sale_ends_at: null, image_url: "", cart_code: "" },
    ]);

  const remove = (i: number) => onChange(variants.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {variants.map((v, i) => (
        <div key={i} className="border border-[oklch(0.88_0.004_260)] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[0.8125rem] font-semibold text-[oklch(0.13_0.01_260)]">Variant {i + 1}</span>
            {variants.length > 1 && (
              <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Dose (e.g. 10 MG)">
              <input value={v.dose} onChange={(e) => update(i, { dose: e.target.value })} className="input-sm" />
            </Field>
            <Field label="LOT">
              <input value={v.lot} onChange={(e) => update(i, { lot: e.target.value })} className="input-sm" />
            </Field>
            <Field label="Cart Code">
              <input value={v.cart_code} onChange={(e) => update(i, { cart_code: e.target.value })} className="input-sm font-mono" />
            </Field>
            <Field label="Price ($)">
              <input type="number" min={0} value={v.price} onChange={(e) => update(i, { price: Number(e.target.value) })} className="input-sm" />
            </Field>
            <Field label="Sale Price ($) — optional">
              <input type="number" min={0} value={v.sale_price ?? ""} placeholder="—"
                onChange={(e) => update(i, { sale_price: e.target.value ? Number(e.target.value) : null })} className="input-sm" />
            </Field>
            <Field label="Sale Ends At — optional">
              <input type="datetime-local" value={v.sale_ends_at ? v.sale_ends_at.slice(0, 16) : ""}
                onChange={(e) => update(i, { sale_ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className="input-sm" />
            </Field>
          </div>
          <Field label="Image URL (or upload below)">
            <input value={v.image_url} onChange={(e) => update(i, { image_url: e.target.value })} className="input-sm font-mono" placeholder="/path/to/image.png" />
          </Field>
          <ImageUploadButton onUploaded={(url) => update(i, { image_url: url })} currentUrl={v.image_url} />
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.35_0.15_260)] hover:underline">
        <Plus className="w-4 h-4" /> Add Variant
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] mb-1">{label}</p>
      {children}
    </div>
  );
}

function ImageUploadButton({ onUploaded, currentUrl }: { onUploaded: (url: string) => void; currentUrl: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    setUploading(true);
    setError("");
    const res = await authedFetch("/api/admin/upload", {
      method: "POST",
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    });
    if (!res.ok) { setError("Upload failed"); setUploading(false); return; }
    const { signedUrl, path } = await res.json();

    const put = await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!put.ok) { setError("Upload failed"); setUploading(false); return; }

    const publicUrl = `https://mddgtvwcwsmlbwiafdvq.supabase.co/storage/v1/object/public/product-images/${path}`;
    onUploaded(publicUrl);
    setUploading(false);
  };

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-[oklch(0.35_0.15_260)] border border-[oklch(0.35_0.15_260)] px-3 py-1.5 rounded-lg hover:bg-[oklch(0.96_0.008_260)] disabled:opacity-50"
      >
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {uploading ? "Uploading…" : "Upload Image"}
      </button>
      {currentUrl && (
        <div className="mt-2 flex items-center gap-2">
          <img src={currentUrl} alt="" className="w-12 h-12 object-cover rounded-lg border border-[oklch(0.91_0.004_260)]"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <span className="text-[0.6875rem] text-[oklch(0.60_0.01_260)] truncate max-w-[200px]">{currentUrl.split("/").pop()}</span>
        </div>
      )}
      {error && <p className="text-[0.75rem] text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ─── Product edit / create modal ──────────────────────────────────────────────
function ProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: ProductRow | null;
  onClose: () => void;
  onSaved: (p: ProductRow) => void;
}) {
  const isNew = !product;
  const [form, setForm] = useState<Omit<ProductRow, "id" | "updated_at">>({
    slug: product?.slug ?? "",
    name: product?.name ?? "",
    full_name: product?.full_name ?? "",
    category: product?.category ?? CATEGORY_OPTIONS[0],
    tagline: product?.tagline ?? "",
    description: product?.description ?? "",
    long_description: product?.long_description ?? "",
    card_bg: product?.card_bg ?? "#f5f5f5",
    badge: product?.badge ?? null,
    variants: product?.variants ?? [{ id: `v-${Date.now()}`, dose: "", lot: "", price: 0, sale_price: null, sale_ends_at: null, image_url: "", cart_code: "" }],
    specs: product?.specs ?? [],
    storage_instructions: product?.storage_instructions ?? "",
    reconstitution_note: product?.reconstitution_note ?? null,
    research_notes: product?.research_notes ?? [],
    coa_href: product?.coa_href ?? "",
    is_active: product?.is_active ?? true,
    display_order: product?.display_order ?? 99,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true);
    setError("");
    const body = isNew ? { ...form } : { id: product.id, ...form };
    const res = await authedFetch("/api/admin/products", {
      method: isNew ? "POST" : "PATCH",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error ?? "Save failed"); return; }
    const saved = await res.json();
    invalidateProductsCache();
    onSaved(saved);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto p-4">
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-[oklch(0.91_0.004_260)]">
          <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">
            {isNew ? "Add Product" : `Edit — ${product.name}`}
          </h2>
          <button onClick={onClose} className="text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)]"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name (short, e.g. GLP-3 (R))">
              <input value={form.name} onChange={(e) => set({ name: e.target.value })} className="input-sm w-full" />
            </Field>
            <Field label="Slug (URL, e.g. retatrutide)">
              <input value={form.slug} onChange={(e) => set({ slug: e.target.value })} className="input-sm w-full font-mono" />
            </Field>
          </div>
          <Field label="Full Name">
            <input value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} className="input-sm w-full" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <select value={form.category} onChange={(e) => set({ category: e.target.value })} className="input-sm w-full">
                {CATEGORY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Badge (optional)">
              <select value={form.badge ?? ""} onChange={(e) => set({ badge: e.target.value || null })} className="input-sm w-full">
                {BADGE_OPTIONS.map((b) => <option key={b} value={b}>{b || "None"}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Card Background Color">
              <div className="flex items-center gap-2">
                <input type="color" value={form.card_bg} onChange={(e) => set({ card_bg: e.target.value })}
                  className="w-10 h-9 rounded border border-[oklch(0.88_0.004_260)] cursor-pointer" />
                <input value={form.card_bg} onChange={(e) => set({ card_bg: e.target.value })} className="input-sm flex-1 font-mono" />
              </div>
            </Field>
            <Field label="Display Order">
              <input type="number" value={form.display_order} onChange={(e) => set({ display_order: Number(e.target.value) })} className="input-sm w-full" />
            </Field>
          </div>
          <Field label="Tagline">
            <input value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} className="input-sm w-full" />
          </Field>
          <Field label="Short Description (shop card)">
            <textarea value={form.description} onChange={(e) => set({ description: e.target.value })}
              rows={2} className="input-sm w-full resize-none" />
          </Field>
          <Field label="Long Description (detail page)">
            <textarea value={form.long_description} onChange={(e) => set({ long_description: e.target.value })}
              rows={4} className="input-sm w-full resize-none" />
          </Field>
          <Field label="Storage Instructions">
            <textarea value={form.storage_instructions} onChange={(e) => set({ storage_instructions: e.target.value })}
              rows={2} className="input-sm w-full resize-none" />
          </Field>
          <Field label="Reconstitution Note (optional)">
            <textarea value={form.reconstitution_note ?? ""} onChange={(e) => set({ reconstitution_note: e.target.value || null })}
              rows={2} className="input-sm w-full resize-none" />
          </Field>
          <Field label="Research Notes (one per line)">
            <textarea value={(form.research_notes ?? []).join("\n")}
              onChange={(e) => set({ research_notes: e.target.value.split("\n").filter(Boolean) })}
              rows={4} className="input-sm w-full resize-none font-mono text-[0.75rem]" />
          </Field>
          <Field label="COA Href (e.g. /coa/product.pdf)">
            <input value={form.coa_href} onChange={(e) => set({ coa_href: e.target.value })} className="input-sm w-full font-mono" />
          </Field>

          {/* Variants */}
          <div>
            <p className="text-[0.75rem] font-bold uppercase tracking-wider text-[oklch(0.40_0.01_260)] mb-3">Variants</p>
            <VariantEditor variants={form.variants} onChange={(v) => set({ variants: v })} />
          </div>

          {error && <p className="text-[0.875rem] text-red-500">{error}</p>}
        </div>

        <div className="p-6 border-t border-[oklch(0.91_0.004_260)] flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-[0.875rem] font-semibold text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)]">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary px-6 py-2 text-[0.875rem] disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : isNew ? "Create Product" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Summary {
  revenue30: number;
  revenueAll: number;
  paidOrders: number;
  aov: number;
  ordersToFulfill: number;
  pendingPayment: number;
  ordersThisWeek: number;
  lowStock: { cartCode: string; stock: number }[];
  outOfStockCount: number;
  lowStockThreshold: number;
  topProducts: { name: string; dose: string; qty: number; revenue: number }[];
  recentOrders: { status: string; fulfillment_status: string | null; net_amount: number; created_at: string }[];
  dailyRevenue: { date: string; revenue: number }[];
  commissionsOwed: number;
  commissionsByAffiliate: { id: string; name: string; code: string; amount: number; paid: number; owed: number; orders: number }[];
  repeatCustomerRate: number;
  repeatCustomers: number;
  totalCustomers: number;
  cancelled30: number;
  autoExpired30: number;
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { session, loading, signOut } = useAuth();
  const [, navigate] = useLocation();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"overview" | "products" | "inventory" | "orders" | "shipping" | "affiliates" | "promos" | "customers">("overview");
  const [loadError, setLoadError] = useState<string | null>(null);

  // Products
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [editProduct, setEditProduct] = useState<ProductRow | null | "new">(null);

  // Inventory
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [savedCode, setSavedCode] = useState<string | null>(null);

  // Overview summary
  const [summary, setSummary] = useState<Summary | null>(null);

  // Orders
  const ORDERS_PER_PAGE = 25;
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderBusy, setOrderBusy] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPage, setOrderPage] = useState(1);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [orderFulfillment, setOrderFulfillment] = useState("");
  const [copiedOrder, setCopiedOrder] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) navigate("/admin/login");
  }, [loading, session, navigate]);

  const orderQueryString = useCallback((overrides?: Record<string, string>) => {
    const params = new URLSearchParams({ page: String(orderPage), perPage: String(ORDERS_PER_PAGE) });
    if (orderSearch.trim()) params.set("search", orderSearch.trim());
    if (orderStatus) params.set("status", orderStatus);
    if (orderFulfillment) params.set("fulfillment", orderFulfillment);
    for (const [k, v] of Object.entries(overrides ?? {})) params.set(k, v);
    return params.toString();
  }, [orderPage, orderSearch, orderStatus, orderFulfillment]);

  const loadOrders = useCallback(async () => {
    if (!session) return;
    const res = await authedFetch(`/api/admin/orders?${orderQueryString()}`);
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders ?? []);
      setOrderTotal(data.total ?? 0);
    }
  }, [session, orderQueryString]);

  // Reload orders (debounced) when page/filters/search change.
  useEffect(() => {
    const t = setTimeout(loadOrders, 250);
    return () => clearTimeout(t);
  }, [loadOrders]);

  const exportOrdersCsv = async () => {
    const res = await authedFetch(`/api/admin/orders?${orderQueryString({ page: "1", perPage: "2000" })}`);
    if (!res.ok) { alert("Export failed"); return; }
    const { orders: rows } = (await res.json()) as { orders: OrderRow[] };
    const header = ["Order ID", "Email", "Payment", "Fulfillment", "Gross", "Discount", "Net", "Pay Currency", "Name", "Address", "City", "State", "ZIP", "Country", "Phone", "Tracking", "Created (ET)"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [header.map(esc).join(",")];
    for (const o of rows) {
      const a = o.shipping_address ?? {};
      lines.push([
        o.id, o.email, o.status, o.fulfillment_status ?? "", o.gross_amount ?? "", o.discount_amount ?? "", o.net_amount,
        o.pay_currency ?? "", a.name ?? "", [a.line1, a.line2].filter(Boolean).join(" "), a.city ?? "", a.state ?? "",
        a.postal_code ?? "", a.country ?? "", a.phone ?? "", o.tracking_number ?? "", formatDateEST(o.created_at),
      ].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vitumlab-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyAddress = (o: OrderRow) => {
    const lines = addressLines(o.shipping_address);
    if (lines.length === 0) return;
    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedOrder(o.id);
    setTimeout(() => setCopiedOrder((c) => (c === o.id ? null : c)), 1500);
  };

  const orderAction = async (id: string, action: string, extra?: Record<string, unknown>) => {
    setOrderBusy(id);
    try {
      const res = await authedFetch("/api/admin/orders", {
        method: "PATCH",
        body: JSON.stringify({ id, action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...data } : o)));
        if (action === "recheck") {
          alert(data.recheck === "confirmed" ? "Payment found — order confirmed." :
            data.recheck === "no_payment_found" ? "No matching payment found on NowPayments." :
            data.recheck === "failed" ? "Payment failed/expired — order marked failed." :
            `NowPayments status: ${data.recheck ?? "unchanged"}`);
        }
      } else {
        alert(data.error ?? "Action failed");
      }
    } finally {
      setOrderBusy(null);
    }
  };

  const handleCancel = (id: string) => {
    const reason = prompt("Cancel this order? Optionally enter a reason:", "Cancelled by admin");
    if (reason === null) return;
    orderAction(id, "cancel", { reason: reason || "Cancelled by admin" });
  };

  const handleShip = (id: string) => {
    const tracking = prompt("Tracking number:");
    if (!tracking?.trim()) return;
    const carrier = prompt("Carrier:", "USPS") || undefined;
    orderAction(id, "ship", { tracking_number: tracking.trim(), carrier });
  };

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const invRes = await authedFetch("/api/admin/inventory");
      if (invRes.status === 401) { setAuthorized(false); return; }
      setAuthorized(true);

      if (!invRes.ok) throw new Error(`Inventory API returned ${invRes.status}`);
      setInventory(await invRes.json());

      const [prodRes, sumRes] = await Promise.all([
        authedFetch("/api/admin/products"),
        authedFetch("/api/admin/summary"),
      ]);
      if (prodRes.ok) {
        setProducts(await prodRes.json());
      } else {
        const err = await prodRes.json().catch(() => ({ error: `HTTP ${prodRes.status}` }));
        setLoadError(`Failed to load products: ${err.error ?? prodRes.status}`);
      }
      if (sumRes.ok) setSummary(await sumRes.json());
      // Orders are loaded separately by loadOrders (supports search/filter/pagination).
    } catch (err) {
      if (authorized === null) setAuthorized(false);
      setLoadError(err instanceof Error ? err.message : "Failed to connect to the API. Are you running with the API server?");
    }
  }, [authorized]);

  useEffect(() => { if (session) loadData(); }, [session, loadData]);

  const updateInventory = async (cartCode: string, patch: { stock?: number; isActive?: boolean }) => {
    const res = await authedFetch("/api/admin/inventory", {
      method: "PATCH",
      body: JSON.stringify({ cartCode, ...patch }),
    });
    if (res.ok) {
      const updated = await res.json();
      setInventory((prev) => prev.map((r) => (r.cart_code === cartCode ? updated : r)));
      setSavedCode(cartCode);
      setTimeout(() => setSavedCode((c) => (c === cartCode ? null : c)), 1500);
    }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    const res = await authedFetch("/api/admin/products", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
      invalidateProductsCache();
    }
  };

  // ── Affiliates + payouts ──────────────────────────────────────────────────
  const [affiliates, setAffiliates] = useState<AffiliateRow[] | null>(null);
  const [affiliateBusy, setAffiliateBusy] = useState(false);
  const [expandedAffiliate, setExpandedAffiliate] = useState<string | null>(null);

  const loadAffiliates = useCallback(async () => {
    const res = await authedFetch("/api/admin/affiliates");
    if (res.ok) setAffiliates(await res.json());
  }, []);

  useEffect(() => {
    if (session && tab === "affiliates" && affiliates === null) loadAffiliates();
  }, [session, tab, affiliates, loadAffiliates]);

  const recordPayout = async (a: AffiliateRow) => {
    const amountStr = prompt(`Record a payout to ${a.name || a.code}.\nOwed: $${a.owed.toFixed(2)}\n\nAmount paid ($):`, a.owed > 0 ? a.owed.toFixed(2) : "");
    if (amountStr === null) return;
    const amount = Number(amountStr);
    if (!(amount > 0)) { alert("Enter a positive amount."); return; }
    const note = prompt("Note (optional, e.g. 'PayPal June'):") || undefined;
    setAffiliateBusy(true);
    const res = await authedFetch("/api/admin/payouts", {
      method: "POST",
      body: JSON.stringify({ affiliateId: a.id, amount, note }),
    });
    setAffiliateBusy(false);
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Failed to record payout"); return; }
    await loadAffiliates();
    loadData(); // refresh Overview "Commissions Owed"
  };

  const deletePayout = async (id: string) => {
    if (!confirm("Delete this payout record?")) return;
    const res = await authedFetch("/api/admin/payouts", { method: "DELETE", body: JSON.stringify({ id }) });
    if (res.ok) { await loadAffiliates(); loadData(); }
  };

  const addAffiliate = async () => {
    const email = prompt("Affiliate email:");
    if (!email?.trim()) return;
    const code = prompt("Discount code (e.g. JANE10):");
    if (!code?.trim()) return;
    const name = prompt("Display name (optional):") || undefined;
    const discount = Number(prompt("Customer discount % (e.g. 10):", "10") ?? "");
    const commission = Number(prompt("Affiliate commission % (e.g. 10):", "10") ?? "");
    const res = await authedFetch("/api/admin/affiliates", {
      method: "POST",
      body: JSON.stringify({ email, code, name, discount_percent: discount || 0, commission_percent: commission || 0 }),
    });
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Failed to add affiliate"); return; }
    loadAffiliates();
  };

  const editAffiliate = async (a: AffiliateRow) => {
    const discount = prompt("Customer discount %:", String(a.discount_percent));
    if (discount === null) return;
    const commission = prompt("Affiliate commission %:", String(a.commission_percent));
    if (commission === null) return;
    const res = await authedFetch("/api/admin/affiliates", {
      method: "PATCH",
      body: JSON.stringify({ id: a.id, discount_percent: Number(discount) || 0, commission_percent: Number(commission) || 0 }),
    });
    if (res.ok) loadAffiliates();
  };

  // ── Promo codes ───────────────────────────────────────────────────────────
  const [promos, setPromos] = useState<PromoRow[] | null>(null);
  const [promoForm, setPromoForm] = useState({ code: "", percent_off: "", min_subtotal: "", max_uses: "", expires_at: "" });
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoFormError, setPromoFormError] = useState("");

  const loadPromos = useCallback(async () => {
    const res = await authedFetch("/api/admin/promos");
    if (res.ok) setPromos(await res.json());
  }, []);

  useEffect(() => {
    if (session && tab === "promos" && promos === null) loadPromos();
  }, [session, tab, promos, loadPromos]);

  const createPromo = async () => {
    setPromoFormError("");
    const pct = Number(promoForm.percent_off);
    if (!promoForm.code.trim() || !(pct >= 1 && pct <= 100)) {
      setPromoFormError("A code and a percent between 1 and 100 are required.");
      return;
    }
    setPromoSaving(true);
    const res = await authedFetch("/api/admin/promos", {
      method: "POST",
      body: JSON.stringify({
        code: promoForm.code,
        percent_off: pct,
        min_subtotal: promoForm.min_subtotal ? Number(promoForm.min_subtotal) : 0,
        max_uses: promoForm.max_uses ? Number(promoForm.max_uses) : null,
        expires_at: promoForm.expires_at ? new Date(promoForm.expires_at).toISOString() : null,
      }),
    });
    setPromoSaving(false);
    if (!res.ok) { setPromoFormError((await res.json().catch(() => ({}))).error ?? "Failed to create promo"); return; }
    setPromoForm({ code: "", percent_off: "", min_subtotal: "", max_uses: "", expires_at: "" });
    loadPromos();
  };

  const togglePromo = async (p: PromoRow) => {
    const res = await authedFetch("/api/admin/promos", {
      method: "PATCH",
      body: JSON.stringify({ id: p.id, is_active: !p.is_active }),
    });
    if (res.ok) loadPromos();
  };

  const deletePromo = async (p: PromoRow) => {
    if (!confirm(`Delete promo code ${p.code}?`)) return;
    const res = await authedFetch("/api/admin/promos", { method: "DELETE", body: JSON.stringify({ id: p.id }) });
    if (res.ok) loadPromos();
  };

  // ── Customers (Supabase Auth users — everyone who has signed in) ──────────
  const [customers, setCustomers] = useState<{ id: string; email: string | null; created_at: string; last_sign_in_at: string | null; provider: string | null }[] | null>(null);
  const [customerPage, setCustomerPage] = useState(1);
  const [customerHasMore, setCustomerHasMore] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");

  const loadCustomers = useCallback(async () => {
    const res = await authedFetch(`/api/admin/users?page=${customerPage}`);
    if (res.ok) {
      const data = await res.json();
      setCustomers(data.users ?? []);
      setCustomerHasMore(!!data.hasMore);
    }
  }, [customerPage]);

  useEffect(() => {
    if (session && tab === "customers") loadCustomers();
  }, [session, tab, loadCustomers]);

  const exportCustomersCsv = () => {
    const rows = customers ?? [];
    const header = ["Email", "Signed up (ET)", "Last sign-in (ET)", "Provider"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [header.map(esc).join(",")];
    for (const c of rows) {
      lines.push([c.email ?? "", formatDateEST(c.created_at), c.last_sign_in_at ? formatDateEST(c.last_sign_in_at) : "never", c.provider ?? ""].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vitumlab-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── Shipping / tracking numbers ───────────────────────────────────────────
  const [shipments, setShipments] = useState<
    { id: string; email: string; tracking_number: string | null; carrier: string | null; fulfillment_status: string | null; shipped_at: string | null; delivered_at: string | null }[] | null
  >(null);
  const [hideDelivered, setHideDelivered] = useState(true);
  const [copiedAllTracking, setCopiedAllTracking] = useState(false);

  const loadShipments = useCallback(async () => {
    const res = await authedFetch("/api/admin/shipments");
    if (res.ok) setShipments((await res.json()).shipments ?? []);
  }, []);

  useEffect(() => {
    if (session && tab === "shipping") loadShipments();
  }, [session, tab, loadShipments]);

  const visibleShipments = (shipments ?? []).filter((s) => s.tracking_number && (!hideDelivered || s.fulfillment_status !== "delivered"));

  const copyAllTracking = () => {
    const numbers = visibleShipments.map((s) => s.tracking_number).filter(Boolean) as string[];
    if (numbers.length === 0) return;
    // USPS bulk tracking accepts up to 35 numbers separated by commas.
    navigator.clipboard.writeText(numbers.join(","));
    setCopiedAllTracking(true);
    setTimeout(() => setCopiedAllTracking(false), 2000);
  };

  // ── Email log / resend ────────────────────────────────────────────────────
  const EMAIL_EVENTS: { event: string; label: string; applies: (o: OrderRow) => boolean }[] = [
    { event: "order_created", label: "Order received", applies: () => true },
    { event: "confirmed", label: "Payment confirmed", applies: (o) => o.status === "confirmed" || o.status === "finished" },
    { event: "admin_new_order", label: "Admin alert", applies: (o) => o.status === "confirmed" || o.status === "finished" },
    { event: "shipped", label: "Shipping confirmation", applies: (o) => !!o.tracking_number || o.fulfillment_status === "shipped" || o.fulfillment_status === "delivered" },
    { event: "delivered", label: "Delivered", applies: (o) => o.fulfillment_status === "delivered" },
    { event: "admin_delivered", label: "Delivered alert (you)", applies: (o) => o.fulfillment_status === "delivered" },
    { event: "cancelled", label: "Cancelled", applies: (o) => o.status === "cancelled" },
    { event: "failed", label: "Payment failed", applies: (o) => o.status === "failed" },
  ];

  if (loading || authorized === null) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[oklch(0.52_0.01_260)]" /></div>;
  }

  if (authorized === false) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-[1.5rem] font-bold text-[oklch(0.13_0.01_260)] mb-2">Not authorized</h1>
        <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] mb-6">This account doesn't have admin access.</p>
        <button onClick={() => { signOut(); navigate("/admin/login"); }} className="btn-primary">Sign out</button>
      </div>
    );
  }

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: LayoutDashboard },
    { key: "products" as const, label: "Products", icon: ShoppingBag },
    { key: "inventory" as const, label: "Inventory", icon: Package },
    { key: "orders" as const, label: "Orders", icon: ClipboardList },
    { key: "shipping" as const, label: "Shipping", icon: Truck },
    { key: "affiliates" as const, label: "Affiliates", icon: Users },
    { key: "promos" as const, label: "Promos", icon: Tag },
    { key: "customers" as const, label: "Customers", icon: UserRound },
  ];

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.002_260)]">
      <SEO title="Admin Dashboard" description="Vitum Lab admin." />

      {editProduct !== null && (
        <ProductModal
          product={editProduct === "new" ? null : editProduct}
          onClose={() => setEditProduct(null)}
          onSaved={(saved) => {
            setProducts((prev) => {
              const idx = prev.findIndex((p) => p.id === saved.id);
              if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
              return [...prev, saved];
            });
            setEditProduct(null);
          }}
        />
      )}

      <div className="container py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-[2rem] font-bold tracking-tight text-[oklch(0.13_0.01_260)]">Admin</h1>
          <button
            onClick={() => { signOut(); navigate("/admin/login"); }}
            className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)]"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[0.875rem] font-semibold transition-colors ${
                tab === key
                  ? "bg-[oklch(0.13_0.01_260)] text-white"
                  : "bg-white text-[oklch(0.40_0.01_260)] hover:bg-[oklch(0.94_0.003_260)] shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)]"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* ── Load error banner ─────────────────────────────────────────── */}
        {loadError && (
          <div className="mb-6 bg-[oklch(0.96_0.02_25)] border border-[oklch(0.88_0.05_25)] rounded-xl px-5 py-3 text-[0.875rem] text-[oklch(0.45_0.18_25)]">
            {loadError}
          </div>
        )}

        {/* ── Overview tab ──────────────────────────────────────────────── */}
        {tab === "overview" && (
          !summary ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-[oklch(0.52_0.01_260)]" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Primary KPIs (color-coded by status) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi icon={DollarSign} label="Revenue (30d)" value={money(summary.revenue30)}
                  tone={summary.revenue30 > 0 ? "good" : "neutral"}>
                  {money(summary.revenueAll)} all-time
                </Kpi>
                <Kpi icon={Truck} label="To Fulfill" value={summary.ordersToFulfill}
                  tone={summary.ordersToFulfill > 0 ? "warn" : "good"}>
                  <button onClick={() => { setOrderStatus(""); setOrderFulfillment("unfulfilled"); setOrderPage(1); setTab("orders"); }}
                    className="text-[oklch(0.40_0.16_260)] font-semibold hover:underline">Paid &amp; unshipped →</button>
                </Kpi>
                <Kpi icon={Clock} label="Pending Payment" value={summary.pendingPayment}
                  tone={summary.pendingPayment > 0 ? "warn" : "neutral"}>
                  <button onClick={() => { setOrderFulfillment(""); setOrderStatus("pending"); setOrderPage(1); setTab("orders"); }}
                    className="text-[oklch(0.40_0.16_260)] font-semibold hover:underline">Awaiting crypto →</button>
                </Kpi>
                <Kpi icon={AlertTriangle} label="Low Stock" value={summary.lowStock.length}
                  tone={summary.outOfStockCount > 0 ? "urgent" : summary.lowStock.length > 0 ? "warn" : "good"}>
                  {summary.outOfStockCount} out of stock
                </Kpi>
              </div>

              {/* Revenue bar chart (10 / 30 / 60 / 90-day) */}
              <RevenueChart data={summary.dailyRevenue} />

              {/* Business-health KPIs */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Kpi icon={Wallet} label="Commissions Owed" value={money(summary.commissionsOwed ?? 0)}
                  tone={(summary.commissionsOwed ?? 0) > 0 ? "warn" : "neutral"}>
                  {(summary.commissionsByAffiliate ?? []).length} affiliate{(summary.commissionsByAffiliate ?? []).length !== 1 ? "s" : ""} with earnings
                </Kpi>
                <Kpi icon={Repeat} label="Repeat Rate"
                  value={`${((summary.repeatCustomerRate ?? 0) * 100).toFixed(0)}%`}
                  tone={summary.paidOrders === 0 ? "neutral" : (summary.repeatCustomerRate ?? 0) >= 0.25 ? "good" : (summary.repeatCustomerRate ?? 0) > 0 ? "warn" : "neutral"}>
                  {summary.repeatCustomers ?? 0} repeat of {summary.totalCustomers ?? 0} customers
                </Kpi>
                <Kpi icon={XCircle} label="Cancelled (30d)" value={summary.cancelled30 ?? 0}
                  tone={(summary.cancelled30 ?? 0) > 5 ? "urgent" : (summary.cancelled30 ?? 0) > 0 ? "warn" : "good"}>
                  {summary.autoExpired30 ?? 0} auto-expired
                </Kpi>
              </div>

              {/* Secondary stats */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <Kpi icon={TrendingUp} label="Orders (7d)" value={summary.ordersThisWeek} tone="info" size="md" />
                <Kpi icon={DollarSign} label="Avg Order" value={money(summary.aov)} tone="info" size="md" />
                <Kpi icon={CheckCircle2} label="Paid Orders" value={summary.paidOrders}
                  tone={summary.paidOrders > 0 ? "good" : "neutral"} size="md" />
              </div>

              {/* Affiliate commissions owed — per-affiliate breakdown */}
              <section className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[oklch(0.45_0.16_260)]" />
                    <h3 className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)]">Commissions Owed by Affiliate</h3>
                  </div>
                  <span className="text-[0.9375rem] font-bold text-[oklch(0.42_0.12_85)]">{money(summary.commissionsOwed ?? 0)}</span>
                </div>
                {(summary.commissionsByAffiliate ?? []).length === 0 ? (
                  <p className="text-[0.8125rem] text-[oklch(0.55_0.01_260)]">No affiliate commissions owed yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {(summary.commissionsByAffiliate ?? []).map((a) => {
                      const top = Math.max(...(summary.commissionsByAffiliate ?? []).map((x) => x.owed), 1);
                      return (
                        <li key={a.id}>
                          <div className="flex items-center justify-between text-[0.8125rem] mb-1">
                            <span className="text-[oklch(0.20_0.01_260)] font-semibold truncate pr-2">
                              {a.name}
                              {a.code ? <span className="ml-1.5 font-mono text-[0.6875rem] text-[oklch(0.55_0.01_260)]">{a.code}</span> : null}
                            </span>
                            <span className="whitespace-nowrap">
                              <span className="text-[oklch(0.55_0.01_260)] mr-2">{a.orders} order{a.orders !== 1 ? "s" : ""} · earned {money(a.amount)} · paid {money(a.paid ?? 0)}</span>
                              <span className="font-bold text-[oklch(0.13_0.01_260)]">{money(a.owed ?? a.amount)} owed</span>
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[oklch(0.95_0.003_260)] overflow-hidden">
                            <div className="h-full rounded-full bg-[oklch(0.65_0.12_85)]" style={{ width: `${Math.max(4, (Math.max(a.owed ?? 0, 0) / top) * 100)}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Low stock list */}
                <section className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6">
                  <h3 className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)] mb-3">Low / Out of Stock</h3>
                  {summary.lowStock.length === 0 ? (
                    <p className="text-[0.8125rem] text-[oklch(0.55_0.01_260)]">All products are above {summary.lowStockThreshold} units.</p>
                  ) : (
                    <ul className="space-y-2">
                      {summary.lowStock.map((s) => (
                        <li key={s.cartCode} className="flex items-center justify-between text-[0.8125rem]">
                          <span className="font-mono text-[oklch(0.30_0.01_260)]">{s.cartCode}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[0.6875rem] font-semibold ${s.stock === 0 ? "bg-[oklch(0.93_0.04_25)] text-[oklch(0.50_0.18_25)]" : "bg-[oklch(0.95_0.04_85)] text-[oklch(0.50_0.12_85)]"}`}>{s.stock} left</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Top sellers */}
                <section className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6">
                  <h3 className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)] mb-3">Top Sellers</h3>
                  {summary.topProducts.length === 0 ? (
                    <p className="text-[0.8125rem] text-[oklch(0.55_0.01_260)]">No paid orders yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {summary.topProducts.map((p, i) => (
                        <li key={i} className="flex items-center justify-between text-[0.8125rem]">
                          <span className="text-[oklch(0.30_0.01_260)] truncate pr-2">{p.name} <span className="text-[oklch(0.55_0.01_260)]">{p.dose}</span></span>
                          <span className="font-semibold text-[oklch(0.13_0.01_260)] whitespace-nowrap">{p.qty} · {money(p.revenue)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Recent orders */}
                <section className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)]">Recent Orders</h3>
                    <button onClick={() => setTab("orders")} className="text-[0.75rem] text-[oklch(0.40_0.16_260)] font-semibold hover:underline">View all</button>
                  </div>
                  {summary.recentOrders.length === 0 ? (
                    <p className="text-[0.8125rem] text-[oklch(0.55_0.01_260)]">No orders yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {summary.recentOrders.map((o, i) => (
                        <li key={i} className="flex items-center justify-between text-[0.8125rem]">
                          <span className="text-[oklch(0.52_0.01_260)]">{new Date(o.created_at).toLocaleDateString()}</span>
                          <span className="flex items-center gap-2">
                            <span className="font-semibold text-[oklch(0.13_0.01_260)]">{money(o.net_amount)}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[0.625rem] font-semibold ${STATUS_COLORS[o.status] ?? STATUS_COLORS.pending}`}>{o.status}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          )
        )}

        {/* ── Products tab ──────────────────────────────────────────────── */}
        {tab === "products" && (
          <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
                <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Products</h2>
              </div>
              <button
                onClick={() => setEditProduct("new")}
                className="flex items-center gap-1.5 btn-primary text-[0.875rem] py-2 px-4"
              >
                <Plus className="w-4 h-4" /> Add Product
              </button>
            </div>

            <div className="space-y-3">
              {products.map((p) => (
                <div key={p.id} className="flex items-start gap-4 border border-[oklch(0.93_0.004_260)] rounded-xl p-4">
                  {/* Image preview */}
                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-[oklch(0.91_0.004_260)] flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: p.card_bg }}>
                    {p.variants[0]?.image_url ? (
                      <img src={p.variants[0].image_url} alt={p.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).replaceWith(document.createTextNode("")); }} />
                    ) : (
                      <ImageOff className="w-5 h-5 text-[oklch(0.60_0.01_260)]" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[oklch(0.13_0.01_260)]">{p.name}</span>
                      {p.badge && (
                        <span className="text-[0.625rem] uppercase tracking-wider font-bold px-2 py-0.5 bg-[oklch(0.95_0.04_260)] text-[oklch(0.35_0.15_260)] rounded-full">{p.badge}</span>
                      )}
                    </div>
                    <p className="text-[0.75rem] text-[oklch(0.52_0.01_260)] mt-0.5">{p.category} · {p.variants.length} variant{p.variants.length !== 1 ? "s" : ""}</p>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {p.variants.map((v) => (
                        <span key={v.id} className="text-[0.6875rem] font-mono bg-[oklch(0.96_0.003_260)] text-[oklch(0.40_0.01_260)] px-2 py-0.5 rounded">
                          {v.dose} · ${v.sale_price ?? v.price}{v.sale_price ? ` (was $${v.price})` : ""}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setEditProduct(p)}
                      className="flex items-center gap-1 text-[0.75rem] font-semibold text-[oklch(0.35_0.15_260)] border border-[oklch(0.35_0.15_260)] px-3 py-1.5 rounded-lg hover:bg-[oklch(0.96_0.008_260)]"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => deleteProduct(p.id)}
                      className="flex items-center gap-1 text-[0.75rem] font-semibold text-red-500 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              ))}
              {products.length === 0 && (
                <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] py-4">No products yet. Add one above.</p>
              )}
            </div>
          </section>
        )}

        {/* ── Inventory tab ─────────────────────────────────────────────── */}
        {tab === "inventory" && (
          <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
            <div className="flex items-center gap-2 mb-6">
              <Package className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
              <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Inventory</h2>
            </div>
            <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-4">Edit stock per cart code. Set a product to 0 to mark it out of stock (its Add to Cart button is disabled on the storefront). Changes save automatically on blur.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[0.875rem]">
                <thead>
                  <tr className="text-left text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] border-b border-[oklch(0.93_0.004_260)]">
                    <th className="py-2 pr-4">Cart Code</th>
                    <th className="py-2 pr-4">Stock</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((row) => (
                    <tr key={row.cart_code} className="border-b border-[oklch(0.95_0.003_260)]">
                      <td className="py-3 pr-4 font-mono text-[0.8125rem] text-[oklch(0.20_0.01_260)]">{row.cart_code}</td>
                      <td className="py-3 pr-4">
                        <input
                          type="number"
                          min={0}
                          defaultValue={row.stock}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!isNaN(v) && v !== row.stock) updateInventory(row.cart_code, { stock: v });
                          }}
                          className="w-20 border border-[oklch(0.88_0.004_260)] rounded-lg px-2 py-1.5 text-[0.8125rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)]"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`px-3 py-1 rounded-full text-[0.75rem] font-semibold ${
                          row.stock > 0
                            ? "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]"
                            : "bg-[oklch(0.93_0.04_25)] text-[oklch(0.50_0.18_25)]"
                        }`}>
                          {row.stock > 0 ? "In stock" : "Out of stock"}
                        </span>
                      </td>
                      <td className="py-3 text-[oklch(0.35_0.14_155)]">
                        {savedCode === row.cart_code && (
                          <span className="flex items-center gap-1 text-[0.75rem]"><Check className="w-3.5 h-3.5" /> Saved</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── Orders tab ────────────────────────────────────────────────── */}
        {tab === "orders" && (
          <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
                <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Orders</h2>
                <span className="text-[0.75rem] text-[oklch(0.60_0.01_260)]">({orderTotal})</span>
              </div>
              <button
                onClick={exportOrdersCsv}
                className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-[oklch(0.35_0.15_260)] border border-[oklch(0.35_0.15_260)] px-3 py-1.5 rounded-lg hover:bg-[oklch(0.96_0.008_260)]"
              >
                <Upload className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <input
                type="text" value={orderSearch}
                onChange={(e) => { setOrderSearch(e.target.value); setOrderPage(1); }}
                placeholder="Search email or order ID…"
                className="flex-1 min-w-[180px] border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2 text-[0.8125rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)]"
              />
              <select
                value={orderStatus} onChange={(e) => { setOrderStatus(e.target.value); setOrderPage(1); }}
                className="border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2 text-[0.8125rem] bg-white focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)]"
              >
                <option value="">All payments</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="finished">Finished</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <select
                value={orderFulfillment} onChange={(e) => { setOrderFulfillment(e.target.value); setOrderPage(1); }}
                className="border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2 text-[0.8125rem] bg-white focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)]"
              >
                <option value="">All fulfillment</option>
                <option value="unfulfilled">Unfulfilled</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>

            {orders.length === 0 ? (
              <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] py-4">
                {orderSearch || orderStatus || orderFulfillment ? "No orders match your filters." : "No orders yet."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.875rem]">
                  <thead>
                    <tr className="text-left text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] border-b border-[oklch(0.93_0.004_260)]">
                      <th className="py-2 pr-4">Order</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Items</th>
                      <th className="py-2 pr-4">Amount</th>
                      <th className="py-2 pr-4">Payment</th>
                      <th className="py-2 pr-4">Fulfillment</th>
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const isPaid = o.status === "confirmed" || o.status === "finished";
                      const isClosed = o.status === "cancelled" || o.status === "failed";
                      const fulfillment = o.fulfillment_status ?? "unfulfilled";
                      const busy = orderBusy === o.id;
                      const expanded = expandedOrder === o.id;
                      return (
                        <Fragment key={o.id}>
                          <tr className="border-b border-[oklch(0.95_0.003_260)] align-top">
                            <td className="py-3 pr-4">
                              <button
                                onClick={() => setExpandedOrder(expanded ? null : o.id)}
                                className="flex items-center gap-1 font-mono text-[0.75rem] text-[oklch(0.20_0.01_260)] hover:text-[oklch(0.40_0.16_260)]"
                              >
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "" : "-rotate-90"}`} />
                                {o.id.slice(0, 10)}
                              </button>
                            </td>
                            <td className="py-3 pr-4 text-[oklch(0.40_0.01_260)]">{o.email}</td>
                            <td className="py-3 pr-4">
                              <div className="space-y-0.5 min-w-[150px]">
                                {(o.items ?? []).filter((it) => it.cartCode !== "bac-water-free").map((it, i) => (
                                  <div key={i} className="text-[0.75rem] text-[oklch(0.30_0.01_260)] whitespace-nowrap leading-snug">
                                    <span className="font-bold text-[oklch(0.13_0.01_260)]">{it.quantity}×</span> {it.name}{" "}
                                    <span className="text-[oklch(0.55_0.01_260)]">{it.dose}</span>
                                  </div>
                                ))}
                                {(o.items ?? []).some((it) => it.cartCode === "bac-water-free") && (
                                  <div className="text-[0.6875rem] text-[oklch(0.55_0.01_260)] italic leading-snug">+ free BAC Water</div>
                                )}
                                {(o.items ?? []).filter((it) => it.cartCode !== "bac-water-free").length === 0 &&
                                  !(o.items ?? []).some((it) => it.cartCode === "bac-water-free") && (
                                    <span className="text-[0.75rem] text-[oklch(0.65_0.01_260)]">—</span>
                                  )}
                              </div>
                            </td>
                            <td className="py-3 pr-4 font-semibold text-[oklch(0.13_0.01_260)]">${Number(o.net_amount).toFixed(2)}</td>
                            <td className="py-3 pr-4">
                              <span className={`px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${STATUS_COLORS[o.status] ?? STATUS_COLORS.pending}`}>
                                {o.status}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              {isPaid ? (
                                <span className={`px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${FULFILLMENT_COLORS[fulfillment] ?? FULFILLMENT_COLORS.unfulfilled}`}>
                                  {fulfillment}
                                </span>
                              ) : (
                                <span className="text-[0.75rem] text-[oklch(0.65_0.01_260)]">—</span>
                              )}
                            </td>
                            <td className="py-3 pr-4 text-[0.8125rem] text-[oklch(0.52_0.01_260)] whitespace-nowrap">{formatDateEST(o.created_at)}</td>
                            <td className="py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-[oklch(0.52_0.01_260)]" />}
                                {o.status === "pending" && (
                                  <button onClick={() => orderAction(o.id, "recheck")} disabled={busy} title="Re-check payment on NowPayments"
                                    className="flex items-center gap-1 text-[0.7rem] font-semibold text-[oklch(0.40_0.16_260)] border border-[oklch(0.40_0.16_260)] px-2 py-1 rounded-lg hover:bg-[oklch(0.96_0.02_260)] disabled:opacity-50">
                                    <RefreshCw className="w-3 h-3" /> Re-check
                                  </button>
                                )}
                                {isPaid && fulfillment === "unfulfilled" && (
                                  <button onClick={() => handleShip(o.id)} disabled={busy} title="Mark shipped"
                                    className="flex items-center gap-1 text-[0.7rem] font-semibold text-[oklch(0.40_0.16_260)] border border-[oklch(0.40_0.16_260)] px-2 py-1 rounded-lg hover:bg-[oklch(0.96_0.02_260)] disabled:opacity-50">
                                    <Truck className="w-3 h-3" /> Ship
                                  </button>
                                )}
                                {isPaid && fulfillment === "shipped" && (
                                  <button onClick={() => orderAction(o.id, "deliver")} disabled={busy} title="Mark delivered"
                                    className="flex items-center gap-1 text-[0.7rem] font-semibold text-[oklch(0.35_0.14_155)] border border-[oklch(0.70_0.10_155)] px-2 py-1 rounded-lg hover:bg-[oklch(0.96_0.03_155)] disabled:opacity-50">
                                    <CheckCircle2 className="w-3 h-3" /> Delivered
                                  </button>
                                )}
                                {!isClosed && (
                                  <button onClick={() => handleCancel(o.id)} disabled={busy} title="Cancel order"
                                    className="flex items-center gap-1 text-[0.7rem] font-semibold text-red-500 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50">
                                    <Ban className="w-3 h-3" /> Cancel
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="border-b border-[oklch(0.95_0.003_260)] bg-[oklch(0.98_0.002_260)]">
                              <td colSpan={8} className="px-4 py-3">
                                {/* Status timeline */}
                                <div className="mb-4 max-w-md">
                                  <OrderTimeline order={o} />
                                </div>
                                <div className="flex flex-wrap gap-8 text-[0.8125rem] text-[oklch(0.35_0.01_260)]">
                                  {/* Order details + totals */}
                                  <div className="space-y-1 min-w-[240px]">
                                    <p className="font-mono text-[0.7rem] text-[oklch(0.55_0.01_260)]">{o.id}</p>
                                    <div>
                                      <p className="font-semibold mb-0.5">Items</p>
                                      {(o.items ?? []).length === 0 ? (
                                        <span className="text-[oklch(0.60_0.01_260)]">—</span>
                                      ) : (
                                        <ul className="space-y-0.5">
                                          {(o.items ?? []).map((it, i) => (
                                            <li key={i} className="flex justify-between gap-4">
                                              <span>{it.quantity}× {it.name} {it.dose}</span>
                                              <span className="text-[oklch(0.45_0.01_260)] whitespace-nowrap">{it.price === 0 ? "Free" : `$${(it.price * it.quantity).toFixed(2)}`}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                    <div className="pt-1"><span className="font-semibold">Ordered:</span> {formatDateEST(o.created_at)}</div>
                                    {o.confirmed_at && (
                                      <div><span className="font-semibold">Paid:</span> {formatDateEST(o.confirmed_at)}</div>
                                    )}
                                    {payLabel(o.pay_currency) && (
                                      <div>
                                        <span className="font-semibold">Paid with:</span> {payLabel(o.pay_currency)}
                                        {o.pay_amount ? ` (${o.pay_amount} ${(o.pay_currency ?? "").toUpperCase()})` : ""}
                                      </div>
                                    )}
                                    {o.tracking_number && (
                                      <div><span className="font-semibold">Tracking:</span> {o.carrier ? `${o.carrier} ` : ""}{o.tracking_number}</div>
                                    )}
                                    {o.cancel_reason && (
                                      <div><span className="font-semibold">Cancel reason:</span> {o.cancel_reason}</div>
                                    )}
                                  </div>

                                  {/* Totals breakdown */}
                                  <div className="space-y-1 min-w-[180px]">
                                    <p className="font-semibold text-[oklch(0.20_0.01_260)]">Totals</p>
                                    <div className="flex justify-between gap-6"><span>Subtotal</span><span>${Number(o.gross_amount ?? o.net_amount).toFixed(2)}</span></div>
                                    {Number(o.discount_amount) > 0 && (
                                      <div className="flex justify-between gap-6 text-[oklch(0.35_0.14_155)]">
                                        <span>Discount{o.discount_code ? ` (${o.discount_code})` : ""}</span>
                                        <span>−${Number(o.discount_amount).toFixed(2)}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between gap-6 font-semibold text-[oklch(0.13_0.01_260)] border-t border-[oklch(0.90_0.004_260)] pt-1">
                                      <span>Total</span><span>${Number(o.net_amount).toFixed(2)}</span>
                                    </div>
                                    {Number(o.commission_amount) > 0 && (
                                      <div className="flex justify-between gap-6 text-[oklch(0.52_0.01_260)]"><span>Commission</span><span>${Number(o.commission_amount).toFixed(2)}</span></div>
                                    )}
                                  </div>

                                  {/* Shipping address */}
                                  <div className="space-y-1 min-w-[200px]">
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold text-[oklch(0.20_0.01_260)]">Ship to</p>
                                      {addressLines(o.shipping_address).length > 0 && (
                                        <button onClick={() => copyAddress(o)} className="text-[0.7rem] font-semibold text-[oklch(0.40_0.16_260)] hover:underline">
                                          {copiedOrder === o.id ? "Copied!" : "Copy"}
                                        </button>
                                      )}
                                    </div>
                                    {addressLines(o.shipping_address).length === 0 ? (
                                      <p className="text-[oklch(0.60_0.01_260)]">No address on file</p>
                                    ) : (
                                      <div className="whitespace-pre-line leading-snug">{addressLines(o.shipping_address).join("\n")}</div>
                                    )}
                                  </div>

                                  {/* Email log + resend */}
                                  <div className="space-y-1 min-w-[260px]">
                                    <p className="font-semibold text-[oklch(0.20_0.01_260)] flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Emails</p>
                                    {EMAIL_EVENTS.filter((e) => e.applies(o)).map(({ event, label }) => {
                                      const sentAt = o.emails_sent?.[event];
                                      return (
                                        <div key={event} className="flex items-center justify-between gap-3">
                                          <span className="text-[0.75rem]">
                                            {label}
                                            <span className={`ml-1.5 ${sentAt ? "text-[oklch(0.45_0.13_155)]" : "text-[oklch(0.60_0.01_260)]"}`}>
                                              {sentAt ? `✓ ${formatDateEST(sentAt)}` : "not sent"}
                                            </span>
                                          </span>
                                          <button
                                            onClick={() => orderAction(o.id, "resend_email", { event })}
                                            disabled={busy}
                                            className="text-[0.7rem] font-semibold text-[oklch(0.40_0.16_260)] hover:underline disabled:opacity-50"
                                          >
                                            {sentAt ? "Resend" : "Send"}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {orderTotal > ORDERS_PER_PAGE && (
              <div className="flex items-center justify-between mt-5 text-[0.8125rem]">
                <span className="text-[oklch(0.52_0.01_260)]">
                  Page {orderPage} of {Math.ceil(orderTotal / ORDERS_PER_PAGE)} · {orderTotal} orders
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                    disabled={orderPage <= 1}
                    className="px-3 py-1.5 rounded-lg border border-[oklch(0.88_0.004_260)] font-semibold text-[oklch(0.35_0.01_260)] hover:bg-[oklch(0.96_0.003_260)] disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setOrderPage((p) => (p < Math.ceil(orderTotal / ORDERS_PER_PAGE) ? p + 1 : p))}
                    disabled={orderPage >= Math.ceil(orderTotal / ORDERS_PER_PAGE)}
                    className="px-3 py-1.5 rounded-lg border border-[oklch(0.88_0.004_260)] font-semibold text-[oklch(0.35_0.01_260)] hover:bg-[oklch(0.96_0.003_260)] disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Affiliates tab ────────────────────────────────────────────── */}
        {tab === "affiliates" && (
          <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
                <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Affiliates</h2>
              </div>
              <button onClick={addAffiliate} className="flex items-center gap-1.5 btn-primary text-[0.875rem] py-2 px-4">
                <Plus className="w-4 h-4" /> Add Affiliate
              </button>
            </div>
            <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-5">
              Owed = commission earned on paid orders − recorded payouts. Record a payout after you send an affiliate their money.
            </p>

            {affiliates === null ? (
              <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[oklch(0.52_0.01_260)]" /></div>
            ) : affiliates.length === 0 ? (
              <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] py-4">No affiliates yet. Add one above.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.875rem]">
                  <thead>
                    <tr className="text-left text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] border-b border-[oklch(0.93_0.004_260)]">
                      <th className="py-2 pr-4">Affiliate</th>
                      <th className="py-2 pr-4">Code</th>
                      <th className="py-2 pr-4">Disc / Comm</th>
                      <th className="py-2 pr-4">Orders</th>
                      <th className="py-2 pr-4">Earned</th>
                      <th className="py-2 pr-4">Paid</th>
                      <th className="py-2 pr-4">Owed</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affiliates.map((a) => {
                      const expanded = expandedAffiliate === a.id;
                      return (
                        <Fragment key={a.id}>
                          <tr className="border-b border-[oklch(0.95_0.003_260)]">
                            <td className="py-3 pr-4">
                              <button
                                onClick={() => setExpandedAffiliate(expanded ? null : a.id)}
                                className="flex items-center gap-1 text-left hover:text-[oklch(0.40_0.16_260)]"
                              >
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${expanded ? "" : "-rotate-90"}`} />
                                <span>
                                  <span className="font-semibold text-[oklch(0.13_0.01_260)] block leading-tight">{a.name || a.code}</span>
                                  <span className="text-[0.75rem] text-[oklch(0.55_0.01_260)]">{a.email}</span>
                                </span>
                              </button>
                            </td>
                            <td className="py-3 pr-4 font-mono text-[0.8125rem]">{a.code}</td>
                            <td className="py-3 pr-4 text-[0.8125rem] text-[oklch(0.40_0.01_260)]">{a.discount_percent}% / {a.commission_percent}%</td>
                            <td className="py-3 pr-4">{a.orders}</td>
                            <td className="py-3 pr-4">{money(a.earned)}</td>
                            <td className="py-3 pr-4 text-[oklch(0.45_0.13_155)]">{money(a.paid)}</td>
                            <td className={`py-3 pr-4 font-bold ${a.owed > 0 ? "text-[oklch(0.50_0.12_85)]" : "text-[oklch(0.13_0.01_260)]"}`}>{money(a.owed)}</td>
                            <td className="py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                <button onClick={() => recordPayout(a)} disabled={affiliateBusy}
                                  className="flex items-center gap-1 text-[0.7rem] font-semibold text-[oklch(0.40_0.16_260)] border border-[oklch(0.40_0.16_260)] px-2 py-1 rounded-lg hover:bg-[oklch(0.96_0.02_260)] disabled:opacity-50">
                                  <Wallet className="w-3 h-3" /> Record Payout
                                </button>
                                <button onClick={() => editAffiliate(a)}
                                  className="flex items-center gap-1 text-[0.7rem] font-semibold text-[oklch(0.40_0.01_260)] border border-[oklch(0.85_0.004_260)] px-2 py-1 rounded-lg hover:bg-[oklch(0.96_0.003_260)]">
                                  <Pencil className="w-3 h-3" /> Edit %
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="border-b border-[oklch(0.95_0.003_260)] bg-[oklch(0.98_0.002_260)]">
                              <td colSpan={8} className="px-4 py-3">
                                <p className="font-semibold text-[0.8125rem] text-[oklch(0.20_0.01_260)] mb-2">Payout history</p>
                                {a.payouts.length === 0 ? (
                                  <p className="text-[0.8125rem] text-[oklch(0.55_0.01_260)]">No payouts recorded yet.</p>
                                ) : (
                                  <ul className="space-y-1">
                                    {a.payouts.map((p) => (
                                      <li key={p.id} className="flex items-center justify-between text-[0.8125rem] max-w-xl">
                                        <span className="text-[oklch(0.40_0.01_260)]">
                                          {formatDateEST(p.created_at)}
                                          {p.note ? <span className="text-[oklch(0.55_0.01_260)]"> — {p.note}</span> : null}
                                        </span>
                                        <span className="flex items-center gap-3">
                                          <span className="font-semibold">{money(p.amount)}</span>
                                          <button onClick={() => deletePayout(p.id)} className="text-red-400 hover:text-red-600" title="Delete payout record">
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── Promos tab ────────────────────────────────────────────────── */}
        {tab === "promos" && (
          <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
              <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Promo Codes</h2>
            </div>
            <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-5">
              General discount codes (separate from affiliate codes). Usage counts when an order is paid.
            </p>

            {/* Create form */}
            <div className="flex flex-wrap items-end gap-2 mb-6 bg-[oklch(0.98_0.002_260)] rounded-xl p-4">
              <Field label="Code">
                <input value={promoForm.code} onChange={(e) => setPromoForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="SPRING20" className="input-sm font-mono w-32" />
              </Field>
              <Field label="% Off">
                <input type="number" min={1} max={100} value={promoForm.percent_off}
                  onChange={(e) => setPromoForm((f) => ({ ...f, percent_off: e.target.value }))} placeholder="20" className="input-sm w-20" />
              </Field>
              <Field label="Min Subtotal ($)">
                <input type="number" min={0} value={promoForm.min_subtotal}
                  onChange={(e) => setPromoForm((f) => ({ ...f, min_subtotal: e.target.value }))} placeholder="0" className="input-sm w-28" />
              </Field>
              <Field label="Max Uses">
                <input type="number" min={1} value={promoForm.max_uses}
                  onChange={(e) => setPromoForm((f) => ({ ...f, max_uses: e.target.value }))} placeholder="∞" className="input-sm w-24" />
              </Field>
              <Field label="Expires">
                <input type="date" value={promoForm.expires_at}
                  onChange={(e) => setPromoForm((f) => ({ ...f, expires_at: e.target.value }))} className="input-sm w-36" />
              </Field>
              <button onClick={createPromo} disabled={promoSaving}
                className="flex items-center gap-1.5 btn-primary text-[0.875rem] py-2 px-4 disabled:opacity-60">
                {promoSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Code
              </button>
            </div>
            {promoFormError && <p className="text-[0.8125rem] text-red-500 -mt-3 mb-4">{promoFormError}</p>}

            {promos === null ? (
              <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[oklch(0.52_0.01_260)]" /></div>
            ) : promos.length === 0 ? (
              <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] py-4">No promo codes yet. Create one above.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.875rem]">
                  <thead>
                    <tr className="text-left text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] border-b border-[oklch(0.93_0.004_260)]">
                      <th className="py-2 pr-4">Code</th>
                      <th className="py-2 pr-4">% Off</th>
                      <th className="py-2 pr-4">Min Subtotal</th>
                      <th className="py-2 pr-4">Uses</th>
                      <th className="py-2 pr-4">Expires</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promos.map((p) => {
                      const expired = p.expires_at && new Date(p.expires_at) < new Date();
                      const maxedOut = p.max_uses != null && p.used_count >= p.max_uses;
                      return (
                        <tr key={p.id} className="border-b border-[oklch(0.95_0.003_260)]">
                          <td className="py-3 pr-4 font-mono font-semibold text-[oklch(0.13_0.01_260)]">{p.code}</td>
                          <td className="py-3 pr-4">{p.percent_off}%</td>
                          <td className="py-3 pr-4">{Number(p.min_subtotal) > 0 ? money(Number(p.min_subtotal)) : "—"}</td>
                          <td className="py-3 pr-4">{p.used_count}{p.max_uses != null ? ` / ${p.max_uses}` : ""}</td>
                          <td className="py-3 pr-4 text-[0.8125rem] text-[oklch(0.52_0.01_260)]">{p.expires_at ? new Date(p.expires_at).toLocaleDateString() : "—"}</td>
                          <td className="py-3 pr-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${
                              !p.is_active ? "bg-[oklch(0.92_0.005_260)] text-[oklch(0.45_0.01_260)]"
                                : expired || maxedOut ? "bg-[oklch(0.93_0.04_25)] text-[oklch(0.50_0.18_25)]"
                                : "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]"
                            }`}>
                              {!p.is_active ? "disabled" : expired ? "expired" : maxedOut ? "maxed out" : "active"}
                            </span>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button onClick={() => togglePromo(p)}
                                className="text-[0.7rem] font-semibold text-[oklch(0.40_0.16_260)] border border-[oklch(0.40_0.16_260)] px-2 py-1 rounded-lg hover:bg-[oklch(0.96_0.02_260)]">
                                {p.is_active ? "Disable" : "Enable"}
                              </button>
                              <button onClick={() => deletePromo(p)}
                                className="flex items-center gap-1 text-[0.7rem] font-semibold text-red-500 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50">
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── Shipping tab ──────────────────────────────────────────────── */}
        {tab === "shipping" && (
          <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
                <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Shipping &amp; Tracking</h2>
                {shipments && <span className="text-[0.75rem] text-[oklch(0.60_0.01_260)]">({visibleShipments.length})</span>}
              </div>
              <button
                onClick={copyAllTracking}
                disabled={visibleShipments.length === 0}
                className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-white bg-[oklch(0.40_0.16_260)] px-4 py-2 rounded-lg hover:bg-[oklch(0.35_0.16_260)] disabled:opacity-40"
              >
                {copiedAllTracking ? <Check className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                {copiedAllTracking ? "Copied!" : `Copy all ${visibleShipments.length} tracking #s`}
              </button>
            </div>
            <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-1">
              "Copy all" puts just the tracking numbers (comma-separated) on your clipboard — the email/order on the left is not included.
              Paste into <a href="https://tools.usps.com/go/TrackConfirmAction_input" target="_blank" rel="noopener noreferrer" className="text-[oklch(0.40_0.16_260)] font-semibold hover:underline">USPS Tracking</a> (up to 35 at a time).
            </p>

            <label className="inline-flex items-center gap-2 text-[0.8125rem] text-[oklch(0.40_0.01_260)] my-4 cursor-pointer">
              <input type="checkbox" checked={hideDelivered} onChange={(e) => setHideDelivered(e.target.checked)} className="accent-[oklch(0.40_0.16_260)]" />
              Hide delivered (track only in-transit)
            </label>

            {shipments === null ? (
              <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[oklch(0.52_0.01_260)]" /></div>
            ) : visibleShipments.length === 0 ? (
              <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] py-4">{hideDelivered ? "No in-transit shipments. Toggle off “Hide delivered” to see delivered ones." : "No orders with tracking numbers yet."}</p>
            ) : (
              <ul className="divide-y divide-[oklch(0.95_0.003_260)] border-y border-[oklch(0.95_0.003_260)]">
                {visibleShipments.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-4 py-2.5">
                    {/* Left label — not part of the bulk copy (select-none) */}
                    <span className="select-none flex items-center gap-2 text-[0.75rem] text-[oklch(0.52_0.01_260)] min-w-0">
                      <span className="truncate max-w-[220px]">{s.email}</span>
                      <span className="font-mono text-[oklch(0.60_0.01_260)]">#{s.id.slice(0, 10)}</span>
                      {s.fulfillment_status === "delivered" && (
                        <span className="select-none px-2 py-0.5 rounded-full text-[0.625rem] font-semibold bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]">delivered</span>
                      )}
                    </span>
                    {/* Tracking number — the only selectable/copyable text */}
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span className="select-none text-[0.6875rem] text-[oklch(0.60_0.01_260)]">{s.carrier || "USPS"}</span>
                      <span className="font-mono text-[0.8125rem] font-semibold text-[oklch(0.13_0.01_260)]">{s.tracking_number}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Customers tab ─────────────────────────────────────────────── */}
        {tab === "customers" && (
          <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <UserRound className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
                <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Customers</h2>
                {customers && <span className="text-[0.75rem] text-[oklch(0.60_0.01_260)]">({customers.length}{customerHasMore ? "+" : ""})</span>}
              </div>
              <button
                onClick={exportCustomersCsv}
                disabled={!customers || customers.length === 0}
                className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-[oklch(0.35_0.15_260)] border border-[oklch(0.35_0.15_260)] px-3 py-1.5 rounded-lg hover:bg-[oklch(0.96_0.008_260)] disabled:opacity-40"
              >
                <Upload className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
            <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-4">Everyone who has created an account / signed in (Supabase Auth).</p>

            <input
              type="text" value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Filter by email…"
              className="w-full max-w-sm mb-5 border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2 text-[0.8125rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)]"
            />

            {customers === null ? (
              <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[oklch(0.52_0.01_260)]" /></div>
            ) : (
              (() => {
                const filtered = customers.filter((c) => !customerSearch.trim() || (c.email ?? "").toLowerCase().includes(customerSearch.trim().toLowerCase()));
                return filtered.length === 0 ? (
                  <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] py-4">{customerSearch ? "No customers match your filter." : "No customers yet."}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[0.875rem]">
                      <thead>
                        <tr className="text-left text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] border-b border-[oklch(0.93_0.004_260)]">
                          <th className="py-2 pr-4">Email</th>
                          <th className="py-2 pr-4">Signed up</th>
                          <th className="py-2 pr-4">Last sign-in</th>
                          <th className="py-2">Method</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((c) => (
                          <tr key={c.id} className="border-b border-[oklch(0.95_0.003_260)]">
                            <td className="py-3 pr-4 font-medium text-[oklch(0.20_0.01_260)]">{c.email ?? "—"}</td>
                            <td className="py-3 pr-4 text-[0.8125rem] text-[oklch(0.52_0.01_260)] whitespace-nowrap">{formatDateEST(c.created_at)}</td>
                            <td className="py-3 pr-4 text-[0.8125rem] text-[oklch(0.52_0.01_260)] whitespace-nowrap">{c.last_sign_in_at ? formatDateEST(c.last_sign_in_at) : "—"}</td>
                            <td className="py-3">
                              <span className="px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold bg-[oklch(0.96_0.005_260)] text-[oklch(0.40_0.01_260)] capitalize">
                                {c.provider === "email" ? "magic link" : c.provider ?? "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}

            {(customerPage > 1 || customerHasMore) && (
              <div className="flex items-center justify-between mt-5 text-[0.8125rem]">
                <span className="text-[oklch(0.52_0.01_260)]">Page {customerPage}</span>
                <div className="flex gap-2">
                  <button onClick={() => setCustomerPage((p) => Math.max(1, p - 1))} disabled={customerPage <= 1}
                    className="px-3 py-1.5 rounded-lg border border-[oklch(0.88_0.004_260)] font-semibold text-[oklch(0.35_0.01_260)] hover:bg-[oklch(0.96_0.003_260)] disabled:opacity-40">← Prev</button>
                  <button onClick={() => setCustomerPage((p) => (customerHasMore ? p + 1 : p))} disabled={!customerHasMore}
                    className="px-3 py-1.5 rounded-lg border border-[oklch(0.88_0.004_260)] font-semibold text-[oklch(0.35_0.01_260)] hover:bg-[oklch(0.96_0.003_260)] disabled:opacity-40">Next →</button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
