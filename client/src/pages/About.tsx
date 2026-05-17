/*
 * About.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Who we are, mission, quality standards, sourcing philosophy
 */

import { Link } from "wouter";
import { ArrowRight, ShieldCheck, FlaskConical, Truck, Award } from "lucide-react";

const values = [
  {
    icon: <FlaskConical className="w-6 h-6" />,
    title: "Precision Synthesis",
    body: "Every compound we carry is synthesized to research-grade specifications. We work exclusively with manufacturers who adhere to strict quality control protocols and provide full batch documentation.",
  },
  {
    icon: <ShieldCheck className="w-6 h-6" />,
    title: "Independent Verification",
    body: "We do not rely solely on manufacturer-supplied data. Every batch is independently tested by accredited US third-party laboratories for identity, purity, and potency before it reaches our catalog.",
  },
  {
    icon: <Award className="w-6 h-6" />,
    title: "Full Transparency",
    body: "Every Certificate of Analysis is publicly available in our COA Library. We publish lot numbers, test dates, and full spectral data — no redactions, no exceptions.",
  },
  {
    icon: <Truck className="w-6 h-6" />,
    title: "Researcher-First Logistics",
    body: "Same-day dispatch on orders placed before 1pm EST. Cold-chain packaging for temperature-sensitive compounds. Free shipping and a complimentary BAC Water on orders over $150.",
  },
];

const stats = [
  { value: "≥99%", label: "Minimum purity on all compounds" },
  { value: "100%", label: "Batches independently tested" },
  { value: "5+", label: "Quality checks per batch" },
  { value: "48h", label: "Average delivery time (contiguous US)" },
];

export default function About() {
  return (
    <div className="min-h-screen bg-white">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="bg-[oklch(0.14_0.03_260)] text-white">
        <div className="container py-20">
          <p className="text-[0.75rem] font-semibold tracking-widest uppercase text-white/50 mb-4">About Vitum Lab</p>
          <h1 className="text-[3rem] sm:text-[3.5rem] font-bold leading-tight tracking-tight max-w-2xl mb-6">
            Research-grade peptides, built on verifiable science.
          </h1>
          <p className="text-[1.0625rem] text-white/70 max-w-xl leading-relaxed">
            Vitum Lab was founded with a single premise: researchers deserve access to compounds that are exactly what they claim to be, backed by documentation they can independently verify.
          </p>
        </div>
      </div>

      {/* ── Stats strip ──────────────────────────────────────────────── */}
      <div className="bg-[oklch(0.97_0.003_260)] border-b border-[oklch(0.91_0.004_260)]">
        <div className="container">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-[oklch(0.91_0.004_260)]">
            {stats.map((s) => (
              <div key={s.value} className="px-8 py-8">
                <p className="text-[2.25rem] font-bold text-[oklch(0.13_0.01_260)] leading-none mb-1">{s.value}</p>
                <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Mission section ───────────────────────────────────────────── */}
      <div className="container py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div>
            <p className="text-[0.75rem] font-semibold tracking-widest uppercase text-[oklch(0.52_0.01_260)] mb-4">Our Mission</p>
            <h2 className="text-[2rem] font-bold text-[oklch(0.13_0.01_260)] leading-tight mb-6">
              Raising the standard for research peptide supply.
            </h2>
            <div className="space-y-4 text-[0.9375rem] text-[oklch(0.40_0.01_260)] leading-relaxed">
              <p>
                The research peptide market has historically suffered from inconsistent quality, opaque sourcing, and a lack of accountability. Vitum Lab was established to address this directly — by building a supply chain grounded in documentation, independent testing, and full transparency.
              </p>
              <p>
                We supply exclusively to qualified researchers and institutions for in vitro and laboratory research applications. Every product in our catalog is lyophilized for stability, independently verified for purity and identity, and accompanied by a Certificate of Analysis from an accredited US laboratory.
              </p>
              <p>
                Our commitment is simple: if we cannot provide documentation for it, we do not sell it.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl bg-[oklch(0.97_0.003_260)] p-8">
              <p className="text-[0.75rem] font-semibold tracking-widest uppercase text-[oklch(0.52_0.01_260)] mb-3">Research Use Only</p>
              <p className="text-[0.9375rem] text-[oklch(0.40_0.01_260)] leading-relaxed">
                All products sold by Vitum Lab are strictly for in vitro / laboratory research use only. They are not intended for human or veterinary use, and are not for use in diagnostic procedures. By purchasing, customers confirm they are qualified researchers.
              </p>
              <Link href="/research-disclaimer" className="inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-[oklch(0.40_0.16_260)] hover:underline mt-4">
                Read full disclaimer <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="rounded-2xl bg-[oklch(0.14_0.03_260)] text-white p-8">
              <p className="text-[0.75rem] font-semibold tracking-widest uppercase text-white/50 mb-3">COA Library</p>
              <p className="text-[0.9375rem] text-white/75 leading-relaxed">
                Every batch Certificate of Analysis is publicly accessible. Search by product, lot number, or test date.
              </p>
              <Link href="/coa-library" className="inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-white hover:underline mt-4">
                Browse COA Library <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Values grid ──────────────────────────────────────────────── */}
      <div className="bg-[oklch(0.97_0.003_260)] py-20">
        <div className="container">
          <p className="text-[0.75rem] font-semibold tracking-widest uppercase text-[oklch(0.52_0.01_260)] mb-4 text-center">How We Operate</p>
          <h2 className="text-[2rem] font-bold text-[oklch(0.13_0.01_260)] text-center mb-12">
            Our operating principles
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {values.map((v) => (
              <div key={v.title} className="bg-white rounded-2xl p-8 flex flex-col gap-4">
                <div className="w-10 h-10 rounded-xl bg-[oklch(0.96_0.012_240)] flex items-center justify-center text-[oklch(0.40_0.16_260)]">
                  {v.icon}
                </div>
                <div>
                  <h3 className="text-[1.0625rem] font-bold text-[oklch(0.13_0.01_260)] mb-2">{v.title}</h3>
                  <p className="text-[0.9rem] text-[oklch(0.40_0.01_260)] leading-relaxed">{v.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <div className="container py-20 text-center">
        <h2 className="text-[2rem] font-bold text-[oklch(0.13_0.01_260)] mb-4">Ready to start your research?</h2>
        <p className="text-[0.9375rem] text-[oklch(0.52_0.01_260)] mb-8 max-w-md mx-auto">
          Browse our full catalog of independently verified research peptides with COAs included.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/shop" className="btn-primary">
            Browse Catalog <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/contact" className="btn-secondary">
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}
