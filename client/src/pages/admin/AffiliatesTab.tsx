/*
 * AffiliatesTab.tsx — affiliate list with earned/paid/owed, record payout,
 * edit %, add affiliate, and expandable payout history.
 * `onMutate` lets the parent refresh the Overview "Commissions Owed" KPI
 * after a payout changes.
 */

import { useState, useEffect, useCallback, Fragment } from "react";
import { Users, Plus, Loader2, ChevronDown, Wallet, Pencil, Trash2 } from "lucide-react";
import { authedFetch } from "@/lib/api";
import type { AffiliateRow } from "./types";
import { money, formatDateEST } from "./shared";

export default function AffiliatesTab({ onMutate }: { onMutate?: () => void }) {
  const [affiliates, setAffiliates] = useState<AffiliateRow[] | null>(null);
  const [affiliateBusy, setAffiliateBusy] = useState(false);
  const [expandedAffiliate, setExpandedAffiliate] = useState<string | null>(null);

  const loadAffiliates = useCallback(async () => {
    const res = await authedFetch("/api/admin/affiliates");
    if (res.ok) setAffiliates(await res.json());
  }, []);

  useEffect(() => { loadAffiliates(); }, [loadAffiliates]);

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
    onMutate?.(); // refresh Overview "Commissions Owed"
  };

  const deletePayout = async (id: string) => {
    if (!confirm("Delete this payout record?")) return;
    const res = await authedFetch("/api/admin/payouts", { method: "DELETE", body: JSON.stringify({ id }) });
    if (res.ok) { await loadAffiliates(); onMutate?.(); }
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

  const deleteAffiliate = async (a: AffiliateRow) => {
    if (!confirm(`Delete affiliate "${a.name || a.code}" (${a.code})?\n\nThis removes the affiliate and their payout records. Past orders keep their history, but the code stops giving a discount. This can't be undone.`)) return;
    setAffiliateBusy(true);
    const res = await authedFetch("/api/admin/affiliates", { method: "DELETE", body: JSON.stringify({ id: a.id }) });
    setAffiliateBusy(false);
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Failed to delete affiliate"); return; }
    await loadAffiliates();
    onMutate?.();
  };

  return (
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
                          <button onClick={() => deleteAffiliate(a)} disabled={affiliateBusy}
                            className="flex items-center gap-1 text-[0.7rem] font-semibold text-red-500 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50" title="Delete affiliate">
                            <Trash2 className="w-3 h-3" /> Delete
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
  );
}
