/*
 * Account.tsx — Vitum Lab customer account (/account)
 * Order history with a status timeline (Placed → Paid → Shipped → Delivered,
 * incl. tracking link), and one-click reorder. Orders are matched by the
 * account email, so past orders appear too.
 */

import { useEffect, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { Package, LogOut, Loader2, HelpCircle, RotateCcw, Wallet, Copy, Check, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { formatOrderId } from "@/lib/orders";
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
  shipping_amount?: number | null;
  credit_applied?: number | null;
  payment_method?: string | null;
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
  const [loadError, setLoadError] = useState(false);
  const [credit, setCredit] = useState<number | null>(null);
  // Payment handles (for the "complete your payment" panel on pending manual
  // orders) + per-order UI state.
  const [payments, setPayments] = useState<Record<string, { handle?: string; instructions?: string }> | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Record<string, "sending" | "sent">>({});
  const [nowTs, setNowTs] = useState(() => Date.now());
  const { products } = useProducts();
  const { isAvailable } = useInventory();
  const { addItem, closeCart } = useCart();

  useEffect(() => {
    fetch("/api/public/site").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.payments) setPayments(d.payments); }).catch(() => {});
  }, []);

  // Tick a countdown for pending manual orders (expire 4 days after placement).
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const MANUAL_EXPIRY_MS = 4 * 24 * 3600 * 1000;

  const MANUAL_LABEL: Record<string, { label: string; memo: string }> = {
    zelle: { label: "Zelle", memo: "memo / note" },
    cashapp: { label: "Cash App", memo: "note" },
    venmo: { label: "Venmo", memo: "note" },
    ach: { label: "bank transfer", memo: "transfer memo" },
  };
  const copyText = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopiedKey(key); setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500); }, () => {});
  };
  const markSent = (id: string) => {
    if (sentIds[id]) return;
    setSentIds((s) => ({ ...s, [id]: "sending" }));
    authedFetch("/api/account/payment-sent", { method: "POST", body: JSON.stringify({ orderId: id }) })
      .then(() => setSentIds((s) => ({ ...s, [id]: "sent" })))
      .catch(() => setSentIds((s) => ({ ...s, [id]: "sent" })));
  };

  useEffect(() => {
    if (!loading && !session) navigate("/login");
  }, [loading, session, navigate]);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await authedFetch("/api/account/orders");
      if (res.ok) {
        setOrders((await res.json()).orders ?? []);
      } else {
        // Expired session / server error: show a retry state, never a false
        // "No orders yet." to a customer who has orders.
        setLoadError(true);
      }
    } catch {
      setLoadError(true); // network failure — otherwise the spinner never resolves
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  // Store credit balance (existing balances still auto-apply at checkout).
  useEffect(() => {
    if (!session) return;
    authedFetch("/api/account/credit").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setCredit(Number(d.balance) || 0); }).catch(() => {});
  }, [session]);

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
    <div className="min-h-screen bg-page">
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

        {/* Store credit — shown only when the customer has a balance to spend. */}
        {(credit ?? 0) > 0 && (
          <div className="mb-8">
            <div className="bg-white rounded-2xl p-5 shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] max-w-sm">
              <div className="flex items-center gap-2 mb-1 text-[oklch(0.52_0.01_260)]">
                <Wallet className="w-4 h-4 text-[oklch(0.35_0.15_260)]" />
                <span className="text-[0.75rem] font-semibold uppercase tracking-wider">Store Credit</span>
              </div>
              <p className="text-[1.75rem] font-bold leading-none text-[oklch(0.32_0.12_155)]">${(credit ?? 0).toFixed(2)}</p>
              <p className="text-[0.75rem] text-[oklch(0.55_0.01_260)] mt-2">Applied automatically at checkout.</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
          <h2 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">Order History</h2>
        </div>

        {fetching ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[oklch(0.52_0.01_260)]" /></div>
        ) : loadError ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)]">
            <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] mb-4">Couldn't load your orders — please try again.</p>
            <button onClick={() => { setFetching(true); load(); }} className="btn-primary">Retry</button>
          </div>
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
                    <p className="font-mono text-[0.75rem] text-[oklch(0.52_0.01_260)]">#{formatOrderId(o.id)}</p>
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

                {/* Complete-your-payment panel — pending manual transfers only */}
                {o.status === "pending" && ["zelle", "cashapp", "venmo", "ach"].includes(o.payment_method ?? "") && (() => {
                  const m = o.payment_method as string;
                  const info = MANUAL_LABEL[m] ?? { label: m, memo: "note" };
                  const handle = payments?.[m]?.handle ?? "";
                  const amountDue = (Number(o.net_amount) + Number(o.shipping_amount ?? 0) - Number(o.credit_applied ?? 0)).toFixed(2);
                  const sent = sentIds[o.id];
                  const remain = new Date(o.created_at).getTime() + MANUAL_EXPIRY_MS - nowTs;
                  const cd = remain > 0 ? `${Math.floor(remain / 86400000)}d ${Math.floor((remain % 86400000) / 3600000)}h` : null;
                  return (
                    <div className="mb-3 rounded-xl border border-[oklch(0.88_0.05_200)] bg-[oklch(0.97_0.02_200)] p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[0.8125rem] text-[oklch(0.30_0.06_200)]">
                          Send <span className="font-bold">${amountDue}</span> via <span className="font-semibold">{info.label}</span>{handle ? " to:" : "."}
                        </p>
                        {cd && <span className="flex-shrink-0 text-[0.6875rem] font-semibold text-[oklch(0.50_0.12_70)] whitespace-nowrap">expires in {cd}</span>}
                      </div>
                      {handle && (
                        <div className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 border border-[oklch(0.90_0.03_200)]">
                          <span className="font-mono text-[0.875rem] font-bold text-[oklch(0.20_0.04_200)] break-all">{handle}</span>
                          <button onClick={() => copyText(handle, `h-${o.id}`)} className="flex items-center gap-1 text-[0.75rem] font-semibold text-[oklch(0.42_0.11_200)] flex-shrink-0 hover:underline">
                            {copiedKey === `h-${o.id}` ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                          </button>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 border border-[oklch(0.90_0.03_200)]">
                        <span><span className="text-[0.6875rem] uppercase tracking-wide text-[oklch(0.45_0.03_200)]">Put in {info.memo}: </span><span className="font-mono text-[0.875rem] font-bold text-[oklch(0.20_0.04_200)] break-all">{formatOrderId(o.id)}</span></span>
                        <button onClick={() => copyText(formatOrderId(o.id), `o-${o.id}`)} className="flex items-center gap-1 text-[0.75rem] font-semibold text-[oklch(0.42_0.11_200)] flex-shrink-0 hover:underline">
                          {copiedKey === `o-${o.id}` ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                        </button>
                      </div>
                      {sent === "sent" ? (
                        <p className="flex items-center justify-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.35_0.12_155)] py-1"><CheckCircle2 className="w-4 h-4" /> Thanks! We'll confirm once it lands.</p>
                      ) : (
                        <button onClick={() => markSent(o.id)} disabled={sent === "sending"} className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-[oklch(0.42_0.14_155)] text-white text-[0.875rem] font-bold hover:bg-[oklch(0.37_0.14_155)] transition-colors disabled:opacity-60">
                          <CheckCircle2 className="w-4 h-4" /> {sent === "sending" ? "Sending…" : "I've Sent the Payment"}
                        </button>
                      )}
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between border-t border-[oklch(0.95_0.003_260)] pt-3">
                  <span className="text-[0.8125rem] text-[oklch(0.52_0.01_260)]">
                    Total <span className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)] ml-1">${(Number(o.net_amount) + Number(o.shipping_amount ?? 0)).toFixed(2)}</span>
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
