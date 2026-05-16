/*
 * Navbar.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Features:
 *   - Continuous marquee promotional banner (no dismiss — always visible)
 *   - Live countdown timer to 1pm EST same-day shipping cutoff
 *   - Persistent compliance bar
 *   - Sticky navbar with cart, nav links, mobile menu
 */

import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingCart, Menu, X, Clock } from "lucide-react";

const FOXY_STORE = "vitum-lab.foxycart.com";

const navLinks = [
  { label: "Shop", href: "/shop" },
  { label: "COA Library", href: "/coa-library" },
  { label: "Research", href: "/research-disclaimer" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

// ─── Countdown to 1pm EST ─────────────────────────────────────────────────────
function getTimeUntilCutoff(): { hours: number; minutes: number; seconds: number; expired: boolean } {
  const now = new Date();
  // Get current time in US/Eastern (handles DST automatically)
  const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));

  const cutoff = new Date(estNow);
  cutoff.setHours(13, 0, 0, 0); // 1:00:00 PM

  // If we've already passed 1pm today, target tomorrow's 1pm
  if (estNow >= cutoff) {
    cutoff.setDate(cutoff.getDate() + 1);
  }

  const diffMs = cutoff.getTime() - estNow.getTime();
  const totalSeconds = Math.floor(diffMs / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds, expired: diffMs <= 0 };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function CountdownTimer() {
  const [time, setTime] = useState(getTimeUntilCutoff);

  useEffect(() => {
    const id = setInterval(() => {
      setTime(getTimeUntilCutoff());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (time.expired) return null;

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0 bg-white/10 rounded-sm px-2.5 py-1">
      <Clock className="w-3 h-3 opacity-80" />
      <span className="text-[0.6875rem] font-semibold tabular-nums tracking-wide">
        {pad(time.hours)}:{pad(time.minutes)}:{pad(time.seconds)}
      </span>
      <span className="text-[0.625rem] opacity-75 hidden sm:inline">until cutoff</span>
    </div>
  );
}

// ─── Marquee message ──────────────────────────────────────────────────────────
const PROMO_MESSAGE =
  "Free shipping and 10mL BAC Water for orders over $150  ·  Orders placed before 1pm EST ships next day!  ·  Free shipping and 10mL BAC Water for orders over $150  ·  Orders placed before 1pm EST ships next day!  ·";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[oklch(0.91_0.004_260)] shadow-[0_1px_4px_oklch(0.13_0.01_260/0.06)]">

      {/* ── Promotional marquee banner ────────────────────────────────── */}
      <div className="bg-[oklch(0.35_0.15_260)] text-white overflow-hidden">
        <div className="flex items-center">
          {/* Countdown timer — left-pinned, doesn't scroll */}
          <div className="flex-shrink-0 flex items-center gap-2 pl-3 pr-4 py-2 border-r border-white/20 bg-[oklch(0.28_0.14_260)]">
            <CountdownTimer />
          </div>

          {/* Scrolling marquee */}
          <div className="flex-1 overflow-hidden relative py-2">
            {/* Fade edges */}
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[oklch(0.35_0.15_260)] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[oklch(0.35_0.15_260)] to-transparent z-10 pointer-events-none" />

            <div className="marquee-track whitespace-nowrap">
              <span className="marquee-content text-[0.75rem] font-semibold tracking-wide">
                {PROMO_MESSAGE}
              </span>
              {/* Duplicate for seamless loop */}
              <span className="marquee-content text-[0.75rem] font-semibold tracking-wide" aria-hidden>
                {PROMO_MESSAGE}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Compliance bar ────────────────────────────────────────────── */}
      <div className="bg-[oklch(0.14_0.03_260)] text-white text-center py-1.5 px-4">
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
                    ? "text-[oklch(0.13_0.01_260)] border-b-2 border-[oklch(0.13_0.01_260)] pb-0.5"
                    : "text-[oklch(0.40_0.01_260)] hover:text-[oklch(0.13_0.01_260)]"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            <a
              href={`https://${FOXY_STORE}/cart`}
              className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-[oklch(0.96_0.003_260)] transition-colors"
              aria-label="Shopping cart"
            >
              <ShoppingCart className="w-5 h-5 text-[oklch(0.40_0.01_260)]" />
            </a>

            <Link href="/shop" className="hidden md:block btn-primary text-sm py-2.5 px-5">
              Shop Now
            </Link>

            <button
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-full hover:bg-[oklch(0.96_0.003_260)] transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <X className="w-5 h-5 text-[oklch(0.40_0.01_260)]" />
              ) : (
                <Menu className="w-5 h-5 text-[oklch(0.40_0.01_260)]" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[oklch(0.91_0.004_260)] bg-white">
          <nav className="container py-4 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`text-sm font-medium py-2.5 px-3 rounded-xl transition-colors ${
                  location === link.href
                    ? "bg-[oklch(0.96_0.003_260)] text-[oklch(0.13_0.01_260)]"
                    : "text-[oklch(0.40_0.01_260)] hover:bg-[oklch(0.96_0.003_260)]"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 border-t border-[oklch(0.91_0.004_260)] mt-2">
              <Link href="/shop" onClick={() => setMobileOpen(false)} className="btn-primary block text-center text-sm">
                Shop Now
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
