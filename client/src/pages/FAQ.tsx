/*
 * FAQ.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Full FAQ page with categorized questions
 */

import { useState } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import SEO from "@/components/SEO";

const faqCategories = [
  {
    category: "Products & Quality",
    questions: [
      {
        q: "What is the purity of your peptides?",
        a: "All peptides are ≥99% pure as verified by HPLC analysis. A Certificate of Analysis (COA) from an accredited third-party laboratory is included with every order and available for download on our COA Library page.",
      },
      {
        q: "Are your products tested by third-party laboratories?",
        a: "Yes. Every batch is independently tested by accredited US third-party laboratories before being listed in our catalog. We do not rely solely on manufacturer-supplied data. Full spectral data and test results are available in our COA Library.",
      },
      {
        q: "What form do your peptides come in?",
        a: "All peptides are supplied in lyophilized (freeze-dried) powder form. This format provides maximum stability and shelf life under standard laboratory storage conditions. Reconstitution with Bacteriostatic Water (BAC Water) is required before use.",
      },
      {
        q: "Do you carry custom or unlisted compounds?",
        a: "We do not currently offer custom synthesis. Our catalog is limited to compounds we have fully tested and documented. If you are interested in a specific compound not currently listed, contact us at hello@vitumlab.com and we will note the request for future catalog expansion.",
      },
      {
        q: "What lot numbers are currently in stock?",
        a: "Current lot numbers are displayed on each product card and product detail page. The COA Library lists all available batch documentation by lot number.",
      },
    ],
  },
  {
    category: "Ordering & Payment",
    questions: [
      {
        q: "Who can purchase from Vitum Lab?",
        a: "Products are sold exclusively to qualified researchers and institutions for in vitro / laboratory research use only. By placing an order, you confirm you are a qualified researcher and that the products will be used solely for research purposes.",
      },
      {
        q: "What payment methods do you accept?",
        a: "We accept major credit cards and cryptocurrency payments via NOWPayments. Cryptocurrency payments are processed securely and confirmed before order fulfillment.",
      },
      {
        q: "Can I place a bulk or institutional order?",
        a: "Yes. For bulk orders or institutional procurement, please contact us at hello@vitumlab.com with your requirements and we will provide a custom quote.",
      },
      {
        q: "Can I modify or cancel my order after placing it?",
        a: "Orders can typically be modified or cancelled by contacting us immediately at hello@vitumlab.com. Once an order has been dispatched, it cannot be cancelled.",
      },
    ],
  },
  {
    category: "Shipping & Delivery",
    questions: [
      {
        q: "How are orders shipped?",
        a: "Orders are shipped via USPS Priority Mail® in padded envelopes. East Coast deliveries typically arrive in 2 days; Central and West Coast deliveries typically arrive in 3 days.",
      },
      {
        q: "Do you offer free shipping?",
        a: "Yes — orders over $150 receive free shipping and a complimentary 10mL BAC Water vial. The free BAC Water is automatically added to your cart when you reach the threshold.",
      },
      {
        q: "Do you ship internationally?",
        a: "Currently we ship within the contiguous United States only. We do not ship to Alaska, Hawaii, US territories, or internationally at this time.",
      },
      {
        q: "How long does delivery take?",
        a: "East Coast orders average 2 days; Central and West Coast orders average 3 days via USPS Priority Mail®. Delivery times are estimates and may vary during peak periods or due to carrier delays outside our control.",
      },
      {
        q: "How is packaging handled for temperature-sensitive compounds?",
        a: "All orders are packaged with appropriate insulation and ice packs where required. Lyophilized peptides are stable at ambient temperatures for short transit periods, but we recommend refrigerating or freezing upon receipt.",
      },
    ],
  },
  {
    category: "Storage & Reconstitution",
    questions: [
      {
        q: "How should I store lyophilized peptides?",
        a: "Lyophilized peptides should be stored at −20°C / −4°F (freezer) for long-term storage. Once reconstituted, store at 4°C / 39°F (refrigerator) and use within 28 days. Avoid repeated freeze-thaw cycles, which can degrade compound integrity.",
      },
      {
        q: "What is BAC Water and why do I need it?",
        a: "Bacteriostatic Water (BAC Water) is sterile water containing 0.9% benzyl alcohol, used to reconstitute lyophilized (freeze-dried) peptides for laboratory use. The benzyl alcohol acts as a preservative, allowing multi-dose use from a single vial. It is required to prepare peptide solutions for in vitro research.",
      },
      {
        q: "How do I reconstitute a lyophilized peptide?",
        a: "Using a sterile syringe, slowly inject the appropriate volume of BAC Water into the vial along the side wall — do not inject directly onto the lyophilized cake. Gently swirl (do not shake) until fully dissolved. Consult your research protocol for the appropriate reconstitution volume and concentration.",
      },
    ],
  },
  {
    category: "Documentation & COAs",
    questions: [
      {
        q: "Where can I find Certificates of Analysis?",
        a: "All batch COAs are available in our COA Library at /coa-library. You can search by product name or lot number. COAs are also included with every order.",
      },
      {
        q: "What information is included in a COA?",
        a: "Each COA includes: compound identity confirmation (HPLC and/or mass spectrometry), purity percentage, lot number, test date, and the name of the accredited testing laboratory. Full spectral data is included where applicable.",
      },
      {
        q: "Can I request a COA for a specific lot?",
        a: "Yes. All available COAs are in our public library. If you require documentation for a specific lot not listed, contact us at hello@vitumlab.com.",
      },
    ],
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[oklch(0.91_0.004_260)]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left gap-4"
      >
        <span className="text-[0.9375rem] font-semibold text-[oklch(0.13_0.01_260)] leading-snug">{q}</span>
        {open
          ? <ChevronUp className="w-5 h-5 flex-shrink-0 text-[oklch(0.52_0.01_260)]" />
          : <ChevronDown className="w-5 h-5 flex-shrink-0 text-[oklch(0.52_0.01_260)]" />}
      </button>
      {open && (
        <p className="pb-5 text-[0.9375rem] text-[oklch(0.40_0.01_260)] leading-relaxed">{a}</p>
      )}
    </div>
  );
}

export default function FAQ() {
  const [activeCategory, setActiveCategory] = useState(faqCategories[0].category);

  return (
    <div className="min-h-screen bg-white">
      <SEO title="FAQ" description="Frequently asked questions about Vitum Lab peptides, ordering, shipping, reconstitution, and storage." />

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="bg-[oklch(0.14_0.03_260)] text-white">
        <div className="container py-16">
          <p className="text-[0.75rem] font-semibold tracking-widest uppercase text-white/50 mb-4">Support</p>
          <h1 className="text-[2.75rem] font-bold leading-tight tracking-tight mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-[1rem] text-white/70 max-w-lg leading-relaxed">
            Find answers to common questions about our products, ordering, shipping, and documentation.
          </p>
        </div>
      </div>

      <div className="container py-12">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">

          {/* ── Category sidebar ─────────────────────────────────────── */}
          <div className="lg:col-span-1">
            <p className="text-[0.75rem] font-semibold tracking-widest uppercase text-[oklch(0.52_0.01_260)] mb-4">Categories</p>
            <nav className="space-y-1">
              {faqCategories.map((cat) => (
                <button
                  key={cat.category}
                  onClick={() => setActiveCategory(cat.category)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-[0.875rem] font-semibold transition-colors ${
                    activeCategory === cat.category
                      ? "bg-[oklch(0.13_0.01_260)] text-white"
                      : "text-[oklch(0.40_0.01_260)] hover:bg-[oklch(0.96_0.003_260)]"
                  }`}
                >
                  {cat.category}
                  <span className={`ml-2 text-[0.75rem] font-normal ${activeCategory === cat.category ? "text-white/60" : "text-[oklch(0.65_0.01_260)]"}`}>
                    ({cat.questions.length})
                  </span>
                </button>
              ))}
            </nav>

            {/* Contact callout */}
            <div className="mt-8 rounded-2xl bg-[oklch(0.97_0.003_260)] p-5">
              <p className="text-[0.8125rem] font-semibold text-[oklch(0.13_0.01_260)] mb-1">Still have questions?</p>
              <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-3">
                Our team responds within 1 business day.
              </p>
              <Link href="/contact" className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.40_0.16_260)] hover:underline">
                Contact Us <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* ── FAQ list ─────────────────────────────────────────────── */}
          <div className="lg:col-span-3">
            {faqCategories
              .filter((cat) => cat.category === activeCategory)
              .map((cat) => (
                <div key={cat.category}>
                  <h2 className="text-[1.5rem] font-bold text-[oklch(0.13_0.01_260)] mb-6">{cat.category}</h2>
                  <div>
                    {cat.questions.map((item) => (
                      <FaqItem key={item.q} q={item.q} a={item.a} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}