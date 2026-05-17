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
import { ArrowRight, CheckCircle2, Shield, FileText, ChevronDown, ChevronUp, FlaskConical, Truck, Users, BookOpen, Check } from "lucide-react";
import { useCart } from "@/contexts/CartContext";

// ─── Product data with variants ───────────────────────────────────────────────
const retatrutideVariants = [
  { dose: "10 MG", lot: "A001", price: 129, img: "/manus-storage/studio-glp3-10mg_e3947ee3.png", cartCode: "retatrutide-10mg", id: "retatrutide-10mg" },
  { dose: "20 MG", lot: "A003", price: 189, img: "/manus-storage/studio-glp3-20mg_f5105426.png", cartCode: "retatrutide-20mg", id: "retatrutide-20mg" },
  { dose: "30 MG", lot: "A007", price: 249, img: "/manus-storage/studio-glp3-30mg_192ac78d.png", cartCode: "retatrutide-30mg", id: "retatrutide-30mg" },
];

const ghkcuVariants = [
  { dose: "50 MG", lot: "B031", price: 69, img: "/manus-storage/studio-ghkcu-50mg_83686b23.png", cartCode: "ghk-cu-50mg", id: "ghkcu-50mg" },
  { dose: "100 MG", lot: "B045", price: 109, img: "/manus-storage/studio-ghkcu-100mg_180c2bfb.png", cartCode: "ghk-cu-100mg", id: "ghkcu-100mg" },
];

// Static products (no variant selector needed)
const staticProducts = [
  {
    id: "nad",
    name: "NAD+",
    dose: "500 MG",
    lot: "D006",
    price: 129,
    category: "Cellular Research",
    tagline: "Nicotinamide Adenine Dinucleotide",
    description: "Research-grade NAD+ for cellular energy metabolism and longevity pathway studies in laboratory settings.",
    img: "/manus-storage/studio-nad-500mg_fca1b8a4.png",
    accentColor: "oklch(0.50 0.14 50)",
    bgTint: "bg-tint-orange",
    cardBg: "#faeae0",
    cartCode: "nad-500mg",
    badge: "New" as string | null,
  },
  {
    id: "bacwater",
    name: "BAC Water",
    dose: "10 ML",
    lot: "E025",
    price: 12,
    category: "Reconstitution",
    tagline: "Bacteriostatic Water 0.9% Benzyl Alcohol",
    description: "USP-grade bacteriostatic water with 0.9% benzyl alcohol for safe multi-dose reconstitution of lyophilized research peptides.",
    img: "/manus-storage/studio-bac-water-10ml_21faee3c.png",
    accentColor: "oklch(0.35 0.10 220)",
    bgTint: "bg-tint-blue",
    cardBg: "#e0eaf5",
    cartCode: "bac-water-10ml",
    badge: null as string | null,
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
    label: "Safety",
    headline: "Sterility Testing",
    method: "USP <71> Protocol",
    body: "Sterility and endotoxin testing follows USP <71> protocol. Lyophilized format ensures maximum stability and shelf life under standard laboratory storage conditions.",
    badge: "Endotoxin Free",
    badgeSub: "USP <71>",
  },
];

// ─── FAQ data ─────────────────────────────────────────────────────────────────
const faqs = [
  {
    q: "What is the purity of your peptides?",
    a: "All peptides are ≥99% pure as verified by HPLC analysis. A Certificate of Analysis (COA) from an accredited third-party laboratory is included with every order and available for download on our COA Library page.",
  },
  {
    q: "How are orders shipped?",
    a: "Orders are shipped via USPS Priority Mail® Padded Flat Rate Envelope. Orders placed before 1pm EST ship the same day. Orders placed after 1pm EST ship the following business day.",
  },
  {
    q: "Do you offer free shipping?",
    a: "Yes — orders over $150 receive free shipping and a complimentary 10mL BAC Water vial. The free BAC Water is automatically added to your cart when you reach the threshold.",
  },
  {
    q: "What is BAC Water and why do I need it?",
    a: "Bacteriostatic Water (BAC Water) is sterile water containing 0.9% benzyl alcohol, used to reconstitute lyophilized (freeze-dried) peptides for laboratory use. It is required to prepare peptide solutions for in vitro research.",
  },
  {
    q: "Are these products for human use?",
    a: "No. All products sold by Vitum Lab are strictly for in vitro / laboratory research use only. They are not intended for human or veterinary use, and are not for use in diagnostic procedures. By purchasing, you confirm you are a qualified researcher.",
  },
  {
    q: "How should I store peptides?",
    a: "Lyophilized peptides should be stored at −20°C (freezer) for long-term storage. Once reconstituted, store at 4°C (refrigerator) and use within 28 days. Avoid repeated freeze-thaw cycles.",
  },
];

// ─── Reveal animation hook ────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("visible"); obs.disconnect(); } },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref as React.RefObject<HTMLDivElement>;
}

// ─── Dose selector card ───────────────────────────────────────────────────────
interface DoseSelectorCardProps {
  name: string;
  category: string;
  description: string;
  cardBg: string;
  variants: { dose: string; lot: string; price: number; img: string; cartCode: string; id: string }[];
  badge?: string;
  detailHref: string;
  fixedLot?: string;
}

function DoseSelectorCard({ name, category, description, cardBg, variants, badge, detailHref, fixedLot }: DoseSelectorCardProps) {
  const { addItem } = useCart();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const selected = variants[selectedIdx];

  const handleAdd = () => {
    addItem({ id: selected.id, name, dose: selected.dose, price: selected.price, img: selected.img, cartCode: selected.cartCode });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="rounded-2xl overflow-hidden group shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] hover:shadow-[0_4px_16px_oklch(0.13_0.01_260/0.12)] transition-shadow duration-200">
      {/* Image area */}
      <Link href={detailHref}>
        <div className="relative overflow-hidden cursor-pointer" style={{ backgroundColor: cardBg, height: "320px" }}>
          {badge && (
            <span className={`absolute top-3 left-3 z-10 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full shadow-md ${badge === "Best Seller" ? "bg-[#1a3a2a] text-white" : "bg-[oklch(0.35_0.15_260)] text-white"}`}>
              {badge === "Best Seller" ? "★ " : ""}{badge}
            </span>
          )}
          <img
            src={selected.img}
            alt={`${name} ${selected.dose} research peptide vial`}
            className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      </Link>

      {/* Info area */}
      <div className="bg-white px-5 pt-4 pb-5">
        <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-[oklch(0.52_0.01_260)] mb-1">{category}</p>
        <div className="flex items-baseline gap-2 mb-1">
          <h3 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">{name}</h3>
        </div>
        <p className="text-[0.6875rem] font-mono text-[oklch(0.60_0.01_260)] mb-3">LOT: {fixedLot ?? selected.lot}</p>

        {/* Dose selector pills */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {variants.map((v, i) => (
            <button
              key={v.dose}
              onClick={() => setSelectedIdx(i)}
              className={`text-[0.6875rem] font-bold px-3 py-1 rounded-full border transition-colors duration-150 ${
                i === selectedIdx
                  ? "bg-[oklch(0.13_0.01_260)] text-white border-[oklch(0.13_0.01_260)]"
                  : "bg-white text-[oklch(0.40_0.01_260)] border-[oklch(0.88_0.004_260)] hover:border-[oklch(0.60_0.01_260)]"
              }`}
            >
              {v.dose}
            </button>
          ))}
        </div>

        <p className="text-[0.8125rem] text-[oklch(0.40_0.01_260)] leading-relaxed mb-4 line-clamp-2">{description}</p>

        <div className="flex items-center justify-between">
          <span className="text-[1.25rem] font-bold text-[oklch(0.13_0.01_260)]">${selected.price}</span>
          <div className="flex items-center gap-2">
            <a
              href={`/coa-library#${selected.cartCode}`}
              className="flex items-center gap-1 text-[0.75rem] font-semibold text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)] transition-colors"
            >
              <FileText className="w-3.5 h-3.5" /> COA
            </a>
            <button
              onClick={handleAdd}
              className={`text-[0.8125rem] py-2 px-4 rounded-full font-semibold transition-all duration-200 active:scale-95 ${
                added
                  ? "bg-[oklch(0.40_0.14_155)] text-white"
                  : "btn-primary"
              }`}
            >
              {added ? (
                <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Added</span>
              ) : (
                "Add to Cart"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Static product card ──────────────────────────────────────────────────────
interface StaticCardProps {
  p: typeof staticProducts[0];
  detailHref: string;
}

function StaticCard({ p, detailHref }: StaticCardProps) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    addItem({ id: p.id, name: p.name, dose: p.dose, price: p.price, img: p.img, cartCode: p.cartCode });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="rounded-2xl overflow-hidden group shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] hover:shadow-[0_4px_16px_oklch(0.13_0.01_260/0.12)] transition-shadow duration-200">
      <Link href={detailHref}>
        <div className="relative overflow-hidden cursor-pointer" style={{ backgroundColor: p.cardBg, height: "320px" }}>
          {p.badge && (
            <span className="absolute top-3 left-3 z-10 bg-[oklch(0.35_0.15_260)] text-white text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full shadow-md">
              {p.badge}
            </span>
          )}
          <img
            src={p.img}
            alt={`${p.name} ${p.dose} research peptide vial`}
            className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      </Link>
      <div className="bg-white px-5 pt-4 pb-5">
        <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-[oklch(0.52_0.01_260)] mb-1">{p.category}</p>
        <div className="flex items-baseline gap-2 mb-1">
          <h3 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)]">{p.name}</h3>
          <span className="text-[0.8125rem] font-semibold text-[oklch(0.52_0.01_260)]">{p.dose}</span>
        </div>
        <p className="text-[0.6875rem] font-mono text-[oklch(0.60_0.01_260)] mb-3">LOT: {p.lot}</p>
        <p className="text-[0.8125rem] text-[oklch(0.40_0.01_260)] leading-relaxed mb-4 line-clamp-2">{p.description}</p>
        <div className="flex items-center justify-between">
          <span className="text-[1.25rem] font-bold text-[oklch(0.13_0.01_260)]">${p.price}</span>
          <div className="flex items-center gap-2">
            <a
              href={`/coa-library#${p.cartCode}`}
              className="flex items-center gap-1 text-[0.75rem] font-semibold text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)] transition-colors"
            >
              <FileText className="w-3.5 h-3.5" /> COA
            </a>
            <button
              onClick={handleAdd}
              className={`text-[0.8125rem] py-2 px-4 rounded-full font-semibold transition-all duration-200 active:scale-95 ${
                added ? "bg-[oklch(0.40_0.14_155)] text-white" : "btn-primary"
              }`}
            >
              {added ? <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Added</span> : "Add to Cart"}
            </button>
          </div>
        </div>
      </div>
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
        {/* Right: product vials on light background */}
        <div className="relative order-1 lg:order-2 flex items-end justify-center pb-0 pt-4 overflow-visible z-10" style={{backgroundColor: '#f0f4f0'}}>
          <div className="relative flex items-end justify-center px-2 w-full max-w-[780px] mb-[-60px]">
            <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2 w-[85%] h-[35%] rounded-full bg-black/50 blur-3xl pointer-events-none" />
            <div className="relative flex-shrink-0 w-[36%] z-10 vial-float-a mr-[-40px]" style={{transform: 'rotate(-8deg)', transformOrigin: 'bottom center'}}>
              <img src="/manus-storage/ghkcu-50mg_e2f27368.png" alt="GHK-Cu 50mg research peptide vial" className="w-full object-contain drop-shadow-2xl" />
            </div>
            <div className="relative flex-shrink-0 w-[46%] z-20 vial-float-b">
              <img src="/manus-storage/glp3-20mg_781f3c53.png" alt="GLP-3 (R) 20mg research peptide vial" className="w-full object-contain drop-shadow-2xl" />
            </div>
            <div className="relative flex-shrink-0 w-[36%] z-10 vial-float-c ml-[-40px]" style={{transform: 'rotate(8deg)', transformOrigin: 'bottom center'}}>
              <img src="/manus-storage/nad-500mg_06819761.png" alt="NAD+ 500mg research peptide vial" className="w-full object-contain drop-shadow-2xl" />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          2. GUARANTEE STRIP — 3 trust pillars
      ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-[oklch(0.13_0.02_260)] text-white">
        <div className="container">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
            {[
              {
                icon: <Shield className="w-5 h-5" />,
                title: "≥99% Purity Guaranteed",
                body: "Every batch independently verified by HPLC and mass spectrometry at accredited US labs.",
              },
              {
                icon: <FileText className="w-5 h-5" />,
                title: "COA with Every Order",
                body: "Full Certificate of Analysis included with every shipment. Download anytime from our public library.",
              },
              {
                icon: <Truck className="w-5 h-5" />,
                title: "Next-Day US Shipping",
                body: "Orders placed before 1pm EST ship same business day. Free shipping + BAC Water over $150.",
              },
            ].map((pillar) => (
              <div key={pillar.title} className="flex items-start gap-4 px-8 py-7">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-[oklch(0.75_0.12_260)]">
                  {pillar.icon}
                </div>
                <div>
                  <p className="text-[0.9375rem] font-bold mb-1 leading-snug">{pillar.title}</p>
                  <p className="text-[0.8125rem] text-white/55 leading-relaxed">{pillar.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          3. PRODUCT SHOWCASE — featured products with dose selectors
      ═══════════════════════════════════════════════════════════════ */}
      <section className="py-20 bg-white">
        <div className="container">
          <div className="flex items-end justify-between mb-10">
            <h2 className="text-[2.25rem] font-bold tracking-tight text-[oklch(0.13_0.01_260)]">Featured Products</h2>
            <Link href="/shop" className="hidden sm:flex items-center gap-1.5 text-[0.875rem] font-semibold text-[oklch(0.40_0.16_260)] hover:underline">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Retatrutide — dose selector */}
            <DoseSelectorCard
              name="Retatrutide GLP-3 (R)"
              category="Metabolic Research"
              description="GLP-1/GIP/Glucagon triple receptor agonist studied for metabolic pathway modulation in preclinical models."
              cardBg="#f5e8e8"
              variants={retatrutideVariants}
              badge="Best Seller"
              detailHref="/shop/retatrutide"
              fixedLot="A003"
            />
            {/* GHK-Cu — dose selector */}
            <DoseSelectorCard
              name="GHK-Cu"
              category="Cosmetic / Tissue Research"
              description="Glycyl-L-histidyl-L-lysine copper(II) complex studied for tissue remodeling and extracellular matrix research."
              cardBg="#e0f0ec"
              variants={ghkcuVariants}
              detailHref="/shop/ghkcu"
              fixedLot="B031"
            />
            {/* NAD+ and BAC Water — static cards */}
            {staticProducts.map((p) => (
              <StaticCard key={p.id} p={p} detailHref={`/shop/${p.id}`} />
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
          <div className="flex flex-wrap gap-8 mb-12">
            <div><p className="text-[2.5rem] font-bold">99%+</p><p className="text-[0.8125rem] text-white/60 uppercase tracking-widest">Purity Guaranteed</p></div>
            <div><p className="text-[2.5rem] font-bold">5</p><p className="text-[0.8125rem] text-white/60 uppercase tracking-widest">Quality Checks</p></div>
            <div><p className="text-[2.5rem] font-bold">100%</p><p className="text-[0.8125rem] text-white/60 uppercase tracking-widest">US Verified</p></div>
          </div>
          <h2 className="text-[2rem] font-bold mb-10">Quality you can verify, not just trust</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <div className="flex flex-wrap gap-2 mb-8">
                {qualityTabs.map((t, i) => (
                  <button key={t.label} onClick={() => setActiveTab(i)}
                    className={`px-4 py-2 rounded-full text-[0.8125rem] font-semibold transition-colors ${activeTab === i ? "bg-white text-[oklch(0.13_0.01_260)]" : "bg-white/10 text-white/70 hover:bg-white/20"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
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
            <div className="flex items-center justify-center">
              <img src="/manus-storage/studio-ghkcu-50mg_83686b23.png" alt="GHK-Cu research peptide vial — 99%+ purity, third-party tested" className="max-h-80 object-contain drop-shadow-2xl" />
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
            Have more questions? <a href="mailto:hello@vitumlab.com" className="text-[oklch(0.40_0.16_260)] hover:underline">Contact us</a>
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

// ─── FaqItem ──────────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[oklch(0.91_0.004_260)]">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-5 text-left gap-4">
        <span className="text-[1rem] font-semibold text-[oklch(0.13_0.01_260)] leading-snug">{q}</span>
        {open ? <ChevronUp className="w-5 h-5 flex-shrink-0 text-[oklch(0.52_0.01_260)]" /> : <ChevronDown className="w-5 h-5 flex-shrink-0 text-[oklch(0.52_0.01_260)]" />}
      </button>
      {open && <p className="pb-5 text-[0.9375rem] text-[oklch(0.40_0.01_260)] leading-relaxed">{a}</p>}
    </div>
  );
}
