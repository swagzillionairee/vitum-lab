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
import { ArrowRight, CheckCircle2, Shield, FileText, ChevronDown, ChevronUp, FlaskConical, Truck, BookOpen, Check } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useInventory } from "@/hooks/useInventory";
import SEO from "@/components/SEO";
import { products } from "@/lib/products";

// ─── Product data derived from shared catalog ──────────────────────────────────
const retatrutideProduct = products.find((p) => p.slug === "retatrutide")!;
const retatrutideVariants = retatrutideProduct.variants.map((v) => ({
  dose: v.dose,
  lot: v.lot,
  price: v.price,
  img: v.img,
  cartCode: v.cartCode,
  id: v.id,
}));

const ghkcuProduct = products.find((p) => p.slug === "ghkcu")!;
const ghkcuVariants = ghkcuProduct.variants.map((v) => ({
  dose: v.dose,
  lot: v.lot,
  price: v.price,
  img: v.img,
  cartCode: v.cartCode,
  id: v.id,
}));

// Static products (no variant selector needed) — NAD+ and BAC Water
const STATIC_EXTRA: Record<string, { accentColor: string; bgTint: string }> = {
  nad: { accentColor: "oklch(0.50 0.14 50)", bgTint: "bg-tint-orange" },
  bacwater: { accentColor: "oklch(0.35 0.10 220)", bgTint: "bg-tint-blue" },
};

const staticProducts = ["nad", "bacwater"].map((slug) => {
  const p = products.find((x) => x.slug === slug)!;
  const v = p.variants[0];
  return {
    id: slug,
    name: p.name,
    dose: v.dose,
    lot: v.lot,
    price: v.price,
    category: p.category,
    tagline: p.tagline,
    description: p.description,
    img: v.img,
    accentColor: STATIC_EXTRA[slug].accentColor,
    bgTint: STATIC_EXTRA[slug].bgTint,
    cardBg: p.cardBg,
    cartCode: v.cartCode,
    badge: p.badge as string | null ?? null,
  };
});

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
    a: "Orders are shipped via USPS Priority Mail® in padded envelopes. East Coast deliveries typically arrive in 2 days; Central and West Coast deliveries typically arrive in 3 days. Delivery times are estimates and not guaranteed.",
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
    a: "Lyophilized peptides should be stored at −20°C / −4°F (freezer) for long-term storage. Once reconstituted, store at 4°C / 39°F (refrigerator) and use within 28 days. Avoid repeated freeze-thaw cycles.",
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
  const { isAvailable } = useInventory();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const selected = variants[selectedIdx];
  const available = isAvailable(selected.cartCode);

  const handleAdd = () => {
    if (!available) return;
    addItem({ id: selected.id, name, dose: selected.dose, price: selected.price, img: selected.img, cartCode: selected.cartCode });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="rounded-2xl overflow-hidden group shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] hover:shadow-[0_4px_16px_oklch(0.13_0.01_260/0.12)] transition-shadow duration-200">
      {/* Image area */}
      <Link href={detailHref}>
        <div className="relative overflow-hidden cursor-pointer" style={{ backgroundColor: cardBg, height: "320px" }}>
          {badge && badge !== "Out of Stock" && available && (
            <span className={`absolute top-3 left-3 z-10 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full shadow-md ${badge === "Best Seller" ? "bg-[#1a3a2a] text-white" : "bg-[oklch(0.35_0.15_260)] text-white"}`}>
              {badge === "Best Seller" ? "★ " : ""}{badge}
            </span>
          )}
          {!available && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
              <span className="bg-white/90 text-[oklch(0.13_0.01_260)] text-[0.75rem] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full">
                Out of Stock
              </span>
            </div>
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
            {available ? (
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
            ) : (
              <button disabled className="text-[0.8125rem] py-2 px-4 rounded-full font-semibold bg-[oklch(0.93_0.003_260)] text-[oklch(0.55_0.01_260)] cursor-not-allowed">
                Out of Stock
              </button>
            )}
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
  const { isAvailable } = useInventory();
  const [added, setAdded] = useState(false);
  const available = isAvailable(p.cartCode);

  const handleAdd = () => {
    if (!available) return;
    addItem({ id: p.id, name: p.name, dose: p.dose, price: p.price, img: p.img, cartCode: p.cartCode });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="rounded-2xl overflow-hidden group shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] hover:shadow-[0_4px_16px_oklch(0.13_0.01_260/0.12)] transition-shadow duration-200">
      <Link href={detailHref}>
        <div className="relative overflow-hidden cursor-pointer" style={{ backgroundColor: p.cardBg, height: "320px" }}>
          {p.badge && p.badge !== "Out of Stock" && available && (
            <span className="absolute top-3 left-3 z-10 bg-[oklch(0.35_0.15_260)] text-white text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full shadow-md">
              {p.badge}
            </span>
          )}
          {!available && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
              <span className="bg-white/90 text-[oklch(0.13_0.01_260)] text-[0.75rem] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full">
                Out of Stock
              </span>
            </div>
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
            {available ? (
              <button
                onClick={handleAdd}
                className={`text-[0.8125rem] py-2 px-4 rounded-full font-semibold transition-all duration-200 active:scale-95 ${
                  added ? "bg-[oklch(0.40_0.14_155)] text-white" : "btn-primary"
                }`}
              >
                {added ? <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Added</span> : "Add to Cart"}
              </button>
            ) : (
              <button disabled className="text-[0.8125rem] py-2 px-4 rounded-full font-semibold bg-[oklch(0.93_0.003_260)] text-[oklch(0.55_0.01_260)] cursor-not-allowed">
                Out of Stock
              </button>
            )}
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
      <SEO description="Vitum Lab — Research grade peptides including GLP-3 (R), GHK-Cu, and NAD+. ≥99% purity, third-party COA tested. Free shipping on orders over $150." />

      {/* ═══════════════════════════════════════════════════════════════
          1. HERO — split layout
      ═══════════════════════════════════════════════════════════════ */}
      <section className="min-h-[88vh] grid grid-cols-1 lg:grid-cols-2 overflow-x-clip">
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
                "USPS Priority Mail",
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
        <div className="relative order-1 lg:order-2 flex items-center justify-center overflow-visible lg:overflow-hidden z-0" style={{backgroundColor: '#f0f4f0'}}>
          <div className="relative flex items-end justify-center w-full px-6" style={{marginBottom: '-5%'}}>
            {/* Left vial */}
            <div className="relative flex-shrink-0 w-[48%] z-10 vial-float-a mr-[-55px] lg:mr-[-195px]" style={{transform: 'rotate(-6deg)', transformOrigin: 'bottom center'}}>
              <img src="/GHKCU%2050mg%20vial%20only.png" alt="GHK-Cu 50mg research peptide vial" className="w-full object-contain" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[55%] h-4 rounded-full bg-black/18 blur-lg pointer-events-none" />
            </div>
            {/* Centre vial */}
            <div className="relative flex-shrink-0 w-[62%] z-20 vial-float-b">
              <img src="/GLP3%2020mg%20vial%20only.png" alt="GLP-3 (R) 20mg research peptide vial" className="w-full object-contain" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[55%] h-4 rounded-full bg-black/20 blur-lg pointer-events-none" />
            </div>
            {/* Right vial */}
            <div className="relative flex-shrink-0 w-[48%] z-10 vial-float-c ml-[-55px] lg:ml-[-195px]" style={{transform: 'rotate(6deg)', transformOrigin: 'bottom center'}}>
              <img src="/nad%2B%20500mg%20vial%20only.png" alt="NAD+ 500mg research peptide vial" className="w-full object-contain" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[55%] h-4 rounded-full bg-black/18 blur-lg pointer-events-none" />
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
                title: "Fast US Shipping",
                body: "2 days avg. to East Coast, 3 days to Central & West Coast via USPS Priority Mail. Free shipping + BAC Water over $150.",
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
              name="GLP-3 (R)"
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
                title: "Fast delivery anywhere in the US",
                body: "2 days avg. to East Coast, 3 days to Central & West Coast via USPS Priority Mail. Free shipping and a complimentary 10mL BAC Water on orders over $150.",
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
      <section ref={qualityRef} className="reveal relative py-20 bg-dark-navy text-white overflow-hidden">
        {/* Vial: absolutely spans full section height, top-aligned with section padding */}
        <div className="hidden lg:flex absolute right-0 top-0 bottom-0 w-[45%] items-start justify-center py-20 pointer-events-none">
          <img src="/GHKCU%2050mg%20vial%20only.png" alt="GHK-Cu research peptide vial — 99%+ purity, third-party tested" className="h-full w-auto object-contain drop-shadow-2xl" />
        </div>
        <div className="container">
          <div className="flex flex-wrap gap-8 mb-12">
            <div><p className="text-[2.5rem] font-bold">99%+</p><p className="text-[0.8125rem] text-white/60 uppercase tracking-widest">Purity Guaranteed</p></div>
            <div><p className="text-[2.5rem] font-bold">5</p><p className="text-[0.8125rem] text-white/60 uppercase tracking-widest">Quality Checks</p></div>
            <div><p className="text-[2.5rem] font-bold">100%</p><p className="text-[0.8125rem] text-white/60 uppercase tracking-widest">US Verified</p></div>
            <div><p className="text-[2.5rem] font-bold">1,000+</p><p className="text-[0.8125rem] text-white/60 uppercase tracking-widest">Orders Shipped</p></div>
          </div>
          <h2 className="text-[2rem] font-bold mb-10">Quality you can verify, not just trust</h2>
          <div className="lg:w-[55%]">
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