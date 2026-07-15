/**
 * LegalPage — shared layout wrapper for all legal/policy pages
 * Design: matches Vitum Lab oklch color system — dark navy header, white/dark body
 */
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

export default function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-page dark:bg-[oklch(0.12_0.02_260)] flex flex-col">

      {/* Full-width dark navy header — stays dark in both modes */}
      <div className="bg-[oklch(0.13_0.01_260)] pt-14 pb-14">
        <div className="max-w-3xl mx-auto px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[0.8125rem] text-[oklch(0.55_0.01_260)] hover:text-white transition-colors mb-7"
          >
            <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" />
            Back to Vitum Lab
          </Link>

          <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-[oklch(0.52_0.01_260)] mb-3">
            Vitum Lab
          </p>

          <h1 className="text-[2rem] font-bold text-white mb-3.5 leading-tight">
            {title}
          </h1>

          <span className="inline-block text-[0.75rem] font-medium text-[oklch(0.55_0.01_260)] bg-[oklch(0.19_0.01_260)] border border-[oklch(0.25_0.01_260)] rounded-full px-3 py-1">
            Last updated: {lastUpdated}
          </span>
        </div>
      </div>

      {/* Body content */}
      <div className="flex-1 bg-white dark:bg-[oklch(0.12_0.02_260)]">
        <div className="max-w-3xl mx-auto px-6 py-14 legal-page-content">
          {children}
        </div>
      </div>

      {/* Footer note */}
      <div className="border-t border-[oklch(0.91_0.004_260)] dark:border-[oklch(0.24_0.02_260)] bg-white dark:bg-[oklch(0.12_0.02_260)]">
        <div className="max-w-3xl mx-auto px-6 py-8 text-center text-[0.75rem] text-[oklch(0.52_0.01_260)] dark:text-[oklch(0.60_0.01_260)]">
          © {new Date().getFullYear()} Vitum Lab. All products are for research use only — not for
          human or veterinary use.
        </div>
      </div>

      {/* Scoped styles for child content rendered via JSX */}
      <style>{`
        .legal-page-content h2 {
          font-size: 1.0625rem;
          font-weight: 600;
          color: oklch(0.13 0.01 260);
          margin-top: 2.5rem;
          margin-bottom: 0.75rem;
          padding-left: 0.875rem;
          border-left: 3px solid oklch(0.35 0.15 260);
          line-height: 1.35;
        }
        .legal-page-content h2:first-child {
          margin-top: 0;
        }
        .legal-page-content p {
          color: oklch(0.45 0.01 260);
          font-size: 0.9375rem;
          line-height: 1.75;
          margin-bottom: 1rem;
        }
        .legal-page-content strong {
          color: oklch(0.13 0.01 260);
          font-weight: 600;
        }
        .legal-page-content a {
          color: oklch(0.35 0.15 260);
          text-decoration: none;
        }
        .legal-page-content a:hover {
          text-decoration: underline;
        }
        .legal-page-content ul {
          list-style: disc;
          padding-left: 1.5rem;
          margin-bottom: 1rem;
          color: oklch(0.45 0.01 260);
        }
        .legal-page-content li {
          font-size: 0.9375rem;
          line-height: 1.75;
          margin-bottom: 0.25rem;
          color: oklch(0.45 0.01 260);
        }
        .legal-page-content li strong {
          color: oklch(0.13 0.01 260);
        }
      `}</style>
    </div>
  );
}
