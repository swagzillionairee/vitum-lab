/*
 * Checkout.tsx — Vitum Lab dedicated checkout page (/checkout)
 * - Requires a signed-in customer (redirects to /login?redirect=/checkout).
 * - Left 2/3: contact + shipping address (Google Places autocomplete).
 * - Right 1/3: order summary (items, subtotal, discount, shipping, total),
 *   promo code, and the "Continue to Payment" button (NowPayments invoice).
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Tag, Check, Loader2, ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { authedFetch } from "@/lib/api";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import SEO from "@/components/SEO";

const FREE_SHIPPING_THRESHOLD = 150;

export default function Checkout() {
  const { items, subtotal, openCart } = useCart();
  const { session, user, loading } = useAuth();
  const [, navigate] = useLocation();

  const [email, setEmail] = useState("");
  const [ship, setShip] = useState({
    name: "", line1: "", line2: "", city: "", state: "", postal_code: "", country: "US", phone: "",
  });
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);
  const [discountPct, setDiscountPct] = useState(0);
  const [affiliateId, setAffiliateId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Require sign-in; return here after auth.
  useEffect(() => {
    if (!loading && !session) navigate("/login?redirect=/checkout");
  }, [loading, session, navigate]);

  // Prefill email from the signed-in account.
  useEffect(() => {
    if (user?.email) setEmail((e) => e || user.email!);
  }, [user]);

  // Prefill the shipping address from the saved profile (or last order).
  useEffect(() => {
    if (!session) return;
    let stale = false;
    (async () => {
      try {
        const res = await authedFetch("/api/account/profile");
        if (!res.ok || stale) return;
        const { shipping_address: a } = await res.json();
        if (!a?.line1) return;
        setShip((prev) => (prev.line1 ? prev : {
          name: a.name ?? "", line1: a.line1 ?? "", line2: a.line2 ?? "", city: a.city ?? "",
          state: a.state ?? "", postal_code: a.postal_code ?? "", country: a.country || "US", phone: a.phone ?? "",
        }));
      } catch { /* prefill is best-effort */ }
    })();
    return () => { stale = true; };
  }, [session]);

  const setShipField = (field: keyof typeof ship, value: string) => {
    setShip((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError(false);
    setPromoApplied(false);
    try {
      const res = await fetch("/api/validate-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim(), subtotal }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setPromoError(true);
      } else {
        setPromoApplied(true);
        setDiscountPct(data.discountPct);
        setAffiliateId(data.affiliateId);
      }
    } catch {
      setPromoError(true);
    } finally {
      setPromoLoading(false);
    }
  };

  const discountAmount = promoApplied ? parseFloat((subtotal * discountPct / 100).toFixed(2)) : 0;
  const shippingCost = 0; // Free shipping (flat) — adjust here if a fee is introduced.
  const total = subtotal - discountAmount + shippingCost;

  const handlePay = async () => {
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!ship.name.trim() || !ship.line1.trim() || !ship.city.trim() || !ship.state.trim() || !ship.postal_code.trim()) {
      setError("Please fill in your full shipping address.");
      return;
    }
    setBusy(true);
    setError("");
    const shippingPayload = {
      name: ship.name.trim(), line1: ship.line1.trim(), line2: ship.line2.trim(),
      city: ship.city.trim(), state: ship.state.trim().toUpperCase(),
      postal_code: ship.postal_code.trim(), country: ship.country, phone: ship.phone.trim(),
    };
    try {
      const response = await fetch("/api/create-crypto-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ name: i.name, dose: i.dose, quantity: i.quantity, cartCode: i.cartCode, price: i.price })),
          email,
          shipping: shippingPayload,
          total,
          discountCode: promoApplied ? promoCode : undefined,
          affiliateId: promoApplied ? affiliateId : undefined,
          discountAmount: promoApplied ? discountAmount : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to create payment. Please try again.");
      } else {
        // Save the address for next time; keepalive lets it finish during the redirect.
        void authedFetch("/api/account/profile", {
          method: "PUT",
          body: JSON.stringify({ shipping_address: shippingPayload }),
          keepalive: true,
        }).catch(() => {});
        window.location.href = data.invoiceUrl;
      }
    } catch {
      setError("Failed to create payment. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const inputBase = "border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2.5 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent";
  const inputClass = `${inputBase} w-full`;

  if (loading || !session) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[oklch(0.52_0.01_260)]" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <SEO title="Checkout" description="Complete your Vitum Lab order." />
        <ShoppingBag className="w-12 h-12 text-[oklch(0.85_0.003_260)] mb-4" />
        <h1 className="text-[1.25rem] font-bold text-[oklch(0.13_0.01_260)] mb-2">Your cart is empty</h1>
        <button onClick={() => navigate("/shop")} className="mt-4 btn-primary py-2.5 px-6 text-sm">Browse Products</button>
      </div>
    );
  }

  return (
    <div className="container py-10">
      <SEO title="Checkout" description="Complete your Vitum Lab order." />
      <h1 className="text-[1.75rem] font-bold tracking-tight text-[oklch(0.13_0.01_260)] mb-8">Checkout</h1>

      <div className="grid lg:grid-cols-3 gap-8 items-start">
        {/* ── Left 2/3: contact + shipping ─────────────────────────── */}
        <div className="lg:col-span-2 space-y-8">
          {/* Contact */}
          <section className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6">
            <h2 className="text-[1rem] font-bold text-[oklch(0.13_0.01_260)] mb-4">Contact</h2>
            <label className="block text-[0.8125rem] font-semibold text-[oklch(0.35_0.01_260)] mb-1.5">Email for order confirmation</label>
            <input type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} placeholder="you@example.com" className={inputClass} />
          </section>

          {/* Shipping address */}
          <section className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6">
            <h2 className="text-[1rem] font-bold text-[oklch(0.13_0.01_260)] mb-4">Shipping address</h2>
            <div className="space-y-3">
              <input type="text" autoComplete="name" value={ship.name} onChange={(e) => setShipField("name", e.target.value)} placeholder="Full name" className={inputClass} />
              <AddressAutocomplete
                value={ship.line1}
                onChange={(v) => setShipField("line1", v)}
                onSelect={(p) => setShip((prev) => ({
                  ...prev,
                  line1: p.line1 || prev.line1,
                  city: p.city || prev.city,
                  state: p.state || prev.state,
                  postal_code: p.postal_code || prev.postal_code,
                  country: p.country || prev.country,
                }))}
                placeholder="Street address"
                className={inputClass}
              />
              <input type="text" autoComplete="address-line2" value={ship.line2} onChange={(e) => setShipField("line2", e.target.value)} placeholder="Apt, suite, unit (optional)" className={inputClass} />
              <div className="flex gap-3">
                <input type="text" autoComplete="address-level2" value={ship.city} onChange={(e) => setShipField("city", e.target.value)} placeholder="City" className={`${inputBase} flex-1 min-w-0`} />
                <input type="text" autoComplete="address-level1" maxLength={2} value={ship.state} onChange={(e) => setShipField("state", e.target.value)} placeholder="State" className={`${inputBase} w-20`} />
                <input type="text" autoComplete="postal-code" inputMode="numeric" value={ship.postal_code} onChange={(e) => setShipField("postal_code", e.target.value)} placeholder="ZIP" className={`${inputBase} w-28`} />
              </div>
              <input type="tel" autoComplete="tel" value={ship.phone} onChange={(e) => setShipField("phone", e.target.value)} placeholder="Phone (for delivery, optional)" className={inputClass} />
              <p className="text-[0.6875rem] text-[oklch(0.55_0.01_260)]">Ships within the United States only.</p>
            </div>
          </section>
        </div>

        {/* ── Right 1/3: order summary ─────────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-[oklch(0.93_0.004_260)] p-6 lg:sticky lg:top-24 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[1rem] font-bold text-[oklch(0.13_0.01_260)]">Order summary</h2>
              <button onClick={openCart} className="text-[0.75rem] font-semibold text-[oklch(0.40_0.16_260)] hover:underline">Edit cart</button>
            </div>

            {/* Items */}
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3 items-center">
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: "#f0f0f0" }}>
                    <img src={item.img} alt={`${item.name} ${item.dose}`} className="w-full h-full object-cover object-top" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.8125rem] font-semibold text-[oklch(0.13_0.01_260)] leading-tight truncate">{item.name}</p>
                    <p className="text-[0.6875rem] text-[oklch(0.52_0.01_260)]">{item.dose} · Qty {item.quantity}</p>
                  </div>
                  <span className="text-[0.8125rem] font-bold text-[oklch(0.13_0.01_260)]">
                    {item.price === 0 ? "Free" : `$${(item.price * item.quantity).toFixed(2)}`}
                  </span>
                </div>
              ))}
            </div>

            {/* Promo */}
            <div className="border-t border-[oklch(0.93_0.004_260)] pt-4">
              <button onClick={() => setPromoOpen(!promoOpen)} className="flex items-center gap-1.5 text-[0.8125rem] text-[oklch(0.40_0.16_260)] font-semibold hover:underline">
                <Tag className="w-3.5 h-3.5" /> Have a promo code?
              </button>
              {promoOpen && (
                <div className="mt-2 flex gap-2">
                  <input type="text" value={promoCode} onChange={(e) => { setPromoCode(e.target.value); setPromoError(false); setPromoApplied(false); setDiscountPct(0); setAffiliateId(undefined); }} placeholder="Enter code" className={`${inputBase} flex-1 min-w-0 py-2`} />
                  <button onClick={handleApplyPromo} disabled={promoLoading} className="flex-shrink-0 px-4 py-2 rounded-lg bg-[oklch(0.13_0.02_260)] text-white text-[0.8125rem] font-semibold hover:bg-[oklch(0.22_0.02_260)] transition-colors disabled:opacity-60">
                    {promoLoading ? "…" : "Apply"}
                  </button>
                </div>
              )}
              {promoApplied && <p className="mt-1.5 text-[0.75rem] text-[oklch(0.35_0.14_155)] flex items-center gap-1"><Check className="w-3 h-3" /> Promo code applied!</p>}
              {promoError && <p className="mt-1.5 text-[0.75rem] text-red-500">Invalid or expired promo code.</p>}
            </div>

            {/* Totals */}
            <div className="border-t border-[oklch(0.93_0.004_260)] pt-4 space-y-2">
              <div className="flex justify-between text-[0.875rem] text-[oklch(0.40_0.01_260)]">
                <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-[0.875rem] text-[oklch(0.35_0.14_155)] font-semibold">
                  <span>Discount ({discountPct}%)</span><span>−${discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-[0.875rem] text-[oklch(0.40_0.01_260)]">
                <span>Shipping</span>
                <span className={subtotal >= FREE_SHIPPING_THRESHOLD ? "text-[oklch(0.35_0.12_155)] font-semibold" : ""}>Free</span>
              </div>
              <div className="flex justify-between items-center border-t border-[oklch(0.93_0.004_260)] pt-2">
                <span className="text-[0.9375rem] font-bold text-[oklch(0.13_0.01_260)]">Total</span>
                <span className="text-[1.25rem] font-bold text-[oklch(0.13_0.01_260)]">${total.toFixed(2)}</span>
              </div>
            </div>

            {error && <p className="text-[0.75rem] text-red-500">{error}</p>}

            <button onClick={handlePay} disabled={busy} className="flex items-center justify-center gap-2 w-full btn-primary py-3.5 text-[0.9375rem] disabled:opacity-60 disabled:cursor-not-allowed">
              {busy ? "Creating Payment…" : (<>Continue to Payment <ArrowRight className="w-4 h-4" /></>)}
            </button>
            <p className="text-[0.6875rem] text-[oklch(0.55_0.01_260)] text-center">
              Pay with crypto, card, or Apple Pay on the next step.
            </p>
            <p className="text-[0.625rem] text-center text-[oklch(0.70_0.01_260)]">
              Research use only — not for human consumption.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
