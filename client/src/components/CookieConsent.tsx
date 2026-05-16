/**
 * CookieConsent — dismissible bottom banner
 * Persists user choice in localStorage under "vitum_cookie_consent"
 * Values: "accepted" | "declined" | null (not yet chosen)
 */
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Cookie, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

  function handleAccept() {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  }

  function handleDecline() {
    localStorage.setItem(STORAGE_KEY, "declined");
    setVisible(false);
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
          className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pointer-events-none"
        >
          <div className="pointer-events-auto max-w-3xl mx-auto bg-white border border-gray-200 rounded-2xl shadow-xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Icon */}
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#d0ecd0] flex items-center justify-center">
              <Cookie className="w-4 h-4 text-[#2d5a3d]" />
            </div>

            {/* Text */}
            <p className="flex-1 text-sm text-gray-600 leading-relaxed">
              We use cookies to remember your preferences and improve your experience. By continuing, you agree to our{" "}
              <Link href="/privacy-policy" className="underline underline-offset-2 text-gray-800 hover:text-black transition-colors">
                Privacy Policy
              </Link>
              .
            </p>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleDecline}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-50"
              >
                Decline
              </button>
              <button
                onClick={handleAccept}
                className="text-xs font-semibold bg-[#1a3a2a] text-white px-4 py-1.5 rounded-lg hover:bg-[#2d5a3d] transition-colors active:scale-[0.97]"
              >
                Accept
              </button>
              <button
                onClick={handleDecline}
                aria-label="Dismiss"
                className="ml-1 text-gray-300 hover:text-gray-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
