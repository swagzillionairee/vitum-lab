/*
 * Home.tsx — Vitum Lab Homepage
 * Design: Contemporary Clinical — Med Spa Precision meets Research Credibility
 * Sections: Hero, Trust Badges, Featured Products, Category Preview, About/Mission, Newsletter
 * Colors: White canvas, Deep Navy authority, Cobalt action, Silver metadata
 * Typography: Sora (display + body), IBM Plex Mono (batch numbers, COA codes)
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  FlaskConical,
  ShieldCheck,
  Truck,
  FileCheck,
  ChevronRight,
  Star,
  Download,
  ArrowRight,
  Microscope,
  Award,
  Globe,
} from "lucide-react";

const FOXY_STORE = "vitum-lab.foxycart.com";

// ─── Product data ────────────────────────────────────────────────────────────
const products = [
  {
    id: "ghk-cu-50mg",
    name: "GHK-Cu",
    size: "50mg",
    category: "Cosmetic / Tissue Research",
    price: 69,
    image: "/manus-storage/product-ghk-cu_4239b927.png",
    badge: "Copper Tripeptide",
    batchPlaceholder: "VL-GHK-2501",
    description:
      "Glycyl-L-histidyl-L-lysine copper(II) complex. A naturally occurring copper peptide studied for its role in tissue remodeling and extracellular matrix research.",
    coaAvailable: true,
  },
  {
    id: "retatrutide-10mg",
    name: "Retatrutide",
    size: "10mg",
    category: "Metabolic Research",
    price: 189,
    image: "/manus-storage/product-retatrutide_5afcd50b.png",
    badge: "Triple Agonist",
    batchPlaceholder: "VL-RET-2501",
    description:
      "GLP-1/GIP/Glucagon triple receptor agonist. Research compound under investigation for metabolic pathway modulation in preclinical models.",
    coaAvailable: true,
  },
  {
    id: "bac-water-10ml",
    name: "BAC Water",
    size: "10ml",
    category: "Lab Supplies",
    price: 14,
    image: "/manus-storage/product-bac-water_0085de38.png",
    badge: "0.9% Benzyl Alcohol",
    batchPlaceholder: "VL-BAC-2501",
    description:
      "Bacteriostatic water containing 0.9% benzyl alcohol. Standard diluent for lyophilized peptide reconstitution in laboratory research settings.",
    coaAvailable: false,
  },
];

// ─── Trust badges ─────────────────────────────────────────────────────────────
const trustBadges = [
  {
    icon: <ShieldCheck className="w-6 h-6" />,
    title: "≥99% Purity Verified",
    sub: "Third-party HPLC tested",
  },
  {
    icon: <FileCheck className="w-6 h-6" />,
    title: "COA with Every Batch",
    sub: "Downloadable certificate",
  },
  {
    icon: <Globe className="w-6 h-6" />,
    title: "US-Sourced & Tested",
    sub: "Domestic accredited labs",
  },
  {
    icon: <Truck className="w-6 h-6" />,
    title: "Discreet Secure Shipping",
    sub: "Cold-chain packaging",
  },
];

// ─── Categories ───────────────────────────────────────────────────────────────
const categories = [
  {
    name: "Cosmetic / Tissue Research",
    slug: "cosmetic",
    description: "Copper peptides and tissue remodeling compounds for dermal research applications.",
    count: 1,
    icon: <Microscope className="w-5 h-5" />,
  },
  {
    name: "Metabolic Research",
    slug: "metabolic",
    description: "Receptor agonists and metabolic pathway modulators for preclinical research.",
    count: 1,
    icon: <FlaskConical className="w-5 h-5" />,
  },
  {
    name: "Lab Supplies",
    slug: "lab-supplies",
    description: "Bacteriostatic water, reconstitution supplies, and laboratory consumables.",
    count: 1,
    icon: <Award className="w-5 h-5" />,
  },
];

// ─── Scroll reveal hook ───────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("visible");
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ product }: { product: (typeof products)[0] }) {
  const foxyUrl = `https://${FOXY_STORE}/cart?name=${encodeURIComponent(product.name + " " + product.size)}&price=${product.price}&code=${product.id}&quantity=1`;

  return (
    <div className="product-card bg-white border border-[oklch(0.90_0.006_255)] rounded-sm overflow-hidden flex flex-col">
      {/* Product image */}
      <div className="relative bg-[oklch(0.97_0.003_255)] flex items-center justify-center p-8 aspect-square">
        <img
          src={product.image}
          alt={`${product.name} ${product.size} research peptide vial`}
          className="w-full h-full object-contain max-h-52"
        />
        <span className="absolute top-3 left-3 bg-[oklch(0.35_0.15_260)] text-white text-[0.625rem] font-semibold tracking-widest uppercase px-2 py-1 rounded-sm">
          {product.badge}
        </span>
      </div>

      {/* Card body */}
      <div className="p-5 flex flex-col flex-1">
        <div className="mb-1">
          <span className="section-label text-[0.625rem]">{product.category}</span>
        </div>
        <h3 className="text-lg font-bold text-[oklch(0.18_0.04_255)] leading-tight mb-1">
          {product.name}
        </h3>
        <p className="text-sm text-[oklch(0.55_0.02_255)] mb-1">{product.size}</p>
        <p className="text-xs text-[oklch(0.65_0.01_255)] font-mono mb-3">
          Batch: {product.batchPlaceholder}
        </p>
        <p className="text-sm text-[oklch(0.40_0.02_255)] leading-relaxed mb-4 flex-1">
          {product.description}
        </p>

        {/* Research disclaimer */}
        <div className="research-disclaimer mb-4 text-[0.625rem]">
          Research Use Only — Not for Human Consumption
        </div>

        {/* Price + actions */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xl font-bold text-[oklch(0.18_0.04_255)]">
            ${product.price}
          </span>
          <div className="flex items-center gap-2">
            {product.coaAvailable && (
              <a
                href={`/coa-library#${product.id}`}
                className="flex items-center gap-1 text-xs font-medium text-[oklch(0.35_0.15_260)] hover:underline"
                title="View Certificate of Analysis"
              >
                <Download className="w-3.5 h-3.5" />
                COA
              </a>
            )}
            <a
              href={foxyUrl}
              className="btn-cobalt text-xs py-2 px-4"
            >
              Add to Cart
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const heroRef = useReveal();
  const badgesRef = useReveal();
  const productsRef = useReveal();
  const categoriesRef = useReveal();
  const aboutRef = useReveal();
  const newsletterRef = useReveal();

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setEmail("");
    }
  };

  return (
    <div className="min-h-screen bg-white">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[oklch(0.18_0.04_255)] min-h-[580px] flex items-center">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-right opacity-30"
          style={{ backgroundImage: "url('/manus-storage/hero-bg_ae48f329.png')" }}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-[oklch(0.18_0.04_255)] via-[oklch(0.18_0.04_255)]/90 to-[oklch(0.18_0.04_255)]/40" />

        <div className="relative z-10 container py-20">
          <div
            ref={heroRef}
            className="reveal max-w-2xl"
          >
            <span className="inline-block section-label text-[oklch(0.60_0.10_260)] mb-5">
              Research Grade Peptides
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-6">
              Precision-Synthesized.
              <br />
              <span className="text-[oklch(0.65_0.12_260)]">Independently Tested.</span>
            </h1>
            <p className="text-lg text-white/70 leading-relaxed mb-8 max-w-xl">
              Vitum Lab supplies research-grade peptides verified for purity and
              identity by accredited US laboratories. Every batch ships with a
              Certificate of Analysis.
            </p>

            {/* Hero CTAs */}
            <div className="flex flex-wrap gap-4 mb-10">
              <Link href="/shop" className="btn-cobalt inline-flex items-center gap-2">
                Browse Products <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/coa-library" className="btn-outline border-white/40 text-white hover:bg-white hover:text-[oklch(0.18_0.04_255)] inline-flex items-center gap-2">
                <FileCheck className="w-4 h-4" />
                COA Library
              </Link>
            </div>

            {/* Hero stats */}
            <div className="flex flex-wrap gap-8">
              {[
                { value: "≥99%", label: "Purity Guaranteed" },
                { value: "3rd Party", label: "Independently Tested" },
                { value: "US-Based", label: "Domestic Sourcing" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                  <div className="text-xs text-white/50 font-medium tracking-wide uppercase mt-0.5">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST BADGES ─────────────────────────────────────────────────── */}
      <section className="border-b border-[oklch(0.90_0.006_255)]">
        <div
          ref={badgesRef}
          className="reveal container"
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-[oklch(0.90_0.006_255)]">
            {trustBadges.map((badge, i) => (
              <div
                key={badge.title}
                className="flex items-center gap-3 py-5 px-4 sm:px-6"
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <div className="flex-shrink-0 text-[oklch(0.35_0.15_260)]">
                  {badge.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[oklch(0.18_0.04_255)] leading-tight">
                    {badge.title}
                  </p>
                  <p className="text-xs text-[oklch(0.55_0.02_255)] mt-0.5">
                    {badge.sub}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURED PRODUCTS ─────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="container">
          <div
            ref={productsRef}
            className="reveal"
          >
            <div className="flex items-end justify-between mb-10">
              <div>
                <span className="section-label block mb-2">Launch Catalog</span>
                <h2 className="text-3xl font-bold text-[oklch(0.18_0.04_255)]">
                  Featured Products
                </h2>
              </div>
              <Link
                href="/shop"
                className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-[oklch(0.35_0.15_260)] hover:underline"
              >
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            <div className="mt-8 sm:hidden text-center">
              <Link href="/shop" className="btn-outline inline-flex items-center gap-2">
                View All Products <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── CATEGORY PREVIEW ─────────────────────────────────────────────── */}
      <section className="py-20 bg-[oklch(0.97_0.003_255)]">
        <div className="container">
          <div
            ref={categoriesRef}
            className="reveal"
          >
            <div className="mb-10">
              <span className="section-label block mb-2">Research Categories</span>
              <h2 className="text-3xl font-bold text-[oklch(0.18_0.04_255)]">
                Browse by Category
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {categories.map((cat, i) => (
                <Link
                  key={cat.slug}
                  href={`/shop?category=${cat.slug}`}
                  className="group block bg-white border border-[oklch(0.90_0.006_255)] rounded-sm p-6 hover:border-[oklch(0.35_0.15_260)] hover:shadow-md transition-all duration-200"
                  style={{ transitionDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-[oklch(0.35_0.15_260)]">{cat.icon}</div>
                    <span className="text-xs font-semibold text-[oklch(0.55_0.02_255)] uppercase tracking-widest">
                      {cat.count} product{cat.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-[oklch(0.18_0.04_255)] mb-2 group-hover:text-[oklch(0.35_0.15_260)] transition-colors">
                    {cat.name}
                  </h3>
                  <p className="text-sm text-[oklch(0.55_0.02_255)] leading-relaxed">
                    {cat.description}
                  </p>
                  <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-[oklch(0.35_0.15_260)]">
                    Explore <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </Link>
              ))}
            </div>

            {/* Placeholder categories */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
              {["Healing & Recovery", "Growth Factors", "Peptide Blends"].map((name) => (
                <div
                  key={name}
                  className="bg-white border border-dashed border-[oklch(0.85_0.006_255)] rounded-sm p-5 flex items-center gap-3 opacity-60"
                >
                  <FlaskConical className="w-4 h-4 text-[oklch(0.65_0.01_255)]" />
                  <div>
                    <p className="text-sm font-semibold text-[oklch(0.55_0.02_255)]">{name}</p>
                    <p className="text-xs text-[oklch(0.65_0.01_255)]">Coming soon</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ABOUT / MISSION ──────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="container">
          <div
            ref={aboutRef}
            className="reveal"
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              {/* Text */}
              <div>
                <span className="section-label block mb-3">Our Mission</span>
                <h2 className="text-3xl font-bold text-[oklch(0.18_0.04_255)] mb-5 leading-tight">
                  Research-grade supply you can verify, not just trust.
                </h2>
                <p className="text-base text-[oklch(0.40_0.02_255)] leading-relaxed mb-5">
                  Vitum Lab was founded on a straightforward principle: researchers
                  deserve transparent documentation for every compound they work
                  with. We source, synthesize, and independently verify each
                  product through accredited US laboratories before it ships.
                </p>
                <p className="text-base text-[oklch(0.40_0.02_255)] leading-relaxed mb-8">
                  Every vial ships with a Certificate of Analysis confirming
                  identity and purity. No ambiguity. No guesswork. Just
                  documented quality for serious research.
                </p>

                <div className="grid grid-cols-2 gap-5 mb-8">
                  {[
                    { value: "≥99%", label: "Identity Purity" },
                    { value: "HPLC", label: "Verification Method" },
                    { value: "US Labs", label: "Third-Party Testing" },
                    { value: "Batch COA", label: "Every Shipment" },
                  ].map((stat) => (
                    <div key={stat.label} className="border-l-2 border-[oklch(0.35_0.15_260)] pl-4">
                      <div className="text-xl font-bold text-[oklch(0.18_0.04_255)]">
                        {stat.value}
                      </div>
                      <div className="text-xs text-[oklch(0.55_0.02_255)] font-medium tracking-wide uppercase mt-0.5">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>

                <Link href="/about" className="btn-primary inline-flex items-center gap-2">
                  Learn About Vitum Lab <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              {/* Visual: vials arranged */}
              <div className="relative">
                <div className="grid grid-cols-2 gap-4">
                  <div className="aspect-square bg-[oklch(0.97_0.003_255)] rounded-sm overflow-hidden flex items-center justify-center p-6">
                    <img
                      src="/manus-storage/product-ghk-cu_4239b927.png"
                      alt="GHK-Cu research peptide"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="aspect-square bg-[oklch(0.94_0.01_255)] rounded-sm overflow-hidden flex items-center justify-center p-6 mt-8">
                    <img
                      src="/manus-storage/product-retatrutide_5afcd50b.png"
                      alt="Retatrutide research peptide"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
                {/* COA badge overlay */}
                <div className="absolute bottom-4 left-4 bg-white border border-[oklch(0.90_0.006_255)] rounded-sm px-4 py-3 shadow-lg">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-[oklch(0.35_0.15_260)]" />
                    <div>
                      <p className="text-xs font-bold text-[oklch(0.18_0.04_255)]">
                        COA Verified
                      </p>
                      <p className="text-[0.625rem] text-[oklch(0.55_0.02_255)] font-mono">
                        Third-party tested
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── NEWSLETTER ───────────────────────────────────────────────────── */}
      <section className="py-16 bg-[oklch(0.18_0.04_255)]">
        <div className="container">
          <div
            ref={newsletterRef}
            className="reveal max-w-2xl mx-auto text-center"
          >
            <span className="section-label text-[oklch(0.60_0.10_260)] block mb-3">
              Research Updates
            </span>
            <h2 className="text-2xl font-bold text-white mb-3">
              Stay current with new compounds and COA releases.
            </h2>
            <p className="text-sm text-white/60 mb-8">
              New product announcements, batch COA releases, and research
              literature updates. No spam — unsubscribe anytime.
            </p>

            {subscribed ? (
              <div className="flex items-center justify-center gap-2 text-[oklch(0.65_0.12_260)] font-semibold">
                <ShieldCheck className="w-5 h-5" />
                You're subscribed. Thank you.
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="flex-1 bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-sm px-4 py-3 rounded-sm focus:outline-none focus:border-[oklch(0.50_0.15_260)] transition-colors"
                />
                <button type="submit" className="btn-cobalt whitespace-nowrap">
                  Subscribe
                </button>
              </form>
            )}

            <p className="mt-4 text-[0.6875rem] text-white/30">
              By subscribing you confirm you are a researcher. Research use only.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
