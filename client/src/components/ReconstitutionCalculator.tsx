/**
 * ReconstitutionCalculator
 * Laboratory reconstitution helper: given a lyophilized peptide mass and a
 * diluent (BAC water) volume, computes the resulting concentration and the
 * volume required to draw a target amount for an aliquot. Strictly a lab-prep
 * reference — no human-dosing framing (no "dose", no insulin-syringe visual).
 */

import { useState, useMemo } from "react";
import { FlaskConical, Info } from "lucide-react";

interface Props {
  peptideMg: number; // default peptide amount in mg (e.g. 10 for a 10mg vial)
}

export default function ReconstitutionCalculator({ peptideMg }: Props) {
  const [peptideAmount, setPeptideAmount] = useState(String(peptideMg));
  const [bacWaterMl, setBacWaterMl] = useState("2");
  const [targetMg, setTargetMg] = useState("0.25");

  const result = useMemo(() => {
    const peptide = parseFloat(peptideAmount);
    const bac = parseFloat(bacWaterMl);
    const target = parseFloat(targetMg);
    if (!peptide || !bac || !target || bac <= 0 || peptide <= 0 || target <= 0) {
      return null;
    }
    const concentrationMgPerMl = peptide / bac;
    const volumePerAliquotMl = target / concentrationMgPerMl;
    const aliquotsPerVial = Math.floor(peptide / target);
    // Fraction of the reconstituted vial one aliquot represents (for the fill bar).
    const fractionOfVial = Math.min(Math.max(volumePerAliquotMl / bac, 0), 1);
    return { concentrationMgPerMl, volumePerAliquotMl, aliquotsPerVial, fractionOfVial };
  }, [peptideAmount, bacWaterMl, targetMg]);

  return (
    <div className="rounded-2xl border border-[oklch(0.92_0.004_260)] bg-white overflow-hidden">
      {/* Header */}
      <div className="bg-[oklch(0.13_0.02_260)] text-white px-6 py-4 flex items-center gap-3">
        <FlaskConical className="w-5 h-5 text-white/70" />
        <div>
          <h3 className="text-[1rem] font-bold">Reconstitution Calculator</h3>
          <p className="text-[0.75rem] text-white/55">For laboratory reconstitution reference only — not medical or dosing advice</p>
        </div>
      </div>

      <div className="p-6">
        <div className="flex flex-col sm:flex-row gap-8">
          {/* Inputs */}
          <div className="flex-1 space-y-5">
            <div>
              <label className="block text-[0.75rem] font-semibold tracking-wide uppercase text-[oklch(0.45_0.01_260)] mb-1.5">
                Peptide Amount (mg)
              </label>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={peptideAmount}
                onChange={(e) => setPeptideAmount(e.target.value)}
                className="w-full border border-[oklch(0.88_0.004_260)] rounded-lg px-3.5 py-2.5 text-[0.9375rem] font-mono focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-[0.75rem] font-semibold tracking-wide uppercase text-[oklch(0.45_0.01_260)] mb-1.5">
                BAC Water Added (mL)
              </label>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={bacWaterMl}
                onChange={(e) => setBacWaterMl(e.target.value)}
                className="w-full border border-[oklch(0.88_0.004_260)] rounded-lg px-3.5 py-2.5 text-[0.9375rem] font-mono focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-[0.75rem] font-semibold tracking-wide uppercase text-[oklch(0.45_0.01_260)] mb-1.5">
                Target Amount per Aliquot (mg)
              </label>
              <input
                type="number"
                min={0.001}
                step={0.001}
                value={targetMg}
                onChange={(e) => setTargetMg(e.target.value)}
                className="w-full border border-[oklch(0.88_0.004_260)] rounded-lg px-3.5 py-2.5 text-[0.9375rem] font-mono focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
              />
            </div>

            {/* Results */}
            {result && (
              <div className="rounded-xl bg-[oklch(0.975_0.003_260)] p-4 space-y-3">
                <ResultRow label="Concentration" value={`${result.concentrationMgPerMl.toFixed(3)} mg/mL`} highlight />
                <ResultRow label="Volume per aliquot" value={`${result.volumePerAliquotMl.toFixed(3)} mL`} highlight />
                <ResultRow label="Aliquots per vial" value={`~${result.aliquotsPerVial}`} />
              </div>
            )}
          </div>

          {/* Vial concentration visual (graduated tube, no syringe/needle) */}
          <div className="flex flex-col items-center gap-2 flex-shrink-0 w-[116px]">
            <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-[oklch(0.52_0.01_260)] text-center">
              Reconstituted vial
            </p>
            <div className="relative w-14 h-[260px] rounded-b-xl rounded-t-md border-2 border-[oklch(0.80_0.01_260)] bg-[oklch(0.97_0.003_260)] overflow-hidden">
              {/* Diluent fill */}
              <div
                className="absolute bottom-0 left-0 right-0 bg-[oklch(0.72_0.09_240)]"
                style={{ height: "72%" }}
              />
              {/* One-aliquot band */}
              {result && (
                <div
                  className="absolute left-0 right-0 bg-[oklch(0.55_0.14_260)]"
                  style={{
                    bottom: 0,
                    height: `${result.fractionOfVial * 72}%`,
                    transition: "height 0.35s cubic-bezier(0.23,1,0.32,1)",
                  }}
                />
              )}
              {/* Graduation ticks */}
              {[20, 40, 60, 80].map((pct) => (
                <div
                  key={pct}
                  className="absolute left-0 w-2.5 h-px bg-[oklch(0.70_0.01_260)]"
                  style={{ bottom: `${pct}%` }}
                />
              ))}
            </div>
            <p className="text-[0.6875rem] text-[oklch(0.60_0.01_260)] text-center leading-tight">
              Shaded band = one aliquot
            </p>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-5 flex gap-2 text-[0.75rem] text-[oklch(0.52_0.01_260)] bg-[oklch(0.975_0.003_260)] rounded-lg px-4 py-3">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            This calculator is provided for <strong>in vitro research reference only</strong> and does not
            constitute medical or dosing advice. These products are not intended for human dosing, injections,
            or ingestion. Always verify calculations independently before use.
          </span>
        </div>
      </div>
    </div>
  );
}

function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[0.8125rem] text-[oklch(0.45_0.01_260)]">{label}</span>
      <span className={`text-[0.875rem] font-mono font-bold ${highlight ? "text-[oklch(0.30_0.16_260)]" : "text-[oklch(0.20_0.01_260)]"}`}>
        {value}
      </span>
    </div>
  );
}
