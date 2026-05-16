/*
 * Home.tsx — Vitum Lab
 * Layout mirrors Amino Club structure:
 * 1. Hero: split layout — left text+CTA, right product vials on pastel bg
 * 2. Guarantee strip: 3 trust pillars
 * 3. Product showcase: large vial + shop CTA
 * 4. Features grid: 2-col cards "Everything you need"
 * 5. Quality proof: stats + tabbed quality checks + vial image
 * 6. FAQ accordion
 * 7. Final CTA
 * 8. Newsletter
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Shield, FileText, ChevronDown, ChevronUp, FlaskConical, Truck, Users, BookOpen } from "lucide-react";

const FOXY = "https://vitum-lab.foxycart.com/cart";

// ─── Product data ─────────────────────────────────────────────────────────────
const products = [
  {
    id: "retatrutide",
    name: "Retatrutide GLP-3",
    dose: "20 MG",
    lot: "A003",
    price: 189,
    category: "Metabolic Research",
    tagline: "Triple Receptor Agonist",
    description: "GLP-1/GIP/Glucagon triple receptor agonist studied for metabolic pathway modulation in preclinical models.",
    img: "/manus-storage/product-retatrutide-v2_2f631ecf.png",
    accentColor: "oklch(0.55 0.10 155)",
    bgTint: "bg-tint-green",
    cardBg: "#d0ecd0",
    cartCode: "retatrutide-20mg",
  },
  {
    id: "ghkcu",
    name: "GHK-Cu",
    dose: "100 MG",
    lot: "B002",
    price: 69,
    category: "Cosmetic / Tissue Research",
    tagline: "Copper Tripeptide Complex",
    description: "Glycyl-L-histidyl-L-lysine copper(II) complex studied for tissue remodeling and extracellular matrix research.",
    img: "/manus-storage/product-ghkcu-v2_82e289e5.png",
    accentColor: "oklch(0.40 0.16 260)",
    bgTint: "bg-tint-blue",
    cardBg: "#c6def0",
    cartCode: "ghk-cu-100mg",
  },
  {
    id: "nad",
    name: "NAD+",
    dose: "500 MG",
    lot: "D006",
    price: 129,
    category: "Cellular Research",
    tagline: "Nicotinamide Adenine Dinucleotide",
    description: "Research-grade NAD+ for cellular energy metabolism and longevity pathway studies in laboratory settings.",
    img: "/manus-storage/product-nad-v2_a8e29cc7.png",
    accentColor: "oklch(0.55 0.10 70)",
    bgTint: "bg-tint-warm",
    cardBg: "#ffd9ad",
    cartCode: "nad-500mg",
  },
];

// ─── Quality tabs ─────────────────────────────────────────────────────────────
const qualityTabs = [
  {
    label: "Potency",
    headline: "Verified Potency",
    method: "HPLC Analysis",
    body: "Every vial is tested to confirm it contains exactly what the label states. You receive the precise concentration specified, verified by accredited US laboratories.",
    badge: "99%+ Purity",
    badgeSub: "Verified by HPLC",
  },
  {
    label: "Purity",
    headline: "Identity Purity",
    method: "Mass Spectrometry",
    body: "Mass spectrometry confirms compound identity with no ambiguity. Every batch COA includes full spectral data available for download.",
    badge: "COA Included",
    badgeSub: "Every batch",
  },
  {
    label: "Stability",
    headline: "Stability Testing",
    method: "Lyophilized Format",
    body: "Lyophilized peptides maintain stability when stored at 2–8°C. Each product label specifies storage conditions and shelf life.",
    badge: "Cold-Chain",
    badgeSub: "Packaging standard",
  },
  {
    label: "Safety",
    headline: "Sterility Standards",
    method: "Endotoxin Testing",
    body: "Endotoxin and sterility testing performed on applicable batches. Full documentation provided with each Certificate of Analysis.",
    badge: "US-Tested",
    badgeSub: "Accredited labs",
  },
  {
    label: "Consistency",
    headline: "Batch Consistency",
    method: "Lot-to-Lot Verification",
    body: "Each new production lot is independently tested and assigned a unique batch number. COA documents are archived and publicly accessible.",
    badge: "Batch COA",
    badgeSub: "Every shipment",
  },
];

// ─── FAQ data ─────────────────────────────────────────────────────────────────
const faqs = [
  {
    q: "What purity level are your peptides and how is it verified?",
    a: "All Vitum Lab peptides are verified at ≥99% purity by HPLC analysis conducted at accredited US third-party laboratories. Each batch Certificate of Analysis is available for download from our COA Library.",
  },
  {
    q: "What is a Certificate of Analysis (COA) and how do I read it?",
    a: "A COA is a document issued by an independent laboratory confirming the identity, purity, and potency of a compound. It includes HPLC chromatogram data, mass spectrometry results, and batch/lot number. Every Vitum Lab order ships with the corresponding COA.",
  },
  {
    q: "How should I store lyophilized peptides?",
    a: "Lyophilized peptides should be stored at 2–8°C (36–46°F) in a sealed, dry environment away from light. Once reconstituted, store at 2–8°C and use within 30 days. Refer to the product label for compound-specific guidance.",
  },
  {
    q: "How fast do you ship and is cold shipping required?",
    a: "Orders placed before 1pm EST ship the same business day via next-day delivery. Lyophilized peptides are stable at ambient temperature for short transit periods; cold-chain packaging is available on request.",
  },
  {
    q: "Are these peptides for human use?",
    a: "No. All products sold by Vitum Lab are strictly for in vitro laboratory and research use only. They are not intended for human or veterinary use, not for use in diagnostic procedures, and have not been evaluated by the FDA.",
  },
  {
    q: "What is your return and refund policy?",
    a: "Due to the nature of research compounds, we do not accept returns. If your order arrives damaged or incorrect, contact support@vitumlab.com within 48 hours of delivery and we will arrange a replacement at no cost.",
  },
];

// ─── Reveal hook ──────────────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("visible"); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[oklch(0.91_0.004_260)]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left gap-4"
      >
        <span className="text-[1rem] font-semibold text-[oklch(0.13_0.01_260)] leading-snug">{q}</span>
        {open
          ? <ChevronUp className="w-5 h-5 flex-shrink-0 text-[oklch(0.52_0.01_260)]" />
          : <ChevronDown className="w-5 h-5 flex-shrink-0 text-[oklch(0.52_0.01_260)]" />
        }
      </button>
      {open && (
        <p className="pb-5 text-[0.9375rem] text-[oklch(0.40_0.01_260)] leading-relaxed">
          {a}
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [activeTab, setActiveTab] = useState(0);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const heroRef = useReveal();
  const guaranteeRef = useReveal();
  const featuresRef = useReveal();
  const qualityRef = useReveal();
  const faqRef = useReveal();

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubscribed(true);
  };

  return (
    <div className="min-h-screen bg-white">

      {/* ═══════════════════════════════════════════════════════════════
          1. HERO — split layout
      ═══════════════════════════════════════════════════════════════ */}
      <section className="min-h-[88vh] grid grid-cols-1 lg:grid-cols-2">

        {/* Left: text + CTAs */}
        <div ref={heroRef} className="reveal flex flex-col justify-center px-6 sm:px-12 lg:px-16 xl:px-20 py-20 lg:py-0 order-2 lg:order-1">
          <div className="max-w-[520px]">
            <div className="inline-flex items-center gap-2 bg-[oklch(0.96_0.003_260)] text-[oklch(0.40_0.01_260)] text-[0.75rem] font-semibold tracking-widest uppercase px-3 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[oklch(0.40_0.16_260)] inline-block" />
              Research Use Only
            </div>

            <h1 className="text-[3rem] sm:text-[3.5rem] lg:text-[4rem] font-bold leading-[1.05] tracking-tight text-[oklch(0.13_0.01_260)] mb-6">
              Research-grade peptides.<br />
              <span className="text-[oklch(0.40_0.16_260)]">Independently tested.</span>
            </h1>

            <p className="text-[1.0625rem] text-[oklch(0.40_0.01_260)] leading-relaxed mb-8 max-w-[440px]">
              Vitum Lab supplies precision-synthesized peptides verified for purity and identity by accredited US laboratories. Every batch ships with a Certificate of Analysis.
            </p>

            <div className="flex flex-wrap gap-3 mb-10">
              <Link href="/shop" className="btn-primary">
                Shop Now <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/coa-library" className="btn-secondary">
                View COA Library
              </Link>
            </div>

            {/* Mini trust row */}
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {[
                "≥99% Purity Verified",
                "COA with Every Batch",
                "US-Based & Tested",
                "Next-Day Shipping*",
              ].map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-[0.8125rem] text-[oklch(0.40_0.01_260)]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[oklch(0.40_0.16_260)] flex-shrink-0" />
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: product vials on light background — overflow into section below */}
        <div className="relative order-1 lg:order-2 flex items-end justify-center pb-0 pt-12 overflow-visible z-10" style={{backgroundColor: '#f0f4f0'}}>

          {/* Three vials — enlarged, tilted, floating independently, overlapping below */}
          <div className="relative flex items-end justify-center gap-2 sm:gap-4 px-4 w-full max-w-[640px] mb-[-80px]">
            {/* GHK-Cu — left, tilted left, float-a */}
            <div className="relative flex-shrink-0 w-[33%] z-10 vial-float-a" style={{transform: 'rotate(-8deg)', transformOrigin: 'bottom center'}}>
              <img
                src="/manus-storage/product-ghkcu-v2_82e289e5.png"
                alt="GHK-Cu 100mg research peptide vial"
                className="w-full object-contain drop-shadow-2xl"
              />
            </div>
            {/* Retatrutide — center, upright, float-b */}
            <div className="relative flex-shrink-0 w-[40%] z-20 vial-float-b">
              <img
                src="/manus-storage/product-retatrutide-v2_2f631ecf.png"
                alt="Retatrutide GLP-3 20mg research peptide vial"
                className="w-full object-contain drop-shadow-2xl"
              />
            </div>
            {/* NAD+ — right, tilted right, float-c */}
            <div className="relative flex-shrink-0 w-[33%] z-10 vial-float-c" style={{transform: 'rotate(8deg)', transformOrigin: 'bottom center'}}>
              <img
                src="/manus-storage/product-nad-v2_a8e29cc7.png"
                alt="NAD+ 500mg research peptide vial"
                className="w-full object-contain drop-shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>



      {/* ═══════════════════════════════════════════════════════════════
          3. PRODUCT SHOWCASE — 3 cards
      ═══════════════════════════════════════════════════════════════ */}
      <section className="py-20 bg-white">
        <div className="container">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2 className="text-[2.25rem] font-bold tracking-tight text-[oklch(0.13_0.01_260)]">Featured Products</h2>
            </div>
            <Link href="/shop" className="hidden sm:flex items-center gap-1.5 text-[0.875rem] font-semibold text-[oklch(0.40_0.16_260)] hover:underline">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map((p) => (
              <div key={p.id} className="rounded-2xl overflow-hidden group">
                {/* Image area — dark bg matches product photo backgrounds */}
                <div className="relative flex items-center justify-center pt-10 pb-8 px-8" style={{ backgroundColor: p.cardBg }}>
                  <img
                src={p.img}
                alt={`${p.name} ${p.dose} research peptide vial`}
                className="h-52 object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-md"
                  />
                </div>

                {/* Info area */}
                <div className="bg-white rounded-t-2xl px-5 pt-5 pb-5">
                  <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-[oklch(0.52_0.01_260)] mb-1">{p.category}</p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <h3 className="text-[1.375rem] font-bold text-[oklch(0.13_0.01_260)]">{p.name}</h3>
                    <span className="text-[0.8125rem] font-semibold text-[oklch(0.52_0.01_260)]">{p.dose}</span>
                  </div>
                  <p className="text-[0.75rem] mono text-[oklch(0.60_0.01_260)] mb-3">LOT: {p.lot}</p>
                  <p className="text-[0.875rem] text-[oklch(0.40_0.01_260)] leading-relaxed mb-4 line-clamp-2">{p.description}</p>

                  <div className="flex items-center justify-between">
                    <span className="text-[1.375rem] font-bold text-[oklch(0.13_0.01_260)]">${p.price}</span>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/coa-library#${p.cartCode}`}
                        className="flex items-center gap-1 text-[0.75rem] font-semibold text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)] transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" /> COA
                      </a>
                      <a
                        href={`${FOXY}?name=${encodeURIComponent(p.name + " " + p.dose)}&price=${p.price}&code=${p.cartCode}&quantity=1`}
                        className="btn-primary text-[0.8125rem] py-2 px-4"
                      >
                        Add to Cart
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          4. FEATURES GRID — "Everything you need"
      ═══════════════════════════════════════════════════════════════ */}
      <section ref={featuresRef} className="reveal py-20 bg-[oklch(0.975_0.003_260)]">
        <div className="container">
          <h2 className="text-[2.25rem] font-bold tracking-tight text-[oklch(0.13_0.01_260)] mb-10 text-center">
            Everything you need to succeed
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              {
                icon: <FlaskConical className="w-6 h-6" />,
                title: "Research-grade quality, researcher-friendly pricing",
                body: "US-based supply with in-house quality control. Every batch undergoes rigorous third-party identity and content testing with full documentation.",
                cta: "Shop Products",
                href: "/shop",
              },
              {
                icon: <FileText className="w-6 h-6" />,
                title: "Full documentation with every order",
                body: "Every shipment includes the batch Certificate of Analysis confirming identity and purity. Download COAs anytime from our public library.",
                cta: "COA Library",
                href: "/coa-library",
              },
              {
                icon: <Truck className="w-6 h-6" />,
                title: "Anywhere in the US, as fast as next day",
                body: "Orders placed before 1pm EST ship the same business day. Free shipping and a complimentary 10mL BAC Water on orders over $150.",
                cta: "Shipping Info",
                href: "/shipping-policy",
              },
              {
                icon: <BookOpen className="w-6 h-6" />,
                title: "Research library at your fingertips",
                body: "Access research articles, compound references, and documentation on each peptide we carry. Updated regularly with new literature.",
                cta: "Research Library",
                href: "/research-disclaimer",
              },
            ].map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-7 flex flex-col gap-4">
                <div className="w-10 h-10 rounded-xl bg-[oklch(0.96_0.012_240)] flex items-center justify-center text-[oklch(0.40_0.16_260)]">
                  {f.icon}
                </div>
                <div>
                  <h3 className="text-[1.0625rem] font-bold text-[oklch(0.13_0.01_260)] mb-2 leading-snug">{f.title}</h3>
                  <p className="text-[0.9rem] text-[oklch(0.40_0.01_260)] leading-relaxed">{f.body}</p>
                </div>
                <Link href={f.href} className="inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-[oklch(0.40_0.16_260)] hover:underline mt-auto">
                  {f.cta} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          5. QUALITY PROOF — dark section, tabbed
      ═══════════════════════════════════════════════════════════════ */}
      <section ref={qualityRef} className="reveal py-20 bg-dark-navy text-white">
        <div className="container">
          {/* Header stats */}
          <div className="flex flex-wrap gap-8 mb-12">
            <div>
              <p className="text-[2.5rem] font-bold">99%+</p>
              <p className="text-[0.8125rem] text-white/60 uppercase tracking-widest">Purity Guaranteed</p>
            </div>
            <div>
              <p className="text-[2.5rem] font-bold">5</p>
              <p className="text-[0.8125rem] text-white/60 uppercase tracking-widest">Quality Checks</p>
            </div>
            <div>
              <p className="text-[2.5rem] font-bold">100%</p>
              <p className="text-[0.8125rem] text-white/60 uppercase tracking-widest">US Verified</p>
            </div>
          </div>

          <h2 className="text-[2rem] font-bold mb-10">Quality you can verify, not just trust</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            {/* Left: tabs + content */}
            <div>
              {/* Tab buttons */}
              <div className="flex flex-wrap gap-2 mb-8">
                {qualityTabs.map((t, i) => (
                  <button
                    key={t.label}
                    onClick={() => setActiveTab(i)}
                    className={`px-4 py-2 rounded-full text-[0.8125rem] font-semibold transition-colors ${
                      activeTab === i
                        ? "bg-white text-[oklch(0.13_0.01_260)]"
                        : "bg-white/10 text-white/70 hover:bg-white/20"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Active tab content */}
              <div key={activeTab} className="space-y-3">
                <p className="text-[0.75rem] font-semibold tracking-widest uppercase text-white/50">{qualityTabs[activeTab].method}</p>
                <h3 className="text-[1.5rem] font-bold">{qualityTabs[activeTab].headline}</h3>
                <p className="text-[0.9375rem] text-white/75 leading-relaxed">{qualityTabs[activeTab].body}</p>

                <div className="flex items-center gap-3 pt-2">
                  <div className="bg-white/10 rounded-lg px-4 py-2.5">
                    <p className="text-[0.875rem] font-bold">{qualityTabs[activeTab].badge}</p>
                    <p className="text-[0.6875rem] text-white/60">{qualityTabs[activeTab].badgeSub}</p>
                  </div>
                </div>

                <div className="pt-4">
                  <Link href="/shop" className="btn-primary bg-white text-[oklch(0.13_0.01_260)] hover:bg-white/90">
                    Shop Now <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Right: product vial */}
            <div className="flex items-center justify-center">
              <img
                src="/manus-storage/product-ghkcu-v2_82e289e5.png"
                alt="GHK-Cu research peptide vial — 99%+ purity, third-party tested"
                className="max-h-80 object-contain drop-shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          6. FAQ ACCORDION
      ═══════════════════════════════════════════════════════════════ */}
      <section ref={faqRef} className="reveal py-20 bg-white">
        <div className="container max-w-3xl mx-auto">
          <h2 className="text-[2.25rem] font-bold tracking-tight text-[oklch(0.13_0.01_260)] mb-2 text-center">
            Frequently asked questions
          </h2>
          <p className="text-[0.9375rem] text-[oklch(0.52_0.01_260)] text-center mb-10">
            Have more questions? <a href="mailto:support@vitumlab.com" className="text-[oklch(0.40_0.16_260)] hover:underline">Contact us</a>
          </p>

          <div>
            {faqs.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>



      {/* ═══════════════════════════════════════════════════════════════
          8. NEWSLETTER
      ═══════════════════════════════════════════════════════════════ */}
      <section className="py-16 bg-dark-navy text-white">
        <div className="container max-w-xl mx-auto text-center">
          <p className="text-[0.75rem] font-semibold tracking-widest uppercase text-white/50 mb-3">Research Updates</p>
          <h2 className="text-[1.75rem] font-bold mb-2">Stay current with new compounds and COA releases.</h2>
          <p className="text-[0.9rem] text-white/60 mb-7">
            New product announcements, batch COA releases, and research literature updates. No spam — unsubscribe anytime.
          </p>

          {subscribed ? (
            <div className="flex items-center justify-center gap-2 text-white/80">
              <CheckCircle2 className="w-5 h-5 text-[oklch(0.70_0.15_155)]" />
              <span className="font-semibold">You're subscribed. Thank you.</span>
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="flex gap-2 max-w-sm mx-auto">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="flex-1 bg-white/10 border border-white/20 text-white placeholder:text-white/40 rounded-full px-4 py-3 text-[0.9rem] outline-none focus:border-white/50 transition-colors"
              />
              <button type="submit" className="btn-primary whitespace-nowrap">
                Subscribe
              </button>
            </form>
          )}

          <p className="text-[0.75rem] text-white/40 mt-4">
            By subscribing you confirm you are a researcher. Research use only.
          </p>
        </div>
      </section>



    </div>
  );
}
