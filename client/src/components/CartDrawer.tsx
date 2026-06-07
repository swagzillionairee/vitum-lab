/*
 * CartDrawer.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Slide-out cart drawer from the right side.
 * - Framer Motion slide + fade for panel and backdrop
 * - Per-item quantity stepper and remove button
 * - Subtotal + free shipping threshold indicator
 * - Checkout via NowPayments invoice (crypto + card/Apple Pay on-ramp)
 */

import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Minus, Plus, Trash2, ShoppingBag, ArrowRight, Tag, ChevronDown, Check } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useLocation } from "wouter";
import AddressAutocomplete from "@/components/AddressAutocomplete";

const FREE_SHIPPING_THRESHOLD = 150;

export default function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, subtotal, totalItems } = useCart();
  const [, navigate] = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);
  const [discountPct, setDiscountPct] = useState(0);
  const [affiliateId, setAffiliateId] = useState<string | undefined>();
  const [checkoutStep, setCheckoutStep] = useState(false);
  const [email, setEmail] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [ship, setShip] = useState({
    name: "", line1: "", line2: "", city: "", state: "", postal_code: "", country: "US", phone: "",
  });
  const setShipField = (field: keyof typeof ship, value: string) => {
    setShip((prev) => ({ ...prev, [field]: value }));
    setCheckoutError("");
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
        body: JSON.stringify({ code: promoCode.trim() }),
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

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    if (isOpen) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, closeCart]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const discountAmount = promoApplied ? parseFloat((subtotal * discountPct / 100).toFixed(2)) : 0;
  const discountedTotal = subtotal - discountAmount;
  const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
  const freeShippingProgress = Math.min((subtotal / FREE_SHIPPING_THRESHOLD) * 100, 100);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="cart-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-[2px]"
            onClick={closeCart}
            aria-hidden
          />

          {/* Drawer panel */}
          <motion.div
            key="cart-drawer"
            ref={drawerRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 36, mass: 0.9 }}
            className="fixed top-0 right-0 bottom-0 z-[9999] w-full sm:max-w-[420px] bg-white shadow-2xl flex flex-col"
            role="dialog"
            aria-label="Shopping cart"
            aria-modal="true"
          >
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[oklch(0.91_0.004_260)]">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
                <h2 className="text-[1.0625rem] font-bold text-[oklch(0.13_0.01_260)]">
                  Cart
                  {totalItems > 0 && (
                    <span className="ml-2 text-[0.75rem] font-semibold text-[oklch(0.52_0.01_260)]">
                      ({totalItems} item{totalItems !== 1 ? "s" : ""})
                    </span>
                  )}
                </h2>
              </div>
              <button
                onClick={closeCart}
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-[oklch(0.96_0.003_260)] transition-colors"
                aria-label="Close cart"
              >
                <X className="w-4.5 h-4.5 text-[oklch(0.40_0.01_260)]" />
              </button>
            </div>

            {/* ── Free shipping progress ──────────────────────────── */}
            <div className="px-6 py-3 bg-[oklch(0.97_0.003_260)] border-b border-[oklch(0.91_0.004_260)]">
              {subtotal >= FREE_SHIPPING_THRESHOLD ? (
                <p className="text-[0.75rem] font-semibold text-[oklch(0.35_0.12_155)]">
                  🎉 You've unlocked free shipping + free BAC Water!
                </p>
              ) : (
                <p className="text-[0.75rem] text-[oklch(0.52_0.01_260)]">
                  Add{" "}
                  <span className="font-bold text-[oklch(0.13_0.01_260)]">
                    ${remaining.toFixed(2)}
                  </span>{" "}
                  more for free shipping &amp; a free BAC Water
                </p>
              )}
              <div className="mt-2 h-1.5 rounded-full bg-[oklch(0.91_0.004_260)] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[oklch(0.35_0.15_260)]"
                  initial={false}
                  animate={{ width: `${freeShippingProgress}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            </div>

            {/* ── Items list ─────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <ShoppingBag className="w-12 h-12 text-[oklch(0.85_0.003_260)] mb-4" />
                  <p className="text-[0.9375rem] font-semibold text-[oklch(0.40_0.01_260)] mb-1">
                    Your cart is empty
                  </p>
                  <p className="text-[0.8125rem] text-[oklch(0.65_0.01_260)]">
                    Add research peptides to get started.
                  </p>
                  <button
                    onClick={() => { closeCart(); navigate("/shop"); }}
                    className="mt-6 btn-primary text-sm py-2.5 px-6"
                  >
                    Browse Products
                  </button>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {items.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      className="flex gap-3 p-3 rounded-xl border border-[oklch(0.91_0.004_260)] bg-white hover:border-[oklch(0.82_0.008_260)] transition-colors"
                    >
                      {/* Product image */}
                      <div
                        className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0"
                        style={{ backgroundColor: "#f0f0f0" }}
                      >
                        <img
                          src={item.img}
                          alt={`${item.name} ${item.dose}`}
                          className="w-full h-full object-cover object-top"
                        />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[0.8125rem] font-bold text-[oklch(0.13_0.01_260)] leading-tight truncate">
                          {item.name}
                        </p>
                        <p className="text-[0.75rem] text-[oklch(0.52_0.01_260)] mb-2">
                          {item.dose}
                        </p>

                        {/* Quantity stepper + price row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 border border-[oklch(0.88_0.004_260)] rounded-lg overflow-hidden">
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="w-7 h-7 flex items-center justify-center text-[oklch(0.40_0.01_260)] hover:bg-[oklch(0.96_0.003_260)] transition-colors active:scale-95"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-7 text-center text-[0.8125rem] font-semibold text-[oklch(0.13_0.01_260)]">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="w-7 h-7 flex items-center justify-center text-[oklch(0.40_0.01_260)] hover:bg-[oklch(0.96_0.003_260)] transition-colors active:scale-95"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[0.875rem] font-bold text-[oklch(0.13_0.01_260)]">
                              ${(item.price * item.quantity).toFixed(2)}
                            </span>
                            <button
                              onClick={() => removeItem(item.id)}
                              className="w-6 h-6 flex items-center justify-center text-[oklch(0.70_0.01_260)] hover:text-red-500 transition-colors"
                              aria-label={`Remove ${item.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* ── Footer: subtotal + checkout ─────────────────────── */}
            {items.length > 0 && (
              <div className="border-t border-[oklch(0.91_0.004_260)] px-6 py-5 space-y-4 bg-white">
                {/* Subtotal */}
                <div className="flex items-center justify-between">
                  <span className="text-[0.875rem] text-[oklch(0.52_0.01_260)]">Subtotal</span>
                  <span className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">
                    ${subtotal.toFixed(2)}
                  </span>
                </div>
                {promoApplied && discountAmount > 0 && (
                  <>
                    <div className="flex items-center justify-between text-[0.875rem] text-[oklch(0.35_0.14_155)] font-semibold">
                      <span>Discount ({discountPct}%)</span>
                      <span>−${discountAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-[oklch(0.91_0.004_260)] pt-2">
                      <span className="text-[0.875rem] font-bold text-[oklch(0.13_0.01_260)]">Total</span>
                      <span className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">
                        ${discountedTotal.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}

                {subtotal >= FREE_SHIPPING_THRESHOLD && (
                  <div className="flex items-center justify-between text-[0.75rem] text-[oklch(0.35_0.12_155)] font-semibold">
                    <span>Free Shipping</span>
                    <span>$0.00</span>
                  </div>
                )}

                <p className="text-[0.6875rem] text-[oklch(0.65_0.01_260)]">
                  Taxes and final shipping calculated at checkout.
                </p>

                {/* Promo code */}
                <div>
                  <button
                    onClick={() => setPromoOpen(!promoOpen)}
                    className="flex items-center gap-1.5 text-[0.8125rem] text-[oklch(0.40_0.16_260)] font-semibold hover:underline"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    Have a promo code?
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${promoOpen ? "rotate-180" : ""}`} />
                  </button>
                  {promoOpen && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => { setPromoCode(e.target.value); setPromoError(false); setPromoApplied(false); setDiscountPct(0); setAffiliateId(undefined); }}
                        placeholder="Enter code"
                        className="flex-1 border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2 text-[0.8125rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
                      />
                      <button
                        onClick={handleApplyPromo}
                        disabled={promoLoading}
                        className="flex-shrink-0 px-4 py-2 rounded-lg bg-[oklch(0.13_0.02_260)] text-white text-[0.8125rem] font-semibold hover:bg-[oklch(0.22_0.02_260)] transition-colors active:scale-95 disabled:opacity-60"
                      >
                        {promoLoading ? "…" : "Apply"}
                      </button>
                    </div>
                  )}
                  {promoApplied && (
                    <p className="mt-1.5 text-[0.75rem] text-[oklch(0.35_0.14_155)] flex items-center gap-1">
                      <Check className="w-3 h-3" /> Promo code applied!
                    </p>
                  )}
                  {promoError && (
                    <p className="mt-1.5 text-[0.75rem] text-red-500">
                      Invalid or expired promo code.
                    </p>
                  )}
                </div>

                {/* Email + shipping address capture step */}
                {checkoutStep && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="block text-[0.8125rem] font-semibold text-[oklch(0.35_0.01_260)]">
                        Email for order confirmation
                      </label>
                      <input
                        type="email" autoComplete="email" value={email}
                        onChange={(e) => { setEmail(e.target.value); setCheckoutError(""); }}
                        placeholder="you@example.com"
                        className="w-full border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2.5 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[0.8125rem] font-semibold text-[oklch(0.35_0.01_260)]">
                        Shipping address
                      </label>
                      <input
                        type="text" autoComplete="name" value={ship.name}
                        onChange={(e) => setShipField("name", e.target.value)} placeholder="Full name"
                        className="w-full border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2.5 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
                      />
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
                        className="w-full border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2.5 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
                      />
                      <input
                        type="text" autoComplete="address-line2" value={ship.line2}
                        onChange={(e) => setShipField("line2", e.target.value)} placeholder="Apt, suite, unit (optional)"
                        className="w-full border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2.5 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text" autoComplete="address-level2" value={ship.city}
                          onChange={(e) => setShipField("city", e.target.value)} placeholder="City"
                          className="flex-1 min-w-0 border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2.5 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
                        />
                        <input
                          type="text" autoComplete="address-level1" value={ship.state}
                          onChange={(e) => setShipField("state", e.target.value)} placeholder="State"
                          className="w-20 border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2.5 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
                        />
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text" autoComplete="postal-code" inputMode="numeric" value={ship.postal_code}
                          onChange={(e) => setShipField("postal_code", e.target.value)} placeholder="ZIP code"
                          className="w-28 border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2.5 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
                        />
                        <select
                          autoComplete="country" value={ship.country}
                          onChange={(e) => setShipField("country", e.target.value)}
                          className="flex-1 border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2.5 text-[0.875rem] bg-white focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
                        >
                          <option value="US">United States</option>
                          <option value="CA">Canada</option>
                        </select>
                      </div>
                      <input
                        type="tel" autoComplete="tel" value={ship.phone}
                        onChange={(e) => setShipField("phone", e.target.value)} placeholder="Phone (for delivery, optional)"
                        className="w-full border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2.5 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
                      />
                    </div>

                    <p className="text-[0.6875rem] text-[oklch(0.55_0.01_260)]">
                      Pay with crypto, card, or Apple Pay on the next step.
                    </p>
                    {checkoutError && (
                      <p className="text-[0.75rem] text-red-500">{checkoutError}</p>
                    )}
                  </div>
                )}

                {/* Checkout buttons */}
                <div className="flex flex-col gap-2.5">
                  {!checkoutStep ? (
                    <button
                      onClick={() => setCheckoutStep(true)}
                      className="flex items-center justify-center gap-2 w-full btn-primary py-3.5 text-[0.9375rem]"
                    >
                      Proceed to Checkout <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={async () => {
                          if (!email.trim() || !email.includes("@")) {
                            setCheckoutError("Please enter a valid email address.");
                            return;
                          }
                          if (!ship.name.trim() || !ship.line1.trim() || !ship.city.trim() || !ship.state.trim() || !ship.postal_code.trim()) {
                            setCheckoutError("Please fill in your full shipping address.");
                            return;
                          }
                          setCheckoutLoading(true);
                          setCheckoutError("");
                          try {
                            const response = await fetch("/api/create-crypto-payment", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                items: items.map((i) => ({ name: i.name, dose: i.dose, quantity: i.quantity, cartCode: i.cartCode, price: i.price })),
                                email,
                                shipping: {
                                  name: ship.name.trim(), line1: ship.line1.trim(), line2: ship.line2.trim(),
                                  city: ship.city.trim(), state: ship.state.trim().toUpperCase(),
                                  postal_code: ship.postal_code.trim(), country: ship.country, phone: ship.phone.trim(),
                                },
                                total: discountedTotal,
                                discountCode: promoApplied ? promoCode : undefined,
                                affiliateId: promoApplied ? affiliateId : undefined,
                                discountAmount: promoApplied ? discountAmount : undefined,
                              }),
                            });
                            const data = await response.json();
                            if (!response.ok) {
                              setCheckoutError(data.error || "Failed to create payment. Please try again.");
                            } else {
                              window.location.href = data.invoiceUrl;
                            }
                          } catch {
                            setCheckoutError("Failed to create payment. Please try again.");
                          } finally {
                            setCheckoutLoading(false);
                          }
                        }}
                        disabled={checkoutLoading}
                        className="flex items-center justify-center gap-2 w-full btn-primary py-3.5 text-[0.9375rem] disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {checkoutLoading ? "Creating Payment…" : (
                          <>Continue to Payment <ArrowRight className="w-4 h-4" /></>
                        )}
                      </button>
                      <button
                        onClick={() => { setCheckoutStep(false); setCheckoutError(""); }}
                        className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] hover:underline"
                      >
                        ← Back
                      </button>
                    </>
                  )}
                </div>

                {/* Research disclaimer */}
                <p className="text-[0.625rem] text-center text-[oklch(0.70_0.01_260)] leading-relaxed">
                  Research use only — not for human consumption.
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
