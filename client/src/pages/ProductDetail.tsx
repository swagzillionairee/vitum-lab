/*
 * ProductDetail.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Full product detail page with image, dose selector, specs, and Add to Cart
 */

import { useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, FileText, Check, ChevronDown, ChevronUp, ShieldCheck, Truck, FlaskConical } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { getProductBySlug } from "@/lib/products";
import ReconstitutionCalculator from "@/components/ReconstitutionCalculator";
import SEO from "@/components/SEO";

export default function ProductDetail() {
  const [, params] = useRoute("/shop/:slug");
  const slug = params?.slug ?? "";
  const product = getProductBySlug(slug);

  const { addItem } = useCart();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(true);
  const [storageOpen, setStorageOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  if (!product) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-[2rem] font-bold text-[oklch(0.13_0.01_260)] mb-3">Product not found</h1>
        <p className="text-[oklch(0.52_0.01_260)] mb-6">The product you're looking for doesn't exist or has been removed.</p>
        <Link href="/shop" className="btn-primary">← Back to Shop</Link>
      </div>
    );
  }

  const selected = product.variants[selectedIdx];

  const handleAdd = () => {
    addItem({
      id: selected.id,
      name: product.name,
      dose: selected.dose,
      price: selected.price,
      img: selected.img,
      cartCode: selected.cartCode,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="min-h-screen bg-white">
      <SEO
        title={product.name}
        description={`${product.fullName} — ${product.tagline}. ≥99% purity, third-party COA tested. For research use only.`}
      />

      {/* ── Breadcrumb ───────────────────────────────────────────────── */}
      <div className="border-b border-[oklch(0.93_0.004_260)]">
        <div className="container py-3 flex items-center gap-2 text-[0.8125rem] text-[oklch(0.52_0.01_260)]">
          <Link href="/shop" className="hover:text-[oklch(0.13_0.01_260)] transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Shop
          </Link>
          <span>/</span>
          <span className="text-[oklch(0.13_0.01_260)] font-semibold">{product.name}</span>
        </div>
      </div>

      <div className="container py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">

          {/* ── Product image ─────────────────────────────────────────── */}
          <div
            className="rounded-3xl overflow-hidden aspect-square w-full"
            style={{ backgroundColor: product.cardBg }}
          >
            <img
              key={selected.img}
              src={selected.img}
              alt={`${product.name} ${selected.dose} research peptide vial`}
              className="w-full h-full object-cover transition-opacity duration-200"
            />
          </div>

          {/* ── Product info ──────────────────────────────────────────── */}
          <div className="lg:sticky lg:top-24">

            {/* Category + badge */}
            <div className="flex items-center gap-2 mb-3">
              <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-[oklch(0.52_0.01_260)]">
                {product.category}
              </p>
              {product.badge && (
                <span className={`text-[0.625rem] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full ${
                  product.badge === "Best Seller"
                    ? "bg-[#1a3a2a] text-white"
                    : product.badge === "Out of Stock"
                    ? "bg-[oklch(0.45_0.01_260)] text-white"
                    : "bg-[oklch(0.35_0.15_260)] text-white"
                }`}>
                  {product.badge === "Best Seller" ? "★ " : ""}{product.badge}
                </span>
              )}
            </div>

            <h1 className="text-[2rem] sm:text-[2.25rem] font-bold text-[oklch(0.13_0.01_260)] leading-tight mb-2">
              {product.name}
            </h1>
            <p className="text-[0.875rem] text-[oklch(0.52_0.01_260)] mb-4">{product.tagline}</p>
            <p className="text-[0.9375rem] text-[oklch(0.40_0.01_260)] leading-relaxed mb-6">
              {product.longDescription}
            </p>

            {/* Dose selector (only if multiple variants) */}
            {product.variants.length > 1 && (
              <div className="mb-5">
                <p className="text-[0.8125rem] font-semibold text-[oklch(0.40_0.01_260)] mb-2">Select Dose</p>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((v, i) => (
                    <button
                      key={v.dose}
                      onClick={() => setSelectedIdx(i)}
                      className={`px-5 py-2.5 rounded-full border text-[0.875rem] font-semibold transition-colors duration-150 ${
                        i === selectedIdx
                          ? "bg-[oklch(0.13_0.01_260)] dark:bg-[oklch(0.40_0.16_260)] text-white border-[oklch(0.13_0.01_260)] dark:border-[oklch(0.40_0.16_260)]"
                          : "bg-white dark:bg-[oklch(0.18_0.02_260)] text-[oklch(0.40_0.01_260)] dark:text-[oklch(0.80_0.01_260)] border-[oklch(0.88_0.004_260)] dark:border-[oklch(0.28_0.02_260)] hover:border-[oklch(0.60_0.01_260)]"
                      }`}
                    >
                      {v.dose}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Lot number */}
            <p className="text-[0.75rem] font-mono text-[oklch(0.60_0.01_260)] mb-6">
              LOT: {selected.lot}
            </p>

            {/* Price + Add to Cart */}
            <div className="flex items-center gap-5 mb-6">
              <span className="text-[2rem] font-bold text-[oklch(0.13_0.01_260)]">${selected.price}</span>
              <button
                onClick={handleAdd}
                className={`flex-1 py-3.5 rounded-full font-semibold text-[0.9375rem] transition-all duration-200 active:scale-95 ${
                  added
                    ? "bg-[oklch(0.40_0.14_155)] text-white"
                    : "btn-primary"
                }`}
              >
                {added ? (
                  <span className="flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> Added to Cart
                  </span>
                ) : (
                  "Add to Cart"
                )}
              </button>
            </div>

            {/* COA link */}
            {product.coaHref !== "/coa-library#bacwater" && (
              <a
                href={product.coaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[0.875rem] font-semibold text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)] transition-colors mb-8"
              >
                <FileText className="w-4 h-4" /> View Certificate of Analysis
              </a>
            )}

            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { icon: <ShieldCheck className="w-4 h-4" />, label: "≥99% Purity" },
                { icon: <FlaskConical className="w-4 h-4" />, label: "3rd-Party Tested" },
                { icon: <Truck className="w-4 h-4" />, label: "USPS Priority Mail" },
              ].map((b) => (
                <div key={b.label} className="flex flex-col items-center gap-1.5 bg-[oklch(0.97_0.003_260)] rounded-xl py-3 px-2 text-center">
                  <span className="text-[oklch(0.40_0.16_260)]">{b.icon}</span>
                  <span className="text-[0.6875rem] font-semibold text-[oklch(0.40_0.01_260)]">{b.label}</span>
                </div>
              ))}
            </div>

            {/* Accordion: Specs */}
            <div className="border-t border-[oklch(0.91_0.004_260)]">
              <button
                onClick={() => setSpecsOpen(!specsOpen)}
                className="w-full flex items-center justify-between py-4 text-left"
              >
                <span className="text-[0.9375rem] font-semibold text-[oklch(0.13_0.01_260)]">Specifications</span>
                {specsOpen ? <ChevronUp className="w-4 h-4 text-[oklch(0.52_0.01_260)]" /> : <ChevronDown className="w-4 h-4 text-[oklch(0.52_0.01_260)]" />}
              </button>
              {specsOpen && (
                <div className="pb-4">
                  <table className="w-full text-[0.875rem]">
                    <tbody>
                      {product.specs.map((s) => (
                        <tr key={s.label} className="border-t border-[oklch(0.95_0.003_260)]">
                          <td className="py-2.5 pr-4 text-[oklch(0.52_0.01_260)] font-medium w-1/2">{s.label}</td>
                          <td className="py-2.5 text-[oklch(0.13_0.01_260)] font-semibold">{s.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Accordion: Storage */}
            <div className="border-t border-[oklch(0.91_0.004_260)]">
              <button
                onClick={() => setStorageOpen(!storageOpen)}
                className="w-full flex items-center justify-between py-4 text-left"
              >
                <span className="text-[0.9375rem] font-semibold text-[oklch(0.13_0.01_260)]">Storage & Handling</span>
                {storageOpen ? <ChevronUp className="w-4 h-4 text-[oklch(0.52_0.01_260)]" /> : <ChevronDown className="w-4 h-4 text-[oklch(0.52_0.01_260)]" />}
              </button>
              {storageOpen && (
                <div className="pb-4 space-y-2">
                  <p className="text-[0.875rem] text-[oklch(0.40_0.01_260)] leading-relaxed">{product.storageInstructions}</p>
                  {product.reconstitutionNote && (
                    <p className="text-[0.875rem] text-[oklch(0.40_0.01_260)] leading-relaxed">
                      <span className="font-semibold text-[oklch(0.13_0.01_260)]">Reconstitution: </span>
                      {product.reconstitutionNote}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Accordion: Research Notes */}
            <div className="border-t border-b border-[oklch(0.91_0.004_260)]">
              <button
                onClick={() => setNotesOpen(!notesOpen)}
                className="w-full flex items-center justify-between py-4 text-left"
              >
                <span className="text-[0.9375rem] font-semibold text-[oklch(0.13_0.01_260)]">Research Notes</span>
                {notesOpen ? <ChevronUp className="w-4 h-4 text-[oklch(0.52_0.01_260)]" /> : <ChevronDown className="w-4 h-4 text-[oklch(0.52_0.01_260)]" />}
              </button>
              {notesOpen && (
                <div className="pb-4">
                  <ul className="space-y-2">
                    {product.researchNotes.map((note) => (
                      <li key={note} className="flex items-start gap-2 text-[0.875rem] text-[oklch(0.40_0.01_260)]">
                        <Check className="w-3.5 h-3.5 text-[oklch(0.40_0.16_260)] flex-shrink-0 mt-0.5" />
                        {note}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-[0.75rem] text-[oklch(0.65_0.01_260)] italic">
                    For in vitro / laboratory research use only. Not for human or veterinary use.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ── Reconstitution Calculator ─────────────────────────────────── */}
      {product.reconstitutionNote && (
        <section className="py-12 bg-[oklch(0.975_0.003_260)]">
          <div className="container max-w-3xl">
            <ReconstitutionCalculator
              peptideMg={parseFloat(selected.dose.replace(/[^0-9.]/g, "")) || 10}
            />
          </div>
        </section>
      )}
    </div>
  );
}
