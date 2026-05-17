/*
 * AgeGate.tsx — Vitum Lab
 * Design: Contemporary Clinical
 * Full-screen modal overlay, formal declaration format, 18+ consent stored in cookie
 */

import { useState } from "react";

interface AgeGateProps {
  onVerified: () => void;
}

export default function AgeGate({ onVerified }: AgeGateProps) {
  const [ageChecked, setAgeChecked] = useState(false);
  const [researchChecked, setResearchChecked] = useState(false);
  const [error, setError] = useState(false);

  const handleEnter = () => {
    if (!ageChecked || !researchChecked) {
      setError(true);
      return;
    }
    // Store consent in cookie (30 days)
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    document.cookie = `vitum_age_verified=true; expires=${expires.toUTCString()}; path=/; SameSite=Strict`;
    onVerified();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Background: hero image with dark overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/manus-storage/agegate-background_67b76add.png')" }}
      />
      <div className="absolute inset-0 bg-[oklch(0.18_0.04_255)]/80" />

      {/* Modal card */}
      <div className="relative z-10 bg-white w-full max-w-md mx-4 rounded-sm shadow-2xl overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1 w-full bg-[oklch(0.35_0.15_260)]" />

        <div className="p-8 sm:p-10">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <img
              src="/manus-storage/vitumlablogoblack_3bc5cca3.png"
              alt="Vitum Lab"
              className="h-48 w-auto"
            />
          </div>

          {/* Headline */}
          <div className="mb-6 text-center">
            <span className="section-label block mb-3">Researcher Verification</span>
            <h1 className="text-xl font-bold text-[oklch(0.18_0.04_255)] leading-snug">
              Research Use Only
            </h1>
            <p className="mt-2 text-sm text-[oklch(0.55_0.02_255)] leading-relaxed">
              Vitum Lab supplies research peptides exclusively to qualified
              researchers and laboratories for in vitro and laboratory use.
              Please confirm before continuing.
            </p>
          </div>

          {/* Checkboxes */}
          <div className="space-y-4 mb-6">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={ageChecked}
                  onChange={(e) => {
                    setAgeChecked(e.target.checked);
                    setError(false);
                  }}
                  className="w-4 h-4 rounded-none border-[oklch(0.55_0.02_255)] accent-[oklch(0.35_0.15_260)]"
                />
              </div>
              <span className="text-sm text-[oklch(0.35_0.05_255)] leading-relaxed group-hover:text-[oklch(0.18_0.04_255)] transition-colors">
                I am at least <strong>18 years of age</strong>.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="mt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={researchChecked}
                  onChange={(e) => {
                    setResearchChecked(e.target.checked);
                    setError(false);
                  }}
                  className="w-4 h-4 rounded-none border-[oklch(0.55_0.02_255)] accent-[oklch(0.35_0.15_260)]"
                />
              </div>
              <span className="text-sm text-[oklch(0.35_0.05_255)] leading-relaxed group-hover:text-[oklch(0.18_0.04_255)] transition-colors">
                I confirm I am a <strong>qualified researcher</strong> purchasing
                for in vitro / laboratory research only — not for human or
                veterinary use.
              </span>
            </label>
          </div>

          {/* Error message */}
          {error && (
            <p className="mb-4 text-xs text-red-600 font-medium">
              Please confirm both statements to continue.
            </p>
          )}

          {/* CTA */}
          <button
            onClick={handleEnter}
            className="w-full btn-primary text-center"
          >
            Enter Vitum Lab →
          </button>

          {/* Legal fine print */}
          <p className="mt-5 text-[0.6875rem] text-[oklch(0.65_0.01_255)] leading-relaxed text-center">
            By proceeding you affirm the above statements are true. Products are
            not for human or veterinary use, not for use in diagnostic
            procedures, and have not been evaluated by the FDA.{" "}
            <a href="/research-disclaimer" className="underline hover:text-[oklch(0.35_0.15_260)]">
              Full disclaimer
            </a>
            .
          </p>

          <p className="mt-3 text-[0.6875rem] text-center text-[oklch(0.65_0.01_255)]">
            Not a researcher?{" "}
            <a
              href="https://www.google.com"
              className="underline hover:text-[oklch(0.35_0.15_260)]"
            >
              Exit
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
