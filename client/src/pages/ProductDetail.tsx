/*
 * ProductDetail.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Full product detail page with image, dose selector, specs, and Add to Cart
 */

import { useState, useEffect } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, FileText, Check, ChevronDown, ChevronUp, ShieldCheck, Truck, FlaskConical, Bell, Loader2, Minus, Plus } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/hooks/useProducts";
import { useInventory } from "@/hooks/useInventory";
import { quantityDiscountPercent, round2 } from "@/lib/discounts";
import ReconstitutionCalculator from "@/components/ReconstitutionCalculator";
import SEO from "@/components/SEO";

// ── Back-in-stock waitlist signup (shown when a variant is out of stock) ──────
function BackInStockForm({ cartCode }: { cartCode: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const submit = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setState("error"); return; }
    setState("loading");
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartCode, email: email.trim() }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.40_0.14_155)]">
        <Check className="w-4 h-4" /> You're on the list — we'll email you the moment it's back.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 max-w-md">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="you@example.com"
          className="flex-1 min-w-0 border border-[oklch(0.88_0.004_260)] rounded-full px-4 py-2.5 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)]"
        />
        <button
          onClick={submit}
          disabled={state === "loading"}
          className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full font-semibold text-[0.875rem] btn-primary disabled:opacity-60 whitespace-nowrap"
        >
          {state === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
          Notify me
        </button>
      </div>
      {state === "error" && (
        <p className="text-[0.75rem] text-red-500 mt-1.5">Please enter a valid email address.</p>
      )}
      <p className="text-[0.6875rem] text-[oklch(0.60_0.01_260)] mt-1.5">One email when this dose is restocked — nothing else.</p>
    </div>
  );
}

export default function ProductDetail() {
  const [, params] = useRoute("/shop/:slug");
  const slug = params?.slug ?? "";
  const { products } = useProducts();
  const product = products.find((p) => p.slug === slug);

  const { addItem } = useCart();
  const { session } = useAuth();
  const { isAvailable, stockDisplay } = useInventory();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [tiers, setTiers] = useState<{ min_qty: number; percent: number }[]>([]);
  const [added, setAdded] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(true);
  const [storageOpen, setStorageOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  // Quantity discount tiers (drives the "buy more, save more" selector).
  useEffect(() => {
    let stale = false;
    fetch("/api/public/site")
      .then((r) => r.json())
      .then((d) => { if (!stale) setTiers(d.quantity_tiers ?? []); })
      .catch(() => {});
    return () => { stale = true; };
  }, []);

  if (!product) {
    return (
      <div className="min-h-screen bg-page flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-[2rem] font-bold text-[oklch(0.13_0.01_260)] mb-3">Product not found</h1>
        <p className="text-[oklch(0.52_0.01_260)] mb-6">The product you're looking for doesn't exist or has been removed.</p>
        <Link href="/shop" className="btn-primary">← Back to Shop</Link>
      </div>
    );
  }

  const selected = product.variants[selectedIdx];
  const available = isAvailable(selected.cartCode);
  const stockCount = stockDisplay(selected.cartCode);
  const effectivePrice = selected.salePrice ?? selected.price;

  const tierPercent = quantityDiscountPercent(tiers, quantity);
  // Active tier = the highest tier whose min_qty ≤ quantity (so only one highlights).
  const activeMin = tiers.reduce((m, t) => (quantity >= t.min_qty && t.min_qty > m ? t.min_qty : m), 0);
  // Per-bottle price preview after the quantity-tier discount (checkout is authoritative).
  const unitPrice = tierPercent > 0 ? round2(effectivePrice * (1 - tierPercent / 100)) : effectivePrice;
  const fmtPrice = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

  const handleAdd = () => {
    if (!available) return;
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: selected.id,
        name: product.name,
        dose: selected.dose,
        price: effectivePrice,
        img: selected.img,
        cartCode: selected.cartCode,
      });
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  // schema.org Product structured data → richer results for peptide searches.
  const abs = (u: string) => (u?.startsWith("http") ? u : `https://vitumlab.com${u || ""}`);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.fullName || product.name,
    description: product.description,
    category: product.category,
    sku: selected.cartCode,
    brand: { "@type": "Brand", name: "Vitum Lab" },
    image: abs(selected.img),
    offers: product.variants.map((v) => ({
      "@type": "Offer",
      name: `${product.name} ${v.dose}`,
      price: (v.salePrice ?? v.price).toFixed(2),
      priceCurrency: "USD",
      availability: isAvailable(v.cartCode) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `https://vitumlab.com/shop/${product.slug}`,
    })),
  };

  return (
    <div className="min-h-screen bg-page">
      <SEO
        title={`${product.name} — ${product.fullName}`}
        description={`${product.fullName} — ${product.tagline}. ≥99% purity, third-party HPLC tested, COA with every order. For laboratory research use only.`}
        canonical={`https://vitumlab.com/shop/${product.slug}`}
        image={abs(selected.img)}
        ogType="product"
        jsonLd={productJsonLd}
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

            {/* Quantity + bulk-savings tiers */}
            {available && (
              <div className="mb-5">
                {tiers.length > 0 && (
                  <>
                    <p className="text-[0.8125rem] font-semibold text-[oklch(0.40_0.01_260)] mb-2">
                      Buy more, save more <span className="font-normal text-[oklch(0.55_0.01_260)]">— discount applies to your cart total at checkout</span>
                    </p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {tiers.map((t) => (
                        <button
                          key={t.min_qty}
                          onClick={() => setQuantity(t.min_qty)}
                          className={`px-4 py-2 rounded-xl border text-[0.8125rem] font-semibold transition-colors ${
                            t.min_qty === activeMin
                              ? "border-[oklch(0.40_0.16_260)] bg-[oklch(0.96_0.03_260)] text-[oklch(0.30_0.14_260)]"
                              : "border-[oklch(0.88_0.004_260)] text-[oklch(0.40_0.01_260)] hover:border-[oklch(0.60_0.01_260)]"
                          }`}
                        >
                          Buy {t.min_qty} · save {t.percent}%
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex items-center gap-3">
                  <span className="text-[0.8125rem] font-semibold text-[oklch(0.40_0.01_260)]">Quantity</span>
                  <div className="flex items-center border border-[oklch(0.88_0.004_260)] rounded-full overflow-hidden">
                    <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-9 h-9 flex items-center justify-center text-[oklch(0.40_0.01_260)] hover:bg-[oklch(0.96_0.003_260)] active:scale-95" aria-label="Decrease quantity">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-10 text-center text-[0.9375rem] font-semibold text-[oklch(0.13_0.01_260)]">{quantity}</span>
                    <button onClick={() => setQuantity((q) => q + 1)} className="w-9 h-9 flex items-center justify-center text-[oklch(0.40_0.01_260)] hover:bg-[oklch(0.96_0.003_260)] active:scale-95" aria-label="Increase quantity">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {tierPercent > 0 && (
                    <span className="text-[0.75rem] font-semibold text-[oklch(0.35_0.14_155)]">Saving {tierPercent}% on this order</span>
                  )}
                </div>
              </div>
            )}

            {/* Price + Add to Cart */}
            <div className="flex items-center gap-5 mb-2">
              {unitPrice < selected.price ? (
                <span className="flex items-baseline gap-2">
                  <span className="text-[2rem] font-bold text-[oklch(0.50_0.18_25)]">${fmtPrice(unitPrice)}</span>
                  <span className="text-[1.125rem] line-through text-[oklch(0.60_0.01_260)]">${selected.price}</span>
                  {tierPercent > 0 && <span className="text-[0.75rem] font-semibold text-[oklch(0.60_0.01_260)]">/ bottle</span>}
                </span>
              ) : (
                <span className="text-[2rem] font-bold text-[oklch(0.13_0.01_260)]">${fmtPrice(unitPrice)}</span>
              )}
              {available ? (
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
                    quantity > 1 ? `Add ${quantity} to Cart` : "Add to Cart"
                  )}
                </button>
              ) : (
                <button
                  disabled
                  className="flex-1 py-3.5 rounded-full font-semibold text-[0.9375rem] bg-[oklch(0.93_0.003_260)] text-[oklch(0.55_0.01_260)] cursor-not-allowed"
                >
                  Out of Stock
                </button>
              )}
            </div>
            {/* Stock count — actual number, capped at "50+" for healthy stock */}
            {available && stockCount && (
              <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.42_0.14_155)] mb-6">
                <span className="w-2 h-2 rounded-full bg-[oklch(0.55_0.15_155)]" />
                {stockCount} in stock
              </p>
            )}
            {!available && (
              <div className="mb-6">
                <p className="text-[0.8125rem] font-semibold text-[oklch(0.50_0.18_25)] mb-3">
                  This dose is currently out of stock.
                </p>
                <BackInStockForm key={selected.cartCode} cartCode={selected.cartCode} />
              </div>
            )}
            {available && !stockCount && <div className="mb-6" />}

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
                { icon: <Truck className="w-4 h-4" />, label: "USPS Ground Advantage" },
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

            {/* Compliance disclaimer */}
            <div className="mt-5 rounded-xl bg-[oklch(0.97_0.01_50)] border border-[oklch(0.90_0.03_50)] px-4 py-3">
              <p className="text-[0.75rem] text-[oklch(0.42_0.06_50)] leading-relaxed">
                <strong>Research use only.</strong> All products currently listed on this site
                are for research purposes ONLY and are intended for research and identification
                purposes only. These products are not intended for human dosing, injections, or
                ingestion. Peptides are strictly for laboratory, academic, or institutional
                research and not for human or animal consumption.
              </p>
            </div>

          </div>
        </div>
      </div>

      {/* ── Dose Calculator (customer-only — signed-in users) ──────────── */}
      {session && product.reconstitutionNote && (
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
