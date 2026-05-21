/*
 * Research.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Research Library — peer-reviewed studies referenced by the research community
 */

import SEO from "@/components/SEO";

interface Study {
  title: string;
  authors: string;
  year: number;
  journal: string;
  summary: string;
  url: string;
}

interface ProductSection {
  name: string;
  tagline: string;
  accentColor: string;
  badgeColor: string;
  badgeText: string;
  borderColor: string;
  studies: Study[];
}

const sections: ProductSection[] = [
  {
    name: "GLP-3 (R) / Retatrutide",
    tagline: "A triple receptor agonist targeting GLP-1, GIP, and glucagon receptors.",
    accentColor: "bg-[oklch(0.50_0.18_260)]",
    badgeColor: "bg-[oklch(0.93_0.04_260)] text-[oklch(0.35_0.18_260)]",
    badgeText: "NEJM / Lancet",
    borderColor: "border-l-[oklch(0.50_0.18_260)]",
    studies: [
      {
        title: "Triple–Hormone-Receptor Agonist Retatrutide for Obesity — A Phase 2 Trial",
        authors: "Jastreboff AM, et al.",
        year: 2023,
        journal: "New England Journal of Medicine",
        summary:
          "Phase 2 randomized trial demonstrating significant weight reduction with retatrutide, a GLP-1/GIP/glucagon triple receptor agonist, across multiple dose cohorts.",
        url: "https://www.nejm.org/doi/full/10.1056/NEJMoa2301972",
      },
      {
        title:
          "Retatrutide, a GIP, GLP-1 and glucagon receptor agonist, for people with type 2 diabetes: a randomised, double-blind, placebo and active-controlled, parallel-group, phase 2 trial conducted in the USA",
        authors: "Rosenstock J, et al.",
        year: 2023,
        journal: "The Lancet",
        summary:
          "Evaluated glycemic control and weight outcomes in adults with type 2 diabetes, showing dose-dependent reductions in HbA1c and body weight.",
        url: "https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(23)01053-X/fulltext",
      },
    ],
  },
  {
    name: "NAD+",
    tagline: "A critical coenzyme in cellular energy metabolism and DNA repair pathways.",
    accentColor: "bg-[oklch(0.55_0.17_160)]",
    badgeColor: "bg-[oklch(0.93_0.04_160)] text-[oklch(0.30_0.17_160)]",
    badgeText: "Cell / Science",
    borderColor: "border-l-[oklch(0.55_0.17_160)]",
    studies: [
      {
        title: "Therapeutic Potential of NAD-Boosting Molecules: The In Vivo Evidence",
        authors: "Rajman L, Chwalek K, Sinclair DA",
        year: 2018,
        journal: "Cell Metabolism",
        summary:
          "Comprehensive review of in vivo evidence for NAD+ precursors in aging, metabolic disease, and neurodegeneration, covering sirtuins and PARP enzyme pathways.",
        url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5884172/",
      },
      {
        title: "NAD⁺ in aging, metabolism, and neurodegeneration",
        authors: "Verdin E",
        year: 2015,
        journal: "Science",
        summary:
          "Reviews the role of NAD+ as a key metabolic cofactor in aging biology, mitochondrial function, and its decline with age.",
        url: "https://www.science.org/doi/10.1126/science.aac4854",
      },
      {
        title: "Nicotinamide mononucleotide increases muscle insulin sensitivity in prediabetic women",
        authors: "Yoshino M, et al.",
        year: 2021,
        journal: "Science",
        summary:
          "Randomized controlled trial showing NMN supplementation increases NAD+ levels in skeletal muscle and enhances insulin sensitivity in postmenopausal women with prediabetes.",
        url: "https://www.science.org/doi/10.1126/science.abe9985",
      },
    ],
  },
  {
    name: "GHK-Cu",
    tagline: "A naturally occurring copper-binding tripeptide with tissue remodeling activity.",
    accentColor: "bg-[oklch(0.58_0.14_55)]",
    badgeColor: "bg-[oklch(0.95_0.04_55)] text-[oklch(0.38_0.14_55)]",
    badgeText: "IJMS / BioMed",
    borderColor: "border-l-[oklch(0.58_0.14_55)]",
    studies: [
      {
        title: "Regenerative and Protective Actions of the GHK-Cu Peptide in the Light of the New Gene Data",
        authors: "Pickart L, Margolina A",
        year: 2018,
        journal: "International Journal of Molecular Sciences",
        summary:
          "Reviews GHK-Cu’s modulation of over 4,000 human genes involved in tissue remodeling, anti-inflammation, antioxidant defense, and wound healing.",
        url: "https://www.mdpi.com/1422-0067/19/7/1987",
      },
      {
        title: "GHK Peptide as a Natural Modulator of Multiple Cellular Pathways in Skin Regeneration",
        authors: "Pickart L, Vasquez-Soltero JM, Margolina A",
        year: 2015,
        journal: "BioMed Research International",
        summary:
          "Examines GHK-Cu’s role in activating collagen synthesis, metalloproteinase regulation, and cellular repair mechanisms relevant to tissue research.",
        url: "https://www.hindawi.com/journals/bmri/2015/648108/",
      },
    ],
  },
];

function StudyCard({
  study,
  badgeColor,
}: {
  study: Study;
  badgeColor: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[oklch(0.91_0.004_260)] p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`text-[0.75rem] font-semibold px-2.5 py-1 rounded-full ${badgeColor}`}>
          {study.journal}
        </span>
        <span className="text-[0.75rem] text-[oklch(0.65_0.01_260)]">{study.year}</span>
      </div>

      <h3 className="font-bold text-[oklch(0.13_0.01_260)] text-[1rem] mt-2 mb-1 leading-snug">
        {study.title}
      </h3>

      <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)]">
        {study.authors} &mdash; <em>{study.journal}</em>
      </p>

      <p className="text-[0.875rem] text-[oklch(0.45_0.01_260)] mt-3 leading-relaxed">
        {study.summary}
      </p>

      <a
        href={study.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[0.8125rem] font-semibold text-[oklch(0.35_0.15_260)] mt-4 inline-flex items-center gap-1 hover:gap-2 transition-all"
      >
        Read Study &rarr;
      </a>
    </div>
  );
}

export default function Research() {
  return (
    <>
      <SEO
        title="Research Library"
        description="Peer-reviewed studies and clinical literature referenced by the research community for compounds available at Vitum Lab, including Retatrutide, NAD+, and GHK-Cu."
      />
      <div className="min-h-screen bg-[oklch(0.97_0.003_260)]">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="bg-[oklch(0.13_0.01_260)] text-white">
          <div className="container py-16">
            <p className="text-[0.75rem] font-semibold tracking-widest uppercase text-white/50 mb-4">
              Scientific Literature
            </p>
            <h1 className="text-[2.75rem] font-bold leading-tight tracking-tight mb-4">
              Research Library
            </h1>
            <p className="text-[1rem] text-white/70 max-w-xl leading-relaxed">
              Peer-reviewed studies and clinical literature referenced by the research community
              for compounds available at Vitum Lab.
            </p>
          </div>
        </div>

        {/* ── Sections ─────────────────────────────────────────────────── */}
        <div className="container py-16 space-y-16">
          {sections.map((section) => (
            <div key={section.name}>
              {/* Section header */}
              <div className={`flex items-start gap-4 mb-8 pl-5 border-l-4 ${section.borderColor}`}>
                <div>
                  <h2 className="text-[1.5rem] font-bold text-[oklch(0.13_0.01_260)] leading-tight">
                    {section.name}
                  </h2>
                  <p className="text-[0.9375rem] text-[oklch(0.52_0.01_260)] mt-1">
                    {section.tagline}
                  </p>
                </div>
              </div>

              {/* Study cards grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {section.studies.map((study) => (
                  <StudyCard key={study.url} study={study} badgeColor={section.badgeColor} />
                ))}
              </div>
            </div>
          ))}

          {/* ── Disclaimer ───────────────────────────────────────────────── */}
          <div className="bg-[oklch(0.14_0.03_260)] text-white rounded-2xl p-8 mt-4">
            <p className="text-[0.875rem] text-white/70 leading-relaxed max-w-3xl">
              <span className="font-semibold text-white">Note: </span>
              All studies linked are published third-party research. Vitum Lab does not claim
              these studies support any specific use of our products. All products are for in
              vitro / laboratory research use only.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
