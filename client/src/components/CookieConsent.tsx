/**
 * CookieConsent — dismissible bottom banner
 * Persists user choice in localStorage under "vitum_cookie_consent"
 * Values: "accepted" | "declined" | null (not yet chosen)
 *
 * While visible, sets `data-cookie-banner` on <html> so CSS can lift other
 * bottom-anchored UI (Shop's floating View-Cart button) clear of the banner.
 */
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Cookie, X } from "lucide-react";

const STORAGE_KEY = "vitum_cookie_consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      // Small delay so it doesn't flash immediately on load
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  // Signal other fixed bottom UI (floating cart button) to move out of the way.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-cookie-banner", visible);
    return () => document.documentElement.removeAttribute("data-cookie-banner");
  }, [visible]);

  function handleAccept() {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  }

  function handleDecline() {
    localStorage.setItem(STORAGE_KEY, "declined");
    setVisible(false);
  }

  if (!visible) return null;

  return (
        <div className="cookie-banner-enter safe-area-bottom fixed bottom-0 left-0 right-0 z-50 px-4 pointer-events-none">
          <div className="pointer-events-auto max-w-3xl mx-auto bg-[oklch(1_0_0)] dark:bg-[oklch(0.18_0.02_260)] border border-[oklch(0.90_0.004_260)] dark:border-[oklch(0.28_0.02_260)] rounded-2xl shadow-xl px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
            {/* Icon */}
            <div className="hidden sm:flex flex-shrink-0 w-8 h-8 rounded-full bg-[oklch(0.96_0.012_240)] dark:bg-[oklch(0.24_0.03_260)] items-center justify-center">
              <Cookie className="w-4 h-4 text-[oklch(0.40_0.16_260)] dark:text-[oklch(0.74_0.15_260)]" />
            </div>

            {/* Text */}
            <p className="flex-1 text-[0.8125rem] text-[oklch(0.45_0.01_260)] dark:text-[oklch(0.80_0.01_260)] leading-snug">
              We use cookies to remember your preferences and improve your experience. By continuing, you agree to our{" "}
              <Link href="/privacy-policy" className="underline underline-offset-2 text-[oklch(0.40_0.16_260)] dark:text-[oklch(0.74_0.15_260)] hover:opacity-80 transition-opacity">
                Privacy Policy
              </Link>
              .
            </p>

            {/* Actions */}
            <div className="flex items-center justify-end gap-1.5 flex-shrink-0">
              <button
                onClick={handleDecline}
                className="min-h-11 text-xs font-medium text-[oklch(0.55_0.01_260)] dark:text-[oklch(0.70_0.01_260)] hover:text-[oklch(0.13_0.01_260)] dark:hover:text-[oklch(0.94_0.006_260)] transition-colors px-3 py-1.5 rounded-full"
              >
                Decline
              </button>
              <button onClick={handleAccept} className="btn-primary min-h-11 text-xs py-1.5 px-4">
                Accept
              </button>
              <button
                onClick={handleDecline}
                aria-label="Dismiss"
                className="ml-0.5 flex h-11 w-11 items-center justify-center rounded-full text-[oklch(0.70_0.01_260)] hover:text-[oklch(0.45_0.01_260)] dark:text-[oklch(0.55_0.01_260)] dark:hover:text-[oklch(0.80_0.01_260)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
  );
}
