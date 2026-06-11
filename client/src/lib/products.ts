// products.ts — Vitum Lab shared product catalog
// Used by Shop, ProductDetail, and Home pages

export interface ProductVariant {
  id: string;
  dose: string;
  lot: string;
  price: number;
  salePrice?: number;
  saleEndsAt?: string;
  img: string;
  cartCode: string;
}

export interface Product {
  slug: string;
  name: string;
  fullName: string;
  category: string;
  tagline: string;
  description: string;
  longDescription: string;
  cardBg: string;
  badge?: string;
  variants: ProductVariant[];
  specs: { label: string; value: string }[];
  storageInstructions: string;
  reconstitutionNote?: string;
  researchNotes: string[];
  coaHref: string;
}

export const products: Product[] = [
  {
    slug: "retatrutide",
    name: "GLP-3 (R)",
    fullName: "GLP-3 (R) (GLP-1/GIP/Glucagon Triple Receptor Agonist)",
    category: "Metabolic Research",
    tagline: "Triple receptor agonist for metabolic pathway research",
    description:
      "GLP-1/GIP/Glucagon triple receptor agonist studied for metabolic pathway modulation in preclinical models.",
    longDescription:
      "GLP-3 (R) is a novel triple receptor agonist targeting GLP-1, GIP, and glucagon receptors simultaneously. It has attracted significant research interest for its potential role in metabolic regulation, energy homeostasis, and adipose tissue dynamics. Available in three doses to support a range of preclinical study designs.",
    cardBg: "#f5e8e8",
    badge: "Best Seller",
    variants: [
      {
        id: "retatrutide-10mg",
        dose: "10 MG",
        lot: "A003",
        price: 129,
        img: "/GLP-3%20(R)%2010MG%20PRODUCT%20PIC.png",
        cartCode: "retatrutide-10mg",
      },
      {
        id: "retatrutide-20mg",
        dose: "20 MG",
        lot: "A003",
        price: 189,
        img: "/GLP-3%20(R)%2020MG%20PRODUCT%20PIC.png",
        cartCode: "retatrutide-20mg",
      },
      {
        id: "retatrutide-30mg",
        dose: "30 MG",
        lot: "A003",
        price: 249,
        img: "/GLP-3%20(R)%2030MG%20PRODUCT%20PIC.png",
        cartCode: "retatrutide-30mg",
      },
    ],
    specs: [
      { label: "Molecular Formula", value: "C₂₂₂H₃₄₈N₄₈O₆₅" },
      { label: "Molecular Weight", value: "4867.5 g/mol" },
      { label: "Purity", value: "≥99% (HPLC)" },
      { label: "Form", value: "Lyophilized powder" },
      { label: "Solubility", value: "Soluble in BAC Water" },
      { label: "Storage", value: "−20°C / −4°F (lyophilized), 4°C / 39°F (reconstituted)" },
    ],
    storageInstructions:
      "Store lyophilized vials at −20°C (−4°F). Once reconstituted with BAC Water, store at 4°C (39°F) and use within 28 days. Avoid repeated freeze-thaw cycles.",
    reconstitutionNote:
      "Reconstitute with Bacteriostatic Water (BAC Water). Inject slowly along the vial wall. Gently swirl — do not shake.",
    researchNotes: [
      "Triple agonist activity at GLP-1, GIP, and glucagon receptors",
      "Studied for metabolic pathway modulation in preclinical models",
      "Research interest in energy homeostasis and adipose tissue dynamics",
      "For in vitro / laboratory research use only",
    ],
    coaHref: "/coa/Retatrutide_COA.pdf",
  },
  {
    slug: "ghkcu",
    name: "GHK-Cu",
    fullName: "GHK-Cu (Glycyl-L-histidyl-L-lysine Copper(II) Complex)",
    category: "Cosmetic / Tissue Research",
    tagline: "Copper peptide for tissue remodeling and ECM research",
    description:
      "Glycyl-L-histidyl-L-lysine copper(II) complex studied for tissue remodeling and extracellular matrix research.",
    longDescription:
      "GHK-Cu is a naturally occurring copper-binding tripeptide with a well-documented research profile in tissue remodeling, wound healing models, and extracellular matrix (ECM) dynamics. It has been studied for its role in collagen synthesis, antioxidant activity, and gene expression modulation in laboratory settings.",
    cardBg: "#e0f0ec",
    variants: [
      {
        id: "ghkcu-50mg",
        dose: "50 MG",
        lot: "B031",
        price: 69,
        img: "/GHKCU%2050%20MG%20PRODUCT%20PIC.png",
        cartCode: "ghk-cu-50mg",
      },
      {
        id: "ghkcu-100mg",
        dose: "100 MG",
        lot: "B031",
        price: 109,
        img: "/GHKCU%20100%20MG%20PRODUCT%20PIC.png",
        cartCode: "ghk-cu-100mg",
      },
    ],
    specs: [
      { label: "Molecular Formula", value: "C₁₄H₂₄CuN₆O₄" },
      { label: "Molecular Weight", value: "340.84 g/mol" },
      { label: "Purity", value: "≥99% (HPLC)" },
      { label: "Form", value: "Lyophilized powder" },
      { label: "Solubility", value: "Soluble in water / BAC Water" },
      { label: "Storage", value: "−20°C / −4°F (lyophilized), 4°C / 39°F (reconstituted)" },
    ],
    storageInstructions:
      "Store lyophilized vials at −20°C (−4°F). Once reconstituted, store at 4°C (39°F) and use within 28 days.",
    reconstitutionNote:
      "Reconstitute with Bacteriostatic Water (BAC Water) or sterile water. Gently swirl to dissolve.",
    researchNotes: [
      "Naturally occurring copper-binding tripeptide",
      "Studied for tissue remodeling and ECM dynamics in vitro",
      "Research interest in collagen synthesis and antioxidant activity",
      "For in vitro / laboratory research use only",
    ],
    coaHref: "/coa/GHKCU_COA.pdf",
  },
  {
    slug: "nad",
    name: "NAD+",
    fullName: "NAD+ (Nicotinamide Adenine Dinucleotide)",
    category: "Cellular Research",
    tagline: "Cellular energy metabolism and longevity pathway research",
    description:
      "Research-grade NAD+ for cellular energy metabolism and longevity pathway studies in laboratory settings.",
    longDescription:
      "Nicotinamide Adenine Dinucleotide (NAD+) is a critical coenzyme involved in redox reactions, energy metabolism, and cellular signaling. It has been extensively studied in the context of mitochondrial function, DNA repair, and longevity pathways including sirtuins and PARP enzymes.",
    cardBg: "#faeae0",
    badge: "Out of Stock",
    variants: [
      {
        id: "nad-500mg",
        dose: "500 MG",
        lot: "D006",
        price: 129,
        img: "/NAD%2B%20500MG%20PRODUCT%20PIC.png",
        cartCode: "nad-500mg",
      },
    ],
    specs: [
      { label: "Molecular Formula", value: "C₂₁H₂₇N₇O₁₄P₂" },
      { label: "Molecular Weight", value: "663.43 g/mol" },
      { label: "Purity", value: "≥99% (HPLC)" },
      { label: "Form", value: "Lyophilized powder" },
      { label: "Solubility", value: "Soluble in water / BAC Water" },
      { label: "Storage", value: "−20°C / −4°F (lyophilized), 4°C / 39°F (reconstituted)" },
    ],
    storageInstructions:
      "Store lyophilized vials at −20°C (−4°F). Once reconstituted, store at 4°C (39°F) and use within 14 days. NAD+ is sensitive to light and heat — minimize exposure.",
    researchNotes: [
      "Critical coenzyme in redox reactions and energy metabolism",
      "Studied in mitochondrial function and DNA repair pathways",
      "Research interest in sirtuin and PARP enzyme activity",
      "For in vitro / laboratory research use only",
    ],
    coaHref: "/coa/NAD_COA.pdf",
  },
  {
    slug: "bacwater",
    name: "BAC Water",
    fullName: "Bacteriostatic Water 0.9% Benzyl Alcohol",
    category: "Reconstitution",
    tagline: "USP-grade bacteriostatic water for peptide reconstitution",
    description:
      "USP-grade bacteriostatic water with 0.9% benzyl alcohol for safe multi-dose reconstitution of lyophilized research peptides.",
    longDescription:
      "Bacteriostatic Water (BAC Water) is sterile water for injection containing 0.9% benzyl alcohol as a preservative. It is the standard reconstitution medium for lyophilized research peptides, enabling multi-dose use from a single vial without risk of microbial contamination.",
    cardBg: "#e0eaf5",
    variants: [
      {
        id: "bacwater-10ml",
        dose: "10 ML",
        lot: "C025",
        price: 15,
        img: "/BAC%20WATER%2010ML%20PRODUCT%20PIC.png",
        cartCode: "bac-water-10ml",
      },
    ],
    specs: [
      { label: "Composition", value: "Water for injection, 0.9% Benzyl Alcohol" },
      { label: "Volume", value: "10 mL" },
      { label: "Grade", value: "USP" },
      { label: "Sterility", value: "Sterile filtered (0.22 µm)" },
      { label: "pH", value: "4.5–7.0" },
      { label: "Storage", value: "Room temperature (15–30°C / 59–86°F)" },
    ],
    storageInstructions:
      "Store at room temperature (15–30°C / 59–86°F). Keep away from direct sunlight. Do not freeze. Discard any unused portion after 28 days of first use.",
    researchNotes: [
      "0.9% benzyl alcohol preservative enables multi-dose use",
      "Sterile filtered through 0.22 µm membrane",
      "Standard reconstitution medium for lyophilized peptides",
      "For laboratory research use only",
    ],
    coaHref: "/coa-library#bacwater",
  },
];
