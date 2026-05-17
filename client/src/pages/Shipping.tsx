/**
 * Shipping & Returns Page
 * Design: Clean editorial layout matching site's navy/white palette.
 * Sections: Processing, Carriers, Delivery, Returns, FAQ
 */

import { Link } from "wouter";
import { Truck, Package, RefreshCw, Clock, MapPin, AlertTriangle } from "lucide-react";

export default function Shipping() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-[oklch(0.13_0.02_260)] text-white py-16">
        <div className="container max-w-3xl">
          <p className="text-[0.75rem] font-semibold tracking-widest uppercase text-white/50 mb-3">Vitum Lab</p>
          <h1 className="text-[2.5rem] font-bold leading-tight mb-4">Shipping &amp; Returns</h1>
          <p className="text-white/65 text-[1rem] leading-relaxed">
            All orders are processed and shipped from our US facility. We ship Monday through Friday,
            excluding federal holidays.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-16">
        <div className="container max-w-3xl space-y-14">

          {/* Processing */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-[oklch(0.13_0.02_260)] flex items-center justify-center text-white flex-shrink-0">
                <Clock className="w-4.5 h-4.5" />
              </div>
              <h2 className="text-[1.375rem] font-bold text-[oklch(0.13_0.01_260)]">Order Processing</h2>
            </div>
            <div className="prose prose-slate max-w-none text-[0.9375rem] leading-relaxed text-[oklch(0.35_0.01_260)]">
              <p>
                Orders placed <strong>before 1:00 pm EST on business days</strong> are processed and shipped
                the same day. Orders placed after 1:00 pm EST, on weekends, or on federal holidays will ship
                the next business day.
              </p>
              <p className="mt-3">
                You will receive a shipping confirmation email with a tracking number as soon as your order
                leaves our facility.
              </p>
            </div>
          </div>

          {/* Domestic Shipping */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-[oklch(0.13_0.02_260)] flex items-center justify-center text-white flex-shrink-0">
                <Truck className="w-4.5 h-4.5" />
              </div>
              <h2 className="text-[1.375rem] font-bold text-[oklch(0.13_0.01_260)]">Domestic Shipping (USA)</h2>
            </div>
            <div className="overflow-hidden rounded-xl border border-[oklch(0.92_0.004_260)]">
              <table className="w-full text-[0.875rem]">
                <thead>
                  <tr className="bg-[oklch(0.975_0.003_260)]">
                    <th className="text-left px-5 py-3 font-semibold text-[oklch(0.25_0.01_260)]">Method</th>
                    <th className="text-left px-5 py-3 font-semibold text-[oklch(0.25_0.01_260)]">Estimated Delivery</th>
                    <th className="text-left px-5 py-3 font-semibold text-[oklch(0.25_0.01_260)]">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[oklch(0.94_0.003_260)]">
                  <tr>
                    <td className="px-5 py-3.5 text-[oklch(0.30_0.01_260)]">USPS Priority Mail</td>
                    <td className="px-5 py-3.5 text-[oklch(0.30_0.01_260)]">2–3 business days</td>
                    <td className="px-5 py-3.5 text-[oklch(0.30_0.01_260)]">$9.99</td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3.5 text-[oklch(0.30_0.01_260)]">USPS Priority Mail Express</td>
                    <td className="px-5 py-3.5 text-[oklch(0.30_0.01_260)]">1–2 business days</td>
                    <td className="px-5 py-3.5 text-[oklch(0.30_0.01_260)]">$29.99</td>
                  </tr>
                  <tr className="bg-[oklch(0.975_0.003_260)]">
                    <td className="px-5 py-3.5 font-semibold text-[oklch(0.20_0.01_260)]">Free Shipping</td>
                    <td className="px-5 py-3.5 text-[oklch(0.30_0.01_260)]">2–3 business days</td>
                    <td className="px-5 py-3.5 font-semibold text-[oklch(0.35_0.14_155)]">Free on orders $150+</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[0.8125rem] text-[oklch(0.52_0.01_260)]">
              * Delivery estimates are provided by the carrier and are not guaranteed. Vitum Lab is not
              responsible for carrier delays.
            </p>
          </div>

          {/* International */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-[oklch(0.13_0.02_260)] flex items-center justify-center text-white flex-shrink-0">
                <MapPin className="w-4.5 h-4.5" />
              </div>
              <h2 className="text-[1.375rem] font-bold text-[oklch(0.13_0.01_260)]">International Shipping</h2>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[0.9rem] text-amber-800 leading-relaxed">
                We currently ship to the <strong>United States only</strong>. International shipping is not
                available at this time. We are working to expand our shipping regions — please check back or
                contact us at{" "}
                <a href="mailto:hello@vitumlab.com" className="underline">hello@vitumlab.com</a> to be notified
                when your country becomes available.
              </p>
            </div>
          </div>

          {/* Packaging */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-[oklch(0.13_0.02_260)] flex items-center justify-center text-white flex-shrink-0">
                <Package className="w-4.5 h-4.5" />
              </div>
              <h2 className="text-[1.375rem] font-bold text-[oklch(0.13_0.01_260)]">Packaging &amp; Cold Chain</h2>
            </div>
            <p className="text-[0.9375rem] leading-relaxed text-[oklch(0.35_0.01_260)]">
              All peptides are shipped in tamper-evident packaging with desiccant packs to maintain
              stability during transit. Lyophilized (freeze-dried) peptides are stable at ambient
              temperature for shipping purposes and do not require cold-chain handling during standard
              transit times. Upon receipt, store according to the product label instructions.
            </p>
          </div>

          {/* Returns */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-[oklch(0.13_0.02_260)] flex items-center justify-center text-white flex-shrink-0">
                <RefreshCw className="w-4.5 h-4.5" />
              </div>
              <h2 className="text-[1.375rem] font-bold text-[oklch(0.13_0.01_260)]">Returns &amp; Refunds</h2>
            </div>
            <div className="space-y-4 text-[0.9375rem] leading-relaxed text-[oklch(0.35_0.01_260)]">
              <p>
                Due to the nature of research chemicals, <strong>all sales are final</strong>. We do not
                accept returns of opened or used products.
              </p>
              <p>
                If your order arrives damaged, incorrect, or with a quality issue, please contact us within
                <strong> 7 days of delivery</strong> at{" "}
                <a href="mailto:hello@vitumlab.com" className="text-[oklch(0.40_0.16_260)] underline hover:no-underline">
                  hello@vitumlab.com
                </a>{" "}
                with your order number and photos of the issue. We will arrange a replacement or store credit
                at our discretion.
              </p>
              <p>
                Refunds for eligible claims are processed within <strong>5–7 business days</strong> back to
                the original payment method.
              </p>
            </div>
          </div>

          {/* Contact */}
          <div className="rounded-2xl bg-[oklch(0.975_0.003_260)] px-8 py-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-bold text-[oklch(0.13_0.01_260)] mb-1">Questions about your order?</p>
              <p className="text-[0.875rem] text-[oklch(0.45_0.01_260)]">Our team typically responds within one business day.</p>
            </div>
            <a
              href="mailto:hello@vitumlab.com"
              className="flex-shrink-0 inline-flex items-center gap-2 bg-[oklch(0.13_0.02_260)] text-white text-[0.875rem] font-semibold px-5 py-2.5 rounded-full hover:bg-[oklch(0.22_0.02_260)] transition-colors"
            >
              Contact Support
            </a>
          </div>

        </div>
      </section>
    </div>
  );
}
