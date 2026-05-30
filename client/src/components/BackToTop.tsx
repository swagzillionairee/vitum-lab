/**
 * BackToTop — floating button that appears after scrolling 400px
 * Animates in/out with opacity + scale. Smooth scrolls to top.
 */

import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className={`fixed bottom-6 right-6 z-40 w-10 h-10 rounded-full bg-[oklch(0.13_0.02_260)] text-white flex items-center justify-center shadow-lg transition-all duration-200 hover:bg-[oklch(0.22_0.02_260)] active:scale-95 ${
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-3 pointer-events-none"
      }`}
    >
      <ArrowUp className="w-4.5 h-4.5" />
    </button>
  );
}
