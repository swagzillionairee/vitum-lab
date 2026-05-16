/**
 * LegalPage — shared layout wrapper for all legal/policy pages
 * Design: clean white, constrained width, generous vertical rhythm
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
    <div className="min-h-screen bg-white">
      {/* Header bar */}
      <div className="border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Vitum Lab
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-14">
        <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-3">Vitum Lab</p>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-400 mb-10">Last updated: {lastUpdated}</p>
        <div className="prose prose-gray max-w-none prose-headings:font-semibold prose-headings:text-gray-800 prose-p:text-gray-600 prose-p:leading-relaxed prose-li:text-gray-600 prose-a:text-blue-600 prose-strong:text-gray-800">
          {children}
        </div>
      </div>

      {/* Footer note */}
      <div className="border-t border-gray-100 mt-16">
        <div className="max-w-3xl mx-auto px-6 py-8 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} Vitum Lab. All products are for research use only — not for human or veterinary use.
        </div>
      </div>
    </div>
  );
}
