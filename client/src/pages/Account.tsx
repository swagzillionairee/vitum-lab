/*
 * Account.tsx — Vitum Lab customer account (/account)
 * Order history with a status timeline (Placed → Paid → Shipped → Delivered,
 * incl. tracking link), and one-click reorder. Orders are matched by the
 * account email, so past orders appear too.
 */

import { useEffect, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { Package, LogOut, Loader2, HelpCircle, RotateCcw, Wallet, Gift, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useProducts } from "@/hooks/useProducts";
import { useInventory } from "@/hooks/useInventory";
import { authedFetch } from "@/lib/api";
import OrderTimeline from "@/components/OrderTimeline";
import SEO from "@/components/SEO";

interface OrderItem { name: string; dose: string; quantity: number; cartCode: string; price: number }
interface Order {
  id: string;
  items: OrderItem[];
  net_amount: number;
  status: string;
  fulfillment_status: string | null;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting Payment",
  confirmed: "Confirmed — Preparing Shipment",
  finished: "Confirmed — Preparing Shipment",
  failed: "Payment Failed",
  cancelled: "Cancelled",
};

function statusLabel(o: Order): string {
  if (o.status === "confirmed" || o.status === "finished") {
    if (o.fulfillment_status === "delivered") return "Delivered";
    if (o.fulfillment_status === "shipped") return "Shipped";
  }
  return STATUS_LABEL[o.status] ?? o.status;
}

export default function Account() {
  const { session, loading, user, signOut } = useAuth();
  const [, navigate] = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [fetching, setFetching] = useState(true);
  const [credit, setCredit] = useState<number | null>(null);
  const [referral, setReferral] = useState<{ code: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const { products } = useProducts();
  const { isAvailable } = useInventory();
  const { addItem, closeCart } = useCart();

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

  // Store credit balance + referral link.
  useEffect(() => {
    if (!session) return;
    authedFetch("/api/account/credit").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setCredit(Number(d.balance) || 0); }).catch(() => {});
    authedFetch("/api/account/referral").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.link) setReferral({ code: d.code, link: d.link }); }).catch(() => {});
  }, [session]);

  const copyReferral = () => {
    if (!referral) return;
    navigator.clipboard.writeText(referral.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Re-add a past order's items to the cart at CURRENT prices/availability.
  const reorder = (o: Order) => {
    const skipped: string[] = [];
    let added = 0;
    for (const it of o.items ?? []) {
      if (it.cartCode === "bac-water-free") continue; // free gift re-applies automatically
      let found: { id: string; name: string; dose: string; price: number; img: string; cartCode: string } | null = null;
      for (const p of products) {
        const v = p.variants.find((vv) => vv.cartCode === it.cartCode);
        if (v) {
          found = { id: v.id, name: p.name, dose: v.dose, price: v.salePrice ?? v.price, img: v.img, cartCode: v.cartCode };
          break;
        }
      }
      if (!found || !isAvailable(it.cartCode)) {
        skipped.push(`${it.name} ${it.dose}`);
        continue;
      }
      for (let k = 0; k < it.quantity; k++) addItem(found);
      added += it.quantity;
    }
    closeCart();
    if (skipped.length > 0) {
      toast.warning(`No longer available: ${skipped.join(", ")}`);
    }
    if (added > 0) {
      toast.success("Items added to your cart at current prices.");
      navigate("/checkout");
    } else if (skipped.length > 0) {
      toast.error("None of those items are currently available.");
    }
  };

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

        {/* Store credit + referral */}
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-5 shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)]">
            <div className="flex items-center gap-2 mb-1 text-[oklch(0.52_0.01_260)]">
              <Wallet className="w-4 h-4 text-[oklch(0.35_0.15_260)]" />
              <span className="text-[0.75rem] font-semibold uppercase tracking-wider">Store Credit</span>
            </div>
            <p className="text-[1.75rem] font-bold leading-none text-[oklch(0.32_0.12_155)]">${(credit ?? 0).toFixed(2)}</p>
            <p className="text-[0.75rem] text-[oklch(0.55_0.01_260)] mt-2">Earned on every order and from referrals — applied automatically at checkout.</p>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)]">
            <div className="flex items-center gap-2 mb-1 text-[oklch(0.52_0.01_260)]">
              <Gift className="w-4 h-4 text-[oklch(0.35_0.15_260)]" />
              <span className="text-[0.75rem] font-semibold uppercase tracking-wider">Refer a Friend</span>
            </div>
            <p className="text-[0.75rem] text-[oklch(0.55_0.01_260)] mb-2">Share your link — your friend gets a discount on their first order, and you earn store credit when they buy.</p>
            <div className="flex gap-2">
              <input readOnly value={referral?.link ?? "Generating…"} onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 border border-[oklch(0.88_0.004_260)] rounded-lg px-2.5 py-1.5 text-[0.75rem] font-mono text-[oklch(0.35_0.01_260)] bg-[oklch(0.98_0.002_260)]" />
              <button onClick={copyReferral} disabled={!referral}
                className="flex items-center gap-1 text-[0.75rem] font-semibold text-[oklch(0.40_0.16_260)] border border-[oklch(0.40_0.16_260)] px-2.5 py-1.5 rounded-lg hover:bg-[oklch(0.96_0.02_260)] disabled:opacity-50">
                {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
              </button>
            </div>
          </div>
        </div>

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
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-mono text-[0.75rem] text-[oklch(0.52_0.01_260)]">#{o.id.slice(0, 10)}</p>
                    <p className="text-[0.75rem] text-[oklch(0.60_0.01_260)]">{new Date(o.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[0.6875rem] font-semibold ${
                    o.status === "confirmed" || o.status === "finished"
                      ? "bg-[oklch(0.93_0.06_155)] text-[oklch(0.35_0.14_155)]"
                      : o.status === "failed"
                      ? "bg-[oklch(0.93_0.04_25)] text-[oklch(0.50_0.18_25)]"
                      : o.status === "cancelled"
                      ? "bg-[oklch(0.92_0.005_260)] text-[oklch(0.45_0.01_260)]"
                      : "bg-[oklch(0.95_0.04_85)] text-[oklch(0.50_0.12_85)]"
                  }`}>
                    {statusLabel(o)}
                  </span>
                </div>

                {/* Status timeline */}
                <div className="mb-4 bg-[oklch(0.98_0.002_260)] rounded-xl px-4 py-3">
                  <OrderTimeline order={o} />
                </div>

                <ul className="text-[0.8125rem] text-[oklch(0.40_0.01_260)] space-y-0.5 mb-3">
                  {(o.items ?? []).map((it, i) => (
                    <li key={i}>{it.name} {it.dose} × {it.quantity}</li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t border-[oklch(0.95_0.003_260)] pt-3">
                  <span className="text-[0.8125rem] text-[oklch(0.52_0.01_260)]">
                    Total <span className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)] ml-1">${Number(o.net_amount).toFixed(2)}</span>
                  </span>
                  <button
                    onClick={() => reorder(o)}
                    className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-[oklch(0.35_0.15_260)] border border-[oklch(0.35_0.15_260)] px-3 py-1.5 rounded-lg hover:bg-[oklch(0.96_0.008_260)]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reorder
                  </button>
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
