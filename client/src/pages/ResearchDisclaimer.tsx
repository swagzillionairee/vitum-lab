import { Link } from "wouter";
import {
  ArrowLeft,
  FlaskConical,
  ShieldAlert,
  UserCheck,
  MessageSquareOff,
  Scale,
  Globe,
  Mail,
  Check,
  TriangleAlert,
} from "lucide-react";
import SEO from "@/components/SEO";

const responsibilities = [
  "I am at least 18 years of age.",
  "I am a qualified researcher, scientist, or laboratory professional purchasing for legitimate in vitro or laboratory research purposes.",
  "I will not use, administer, or distribute these products for human or veterinary consumption.",
  "I understand and accept full responsibility for compliance with all applicable federal, state, and local laws governing the purchase, possession, and use of research chemicals in my jurisdiction.",
  "I have the knowledge and facilities to handle research-grade compounds safely and responsibly.",
];

const sections = [
  {
    icon: <FlaskConical className="w-6 h-6" />,
    title: "For Research Use Only",
    color: "text-[oklch(0.35_0.15_260)]",
    bg: "bg-[oklch(0.95_0.01_260)]",
    body: "All products sold by Vitum Lab are intended exclusively for in vitro laboratory research and scientific study by qualified researchers. They are not intended for human consumption, veterinary use, diagnostic procedures, or therapeutic application of any kind.",
    emphasis:
      "not intended for human consumption, veterinary use, diagnostic procedures, or therapeutic application of any kind.",
  },
  {
    icon: <MessageSquareOff className="w-6 h-6" />,
    title: "No Medical Advice",
    color: "text-[oklch(0.45_0.12_50)]",
    bg: "bg-[oklch(0.97_0.02_50)]",
    body: "Nothing on this website constitutes medical advice, diagnosis, or treatment recommendations. Any scientific or research information provided is for educational and informational purposes only. Always consult a licensed healthcare professional for medical guidance.",
  },
  {
    icon: <Scale className="w-6 h-6" />,
    title: "Limitation of Liability",
    color: "text-[oklch(0.40_0.08_155)]",
    bg: "bg-[oklch(0.96_0.02_155)]",
    body: "Vitum Lab shall not be held liable for any misuse, improper handling, or unlawful application of its products. The purchaser assumes all risk associated with the acquisition and use of research compounds purchased from Vitum Lab.",
  },
  {
    icon: <Globe className="w-6 h-6" />,
    title: "Regulatory Compliance",
    color: "text-[oklch(0.38_0.10_280)]",
    bg: "bg-[oklch(0.96_0.01_280)]",
    body: "It is the sole responsibility of the purchaser to ensure that the acquisition, possession, and use of any product purchased from Vitum Lab complies with all applicable laws and regulations in their country, state, or locality. Vitum Lab reserves the right to refuse or cancel any order at its discretion.",
  },
];

export default function ResearchDisclaimer() {
  return (
    <div className="min-h-screen bg-[oklch(0.98_0.002_260)]">
      <SEO
        title="Research Disclaimer"
        description="Vitum Lab research disclaimer — all products are for in vitro laboratory use only. Not for human or veterinary consumption."
      />

      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[oklch(0.91_0.004_260)] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[oklch(0.52_0.01_260)] hover:text-[oklch(0.13_0.01_260)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Vitum Lab
          </Link>
        </div>
      </div>

      {/* ── Hero banner ─────────────────────────────────────────────────── */}
      <div className="bg-[oklch(0.13_0.01_260)] text-white">
        <div className="max-w-4xl mx-auto px-6 py-16 sm:py-20">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-xl bg-white/10">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs font-bold tracking-widest uppercase text-white/50">
              Vitum Lab · Legal
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 leading-tight">
            Research Disclaimer
          </h1>
          <p className="text-white/60 text-sm mb-8">Last updated: May 2025</p>

          {/* FDA warning card */}
          <div className="flex items-start gap-4 bg-white/8 border border-white/15 rounded-2xl px-6 py-5">
            <TriangleAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-white/80 leading-relaxed">
              These products have{" "}
              <span className="text-white font-semibold">
                not been evaluated
              </span>{" "}
              by the U.S. Food and Drug Administration (FDA) or any other
              regulatory authority. They are not approved drugs, dietary
              supplements, or medical devices. Vitum Lab makes no claims
              regarding the safety, efficacy, or suitability of any product for
              use in humans or animals.
            </p>
          </div>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 py-14 space-y-8">
        {/* Info section cards */}
        {sections.map(s => (
          <div
            key={s.title}
            className="bg-white rounded-2xl border border-[oklch(0.91_0.004_260)] overflow-hidden shadow-[0_1px_4px_oklch(0.13_0.01_260/0.05)]"
          >
            <div className="px-7 py-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-xl ${s.bg} ${s.color}`}>
                  {s.icon}
                </div>
                <h2 className="text-lg font-bold text-[oklch(0.13_0.01_260)]">
                  {s.title}
                </h2>
              </div>
              <p className="text-[0.9375rem] text-[oklch(0.40_0.01_260)] leading-relaxed">
                {s.body}
              </p>
            </div>
          </div>
        ))}

        {/* Purchaser responsibilities */}
        <div className="bg-white rounded-2xl border border-[oklch(0.91_0.004_260)] overflow-hidden shadow-[0_1px_4px_oklch(0.13_0.01_260/0.05)]">
          <div className="px-7 py-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-xl bg-[oklch(0.95_0.01_260)] text-[oklch(0.35_0.15_260)]">
                <UserCheck className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-[oklch(0.13_0.01_260)]">
                Purchaser Responsibility
              </h2>
            </div>
            <p className="text-[0.9375rem] text-[oklch(0.40_0.01_260)] leading-relaxed mb-6">
              By placing an order with Vitum Lab, the purchaser affirms that:
            </p>
            <ul className="space-y-3">
              {responsibilities.map((r, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-[oklch(0.95_0.01_260)] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-[oklch(0.35_0.15_260)]" />
                  </div>
                  <span className="text-[0.9375rem] text-[oklch(0.40_0.01_260)] leading-relaxed">
                    {r}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-[oklch(0.13_0.01_260)] rounded-2xl px-7 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-white/10">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-white">
                Questions about this disclaimer?
              </p>
              <p className="text-sm text-white/60 mt-0.5">
                Our team is available to help.
              </p>
            </div>
          </div>
          <a
            href="mailto:hello@vitumlab.com"
            className="inline-flex items-center gap-2 bg-white text-[oklch(0.13_0.01_260)] font-semibold text-sm px-5 py-2.5 rounded-full hover:bg-white/90 transition-colors whitespace-nowrap"
          >
            hello@vitumlab.com
          </a>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="border-t border-[oklch(0.91_0.004_260)] mt-4">
        <div className="max-w-4xl mx-auto px-6 py-8 text-center text-xs text-[oklch(0.60_0.01_260)]">
          © {new Date().getFullYear()} Vitum Lab. All products are for research
          use only — not for human or veterinary use.
        </div>
      </div>
    </div>
  );
}
