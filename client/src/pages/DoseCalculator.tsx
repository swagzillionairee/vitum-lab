import { useEffect } from "react";
import { useLocation } from "wouter";
import ReconstitutionCalculator from "@/components/ReconstitutionCalculator";
import SEO from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";

export default function DoseCalculator() {
  const { session, loading } = useAuth();
  const [, navigate] = useLocation();

  // Customer-only tool: send anonymous visitors to sign in first.
  useEffect(() => {
    if (!loading && !session) {
      navigate("/login?redirect=/dose-calculator");
    }
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <p className="text-[oklch(0.52_0.01_260)] text-sm">Sign in to access this tool…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page">
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
