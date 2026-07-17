/*
 * Footer.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Deep navy background, white text, persistent "Research Use Only" disclaimer
 * All required policy links, contact info, compliance notices
 */

import { Link } from "wouter";
import { Mail, MapPin, FlaskConical } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-[oklch(0.18_0.04_255)] text-white">
      {/* Persistent Research Use Only banner */}
      <div className="border-b border-white/10 bg-[oklch(0.14_0.04_255)]">
        <div className="container py-3">
          <p className="text-center text-[0.6875rem] font-semibold tracking-widest uppercase text-[oklch(0.75_0.05_255)]">
            ⚠ Research Use Only — Not for Human Consumption — Not Evaluated by the FDA
          </p>
        </div>
      </div>

      <div className="container py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand column */}
          <div className="lg:col-span-1">
            <img
              src="/vitum%20lab%20logo%20black.webp"
              alt="Vitum Lab"
              width={512}
              height={512}
              loading="lazy"
              decoding="async"
              className="h-8 w-auto mb-4 brightness-0 invert"
            />
            <p className="text-sm text-white/60 leading-relaxed mb-5">
              Research-grade peptides independently tested for purity and
              identity. Supplied for in vitro and laboratory research use only.
            </p>
            <div className="space-y-2">
              <a
                href="mailto:hello@vitumlab.com"
                className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
              >
                <Mail className="w-4 h-4 flex-shrink-0" />
                hello@vitumlab.com
              </a>
              <div className="flex items-start gap-2 text-sm text-white/60">
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>1300 S Columbus Blvd<br />Philadelphia, PA 19147</span>
              </div>
            </div>
          </div>

          {/* Products column */}
          <div>
            <h4 className="text-xs font-semibold tracking-widest uppercase text-white/40 mb-4">
              Products
            </h4>
            <ul className="space-y-2.5">
              {[
                { label: "All Products", href: "/shop" },
                { label: "COA Library", href: "/coa-library" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support column */}
          <div>
            <h4 className="text-xs font-semibold tracking-widest uppercase text-white/40 mb-4">
              Support
            </h4>
            <ul className="space-y-2.5">
              {[
                { label: "FAQ", href: "/faq" },
                { label: "Shipping Policy", href: "/shipping-policy" },
                { label: "Return Policy", href: "/return-policy" },
                { label: "Contact Us", href: "/contact" },
                { label: "About Vitum Lab", href: "/about" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal column */}
          <div>
            <h4 className="text-xs font-semibold tracking-widest uppercase text-white/40 mb-4">
              Legal & Compliance
            </h4>
            <ul className="space-y-2.5">
              {[
                { label: "Research Disclaimer", href: "/research-disclaimer" },
                { label: "Terms of Service", href: "/terms-of-service" },
                { label: "Privacy Policy", href: "/privacy-policy" },
              ].map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} Vitum Lab. All rights reserved.
          </p>
          <p className="text-xs text-white/40 text-center sm:text-right max-w-md">
            All products sold on this website are intended for research and
            identification purposes only and are not intended for human dosing,
            injections, or ingestion. Peptides are strictly for laboratory,
            academic, or institutional research and not for human or animal
            consumption.
          </p>
        </div>
      </div>
    </footer>
  );
}
