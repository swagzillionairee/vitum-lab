/*
 * OrderTracking.tsx — public order tracking (/track). No sign-in required:
 * the customer enters their order number + email and we look it up via
 * GET /api/public/track (email must match the order). Reuses OrderTimeline.
 */
import { useState, useEffect, type FormEvent } from "react";
import { Package, Loader2, Search, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import OrderTimeline from "@/components/OrderTimeline";
import SEO from "@/components/SEO";
import { formatOrderId } from "@/lib/orders";

interface TrackedOrder {
  id: string;
  items?: { name: string; dose: string; quantity: number; cartCode?: string; price?: number }[];
  net_amount?: number;
  shipping_amount?: number | null;
  status: string;
  fulfillment_status?: string | null;
  tracking_number?: string | null;
  carrier?: string | null;
  created_at: string;
  confirmed_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
}

export default function OrderTracking() {
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);

  // Prefill the order number from ?order= (e.g. a link in a confirmation email).
  useEffect(() => {
    const o = new URLSearchParams(window.location.search).get("order");
    if (o) setOrderId(o);
  }, []);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!orderId.trim() || !email.trim()) { setError("Enter your order number and email."); setState("error"); return; }
    setState("loading"); setError("");
    try {
      const res = await fetch(
        `/api/public/track?order=${encodeURIComponent(orderId.trim())}&email=${encodeURIComponent(email.trim())}`,
      );
      const data = await res.json();
      if (!res.ok) { setError(data.error || "No order found."); setState("error"); setOrder(null); return; }
      setOrder(data.order as TrackedOrder); setState("done");
    } catch {
      setError("Something went wrong. Please try again."); setState("error");
    }
  };

  const inputClass = "w-full border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2.5 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)]";

  return (
    <div className="min-h-[70vh] bg-page">
      <SEO title="Track Your Order" description="Check the status of your Vitum Lab order with your order number and email." />

      <div className="container py-12 max-w-xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)] transition-colors mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
        </Link>

        <div className="flex items-center gap-2 mb-2">
          <Package className="w-6 h-6 text-[oklch(0.35_0.15_260)]" />
          <h1 className="text-[1.75rem] font-bold tracking-tight text-[oklch(0.13_0.01_260)]">Track Your Order</h1>
        </div>
        <p className="text-[0.9375rem] text-[oklch(0.52_0.01_260)] mb-6">
          Enter the order number from your confirmation email and the email you used at checkout.
        </p>

        <form onSubmit={submit} className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6 space-y-3">
          <div>
            <label className="block text-[0.8125rem] font-semibold text-[oklch(0.35_0.01_260)] mb-1.5">Order number</label>
            <input value={orderId} onChange={(e) => { setOrderId(e.target.value); setState("idle"); }} placeholder="e.g. a1b2c3d4e5--…" className={`${inputClass} font-mono`} />
          </div>
          <div>
            <label className="block text-[0.8125rem] font-semibold text-[oklch(0.35_0.01_260)] mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setState("idle"); }} placeholder="you@example.com" className={inputClass} />
          </div>
          <button type="submit" disabled={state === "loading"} className="flex items-center justify-center gap-2 w-full btn-primary py-3 text-[0.9375rem] disabled:opacity-60">
            {state === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {state === "loading" ? "Looking up…" : "Track order"}
          </button>
          {state === "error" && <p className="text-[0.8125rem] text-red-500">{error}</p>}
        </form>

        {state === "done" && order && (
          <div className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6 mt-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[0.75rem] text-[oklch(0.55_0.01_260)]">{formatOrderId(order.id)}</span>
              {order.net_amount != null && (
                <span className="text-[0.875rem] font-bold text-[oklch(0.13_0.01_260)]">${(Number(order.net_amount) + Number(order.shipping_amount ?? 0)).toFixed(2)}</span>
              )}
            </div>

            <OrderTimeline order={order} />

            {order.items && order.items.length > 0 && (
              <ul className="mt-5 pt-4 border-t border-[oklch(0.95_0.003_260)] space-y-1.5">
                {order.items.filter((it) => it.cartCode !== "bac-water-free").map((it, i) => (
                  <li key={i} className="flex justify-between text-[0.8125rem] text-[oklch(0.35_0.01_260)]">
                    <span><span className="font-semibold text-[oklch(0.13_0.01_260)]">{it.quantity}×</span> {it.name} <span className="text-[oklch(0.55_0.01_260)]">{it.dose}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
