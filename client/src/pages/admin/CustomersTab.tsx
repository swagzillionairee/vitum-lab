/*
 * CustomersTab.tsx — everyone who has created an account / signed in
 * (Supabase Auth), with per-customer order count + lifetime spend.
 */

import { useState, useEffect, useCallback } from "react";
import { UserRound, Loader2, Upload } from "lucide-react";
import { authedFetch } from "@/lib/api";
import type { CustomerRow } from "./types";
import { money, formatDateEST } from "./shared";

export default function CustomersTab() {
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
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

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const exportCustomersCsv = () => {
    const rows = customers ?? [];
    const header = ["Email", "Orders", "Total Spent", "Signed up (ET)", "Last sign-in (ET)", "Provider"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [header.map(esc).join(",")];
    for (const c of rows) {
      lines.push([c.email ?? "", c.orders, c.spent.toFixed(2), formatDateEST(c.created_at), c.last_sign_in_at ? formatDateEST(c.last_sign_in_at) : "never", c.provider ?? ""].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vitumlab-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
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
                    <th className="py-2 pr-4">Orders</th>
                    <th className="py-2 pr-4">Spent</th>
                    <th className="py-2 pr-4">Signed up</th>
                    <th className="py-2 pr-4">Last sign-in</th>
                    <th className="py-2">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b border-[oklch(0.95_0.003_260)]">
                      <td className="py-3 pr-4 font-medium text-[oklch(0.20_0.01_260)]">{c.email ?? "—"}</td>
                      <td className="py-3 pr-4 text-[oklch(0.30_0.01_260)]">{c.orders > 0 ? c.orders : "—"}</td>
                      <td className="py-3 pr-4 font-semibold text-[oklch(0.13_0.01_260)]">{c.spent > 0 ? money(c.spent) : "—"}</td>
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
  );
}
