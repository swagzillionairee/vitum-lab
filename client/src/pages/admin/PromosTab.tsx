/*
 * PromosTab.tsx — store discounts, in two parts:
 *   1. Site-wide Sale — one % off EVERY product (strikethrough old price + new
 *      price storefront-wide). Turning it on clears individual product sale
 *      prices; the site-wide sale always takes precedence.
 *   2. Promo Codes — general codes (separate from affiliate codes): % off /
 *      min subtotal / max uses / expiry; enable/disable; delete. Limited to one
 *      use per customer (usage counts when an order is paid).
 */

import { useState, useEffect, useCallback } from "react";
import { Tag, Loader2, Plus, Trash2, Megaphone, Check, Power, Layers, Gift } from "lucide-react";
import { authedFetch } from "@/lib/api";
import { invalidateProductsCache } from "@/hooks/useProducts";
import type { PromoRow, SitePromo, QuantityTier } from "./types";
import { money, Field } from "./shared";

// ─── Quantity discount tiers ───────────────────────────────────────────────────
function QuantityDiscountsCard() {
  const [tiers, setTiers] = useState<QuantityTier[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const res = await authedFetch("/api/admin/quantity-tiers");
    if (res.ok) setTiers((await res.json()).tiers ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const update = (i: number, patch: Partial<QuantityTier>) =>
    setTiers((t) => (t ?? []).map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const add = () => setTiers((t) => [...(t ?? []), { min_qty: 0, percent: 0 }]);
  const remove = (i: number) => setTiers((t) => (t ?? []).filter((_, idx) => idx !== i));
  const loadRecommended = () => setTiers([{ min_qty: 3, percent: 5 }, { min_qty: 5, percent: 10 }, { min_qty: 10, percent: 15 }]);

  const save = async () => {
    setErr(""); setMsg("");
    const clean = (tiers ?? []).filter((t) => Number(t.min_qty) >= 1 && Number(t.percent) >= 1 && Number(t.percent) <= 100);
    setSaving(true);
    const res = await authedFetch("/api/admin/quantity-tiers", { method: "PUT", body: JSON.stringify({ tiers: clean }) });
    setSaving(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Failed to save"); return; }
    setTiers((await res.json()).tiers ?? []);
    setMsg("Quantity discounts saved.");
  };

  return (
    <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
      <div className="flex items-center gap-2 mb-2">
        <Layers className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
        <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Quantity Discounts</h2>
      </div>
      <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-5">
        Reward bigger orders: a % off once the cart hits a total item count. The best matching tier applies, and it
        <span className="font-semibold"> stacks</span> on top of the site-wide sale and any promo/affiliate code. Leave empty to disable.
      </p>

      {tiers === null ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[oklch(0.52_0.01_260)]" /></div>
      ) : (
        <div className="space-y-2 mb-4">
          {tiers.length === 0 && (
            <p className="text-[0.8125rem] text-[oklch(0.55_0.01_260)]">No tiers yet — quantity discounts are off.</p>
          )}
          {tiers.map((t, i) => (
            <div key={i} className="flex items-end gap-2 bg-[oklch(0.98_0.002_260)] rounded-xl p-3">
              <Field label="Buy at least (items)">
                <input type="number" min={1} value={t.min_qty || ""} onChange={(e) => update(i, { min_qty: Number(e.target.value) })} placeholder="3" className="input-sm w-28" />
              </Field>
              <Field label="% Off">
                <input type="number" min={1} max={100} value={t.percent || ""} onChange={(e) => update(i, { percent: Number(e.target.value) })} placeholder="10" className="input-sm w-20" />
              </Field>
              <button onClick={() => remove(i)} className="ml-auto flex items-center gap-1 text-[0.7rem] font-semibold text-red-500 border border-red-200 px-2 py-1.5 rounded-lg hover:bg-red-50">
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={add} className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.35_0.15_260)] border border-[oklch(0.35_0.15_260)] px-3 py-1.5 rounded-lg hover:bg-[oklch(0.96_0.008_260)]">
          <Plus className="w-4 h-4" /> Add tier
        </button>
        {(tiers === null || tiers.length === 0) && (
          <button onClick={loadRecommended} className="text-[0.8125rem] font-semibold text-[oklch(0.40_0.16_260)] hover:underline">Use recommended (3→5%, 5→10%, 10→15%)</button>
        )}
        <button onClick={save} disabled={saving} className="ml-auto flex items-center gap-1.5 btn-primary text-[0.875rem] py-2 px-4 disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
        </button>
      </div>
      {err && <p className="text-[0.8125rem] text-red-500 mt-3">{err}</p>}
      {msg && <p className="text-[0.8125rem] text-[oklch(0.35_0.14_155)] mt-3 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {msg}</p>}
    </section>
  );
}

// ─── Site-wide sale card ───────────────────────────────────────────────────────
function SiteWideSaleCard() {
  const [promo, setPromo] = useState<SitePromo | null>(null);
  const [form, setForm] = useState({ percent: "", label: "", starts_at: "", ends_at: "" });
  const [saving, setSaving] = useState<"on" | "off" | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const res = await authedFetch("/api/admin/site-promo");
    if (res.ok) {
      const d: SitePromo = await res.json();
      setPromo(d);
      setForm({
        percent: d.sitewide_percent != null ? String(d.sitewide_percent) : "",
        label: d.sitewide_label ?? "",
        starts_at: d.sitewide_starts_at ? d.sitewide_starts_at.slice(0, 10) : "",
        ends_at: d.sitewide_ends_at ? d.sitewide_ends_at.slice(0, 10) : "",
      });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (active: boolean) => {
    setErr(""); setMsg("");
    const pct = Number(form.percent);
    if (active) {
      if (!(pct >= 1 && pct <= 99)) { setErr("Enter a percentage between 1 and 99 to start a sale."); return; }
      if (!confirm(
        `Turn on a site-wide ${pct}% sale?\n\n` +
        `• ${pct}% comes off EVERY product (old price shown with a strikethrough).\n` +
        `• Any individual product sale prices you've set will be REMOVED (the site-wide sale takes precedence).\n\n` +
        `Continue?`,
      )) return;
    }
    setSaving(active ? "on" : "off");
    const res = await authedFetch("/api/admin/site-promo", {
      method: "PUT",
      body: JSON.stringify({
        active,
        percent: form.percent ? pct : null,
        label: form.label.trim() || null,
        // Start of the chosen start day; end-of-day for the end so the sale runs
        // through the chosen dates (scheduling).
        starts_at: form.starts_at ? new Date(`${form.starts_at}T00:00:00`).toISOString() : null,
        ends_at: form.ends_at ? new Date(`${form.ends_at}T23:59:59`).toISOString() : null,
      }),
    });
    setSaving(null);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Failed to save"); return; }
    invalidateProductsCache();
    setMsg(active ? "Site-wide sale is live across the storefront." : "Site-wide sale turned off.");
    load();
  };

  const active = !!promo?.sitewide_active;
  const expired = !!promo?.sitewide_ends_at && new Date(promo.sitewide_ends_at) < new Date();
  const scheduled = !!promo?.sitewide_starts_at && new Date(promo.sitewide_starts_at) > new Date();

  return (
    <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
          <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Site-wide Sale</h2>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${
          active && !expired && !scheduled ? "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]"
            : active && scheduled ? "bg-[oklch(0.93_0.05_260)] text-[oklch(0.40_0.16_260)]"
            : active && expired ? "bg-[oklch(0.93_0.04_25)] text-[oklch(0.50_0.18_25)]"
            : "bg-[oklch(0.92_0.005_260)] text-[oklch(0.45_0.01_260)]"
        }`}>
          {active && !expired && !scheduled ? `${promo?.sitewide_percent}% OFF — live`
            : active && scheduled ? `${promo?.sitewide_percent}% OFF — scheduled`
            : active && expired ? "ended" : "off"}
        </span>
      </div>
      <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-5">
        One percentage off <span className="font-semibold">every product</span>. Customers see the original price
        struck through with the new price. Turning it on removes individual product sale prices — the site-wide
        sale always takes precedence. Promo &amp; affiliate codes still stack on top at checkout.
      </p>

      <div className="flex flex-wrap items-end gap-2 bg-[oklch(0.98_0.002_260)] rounded-xl p-4">
        <Field label="% Off (site-wide)">
          <input type="number" min={1} max={99} value={form.percent}
            onChange={(e) => setForm((f) => ({ ...f, percent: e.target.value }))} placeholder="20" className="input-sm w-24" />
        </Field>
        <Field label="Label — optional">
          <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Summer Sale" className="input-sm w-40" />
        </Field>
        <Field label="Starts — optional">
          <input type="date" value={form.starts_at}
            onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} className="input-sm w-40" />
        </Field>
        <Field label="Ends — optional">
          <input type="date" value={form.ends_at}
            onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} className="input-sm w-40" />
        </Field>
        {active ? (
          <>
            <button onClick={() => save(true)} disabled={saving !== null}
              className="flex items-center gap-1.5 btn-primary text-[0.875rem] py-2 px-4 disabled:opacity-60">
              {saving === "on" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Update
            </button>
            <button onClick={() => save(false)} disabled={saving !== null}
              className="flex items-center gap-1.5 text-[0.875rem] font-semibold text-red-500 border border-red-200 py-2 px-4 rounded-lg hover:bg-red-50 disabled:opacity-60">
              {saving === "off" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />} Turn off
            </button>
          </>
        ) : (
          <button onClick={() => save(true)} disabled={saving !== null}
            className="flex items-center gap-1.5 btn-primary text-[0.875rem] py-2 px-4 disabled:opacity-60">
            {saving === "on" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />} Start sale
          </button>
        )}
      </div>
      {err && <p className="text-[0.8125rem] text-red-500 mt-3">{err}</p>}
      {msg && <p className="text-[0.8125rem] text-[oklch(0.35_0.14_155)] mt-3 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {msg}</p>}
    </section>
  );
}

// Pick black or white text for readability on a given hex background.
function readableText(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex ?? "");
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111111" : "#ffffff";
}

// ─── Featured-products banner ──────────────────────────────────────────────────
function FeaturedBannerCard() {
  const [active, setActive] = useState(false);
  const [text, setText] = useState("");
  const [color, setColor] = useState("#7c3aed");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const res = await authedFetch("/api/admin/featured-banner");
    if (res.ok) {
      const d = await res.json();
      setActive(!!d.featured_banner_active);
      setText(d.featured_banner_text ?? "");
      setColor(d.featured_banner_color ?? "#7c3aed");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (nextActive: boolean) => {
    setErr(""); setMsg("");
    if (nextActive && !text.trim()) { setErr("Enter banner text to turn it on."); return; }
    setSaving(true);
    const res = await authedFetch("/api/admin/featured-banner", {
      method: "PUT",
      body: JSON.stringify({ active: nextActive, text: text.trim() || null, color }),
    });
    setSaving(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Failed to save"); return; }
    const d = await res.json();
    setActive(!!d.featured_banner_active);
    setMsg(nextActive ? "Banner is live next to Featured Products." : "Banner turned off.");
  };

  return (
    <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
          <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Featured Products Banner</h2>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${
          active ? "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]" : "bg-[oklch(0.92_0.005_260)] text-[oklch(0.45_0.01_260)]"
        }`}>
          {active ? "live" : "off"}
        </span>
      </div>
      <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-5">
        A small pill shown next to the homepage <span className="font-semibold">Featured Products</span> heading. Pick any text and color
        (emoji welcome). Purely cosmetic — it doesn&apos;t change any pricing.
      </p>

      <div className="flex flex-wrap items-end gap-3 bg-[oklch(0.98_0.002_260)] rounded-xl p-4">
        <Field label="Banner text">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={60}
            placeholder="🎉 40% OFF, AUTO-APPLIED" className="input-sm w-64" />
        </Field>
        <Field label="Color">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
            className="h-9 w-14 rounded-lg border border-[oklch(0.88_0.004_260)] cursor-pointer bg-white p-0.5" />
        </Field>
        <div className="flex flex-col gap-1">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[oklch(0.52_0.01_260)]">Preview</span>
          <span className="inline-flex items-center px-3 py-1.5 rounded-full text-[0.8125rem] font-bold"
            style={{ backgroundColor: color, color: readableText(color) }}>
            {text.trim() || "Your banner"}
          </span>
        </div>
        {active ? (
          <>
            <button onClick={() => save(true)} disabled={saving}
              className="flex items-center gap-1.5 btn-primary text-[0.875rem] py-2 px-4 disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Update
            </button>
            <button onClick={() => save(false)} disabled={saving}
              className="flex items-center gap-1.5 text-[0.875rem] font-semibold text-red-500 border border-red-200 py-2 px-4 rounded-lg hover:bg-red-50 disabled:opacity-60">
              <Power className="w-4 h-4" /> Turn off
            </button>
          </>
        ) : (
          <button onClick={() => save(true)} disabled={saving}
            className="flex items-center gap-1.5 btn-primary text-[0.875rem] py-2 px-4 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />} Turn on
          </button>
        )}
      </div>
      {err && <p className="text-[0.8125rem] text-red-500 mt-3">{err}</p>}
      {msg && <p className="text-[0.8125rem] text-[oklch(0.35_0.14_155)] mt-3 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {msg}</p>}
    </section>
  );
}

// ─── Self-serve referral program ───────────────────────────────────────────────
function ReferralProgramCard() {
  const [form, setForm] = useState<{ active: boolean; buyer_discount: string; bounty_amount: string; bounty_orders: string; min_order: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const res = await authedFetch("/api/admin/referral-program");
    if (res.ok) {
      const d = await res.json();
      setForm({
        active: !!d.referral_program_active,
        buyer_discount: String(d.referral_buyer_discount ?? 10),
        bounty_amount: String(d.referral_bounty_amount ?? 100),
        bounty_orders: String(d.referral_bounty_orders ?? 5),
        min_order: String(d.referral_min_order ?? 0),
      });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (active: boolean) => {
    if (!form) return;
    setErr(""); setMsg(""); setSaving(true);
    const res = await authedFetch("/api/admin/referral-program", {
      method: "PUT",
      body: JSON.stringify({
        active,
        buyer_discount: Number(form.buyer_discount) || 0,
        bounty_amount: Number(form.bounty_amount) || 0,
        bounty_orders: Number(form.bounty_orders) || 1,
        min_order: Number(form.min_order) || 0,
      }),
    });
    setSaving(false);
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? "Failed to save"); return; }
    const d = await res.json();
    // Re-sync ALL fields from the response — the server clamps out-of-range
    // values (e.g. bounty_orders → min 1), and the form must show what was
    // actually saved, not what was typed.
    setForm({
      active: !!d.referral_program_active,
      buyer_discount: String(d.referral_buyer_discount ?? 10),
      bounty_amount: String(d.referral_bounty_amount ?? 100),
      bounty_orders: String(d.referral_bounty_orders ?? 5),
      min_order: String(d.referral_min_order ?? 0),
    });
    setMsg(active ? "Referral program is live at /referral." : "Referral program turned off.");
  };

  const active = !!form?.active;

  return (
    <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
          <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Referral Program (self-serve)</h2>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${active ? "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]" : "bg-[oklch(0.92_0.005_260)] text-[oklch(0.45_0.01_260)]"}`}>
          {active ? "live" : "off"}
        </span>
      </div>
      <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-5">
        The public <span className="font-mono">/referral</span> page: customers sign in to get a code (tied to their account), buyers get a % off,
        and the referrer earns a flat bounty per N <em>unique</em> referred customers. Only orders at or above the minimum count, one per customer, and
        refunds are clawed back automatically. Payouts are claimed by email and paid by you manually. Separate from your curated Affiliates.
      </p>

      {form === null ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[oklch(0.52_0.01_260)]" /></div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2 bg-[oklch(0.98_0.002_260)] rounded-xl p-4">
            <Field label="Buyer discount %">
              <input type="number" min={0} max={100} value={form.buyer_discount}
                onChange={(e) => setForm((f) => f && { ...f, buyer_discount: e.target.value })} className="input-sm w-24" />
            </Field>
            <Field label="Bounty $ per payout">
              <input type="number" min={0} value={form.bounty_amount}
                onChange={(e) => setForm((f) => f && { ...f, bounty_amount: e.target.value })} className="input-sm w-28" />
            </Field>
            <Field label="Referred customers per payout">
              <input type="number" min={1} value={form.bounty_orders}
                onChange={(e) => setForm((f) => f && { ...f, bounty_orders: e.target.value })} className="input-sm w-40" />
            </Field>
            <Field label="Min qualifying order $">
              <input type="number" min={0} value={form.min_order}
                onChange={(e) => setForm((f) => f && { ...f, min_order: e.target.value })} className="input-sm w-32" />
            </Field>
            {active ? (
              <>
                <button onClick={() => save(true)} disabled={saving} className="flex items-center gap-1.5 btn-primary text-[0.875rem] py-2 px-4 disabled:opacity-60">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Update
                </button>
                <button onClick={() => save(false)} disabled={saving} className="flex items-center gap-1.5 text-[0.875rem] font-semibold text-red-500 border border-red-200 py-2 px-4 rounded-lg hover:bg-red-50 disabled:opacity-60">
                  <Power className="w-4 h-4" /> Turn off
                </button>
              </>
            ) : (
              <button onClick={() => save(true)} disabled={saving} className="flex items-center gap-1.5 btn-primary text-[0.875rem] py-2 px-4 disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />} Turn on
              </button>
            )}
          </div>
          <p className="text-[0.75rem] text-[oklch(0.55_0.01_260)] mt-3">
            Current: buyers get <strong>{form.buyer_discount || 0}%</strong> off; referrer earns
            <strong> ${form.bounty_amount || 0}</strong> per <strong>{form.bounty_orders || 0}</strong> unique referred customers
            {Number(form.min_order) > 0 ? <> (orders <strong>${form.min_order}+</strong>)</> : null}.
            Changing the buyer discount updates it on all existing referral codes.
          </p>
        </>
      )}
      {err && <p className="text-[0.8125rem] text-red-500 mt-3">{err}</p>}
      {msg && <p className="text-[0.8125rem] text-[oklch(0.35_0.14_155)] mt-3 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {msg}</p>}
    </section>
  );
}

// ─── Promo codes ───────────────────────────────────────────────────────────────
export default function PromosTab() {
  const [promos, setPromos] = useState<PromoRow[] | null>(null);
  const [promoForm, setPromoForm] = useState({ code: "", percent_off: "", min_subtotal: "", max_uses: "", starts_at: "", expires_at: "" });
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoFormError, setPromoFormError] = useState("");

  const loadPromos = useCallback(async () => {
    const res = await authedFetch("/api/admin/promos");
    if (res.ok) setPromos(await res.json());
  }, []);

  useEffect(() => { loadPromos(); }, [loadPromos]);

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
        starts_at: promoForm.starts_at ? new Date(`${promoForm.starts_at}T00:00:00`).toISOString() : null,
        // End-of-day LOCAL (same as the site-wide sale): a bare "YYYY-MM-DD"
        // parses as UTC midnight, which killed codes the evening before the
        // chosen date and made a same-day start/expire promo never valid.
        expires_at: promoForm.expires_at ? new Date(`${promoForm.expires_at}T23:59:59`).toISOString() : null,
      }),
    });
    setPromoSaving(false);
    if (!res.ok) { setPromoFormError((await res.json().catch(() => ({}))).error ?? "Failed to create promo"); return; }
    setPromoForm({ code: "", percent_off: "", min_subtotal: "", max_uses: "", starts_at: "", expires_at: "" });
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

  return (
    <div className="space-y-6">
      <SiteWideSaleCard />
      <FeaturedBannerCard />
      <QuantityDiscountsCard />
      <ReferralProgramCard />

      <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
        <div className="flex items-center gap-2 mb-2">
          <Tag className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
          <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Promo Codes</h2>
        </div>
        <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-5">
          General discount codes (separate from affiliate codes). Limited to one use per customer; usage counts when an order is paid.
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
          <Field label="Starts">
            <input type="date" value={promoForm.starts_at}
              onChange={(e) => setPromoForm((f) => ({ ...f, starts_at: e.target.value }))} className="input-sm w-36" />
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
                  const scheduled = p.starts_at && new Date(p.starts_at) > new Date();
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
                            : scheduled ? "bg-[oklch(0.93_0.05_260)] text-[oklch(0.40_0.16_260)]"
                            : "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]"
                        }`}>
                          {!p.is_active ? "disabled" : expired ? "expired" : maxedOut ? "maxed out" : scheduled ? "scheduled" : "active"}
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
    </div>
  );
}
