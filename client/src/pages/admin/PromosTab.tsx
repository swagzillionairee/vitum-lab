/*
 * PromosTab.tsx — general promo codes (separate from affiliate codes):
 * create with % off / min subtotal / max uses / expiry; enable/disable; delete.
 */

import { useState, useEffect, useCallback } from "react";
import { Tag, Loader2, Plus, Trash2 } from "lucide-react";
import { authedFetch } from "@/lib/api";
import type { PromoRow } from "./types";
import { money, Field } from "./shared";

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
  );
}
