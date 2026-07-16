/*
 * Shop.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Full product catalog with all variants:
 *   - Retatrutide GLP-3 (R): 10mg, 20mg, 30mg
 *   - GHK-Cu: 50mg, 100mg
 *   - NAD+: 500mg
 *   - BAC Water: 10mL
 * Features: category filter tabs, product cards with Added✓ feedback,
 *   floating View Cart button, product detail page links
 */

import { useState, useEffect } from "react";
import { Link } from "wouter";
import { FileText, ShieldCheck, Truck, ArrowLeft, ShoppingCart, Check } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { AnimatePresence, motion } from "framer-motion";
import SEO from "@/components/SEO";
import { useProducts } from "@/hooks/useProducts";
import { useInventory } from "@/hooks/useInventory";
import { coaLibraryHref } from "@/lib/products";

// ─── Slug → categorySlug mapping ─────────────────────────────────────────────
const CATEGORY_SLUG_MAP: Record<string, string> = {
  "Metabolic Research": "metabolic",
  "Cosmetic / Tissue Research": "tissue",
  "Cellular Research": "cellular",
  "Reconstitution": "reconstitution",
};

const categories = [
  { slug: "all", label: "All Products" },
  { slug: "metabolic", label: "Metabolic Research" },
  { slug: "tissue", label: "Tissue Research" },
  { slug: "cellular", label: "Cellular Research" },
  { slug: "reconstitution", label: "Reconstitution" },
];

// URL param aliases (e.g. footer sends "cosmetic" but slug is "tissue")
const CATEGORY_ALIASES: Record<string, string> = {
  cosmetic: "tissue",
};

const BADGE_STYLES: Record<string, string> = {
  "Best Seller": "bg-[#1a3a2a] text-white",
  "New": "bg-[oklch(0.35_0.15_260)] text-white",
};

type FlatProduct = {
  id: string; name: string; dose: string; lot: string; price: number;
  salePrice?: number; category: string; categorySlug: string; tagline: string;
  description: string; img: string; cardBg: string; cartCode: string;
  badge: string | null; detailSlug: string;
};

// ─── Product card with Added✓ feedback ───────────────────────────────────────
function ProductCard({ p }: { p: FlatProduct }) {
  const { addItem } = useCart();
  const { isAvailable, stockLabel } = useInventory();
  const [added, setAdded] = useState(false);

  const available = isAvailable(p.cartCode);
  const label = stockLabel(p.cartCode);

  const handleAdd = () => {
    if (!available) return;
    addItem({ id: p.id, name: p.name, dose: p.dose, price: p.salePrice ?? p.price, img: p.img, cartCode: p.cartCode });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_4px_oklch(0.13_0.01_260/0.07)] group hover:shadow-[0_4px_16px_oklch(0.13_0.01_260/0.12)] transition-shadow duration-200 flex flex-col h-full">
      {/* Image area — links to product detail */}
      <Link href={`/shop/${p.detailSlug}`}>
        <div className="relative overflow-hidden cursor-pointer" style={{ backgroundColor: p.cardBg, height: "280px" }}>
          {p.badge && (
            <span className={`absolute top-3 left-3 z-10 text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full shadow-md ${BADGE_STYLES[p.badge] ?? "bg-gray-800 text-white"}`}>
              {p.badge === "Best Seller" ? "★ " : ""}{p.badge}
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

      {/* Info area */}
      <div className="px-5 pt-4 pb-5 flex-1 flex flex-col">
        <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-[oklch(0.52_0.01_260)] mb-1">{p.category}</p>
        <div className="flex items-baseline gap-2 mb-0.5">
          <h3 className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)] leading-tight">{p.name}</h3>
          <span className="text-[0.8125rem] font-semibold text-[oklch(0.52_0.01_260)] flex-shrink-0">{p.dose}</span>
        </div>
        <p className="text-[0.6875rem] font-mono text-[oklch(0.60_0.01_260)] mb-2">LOT: {p.lot}</p>
        <p className="text-[0.8125rem] text-[oklch(0.40_0.01_260)] leading-relaxed mb-4 line-clamp-2">{p.description}</p>

        <div className="space-y-3 mt-auto">
          {/* Price */}
          <div>
            {p.salePrice != null ? (
              <div className="flex items-baseline gap-2">
                <span className="text-[1.25rem] font-bold text-[oklch(0.50_0.18_25)]">${p.salePrice}</span>
                <span className="text-[0.875rem] line-through text-[oklch(0.60_0.01_260)]">${p.price}</span>
              </div>
            ) : (
              <span className="text-[1.25rem] font-bold text-[oklch(0.13_0.01_260)]">${p.price}</span>
            )}
            {label && available && (
              <p className="text-[0.6875rem] text-amber-600 font-semibold mt-0.5">{label}</p>
            )}
          </div>
          {/* COA + Add to Cart (own row so they never overlap the price) */}
          <div className="flex items-center justify-between gap-2">
            <a
              href={coaLibraryHref(p.cartCode)}
              className="flex items-center gap-1 text-[0.75rem] font-semibold text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)] transition-colors flex-shrink-0"
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
                {added ? (
                  <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Added</span>
                ) : (
                  "Add to Cart"
                )}
              </button>
            ) : (
              <span className="text-[0.8125rem] py-2 px-4 rounded-full font-semibold bg-[oklch(0.93_0.003_260)] text-[oklch(0.52_0.01_260)]">
                Out of Stock
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Shop page ───────────────────────────────────────────────────────────
export default function Shop() {
  const { totalItems, openCart } = useCart();
  const { products } = useProducts();
  const [activeCategory, setActiveCategory] = useState("all");

  const allProducts: FlatProduct[] = products.flatMap((product) =>
    product.variants.map((variant, idx) => ({
      id: variant.id,
      name: product.name,
      dose: variant.dose,
      lot: variant.lot,
      price: variant.price,
      salePrice: variant.salePrice,
      category: product.category,
      categorySlug: CATEGORY_SLUG_MAP[product.category] ?? "other",
      tagline: product.tagline,
      description: product.description,
      img: variant.img,
      cardBg: product.cardBg,
      cartCode: variant.cartCode,
      badge: idx === 0 && product.badge ? product.badge : null,
      detailSlug: product.slug,
    }))
  );

  // Read ?category= URL param on mount so footer links filter correctly
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("category");
    if (cat) {
      const normalized = CATEGORY_ALIASES[cat.toLowerCase()] ?? cat.toLowerCase();
      const match = categories.find((c) => c.slug.toLowerCase() === normalized);
      if (match) setActiveCategory(match.slug);
    }
  }, []);

  const filtered =
    activeCategory === "all"
      ? allProducts
      : allProducts.filter((p) => p.categorySlug === activeCategory);

  return (
    <div className="min-h-screen bg-page">
      <SEO title="Shop" description="Browse Vitum Lab's full catalog of research peptides: GLP-3 (R) 10/20/30mg, GHK-Cu 50/100mg, NAD+ 500mg, and BAC Water 10mL. ≥99% purity guaranteed." />

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="page-hero-tint border-b border-[oklch(0.91_0.004_260)]">
        <div className="container py-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)] transition-colors mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
          </Link>
          <h1 className="text-[2.5rem] font-bold tracking-tight text-[oklch(0.13_0.01_260)] mb-2">
            Research Catalog
          </h1>
          <p className="text-[oklch(0.52_0.01_260)] text-[0.9375rem] max-w-xl">
            All peptides are lyophilized, ≥99% purity by HPLC, and supplied with
            third-party certificates of analysis. For in vitro / laboratory research
            use only.
          </p>
        </div>
      </div>

      {/* ── Trust strip ──────────────────────────────────────────────────── */}
      <div className="bg-[oklch(0.14_0.03_260)] text-white">
        <div className="container">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 py-3 text-[0.75rem] font-semibold tracking-wide">
            <span className="flex items-center gap-1.5 opacity-80">
              <ShieldCheck className="w-3.5 h-3.5" /> ≥99% Purity — HPLC Verified
            </span>
            <span className="hidden sm:block opacity-30">|</span>
            <span className="flex items-center gap-1.5 opacity-80">
              <Truck className="w-3.5 h-3.5" /> 2–5 Business-Day Delivery via USPS Ground Advantage
            </span>
            <span className="hidden sm:block opacity-30">|</span>
            <span className="flex items-center gap-1.5 opacity-80">
              <FileText className="w-3.5 h-3.5" /> COA Included with Every Order
            </span>
          </div>
        </div>
      </div>

      {/* ── Category filter tabs ──────────────────────────────────────────── */}
      <div className="bg-white border-b border-[oklch(0.91_0.004_260)]">
        <div className="container">
          <div className="flex gap-1 py-3 overflow-x-auto">
            {categories.map((c) => (
              <button
                key={c.slug}
                onClick={() => setActiveCategory(c.slug)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-[0.8125rem] font-semibold transition-colors ${
                  activeCategory === c.slug
                    ? "bg-[oklch(0.13_0.01_260)] dark:bg-[oklch(0.40_0.16_260)] text-white"
                    : "bg-[oklch(0.96_0.003_260)] dark:bg-[oklch(0.20_0.02_260)] text-[oklch(0.40_0.01_260)] dark:text-[oklch(0.80_0.01_260)] hover:bg-[oklch(0.92_0.005_260)] dark:hover:bg-[oklch(0.26_0.02_260)]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Product grid ─────────────────────────────────────────────────── */}
      <div className="container py-12">
        <p className="text-[0.8125rem] text-[oklch(0.60_0.01_260)] mb-6">
          Showing {filtered.length} product{filtered.length !== 1 ? "s" : ""}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>

        {/* ── Free shipping callout ─────────────────────────────────────── */}
        <div className="mt-14 rounded-2xl bg-[oklch(0.35_0.15_260)] text-white px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-[0.75rem] font-semibold tracking-widest uppercase opacity-70 mb-1">
              Limited Offer
            </p>
            <h3 className="text-[1.375rem] font-bold">
              Free Shipping + Free BAC Water
            </h3>
            <p className="text-[0.875rem] opacity-80 mt-1">
              Free shipping over $75; free BAC Water over $100. Shipped via USPS Ground Advantage padded envelopes.
            </p>
          </div>
          <Link
            href="/shipping-policy"
            className="flex-shrink-0 bg-white text-[oklch(0.35_0.15_260)] font-semibold text-[0.875rem] px-6 py-3 rounded-full hover:bg-white/90 transition-colors"
          >
            Shipping Details →
          </Link>
        </div>

        {/* ── Research disclaimer ───────────────────────────────────────── */}
        <p className="mt-8 text-center text-[0.6875rem] text-[oklch(0.65_0.01_260)] max-w-2xl mx-auto leading-relaxed">
          All products are sold strictly for in vitro / laboratory research purposes only.
          Not for human or veterinary use. Not for use in diagnostic procedures.
          These statements have not been evaluated by the FDA.{" "}
          <Link href="/research-disclaimer" className="underline hover:text-[oklch(0.35_0.15_260)]">
            Full disclaimer
          </Link>
          .
        </p>
      </div>

      {/* ── Floating View Cart button ─────────────────────────────────────── */}
      <AnimatePresence>
        {totalItems > 0 && (
          <motion.button
            key="floating-cart"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={openCart}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-[oklch(0.13_0.01_260)] text-white pl-4 pr-5 py-3.5 rounded-full shadow-[0_4px_20px_oklch(0.13_0.01_260/0.35)] hover:bg-[oklch(0.20_0.02_260)] active:scale-95 transition-all duration-150 font-semibold text-[0.9375rem]"
            aria-label={`View cart — ${totalItems} item${totalItems !== 1 ? "s" : ""}`}
          >
            <div className="relative">
              <ShoppingCart className="w-5 h-5" />
              <span className="absolute -top-2 -right-2 w-4.5 h-4.5 bg-[oklch(0.40_0.16_260)] text-white text-[0.625rem] font-bold rounded-full flex items-center justify-center leading-none">
                {totalItems}
              </span>
            </div>
            View Cart
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
