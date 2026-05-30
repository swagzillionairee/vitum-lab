/*
 * Navbar.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Features:
 *   - Continuous marquee promotional banner (no dismiss — always visible)
 *   - Persistent compliance bar
 *   - Sticky navbar with cart, nav links, dark mode toggle, mobile menu
 */

import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingCart, Menu, X, Sun, Moon } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useTheme } from "@/contexts/ThemeContext";

const navLinks = [
  { label: "Shop", href: "/shop" },
  { label: "COA Library", href: "/coa-library" },
  { label: "Dose Calculator", href: "/dose-calculator" },
  { label: "Research", href: "/research" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

// ─── Marquee items ────────────────────────────────────────────────────────────
const PROMO_ITEMS = [
  "Free shipping + 10mL BAC Water on orders over $150",
  "2–3 day delivery via USPS Priority Mail",
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const { totalItems, openCart } = useCart();
  const { theme, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 bg-white dark:bg-[oklch(0.13_0.02_260)] border-b border-[oklch(0.91_0.004_260)] dark:border-[oklch(0.24_0.02_260)] transition-shadow duration-200 ${scrolled ? "shadow-[0_2px_16px_oklch(0.13_0.01_260/0.12)] dark:shadow-[0_2px_16px_oklch(0_0_0/0.5)]" : "shadow-[0_1px_4px_oklch(0.13_0.01_260/0.06)] dark:shadow-[0_1px_4px_oklch(0_0_0/0.3)]"}`}
    >
      {/* ── Promotional marquee banner ────────────────────────────────── */}
      <div className="bg-[oklch(0.35_0.15_260)] text-white overflow-hidden">
        <div className="flex items-center">
          {/* Scrolling marquee */}
          <div className="flex-1 overflow-hidden relative py-2">
            {/* Fade edges */}
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[oklch(0.35_0.15_260)] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[oklch(0.35_0.15_260)] to-transparent z-10 pointer-events-none" />

            <div className="marquee-track whitespace-nowrap">
              {/* Render 6 copies of the items for a seamless loop */}
              {[...Array(6)].map((_, i) => (
                <span
                  key={i}
                  className="marquee-content inline-flex items-center"
                  aria-hidden={i > 0}
                >
                  {PROMO_ITEMS.map((item, j) => (
                    <span key={j} className="inline-flex items-center">
                      <span className="text-[0.75rem] font-semibold tracking-wide">
                        {item}
                      </span>
                      <span className="mx-10 text-white/40 text-[0.75rem]">
                        ·
                      </span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Compliance bar ────────────────────────────────────────────── */}
      <div className="bg-[oklch(0.14_0.03_260)] text-white text-center py-1.5 px-4">
        <p className="text-[0.625rem] font-medium tracking-widest uppercase text-white/70">
          Research Use Only — Not for Human Consumption
        </p>
      </div>

      {/* ── Main navbar ──────────────────────────────────────────────── */}
      <div className="container">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <img
              src="/vitum%20lab%20logo%20black.png"
              alt="Vitum Lab"
              className="h-14 w-auto dark:invert"
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors duration-150 ${
                  location === link.href
                    ? "text-[oklch(0.13_0.01_260)] dark:text-[oklch(0.94_0.006_260)] border-b-2 border-[oklch(0.13_0.01_260)] dark:border-[oklch(0.94_0.006_260)] pb-0.5"
                    : "text-[oklch(0.40_0.01_260)] dark:text-[oklch(0.62_0.01_260)] hover:text-[oklch(0.13_0.01_260)] dark:hover:text-[oklch(0.94_0.006_260)]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Dark mode toggle */}
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-[oklch(0.96_0.003_260)] dark:hover:bg-[oklch(0.20_0.02_260)] transition-colors"
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {theme === "dark" ? (
                <Sun className="w-4.5 h-4.5 text-[oklch(0.75_0.12_80)]" />
              ) : (
                <Moon className="w-4.5 h-4.5 text-[oklch(0.40_0.01_260)]" />
              )}
            </button>

            <button
              onClick={openCart}
              className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-[oklch(0.96_0.003_260)] dark:hover:bg-[oklch(0.20_0.02_260)] transition-colors"
              aria-label="Shopping cart"
            >
              <ShoppingCart className="w-5 h-5 text-[oklch(0.40_0.01_260)] dark:text-[oklch(0.62_0.01_260)]" />
              {totalItems > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-[oklch(0.35_0.15_260)] text-white text-[10px] font-bold rounded-full px-1">
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              )}
            </button>

            <Link
              href="/shop"
              className="hidden md:block btn-primary text-sm py-2.5 px-5"
            >
              Shop Now
            </Link>

            <button
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-full hover:bg-[oklch(0.96_0.003_260)] dark:hover:bg-[oklch(0.20_0.02_260)] transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <X className="w-5 h-5 text-[oklch(0.40_0.01_260)] dark:text-[oklch(0.62_0.01_260)]" />
              ) : (
                <Menu className="w-5 h-5 text-[oklch(0.40_0.01_260)] dark:text-[oklch(0.62_0.01_260)]" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[oklch(0.91_0.004_260)] dark:border-[oklch(0.24_0.02_260)] bg-white dark:bg-[oklch(0.13_0.02_260)]">
          <nav className="container py-4 flex flex-col gap-1">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`text-sm font-medium py-2.5 px-3 rounded-xl transition-colors ${
                  location === link.href
                    ? "bg-[oklch(0.96_0.003_260)] dark:bg-[oklch(0.20_0.02_260)] text-[oklch(0.13_0.01_260)] dark:text-[oklch(0.94_0.006_260)]"
                    : "text-[oklch(0.40_0.01_260)] dark:text-[oklch(0.62_0.01_260)] hover:bg-[oklch(0.96_0.003_260)] dark:hover:bg-[oklch(0.20_0.02_260)]"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 border-t border-[oklch(0.91_0.004_260)] dark:border-[oklch(0.24_0.02_260)] mt-2">
              <Link
                href="/shop"
                onClick={() => setMobileOpen(false)}
                className="btn-primary block text-center text-sm"
              >
                Shop Now
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
