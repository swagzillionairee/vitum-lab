import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ShieldCheck,
  Truck,
  FileCheck,
  ArrowRight,
  ChevronRight,
  Download,
  FlaskConical,
  Microscope,
  Award,
} from "lucide-react";

const FOXY_STORE = "vitum-lab.foxycart.com";

// ─── Product data ─────────────────────────────────────────────────────────────
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

const guarantees = [
  {
    icon: <ShieldCheck className="w-7 h-7" />,
    title: "≥99% Purity Guaranteed",
    sub: "Every batch verified by third-party HPLC analysis.",
  },
  {
    icon: <FileCheck className="w-7 h-7" />,
    title: "COA with Every Order",
    sub: "Downloadable Certificate of Analysis — no request needed.",
  },
  {
    icon: <FlaskConical className="w-7 h-7" />,
    title: "US-Sourced & Tested",
    sub: "Synthesized and verified by domestic accredited labs.",
  },
  {
    icon: <Truck className="w-7 h-7" />,
    title: "Discreet Cold-Chain Shipping",
    sub: "Temperature-controlled packaging on every shipment.",
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
      { threshold: 0.08 }
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
    <div className="product-card bg-white border border-[oklch(0.90_0.006_255)] rounded-lg overflow-hidden flex flex-col">
      <div className="relative bg-[oklch(0.97_0.003_255)] flex items-center justify-center p-8 aspect-square">
        <img
          src={product.image}
          alt={`${product.name} ${product.size} research peptide vial`}
          className="w-full h-full object-contain max-h-52"
        />
        <span className="absolute top-3 left-3 bg-[oklch(0.18_0.04_255)] text-white text-[0.625rem] font-semibold tracking-widest uppercase px-2 py-1 rounded-full">
          {product.badge}
        </span>
      </div>

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

        <div className="research-disclaimer mb-4 text-[0.625rem]">
          Research Use Only — Not for Human Consumption
        </div>

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
            <a href={foxyUrl} className="btn-cobalt text-xs py-2 px-4">
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

  const heroRef    = useReveal();
  const guaranteeRef = useReveal();
  const productsRef  = useReveal();
  const featureRef   = useReveal();

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) { setSubscribed(true); setEmail(""); }
  };

  return (
    <div className="min-h-screen bg-white">

      {/* ── SECTION 1: HERO (split, Amino Club style) ──────────────────────── */}
      <section className="min-h-[calc(100vh-120px)] grid grid-cols-1 lg:grid-cols-2">

        {/* LEFT — text panel */}
        <div className="flex flex-col justify-center px-8 sm:px-12 lg:px-16 xl:px-24 py-20 bg-white order-2 lg:order-1">
          <div ref={heroRef} className="reveal max-w-lg">
            <span className="section-label block mb-5">Research Grade Peptides</span>

            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-bold text-[oklch(0.12_0.04_255)] leading-[1.05] tracking-tight mb-6">
              Research Peptides
              <br />
              You Can Trust.
            </h1>

            <p className="text-base sm:text-lg text-[oklch(0.45_0.02_255)] leading-relaxed mb-8">
              Research-grade peptides with Certificate of Analysis on every
              batch. ≥99% identity purity, independently third-party tested.
            </p>

            <div className="flex flex-wrap gap-4 mb-12">
              <Link
                href="/shop"
                className="btn-primary inline-flex items-center gap-2 rounded-full"
              >
                Browse Catalog <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/coa-library"
                className="btn-outline inline-flex items-center gap-2 rounded-full"
              >
                <FileCheck className="w-4 h-4" />
                COA Library
              </Link>
            </div>

            <div className="flex gap-10">
              {[
                { value: "≥99%", label: "Identity Purity" },
                { value: "3rd Party", label: "Independently Tested" },
                { value: "US-Based", label: "Domestic Sourcing" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="text-2xl font-bold text-[oklch(0.12_0.04_255)]">{s.value}</div>
                  <div className="text-xs text-[oklch(0.55_0.02_255)] font-medium tracking-wide uppercase mt-0.5">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — floating vials panel */}
        <div
          className="relative flex items-center justify-center order-1 lg:order-2 py-16 lg:py-0 min-h-[420px]"
          style={{ background: "oklch(0.96 0.006 255)" }}
        >
          {/* Subtle radial glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 60% 50%, oklch(0.88 0.03 260 / 0.35) 0%, transparent 80%)",
            }}
          />

          {/* Two floating vials */}
          <div className="relative z-10 flex items-end gap-6 sm:gap-10">
            {/* Vial 1 — Retatrutide GLP-3 */}
            <div className="vial-float w-40 sm:w-52 xl:w-60 drop-shadow-2xl">
              <img
                src="/manus-storage/product-retatrutide_5afcd50b.png"
                alt="Retatrutide GLP-3 research peptide"
                className="w-full h-full object-contain"
              />
            </div>

            {/* Vial 2 — GHK-Cu (offset lower) */}
            <div className="vial-float-delayed w-32 sm:w-44 xl:w-52 drop-shadow-2xl mb-[-2rem]">
              <img
                src="/manus-storage/product-ghk-cu_4239b927.png"
                alt="GHK-Cu research peptide"
                className="w-full h-full object-contain"
              />
            </div>
          </div>

          {/* Research disclaimer badge */}
          <div className="absolute bottom-6 right-6 bg-white/80 backdrop-blur-sm border border-white rounded-xl px-4 py-2 shadow-md text-[0.65rem] font-semibold text-[oklch(0.40_0.02_255)] uppercase tracking-widest">
            Research Use Only
          </div>
        </div>
      </section>

      {/* ── SECTION 2: THE VITUM LAB GUARANTEE ─────────────────────────────── */}
      <section className="py-20 bg-white border-t border-[oklch(0.92_0.006_255)]">
        <div className="container">
          <div ref={guaranteeRef} className="reveal">
            <div className="text-center mb-14">
              <span className="section-label block mb-3">Our Promise</span>
              <h2 className="text-3xl sm:text-4xl font-bold text-[oklch(0.12_0.04_255)]">
                The Vitum Lab Guarantee
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {guarantees.map((g, i) => (
                <div
                  key={g.title}
                  className="flex flex-col items-start gap-4"
                  style={{ transitionDelay: `${i * 70}ms` }}
                >
                  <div className="p-3 rounded-xl bg-[oklch(0.95_0.01_260)] text-[oklch(0.30_0.15_260)]">
                    {g.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-[oklch(0.12_0.04_255)] mb-1 text-base leading-snug">
                      {g.title}
                    </h3>
                    <p className="text-sm text-[oklch(0.50_0.02_255)] leading-relaxed">
                      {g.sub}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: FEATURED PRODUCTS ────────────────────────────────────── */}
      <section className="py-20 bg-[oklch(0.97_0.003_255)]">
        <div className="container">
          <div ref={productsRef} className="reveal">
            <div className="flex items-end justify-between mb-12">
              <div>
                <span className="section-label block mb-2">Our Catalog</span>
                <h2 className="text-3xl sm:text-4xl font-bold text-[oklch(0.12_0.04_255)]">
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
              <Link href="/shop" className="btn-outline inline-flex items-center gap-2 rounded-full">
                View All Products <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 4: GHK-CU FEATURE (left vial, right text) ──────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 min-h-[560px]">

        {/* LEFT — large GHK-Cu vial */}
        <div
          className="relative flex items-center justify-center py-20 lg:py-0 min-h-[400px]"
          style={{ background: "oklch(0.96 0.006 255)" }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 60% at 40% 55%, oklch(0.85 0.04 220 / 0.30) 0%, transparent 75%)",
            }}
          />
          <div className="relative z-10 w-56 sm:w-72 xl:w-80 drop-shadow-2xl">
            <img
              src="/manus-storage/product-ghk-cu_4239b927.png"
              alt="GHK-Cu 100mg copper peptide research vial"
              className="w-full h-full object-contain"
            />
          </div>

          {/* COA badge */}
          <div className="absolute bottom-8 left-8 bg-white border border-[oklch(0.90_0.006_255)] rounded-xl px-5 py-3 shadow-lg flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-[oklch(0.35_0.15_260)] flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-[oklch(0.12_0.04_255)]">COA Verified</p>
              <p className="text-[0.625rem] text-[oklch(0.55_0.02_255)] font-mono">
                Third-party tested · Lot: B002
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT — mission text */}
        <div className="flex flex-col justify-center px-8 sm:px-12 lg:px-16 xl:px-24 py-20 bg-white">
          <div ref={featureRef} className="reveal max-w-lg">
            <span className="section-label block mb-4">Quality You Can Verify</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-[oklch(0.12_0.04_255)] leading-tight mb-5">
              Documented quality for research and laboratory use.
            </h2>
            <p className="text-base text-[oklch(0.45_0.02_255)] leading-relaxed mb-5">
              Vitum Lab was founded on a straightforward principle: researchers
              deserve transparent documentation for every compound they work with.
              We source, synthesize, and independently verify each product through
              accredited US laboratories before it ships.
            </p>
            <p className="text-base text-[oklch(0.45_0.02_255)] leading-relaxed mb-8">
              Every vial ships with a Certificate of Analysis confirming identity
              and purity. No ambiguity — just documented quality for serious
              research.
            </p>

            <div className="grid grid-cols-2 gap-5 mb-10">
              {[
                { value: "≥99%", label: "Identity Purity" },
                { value: "HPLC", label: "Verification Method" },
                { value: "US Labs", label: "Third-Party Testing" },
                { value: "Batch COA", label: "Every Shipment" },
              ].map((stat) => (
                <div key={stat.label} className="border-l-2 border-[oklch(0.35_0.15_260)] pl-4">
                  <div className="text-xl font-bold text-[oklch(0.12_0.04_255)]">{stat.value}</div>
                  <div className="text-xs text-[oklch(0.55_0.02_255)] font-medium tracking-wide uppercase mt-0.5">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-4">
              <Link href="/shop" className="btn-primary inline-flex items-center gap-2 rounded-full">
                Browse Products <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/about" className="btn-outline inline-flex items-center gap-2 rounded-full">
                About Vitum Lab
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── NEWSLETTER ───────────────────────────────────────────────────────── */}
      <section className="py-16 bg-[oklch(0.18_0.04_255)]">
        <div className="container max-w-2xl mx-auto text-center">
          <span className="section-label text-[oklch(0.60_0.10_260)] block mb-3">
            Research Updates
          </span>
          <h2 className="text-2xl font-bold text-white mb-3">
            Stay current with new compounds and COA releases.
          </h2>
          <p className="text-sm text-white/60 mb-8">
            New product announcements, batch COA releases, and research literature
            updates. No spam — unsubscribe anytime.
          </p>

          {subscribed ? (
            <div className="flex items-center justify-center gap-2 text-[oklch(0.65_0.12_260)] font-semibold">
              <ShieldCheck className="w-5 h-5" />
              You're subscribed. Thank you.
            </div>
          ) : (
            <form
              onSubmit={handleSubscribe}
              className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="flex-1 bg-white/10 border border-white/20 text-white placeholder:text-white/40 text-sm px-4 py-3 rounded-full focus:outline-none focus:border-[oklch(0.50_0.15_260)] transition-colors"
              />
              <button type="submit" className="btn-cobalt whitespace-nowrap rounded-full">
                Subscribe
              </button>
            </form>
          )}

          <p className="mt-4 text-[0.6875rem] text-white/30">
            By subscribing you confirm you are a researcher. Research use only.
          </p>
        </div>
      </section>

    </div>
  );
}
