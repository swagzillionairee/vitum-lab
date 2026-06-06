/*
 * Account.tsx — Vitum Lab customer account (/account)
 * Order history + shipping status for the logged-in customer.
 * Orders are matched by the account email, so past orders appear too.
 */

import { useEffect, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { Package, LogOut, Loader2, HelpCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { authedFetch } from "@/lib/api";
import SEO from "@/components/SEO";

interface OrderItem { name: string; dose: string; quantity: number }
interface Order {
  id: string;
  items: OrderItem[];
  net_amount: number;
  status: string;
  created_at: string;
  confirmed_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting Payment",
  confirmed: "Confirmed — Preparing Shipment",
  finished: "Shipped",
  failed: "Payment Failed",
};

export default function Account() {
  const { session, loading, user, signOut } = useAuth();
  const [, navigate] = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !session) navigate("/login");
  }, [loading, session, navigate]);

  const load = useCallback(async () => {
    const res = await authedFetch("/api/account/orders");
    if (res.ok) setOrders((await res.json()).orders ?? []);
    setFetching(false);
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[oklch(0.52_0.01_260)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.002_260)]">
      <SEO title="My Account" description="Your Vitum Lab order history and shipping status." />
      <div className="container py-10 max-w-3xl">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-[2rem] font-bold tracking-tight text-[oklch(0.13_0.01_260)]">My Account</h1>
          <button
            onClick={() => { signOut(); navigate("/"); }}
            className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)]"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
        <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] mb-8">{user?.email}</p>

        <div className="flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
          <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Order History</h2>
        </div>

        {fetching ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[oklch(0.52_0.01_260)]" /></div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)]">
            <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] mb-4">No orders yet.</p>
            <Link href="/shop" className="btn-primary">Browse Products</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((o) => (
              <div key={o.id} className="bg-white rounded-2xl p-5 shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-mono text-[0.75rem] text-[oklch(0.52_0.01_260)]">#{o.id.slice(0, 10)}</p>
                    <p className="text-[0.75rem] text-[oklch(0.60_0.01_260)]">{new Date(o.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[0.6875rem] font-semibold ${
                    o.status === "confirmed" || o.status === "finished"
                      ? "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]"
                      : o.status === "failed"
                      ? "bg-[oklch(0.93_0.04_25)] text-[oklch(0.50_0.18_25)]"
                      : "bg-[oklch(0.95_0.04_85)] text-[oklch(0.50_0.12_85)]"
                  }`}>
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </div>
                <ul className="text-[0.8125rem] text-[oklch(0.40_0.01_260)] space-y-0.5 mb-3">
                  {(o.items ?? []).map((it, i) => (
                    <li key={i}>{it.name} {it.dose} × {it.quantity}</li>
                  ))}
                </ul>
                <div className="flex justify-between border-t border-[oklch(0.95_0.003_260)] pt-3">
                  <span className="text-[0.8125rem] text-[oklch(0.52_0.01_260)]">Total</span>
                  <span className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)]">${Number(o.net_amount).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 bg-white rounded-2xl p-5 shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
            <span className="text-[0.875rem] text-[oklch(0.40_0.01_260)]">Need help with an order?</span>
          </div>
          <Link href="/contact" className="text-[0.8125rem] font-semibold text-[oklch(0.35_0.15_260)] hover:underline">Contact Support →</Link>
        </div>
      </div>
    </div>
  );
}
