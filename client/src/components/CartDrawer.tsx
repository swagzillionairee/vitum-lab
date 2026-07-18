/*
 * CartDrawer.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Slide-out cart drawer from the right side.
 * - Shows the products in the cart (scrollable) with quantity steppers
 * - Subtotal + free shipping threshold indicator
 * - "Proceed to Checkout" routes to the dedicated /checkout page
 *   (forces sign-in first if the customer is not authenticated)
 */

import { useEffect } from "react";
import { X, Minus, Plus, Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { FREE_SHIPPING_THRESHOLD, FREE_GIFT_THRESHOLD } from "@/lib/discounts";

export default function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, subtotal, totalItems } = useCart();
  const { session } = useAuth();
  const [, navigate] = useLocation();

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
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  // Two-stage perks: free shipping at $75, free BAC Water at $100. Track toward
  // whichever the customer hasn't unlocked yet.
  const freeShip = subtotal >= FREE_SHIPPING_THRESHOLD;
  const freeGift = subtotal >= FREE_GIFT_THRESHOLD;
  const nextTarget = freeShip ? FREE_GIFT_THRESHOLD : FREE_SHIPPING_THRESHOLD;
  const remaining = Math.max(0, nextTarget - subtotal);
  const freeShippingProgress = Math.min((subtotal / nextTarget) * 100, 100);

  const handleCheckout = () => {
    closeCart();
    // Force sign-in before checkout; return to /checkout afterward.
    if (!session) {
      navigate("/login?redirect=/checkout");
    } else {
      navigate("/checkout");
    }
  };

  if (!isOpen) return null;

  return (
        <>
          {/* Backdrop */}
          <div
            className="cart-backdrop-enter fixed inset-0 z-[9998] bg-black/40 backdrop-blur-[2px]"
            onClick={closeCart}
            aria-hidden
          />

          {/* Drawer panel */}
          <div
            className="cart-drawer-enter fixed top-0 right-0 bottom-0 z-[9999] w-full sm:max-w-[420px] bg-white shadow-2xl flex flex-col"
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
                className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-[oklch(0.96_0.003_260)] transition-colors"
                aria-label="Close cart"
              >
                <X className="w-4.5 h-4.5 text-[oklch(0.40_0.01_260)]" />
              </button>
            </div>

            {/* ── Free shipping progress ──────────────────────────── */}
            <div className="px-6 py-3 bg-[oklch(0.97_0.003_260)] border-b border-[oklch(0.91_0.004_260)]">
              {freeGift ? (
                <p className="text-[0.75rem] font-semibold text-[oklch(0.35_0.12_155)]">
                  🎉 You've unlocked free shipping + a free BAC Water!
                </p>
              ) : freeShip ? (
                <p className="text-[0.75rem] text-[oklch(0.52_0.01_260)]">
                  <span className="font-semibold text-[oklch(0.35_0.12_155)]">🎉 Free shipping unlocked!</span> Add{" "}
                  <span className="font-bold text-[oklch(0.13_0.01_260)]">${remaining.toFixed(2)}</span>{" "}
                  more for a free BAC Water
                </p>
              ) : (
                <p className="text-[0.75rem] text-[oklch(0.52_0.01_260)]">
                  Add{" "}
                  <span className="font-bold text-[oklch(0.13_0.01_260)]">
                    ${remaining.toFixed(2)}
                  </span>{" "}
                  more for free shipping
                </p>
              )}
              <div className="mt-2 h-1.5 rounded-full bg-[oklch(0.91_0.004_260)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[oklch(0.35_0.15_260)]"
                  style={{ width: `${freeShippingProgress}%`, transition: "width 400ms ease-out" }}
                />
              </div>
            </div>

            {/* ── Items list (scrollable) ────────────────────────────── */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
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
                <>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="cart-item-enter flex gap-3 p-3 rounded-xl border border-[oklch(0.91_0.004_260)] bg-white hover:border-[oklch(0.82_0.008_260)] transition-colors"
                    >
                      {/* Product image */}
                      <div
                        className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0"
                        style={{ backgroundColor: "#f0f0f0" }}
                      >
                        <img
                          src={item.img}
                          alt={`${item.name} ${item.dose}`}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover object-top"
                        />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[0.875rem] font-bold text-[oklch(0.13_0.01_260)] leading-tight truncate">
                          {item.name}
                        </p>
                        <p className="text-[0.8125rem] font-medium text-[oklch(0.42_0.01_260)] mb-2">
                          {item.dose}
                        </p>

                        {/* Quantity stepper + price row */}
                        {item.isFreeGift ? (
                          <div className="flex items-center justify-between">
                            <span className="text-[0.6875rem] font-semibold px-2.5 py-1 rounded-full bg-[oklch(0.95_0.04_155)] text-[oklch(0.40_0.14_155)]">
                              Free gift · limit 1
                            </span>
                            <span className="text-[0.875rem] font-bold text-[oklch(0.40_0.14_155)]">Free</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-1 border border-[oklch(0.88_0.004_260)] rounded-lg overflow-hidden">
                              <button
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                className="w-11 h-11 flex items-center justify-center text-[oklch(0.40_0.01_260)] hover:bg-[oklch(0.96_0.003_260)] transition-colors active:scale-95"
                                aria-label="Decrease quantity"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-8 text-center text-[0.8125rem] font-semibold text-[oklch(0.13_0.01_260)]">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                className="w-11 h-11 flex items-center justify-center text-[oklch(0.40_0.01_260)] hover:bg-[oklch(0.96_0.003_260)] transition-colors active:scale-95"
                                aria-label="Increase quantity"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="flex items-center justify-between gap-2 sm:justify-end">
                              <span className="text-[0.875rem] font-bold text-[oklch(0.13_0.01_260)]">
                                ${(item.price * item.quantity).toFixed(2)}
                              </span>
                              <button
                                onClick={() => removeItem(item.id)}
                                className="w-11 h-11 flex items-center justify-center rounded-full text-[oklch(0.70_0.01_260)] hover:text-red-500 hover:bg-red-50 transition-colors"
                                aria-label={`Remove ${item.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* ── Footer: subtotal + checkout ─────────────────────── */}
            {items.length > 0 && (
              <div className="safe-area-bottom-5 border-t border-[oklch(0.91_0.004_260)] px-6 pt-5 space-y-4 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-[0.875rem] text-[oklch(0.52_0.01_260)]">Subtotal</span>
                  <span className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">
                    ${subtotal.toFixed(2)}
                  </span>
                </div>
                <p className="text-[0.6875rem] text-[oklch(0.65_0.01_260)]">
                  Shipping &amp; any discounts applied at checkout.
                </p>

                <button
                  onClick={handleCheckout}
                  className="flex items-center justify-center gap-2 w-full btn-primary py-3.5 text-[0.9375rem]"
                >
                  Proceed to Checkout <ArrowRight className="w-4 h-4" />
                </button>

                <p className="text-[0.625rem] text-center text-[oklch(0.70_0.01_260)] leading-relaxed">
                  Research use only — not for human consumption.
                </p>
              </div>
            )}
          </div>
        </>
  );
}
