/**
 * ReconstitutionCalculator
 * Design: Clean card with input fields + animated syringe SVG visual.
 * The syringe fill level and unit markers update in real-time.
 */

import { useState, useMemo } from "react";
import { FlaskConical, Info } from "lucide-react";

interface Props {
  peptideMg: number; // default peptide amount in mg (e.g. 10 for Retatrutide 10mg)
}

export default function ReconstitutionCalculator({ peptideMg }: Props) {
  const [peptideAmount, setPeptideAmount] = useState(String(peptideMg));
  const [bacWaterMl, setBacWaterMl] = useState("2");
  const [desiredDoseMg, setDesiredDoseMg] = useState("0.25");

  const result = useMemo(() => {
    const peptide = parseFloat(peptideAmount);
    const bac = parseFloat(bacWaterMl);
    const dose = parseFloat(desiredDoseMg);
    if (!peptide || !bac || !dose || bac <= 0 || peptide <= 0 || dose <= 0) {
      return null;
    }
    const concentrationMgPerMl = peptide / bac;
    const volumePerDoseMl = dose / concentrationMgPerMl;
    const volumePerDoseUnits = volumePerDoseMl * 100;
    const dosesPerVial = Math.floor(peptide / dose);
    return {
      concentrationMgPerMl,
      volumePerDoseMl,
      volumePerDoseUnits,
      dosesPerVial,
    };
  }, [peptideAmount, bacWaterMl, desiredDoseMg]);

  // Syringe fill: 0–100 units on a U-100 syringe
  const syringeUnits = result
    ? Math.min(Math.max(result.volumePerDoseUnits, 0), 100)
    : 0;
  const fillPercent = syringeUnits / 100; // 0 to 1

  // Tick marks at 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
  const ticks = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  // Syringe SVG dimensions
  const syringeH = 280;
  const barrelTop = 30;
  const barrelBottom = 240;
  const barrelH = barrelBottom - barrelTop;
  const barrelX = 44;
  const barrelW = 28;

  // Fill level: fills from bottom up
  const fillH = fillPercent * barrelH;
  const fillY = barrelBottom - fillH;

  return (
    <div className="rounded-2xl border border-[oklch(0.92_0.004_260)] bg-white overflow-hidden">
      {/* Header */}
      <div className="bg-[oklch(0.13_0.02_260)] text-white px-6 py-4 flex items-center gap-3">
        <FlaskConical className="w-5 h-5 text-white/70" />
        <div>
          <h3 className="text-[1rem] font-bold">Reconstitution Calculator</h3>
          <p className="text-[0.75rem] text-white/55">
            For research use only — not medical dosing advice
          </p>
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
                onChange={e => setPeptideAmount(e.target.value)}
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
                onChange={e => setBacWaterMl(e.target.value)}
                className="w-full border border-[oklch(0.88_0.004_260)] rounded-lg px-3.5 py-2.5 text-[0.9375rem] font-mono focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-[0.75rem] font-semibold tracking-wide uppercase text-[oklch(0.45_0.01_260)] mb-1.5">
                Desired Dose (mg)
              </label>
              <input
                type="number"
                min={0.001}
                step={0.001}
                value={desiredDoseMg}
                onChange={e => setDesiredDoseMg(e.target.value)}
                className="w-full border border-[oklch(0.88_0.004_260)] rounded-lg px-3.5 py-2.5 text-[0.9375rem] font-mono focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent"
              />
            </div>

            {/* Results */}
            {result && (
              <div className="rounded-xl bg-[oklch(0.975_0.003_260)] p-4 space-y-3">
                <ResultRow
                  label="Concentration"
                  value={`${result.concentrationMgPerMl.toFixed(3)} mg/mL`}
                />
                <ResultRow
                  label="Volume per dose"
                  value={`${result.volumePerDoseMl.toFixed(3)} mL`}
                  highlight
                />
                <ResultRow
                  label="Syringe units (U-100)"
                  value={`${result.volumePerDoseUnits.toFixed(1)} units`}
                  highlight
                />
                <ResultRow
                  label="Doses per vial"
                  value={`~${result.dosesPerVial} doses`}
                />
              </div>
            )}
          </div>

          {/* Syringe visual */}
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-[oklch(0.52_0.01_260)]">
              U-100 / 1mL / 1cc
            </p>
            <svg
              width="116"
              height={syringeH}
              viewBox={`0 0 116 ${syringeH}`}
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="overflow-visible"
            >
              {/* Plunger rod */}
              <rect
                x="54"
                y="4"
                width="8"
                height={barrelTop - 4}
                rx="2"
                fill="oklch(0.75 0.01 260)"
              />
              {/* Plunger handle */}
              <rect
                x="44"
                y="2"
                width="28"
                height="8"
                rx="3"
                fill="oklch(0.55 0.01 260)"
              />

              {/* Barrel background */}
              <rect
                x={barrelX}
                y={barrelTop}
                width={barrelW}
                height={barrelH}
                rx="4"
                fill="oklch(0.97 0.003 260)"
                stroke="oklch(0.80 0.01 260)"
                strokeWidth="1.5"
              />

              {/* Fill */}
              {fillH > 0 && (
                <rect
                  x={barrelX + 1}
                  y={fillY}
                  width={barrelW - 2}
                  height={fillH}
                  rx="2"
                  fill="oklch(0.55 0.14 260)"
                  style={{
                    transition:
                      "y 0.35s cubic-bezier(0.23,1,0.32,1), height 0.35s cubic-bezier(0.23,1,0.32,1)",
                  }}
                />
              )}

              {/* Tick marks and labels */}
              {ticks.map(tick => {
                const y = barrelBottom - (tick / 100) * barrelH;
                const isMajor = tick % 20 === 0;
                const isHighlighted =
                  result && Math.abs(result.volumePerDoseUnits - tick) < 3;
                return (
                  <g key={tick}>
                    {/* Left tick */}
                    <line
                      x1={barrelX - (isMajor ? 10 : 6)}
                      y1={y}
                      x2={barrelX}
                      y2={y}
                      stroke={
                        isHighlighted
                          ? "oklch(0.40 0.16 260)"
                          : "oklch(0.65 0.01 260)"
                      }
                      strokeWidth={isMajor ? 1.5 : 1}
                    />
                    {/* Right tick */}
                    <line
                      x1={barrelX + barrelW}
                      y1={y}
                      x2={barrelX + barrelW + (isMajor ? 10 : 6)}
                      y2={y}
                      stroke={
                        isHighlighted
                          ? "oklch(0.40 0.16 260)"
                          : "oklch(0.65 0.01 260)"
                      }
                      strokeWidth={isMajor ? 1.5 : 1}
                    />
                    {/* Label on major ticks */}
                    {isMajor && (
                      <text
                        x={barrelX - 13}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="9"
                        fill={
                          isHighlighted
                            ? "oklch(0.30 0.16 260)"
                            : "oklch(0.55 0.01 260)"
                        }
                        fontFamily="monospace"
                        fontWeight={isHighlighted ? "700" : "400"}
                      >
                        {tick}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Dose indicator arrow */}
              {result && syringeUnits > 0 && syringeUnits <= 100 && (
                <g
                  style={{
                    transition: "transform 0.35s cubic-bezier(0.23,1,0.32,1)",
                  }}
                  transform={`translate(0, ${barrelBottom - (syringeUnits / 100) * barrelH})`}
                >
                  <line
                    x1={barrelX + barrelW + 12}
                    y1={0}
                    x2={barrelX + barrelW + 32}
                    y2={0}
                    stroke="oklch(0.40 0.16 260)"
                    strokeWidth="1.5"
                    strokeDasharray="3 2"
                  />
                  <text
                    x={barrelX + barrelW + 34}
                    y={4}
                    fontSize="9"
                    fill="oklch(0.30 0.16 260)"
                    fontFamily="monospace"
                    fontWeight="700"
                  >
                    {syringeUnits.toFixed(1)}u
                  </text>
                </g>
              )}

              {/* Needle */}
              <rect
                x="55"
                y={barrelBottom}
                width="6"
                height="8"
                rx="1"
                fill="oklch(0.75 0.01 260)"
              />
              <path
                d={`M55 ${barrelBottom + 8} L58 ${barrelBottom + 22} L61 ${barrelBottom + 8} Z`}
                fill="oklch(0.70 0.01 260)"
              />
            </svg>
            <p className="text-[0.6875rem] text-[oklch(0.60_0.01_260)] text-center leading-tight max-w-[90px]">
              Units on U-100 / 1mL / 1cc syringe
            </p>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-5 flex gap-2 text-[0.75rem] text-[oklch(0.52_0.01_260)] bg-[oklch(0.975_0.003_260)] rounded-lg px-4 py-3">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            This calculator is provided for{" "}
            <strong>in vitro research reference only</strong> and does not
            constitute medical or dosing advice. Always verify calculations
            independently before use.
          </span>
        </div>
      </div>
    </div>
  );
}

function ResultRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[0.8125rem] text-[oklch(0.45_0.01_260)]">
        {label}
      </span>
      <span
        className={`text-[0.875rem] font-mono font-bold ${highlight ? "text-[oklch(0.30_0.16_260)]" : "text-[oklch(0.20_0.01_260)]"}`}
      >
        {value}
      </span>
    </div>
  );
}
