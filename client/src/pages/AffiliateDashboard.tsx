/*
 * AffiliateDashboard.tsx — Vitum Lab affiliate dashboard (/affiliate/dashboard)
 * Stats cards + 30-day orders chart (recharts) + attributed orders table.
 * Gated server-side by the affiliates table; non-affiliates see "not authorized".
 */

import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { LogOut, Loader2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { authedFetch } from "@/lib/api";
import SEO from "@/components/SEO";

interface Stats {
  code: string;
  name: string | null;
  discountPercent: number;
  commissionPercent: number;
  totalOrders: number;
  revenue: number;
  discountsGiven: number;
  commission: number;
  series: { date: string; count: number }[];
}

interface AffOrder {
  id: string;
  net_amount: number;
  commission_amount: number | null;
  status: string;
  created_at: string;
}

export default function AffiliateDashboard() {
  const { session, loading, signOut } = useAuth();
  const [, navigate] = useLocation();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<AffOrder[]>([]);

  useEffect(() => {
    if (!loading && !session) navigate("/affiliate/login");
  }, [loading, session, navigate]);

  const load = useCallback(async () => {
    const res = await authedFetch("/api/affiliate/stats");
    if (res.status === 401) { setAuthorized(false); return; }
    setAuthorized(true);
    setStats(await res.json());
    const ord = await authedFetch("/api/affiliate/orders");
    if (ord.ok) setOrders((await ord.json()).orders ?? []);
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  if (loading || authorized === null) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[oklch(0.52_0.01_260)]" /></div>;
  }

  if (authorized === false) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-[1.5rem] font-bold text-[oklch(0.13_0.01_260)] mb-2">Not an affiliate account</h1>
        <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] mb-6">This account isn't registered as an affiliate.</p>
        <button onClick={() => { signOut(); navigate("/affiliate/login"); }} className="btn-primary">Sign out</button>
      </div>
    );
  }

  const cards = [
    { label: "Total Orders", value: stats?.totalOrders ?? 0 },
    { label: "Revenue Generated", value: `$${(stats?.revenue ?? 0).toFixed(2)}` },
    { label: "Discounts Given", value: `$${(stats?.discountsGiven ?? 0).toFixed(2)}` },
    { label: "Commission Earned", value: `$${(stats?.commission ?? 0).toFixed(2)}` },
  ];

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.002_260)]">
      <SEO title="Affiliate Dashboard" description="Vitum Lab affiliate dashboard." />
      <div className="container py-10">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-[2rem] font-bold tracking-tight text-[oklch(0.13_0.01_260)]">Affiliate Dashboard</h1>
          <button onClick={() => { signOut(); navigate("/affiliate/login"); }} className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)]">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
        {stats && (
          <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] mb-8">
            Code <span className="font-mono font-bold text-[oklch(0.35_0.15_260)]">{stats.code}</span> · {stats.discountPercent}% customer discount · {stats.commissionPercent}% commission
          </p>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {cards.map((c) => (
            <div key={c.label} className="bg-white rounded-2xl p-5 shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)]">
              <p className="text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] mb-1">{c.label}</p>
              <p className="text-[1.5rem] font-bold text-[oklch(0.13_0.01_260)]">{c.value}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] mb-8">
          <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)] mb-4">Orders — Last 30 Days</h2>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={stats?.series ?? []} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.93 0.004 260)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} interval={4} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="oklch(0.35 0.15 260)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Orders table */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)]">
          <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)] mb-4">Attributed Orders</h2>
          {orders.length === 0 ? (
            <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] py-4">No orders attributed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.875rem]">
                <thead>
                  <tr className="text-left text-[0.6875rem] uppercase tracking-wider text-[oklch(0.60_0.01_260)] border-b border-[oklch(0.93_0.004_260)]">
                    <th className="py-2 pr-4">Order</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Commission</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-[oklch(0.95_0.003_260)]">
                      <td className="py-3 pr-4 font-mono text-[0.75rem] text-[oklch(0.20_0.01_260)]">{o.id.slice(0, 10)}</td>
                      <td className="py-3 pr-4 font-semibold text-[oklch(0.13_0.01_260)]">${Number(o.net_amount).toFixed(2)}</td>
                      <td className="py-3 pr-4 text-[oklch(0.35_0.14_155)] font-semibold">${Number(o.commission_amount ?? 0).toFixed(2)}</td>
                      <td className="py-3 pr-4 text-[oklch(0.40_0.01_260)]">{o.status}</td>
                      <td className="py-3 text-[0.8125rem] text-[oklch(0.52_0.01_260)]">{new Date(o.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
