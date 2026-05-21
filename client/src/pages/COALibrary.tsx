/*
 * COALibrary.tsx — Vitum Lab
 * Displays all third-party Certificates of Analysis with PDF download links
 */

import { FileText, ExternalLink, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import SEO from "@/components/SEO";

const coas = [
  {
    product: "GLP-3 (R)",
    fullName: "GLP-3 (Retatrutide)",
    category: "Metabolic Research",
    batch: "2026001",
    reportNo: "VL001-101",
    purity: "99.5%",
    purityNote: "*excludes bulking agents/excipients",
    date: "Mar. 27, 2026",
    lab: "Constitution Laboratories LLC",
    test: "HPLC Purity",
    matrix: "Powder",
    pdf: "/coa/Retatrutide_COA.pdf",
    slug: "glp3r",
    color: "bg-[#f5e8e0]",
    dot: "bg-red-400",
  },
  {
    product: "GHK-Cu",
    fullName: "GHK-Cu (Glycyl-L-histidyl-L-lysine Copper(II) Complex)",
    category: "Cosmetic / Tissue Research",
    batch: "2026001",
    reportNo: "VL 089-109A",
    purity: "99.02%",
    purityNote: null,
    date: "Mar. 27, 2026",
    lab: "Constitution Laboratories LLC",
    test: "HPLC Purity",
    matrix: "Powder",
    pdf: "/coa/GHKCU_COA.pdf",
    slug: "ghkcu",
    color: "bg-[#e0f0ec]",
    dot: "bg-emerald-400",
  },
  {
    product: "NAD+",
    fullName: "NAD+ (Nicotinamide Adenine Dinucleotide)",
    category: "Cellular Research",
    batch: "2026001",
    reportNo: "VL 079-101F",
    purity: "99.6%",
    purityNote: null,
    date: "Mar. 27, 2026",
    lab: "Constitution Laboratories LLC",
    test: "HPLC Purity",
    matrix: "Powder",
    pdf: "/coa/NAD_COA.pdf",
    slug: "nad",
    color: "bg-[#faeae0]",
    dot: "bg-orange-400",
  },
];

export default function COALibrary() {
  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="COA Library"
        description="Third-party Certificates of Analysis for all Vitum Lab research peptides. Verified by Constitution Laboratories LLC."
      />

      {/* Header */}
      <div className="border-b border-[oklch(0.93_0.004_260)]">
        <div className="container py-10">
          <p className="section-label mb-2">Transparency</p>
          <h1 className="text-[2rem] font-bold text-[oklch(0.13_0.01_260)]">COA Library</h1>
          <p className="text-[oklch(0.52_0.01_260)] mt-2 text-[0.9375rem] max-w-xl">
            Every product is independently tested by a third-party analytical laboratory. Download the full Certificate of Analysis for each batch below.
          </p>

          {/* Lab badge */}
          <div className="mt-5 inline-flex items-center gap-2.5 bg-[oklch(0.97_0.003_260)] border border-[oklch(0.90_0.005_260)] rounded-full px-4 py-2">
            <ShieldCheck className="w-4 h-4 text-[oklch(0.40_0.14_155)]" />
            <span className="text-[0.8125rem] font-semibold text-[oklch(0.30_0.01_260)]">
              Tested by Constitution Laboratories LLC
            </span>
          </div>
        </div>
      </div>

      {/* COA Cards */}
      <div className="container py-12">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {coas.map((c) => (
            <div
              key={c.slug}
              id={c.slug}
              className="border border-[oklch(0.91_0.004_260)] rounded-2xl overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200"
            >
              {/* Colored top strip */}
              <div className={`${c.color} px-6 py-5 flex items-center gap-3`}>
                <span className={`w-2.5 h-2.5 rounded-full ${c.dot} flex-shrink-0`} />
                <div>
                  <p className="font-bold text-[oklch(0.13_0.01_260)] text-[1rem]">{c.product}</p>
                  <p className="text-[0.75rem] text-[oklch(0.45_0.01_260)]">{c.category}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[1.25rem] font-bold text-[oklch(0.13_0.01_260)]">{c.purity}</p>
                  <p className="text-[0.7rem] text-[oklch(0.50_0.01_260)]">Purity</p>
                </div>
              </div>

              {/* Details */}
              <div className="px-6 py-5 flex-1 flex flex-col gap-3">
                <table className="w-full text-[0.8125rem]">
                  <tbody className="divide-y divide-[oklch(0.93_0.004_260)]">
                    {[
                      ["Batch #", c.batch],
                      ["Report No.", c.reportNo],
                      ["Report Date", c.date],
                      ["Laboratory", c.lab],
                      ["Test Method", c.test],
                      ["Matrix", c.matrix],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td className="py-2 text-[oklch(0.52_0.01_260)] font-medium w-[45%]">{label}</td>
                        <td className="py-2 text-[oklch(0.20_0.01_260)] font-semibold text-right">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {c.purityNote && (
                  <p className="text-[0.75rem] text-[oklch(0.55_0.01_260)] italic">{c.purityNote}</p>
                )}

                <div className="mt-auto pt-3 flex flex-col gap-2">
                  <a
                    href={c.pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full bg-[oklch(0.13_0.01_260)] text-white text-[0.875rem] font-semibold hover:bg-[oklch(0.22_0.01_260)] transition-colors"
                  >
                    <FileText className="w-4 h-4" /> Download COA (PDF)
                  </a>
                  <Link
                    href={`/shop/${c.slug === "glp3r" ? "retatrutide" : c.slug}`}
                    className="flex items-center justify-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View Product
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="mt-10 bg-[oklch(0.975_0.003_260)] rounded-2xl px-6 py-5 text-[0.8125rem] text-[oklch(0.50_0.01_260)] leading-relaxed max-w-3xl">
          <strong className="text-[oklch(0.30_0.01_260)]">Note:</strong> All COAs are issued by Constitution Laboratories LLC, an independent third-party analytical laboratory. Certificates relate only to the specific batch tested and may not be reproduced without written approval. All products are for in vitro / laboratory research use only — not for human or veterinary consumption.
        </div>
      </div>
    </div>
  );
}
