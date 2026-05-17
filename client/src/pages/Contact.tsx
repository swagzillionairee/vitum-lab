/*
 * Contact.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Contact form + direct email + support info
 * Email: hello@vitumlab.com
 */

import { useState } from "react";
import { Mail, Clock, ShieldCheck, CheckCircle2 } from "lucide-react";
import SEO from "@/components/SEO";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Build mailto link with form data
    const subject = encodeURIComponent(form.subject || "Inquiry from Vitum Lab website");
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\n\nMessage:\n${form.message}`
    );
    window.location.href = `mailto:hello@vitumlab.com?subject=${subject}&body=${body}`;
    setSubmitted(true);
  };

  return (
    <>
    <SEO title="Contact" description="Get in touch with the Vitum Lab team. Email us at hello@vitumlab.com for order support, research inquiries, or wholesale questions." />
    <div className="min-h-screen bg-white">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="bg-[oklch(0.14_0.03_260)] text-white">
        <div className="container py-16">
          <p className="text-[0.75rem] font-semibold tracking-widest uppercase text-white/50 mb-4">Get in Touch</p>
          <h1 className="text-[2.75rem] font-bold leading-tight tracking-tight mb-4">Contact Us</h1>
          <p className="text-[1rem] text-white/70 max-w-lg leading-relaxed">
            Questions about an order, a product, or our quality standards? We're here to help.
          </p>
        </div>
      </div>

      <div className="container py-16">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">

          {/* ── Contact form ─────────────────────────────────────────── */}
          <div className="lg:col-span-3">
            <h2 className="text-[1.375rem] font-bold text-[oklch(0.13_0.01_260)] mb-6">Send us a message</h2>

            {submitted ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CheckCircle2 className="w-12 h-12 text-[oklch(0.40_0.14_155)] mb-4" />
                <h3 className="text-[1.25rem] font-bold text-[oklch(0.13_0.01_260)] mb-2">Message sent!</h3>
                <p className="text-[0.9375rem] text-[oklch(0.52_0.01_260)] max-w-sm">
                  Your email client should have opened. If it didn't, you can reach us directly at{" "}
                  <a href="mailto:hello@vitumlab.com" className="text-[oklch(0.40_0.16_260)] hover:underline font-semibold">
                    hello@vitumlab.com
                  </a>
                  .
                </p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="mt-6 btn-secondary text-sm"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[0.8125rem] font-semibold text-[oklch(0.40_0.01_260)] mb-1.5">
                      Your Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Dr. Jane Smith"
                      className="w-full border border-[oklch(0.88_0.004_260)] rounded-xl px-4 py-3 text-[0.9375rem] text-[oklch(0.13_0.01_260)] placeholder:text-[oklch(0.75_0.005_260)] outline-none focus:border-[oklch(0.40_0.16_260)] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.8125rem] font-semibold text-[oklch(0.40_0.01_260)] mb-1.5">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="jane@university.edu"
                      className="w-full border border-[oklch(0.88_0.004_260)] rounded-xl px-4 py-3 text-[0.9375rem] text-[oklch(0.13_0.01_260)] placeholder:text-[oklch(0.75_0.005_260)] outline-none focus:border-[oklch(0.40_0.16_260)] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[0.8125rem] font-semibold text-[oklch(0.40_0.01_260)] mb-1.5">
                    Subject
                  </label>
                  <select
                    name="subject"
                    value={form.subject}
                    onChange={handleChange}
                    className="w-full border border-[oklch(0.88_0.004_260)] rounded-xl px-4 py-3 text-[0.9375rem] text-[oklch(0.13_0.01_260)] outline-none focus:border-[oklch(0.40_0.16_260)] transition-colors bg-white"
                  >
                    <option value="">Select a topic…</option>
                    <option value="Order Inquiry">Order Inquiry</option>
                    <option value="Product Question">Product Question</option>
                    <option value="COA / Documentation">COA / Documentation</option>
                    <option value="Shipping & Delivery">Shipping & Delivery</option>
                    <option value="Bulk / Institutional Order">Bulk / Institutional Order</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[0.8125rem] font-semibold text-[oklch(0.40_0.01_260)] mb-1.5">
                    Message <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="message"
                    required
                    value={form.message}
                    onChange={handleChange}
                    rows={6}
                    placeholder="Please describe your question or inquiry in detail…"
                    className="w-full border border-[oklch(0.88_0.004_260)] rounded-xl px-4 py-3 text-[0.9375rem] text-[oklch(0.13_0.01_260)] placeholder:text-[oklch(0.75_0.005_260)] outline-none focus:border-[oklch(0.40_0.16_260)] transition-colors resize-none"
                  />
                </div>

                <p className="text-[0.75rem] text-[oklch(0.65_0.01_260)]">
                  By submitting this form you confirm you are a qualified researcher. All inquiries are for research purposes only.
                </p>

                <button type="submit" className="btn-primary w-full sm:w-auto py-3.5 px-8 text-[0.9375rem]">
                  Send Message →
                </button>
              </form>
            )}
          </div>

          {/* ── Contact info sidebar ──────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">
            <div className="rounded-2xl bg-[oklch(0.97_0.003_260)] p-7">
              <div className="w-10 h-10 rounded-xl bg-[oklch(0.96_0.012_240)] flex items-center justify-center text-[oklch(0.40_0.16_260)] mb-4">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="text-[1rem] font-bold text-[oklch(0.13_0.01_260)] mb-1">Email</h3>
              <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] mb-3">
                For all inquiries, including orders, products, and documentation.
              </p>
              <a
                href="mailto:hello@vitumlab.com"
                className="text-[0.9375rem] font-semibold text-[oklch(0.40_0.16_260)] hover:underline"
              >
                hello@vitumlab.com
              </a>
            </div>

            <div className="rounded-2xl bg-[oklch(0.97_0.003_260)] p-7">
              <div className="w-10 h-10 rounded-xl bg-[oklch(0.96_0.012_240)] flex items-center justify-center text-[oklch(0.40_0.16_260)] mb-4">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-[1rem] font-bold text-[oklch(0.13_0.01_260)] mb-1">Response Time</h3>
              <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)]">
                We typically respond within 1 business day. For urgent order inquiries, please include your order number in the subject line.
              </p>
            </div>

            <div className="rounded-2xl bg-[oklch(0.14_0.03_260)] text-white p-7">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-[1rem] font-bold mb-1">Research Use Only</h3>
              <p className="text-[0.875rem] text-white/70 leading-relaxed">
                All products are sold strictly for in vitro / laboratory research use only. By contacting us you confirm you are a qualified researcher.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </>
  );
}