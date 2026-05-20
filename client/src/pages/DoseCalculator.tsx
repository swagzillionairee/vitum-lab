import ReconstitutionCalculator from "@/components/ReconstitutionCalculator";
import SEO from "@/components/SEO";

export default function DoseCalculator() {
  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="Dose Calculator"
        description="Reconstitution calculator for research peptides. Calculate concentration, volume per dose, and doses per vial."
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
