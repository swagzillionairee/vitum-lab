import ReconstitutionCalculator from "@/components/ReconstitutionCalculator";
import SEO from "@/components/SEO";

// Public (no sign-in): reconstitution calculators are a top organic-search
// entry point in this niche, and the tool doubles as a PDP conversion aid.
// The RUO disclaimer lives inside the calculator itself.
export default function DoseCalculator() {
  return (
    <div className="min-h-screen bg-page">
      <SEO
        title="Peptide Reconstitution & Dose Calculator"
        description="Free peptide reconstitution calculator — enter vial size, BAC water volume, and desired dose to get concentration, volume per dose, and doses per vial. For laboratory research use only."
        canonical="https://vitumlab.com/dose-calculator"
      />

      <div className="border-b border-[oklch(0.93_0.004_260)]">
        <div className="container py-8">
          <p className="section-label mb-2">Tools</p>
          <h1 className="text-[2rem] font-bold text-[oklch(0.13_0.01_260)]">Dose Calculator</h1>
          <p className="text-[oklch(0.52_0.01_260)] mt-2 text-[0.9375rem]">
            Calculate reconstitution volumes and doses for your research peptides.
          </p>
        </div>
      </div>

      <section className="py-12 bg-[oklch(0.975_0.003_260)] min-h-[calc(100vh-200px)]">
        <div className="container max-w-3xl">
          <ReconstitutionCalculator peptideMg={10} />
        </div>
      </section>
    </div>
  );
}
