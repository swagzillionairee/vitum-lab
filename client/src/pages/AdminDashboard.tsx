/*
 * AdminDashboard.tsx — Vitum Lab
 * Owner-only dashboard. Gated by the admins table server-side; if the API
 * returns 401 the page shows a "not authorized" state.
 * - Inventory: edit stock levels, toggle active/inactive
 * - Orders: recent order overview with status
 */

import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Package, ClipboardList, LogOut, Loader2, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import SEO from "@/components/SEO";

interface InventoryRow {
  cart_code: string;
  stock: number;
  is_active: boolean;
  updated_at: string;
}

interface OrderRow {
  id: string;
  email: string;
  net_amount: number;
  status: string;
  created_at: string;
}

async function authedFetch(path: string, init?: RequestInit) {
  const { data } = await supabase!.auth.getSession();
  const token = data.session?.access_token;
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
}

export default function AdminDashboard() {
  const { session, loading, signOut } = useAuth();
  const [, navigate] = useLocation();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [savedCode, setSavedCode] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) navigate("/admin/login");
  }, [loading, session, navigate]);

  const loadData = useCallback(async () => {
    const invRes = await authedFetch("/api/admin/inventory");
    if (invRes.status === 401) {
      setAuthorized(false);
      return;
    }
    setAuthorized(true);
    setInventory(await invRes.json());
    const ordRes = await authedFetch("/api/admin/orders");
    if (ordRes.ok) setOrders((await ordRes.json()).orders);
  }, []);

  useEffect(() => {
    if (session) loadData();
  }, [session, loadData]);

  const updateRow = async (cartCode: string, patch: { stock?: number; isActive?: boolean }) => {
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

  if (loading || authorized === null) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[oklch(0.52_0.01_260)]" />
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-[1.5rem] font-bold text-[oklch(0.13_0.01_260)] mb-2">Not authorized</h1>
        <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] mb-6">
          This account doesn't have admin access.
        </p>
        <button onClick={() => { signOut(); navigate("/admin/login"); }} className="btn-primary">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.002_260)]">
      <SEO title="Admin Dashboard" description="Vitum Lab admin." />
      <div className="container py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-[2rem] font-bold tracking-tight text-[oklch(0.13_0.01_260)]">Admin</h1>
          <button
            onClick={() => { signOut(); navigate("/admin/login"); }}
            className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)]"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>

        {/* ── Inventory ─────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
            <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Inventory</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[0.875rem]">
              <thead>
                <tr className="text-left text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] border-b border-[oklch(0.93_0.004_260)]">
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Stock</th>
                  <th className="py-2 pr-4">Active</th>
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
                          if (!isNaN(v) && v !== row.stock) updateRow(row.cart_code, { stock: v });
                        }}
                        className="w-20 border border-[oklch(0.88_0.004_260)] rounded-lg px-2 py-1.5 text-[0.8125rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)]"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        onClick={() => updateRow(row.cart_code, { isActive: !row.is_active })}
                        className={`px-3 py-1 rounded-full text-[0.75rem] font-semibold ${
                          row.is_active
                            ? "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]"
                            : "bg-[oklch(0.93_0.003_260)] text-[oklch(0.52_0.01_260)]"
                        }`}
                      >
                        {row.is_active ? "Active" : "Hidden"}
                      </button>
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

        {/* ── Orders ─────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] p-6">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
            <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Recent Orders</h2>
          </div>
          {orders.length === 0 ? (
            <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] py-4">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.875rem]">
                <thead>
                  <tr className="text-left text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] border-b border-[oklch(0.93_0.004_260)]">
                    <th className="py-2 pr-4">Order</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-[oklch(0.95_0.003_260)]">
                      <td className="py-3 pr-4 font-mono text-[0.75rem] text-[oklch(0.20_0.01_260)]">{o.id.slice(0, 10)}</td>
                      <td className="py-3 pr-4 text-[oklch(0.40_0.01_260)]">{o.email}</td>
                      <td className="py-3 pr-4 font-semibold text-[oklch(0.13_0.01_260)]">${Number(o.net_amount).toFixed(2)}</td>
                      <td className="py-3 pr-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold ${
                          o.status === "confirmed" || o.status === "finished"
                            ? "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]"
                            : o.status === "failed"
                            ? "bg-[oklch(0.93_0.04_25)] text-[oklch(0.50_0.18_25)]"
                            : "bg-[oklch(0.95_0.04_85)] text-[oklch(0.50_0.12_85)]"
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3 text-[0.8125rem] text-[oklch(0.52_0.01_260)]">
                        {new Date(o.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
