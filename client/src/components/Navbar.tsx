/*
 * Navbar.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * White background, navy text, cobalt accent on active, cart icon with Foxy.io integration
 * Includes: dismissible promotional announcement banner + persistent compliance bar
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingCart, Menu, X, Tag, Truck } from "lucide-react";

const FOXY_STORE = "vitum-lab.foxycart.com";
const PROMO_DISMISSED_KEY = "vitum_promo_dismissed_v1";

const navLinks = [
  { label: "Shop", href: "/shop" },
  { label: "COA Library", href: "/coa-library" },
  { label: "Research", href: "/research-disclaimer" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

function isPromoDismissed(): boolean {
  try {
    return localStorage.getItem(PROMO_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [promoDismissed, setPromoDismissed] = useState(isPromoDismissed);
  const [location] = useLocation();

  const dismissPromo = () => {
    try {
      localStorage.setItem(PROMO_DISMISSED_KEY, "true");
    } catch {}
    setPromoDismissed(true);
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[oklch(0.90_0.006_255)] shadow-[0_1px_0_oklch(0.18_0.04_255/0.06)]">

      {/* ── Promotional announcement banner (dismissible) ─────────────── */}
      {!promoDismissed && (
        <div className="relative bg-[oklch(0.35_0.15_260)] text-white overflow-hidden">
          {/* Subtle shimmer stripe */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />

          <div className="relative flex items-center justify-center gap-3 py-2.5 px-10 text-center">
            {/* Icon */}
            <Truck className="hidden sm:block w-3.5 h-3.5 flex-shrink-0 opacity-80" />

            {/* Message */}
            <p className="text-[0.75rem] font-semibold leading-snug tracking-wide">
              Free shipping and 10mL BAC Water for orders over $150.{" "}
              <span className="opacity-90 font-normal">
                Orders placed before 1pm EST ships next day!
              </span>
            </p>

            {/* Dismiss button */}
            <button
              onClick={dismissPromo}
              aria-label="Dismiss announcement"
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Compliance bar (always visible) ──────────────────────────── */}
      <div className="bg-[oklch(0.18_0.04_255)] text-white text-center py-1.5 px-4">
        <p className="text-[0.625rem] font-medium tracking-widest uppercase text-white/70">
          Research Use Only — Not for Human Consumption &nbsp;|&nbsp; Free COA with Every Order
        </p>
      </div>

      {/* ── Main navbar ──────────────────────────────────────────────── */}
      <div className="container">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <img
              src="/manus-storage/vitum-lab-logo_e66f6f91.png"
              alt="Vitum Lab"
              className="h-8 w-auto"
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors duration-150 ${
                  location === link.href
                    ? "text-[oklch(0.35_0.15_260)] border-b-2 border-[oklch(0.35_0.15_260)] pb-0.5"
                    : "text-[oklch(0.35_0.05_255)] hover:text-[oklch(0.18_0.04_255)]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            {/* Foxy.io cart */}
            <a
              href={`https://${FOXY_STORE}/cart`}
              className="relative flex items-center justify-center w-9 h-9 rounded-sm hover:bg-[oklch(0.96_0.004_255)] transition-colors"
              aria-label="Shopping cart"
            >
              <ShoppingCart className="w-5 h-5 text-[oklch(0.35_0.05_255)]" />
            </a>

            {/* Shop CTA (desktop) */}
            <Link href="/shop" className="hidden md:block btn-cobalt text-sm py-2 px-4">
              Shop Now
            </Link>

            {/* Mobile menu toggle */}
            <button
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-sm hover:bg-[oklch(0.96_0.004_255)] transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <X className="w-5 h-5 text-[oklch(0.35_0.05_255)]" />
              ) : (
                <Menu className="w-5 h-5 text-[oklch(0.35_0.05_255)]" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[oklch(0.90_0.006_255)] bg-white">
          <nav className="container py-4 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`text-sm font-medium py-2.5 px-3 rounded-sm transition-colors ${
                  location === link.href
                    ? "bg-[oklch(0.94_0.01_255)] text-[oklch(0.35_0.15_260)]"
                    : "text-[oklch(0.35_0.05_255)] hover:bg-[oklch(0.96_0.004_255)]"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 border-t border-[oklch(0.90_0.006_255)] mt-2">
              <Link href="/shop" onClick={() => setMobileOpen(false)} className="btn-cobalt block text-center text-sm">
                Shop Now
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
