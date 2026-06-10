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
import { Tag, Loader2, Plus, Trash2, Megaphone, Check, Power } from "lucide-react";
import { authedFetch } from "@/lib/api";
import { invalidateProductsCache } from "@/hooks/useProducts";
import type { PromoRow, SitePromo } from "./types";
import { money, Field } from "./shared";

// ─── Site-wide sale card ───────────────────────────────────────────────────────
function SiteWideSaleCard() {
  const [promo, setPromo] = useState<SitePromo | null>(null);
  const [form, setForm] = useState({ percent: "", label: "", ends_at: "" });
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
        // Store as end-of-day so the sale runs through the chosen date.
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

  return (
    <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
          <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Site-wide Sale</h2>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${
          active && !expired ? "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]"
            : active && expired ? "bg-[oklch(0.93_0.04_25)] text-[oklch(0.50_0.18_25)]"
            : "bg-[oklch(0.92_0.005_260)] text-[oklch(0.45_0.01_260)]"
        }`}>
          {active && !expired ? `${promo?.sitewide_percent}% OFF — live` : active && expired ? "ended" : "off"}
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

// ─── Promo codes ───────────────────────────────────────────────────────────────
export default function PromosTab() {
  const [promos, setPromos] = useState<PromoRow[] | null>(null);
  const [promoForm, setPromoForm] = useState({ code: "", percent_off: "", min_subtotal: "", max_uses: "", expires_at: "" });
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

  return (
    <div className="space-y-6">
      <SiteWideSaleCard />

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
    </div>
  );
}
