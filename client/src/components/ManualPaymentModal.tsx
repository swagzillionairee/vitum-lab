/*
 * ManualPaymentModal.tsx — post-order "complete your payment" overlay for the
 * manual peer-to-peer methods (Venmo / Cash App / Zelle / bank ACH). Mirrors the
 * 3-step flow: send exactly $X → to this handle → with your order # in the note.
 * The order is already created (pending) by the time this opens, so the order
 * number shown here is the real reference the customer must include.
 */
import { useState } from "react";
import { Copy, Check, X, CheckCircle2, Landmark, DollarSign, AtSign, Building2 } from "lucide-react";

export interface ManualModalData {
  method: string;      // zelle | cashapp | venmo | ach
  handle: string;      // where to send
  instructions: string;
  amount: string;      // formatted, e.g. "211.85"
  orderId: string;     // the reference to put in the memo
  expiresAt?: string;  // ISO — when the reservation auto-expires (countdown)
}

const UI: Record<string, {
  label: string; Icon: typeof AtSign; accent: string; accentBg: string;
  step1: string; copyLabel: string; noteLabel: string;
}> = {
  venmo:   { label: "Venmo",    Icon: AtSign,     accent: "oklch(0.52 0.15 250)", accentBg: "oklch(0.52 0.15 250)", step1: "Send to this @username", copyLabel: "Copy @username", noteLabel: "Add a note — type exactly:" },
  cashapp: { label: "Cash App", Icon: DollarSign, accent: "oklch(0.55 0.16 155)", accentBg: "oklch(0.55 0.16 155)", step1: "Send to this $cashtag", copyLabel: "Copy $cashtag", noteLabel: "Add a note — type exactly:" },
  zelle:   { label: "Zelle",    Icon: Landmark,   accent: "oklch(0.48 0.19 300)", accentBg: "oklch(0.48 0.19 300)", step1: "Send to this number / email", copyLabel: "Copy", noteLabel: "Memo / add notes — type exactly:" },
  ach:     { label: "Bank Transfer", Icon: Building2, accent: "oklch(0.42 0.13 155)", accentBg: "oklch(0.42 0.13 155)", step1: "Send to this account", copyLabel: "Copy details", noteLabel: "Transfer memo — type exactly:" },
};

export default function ManualPaymentModal({ data, onSent, onClose }: {
  data: ManualModalData;
  onSent: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"handle" | "order" | null>(null);
  const ui = UI[data.method] ?? UI.venmo;

  const copy = (text: string, which: "handle" | "order") => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(which); setTimeout(() => setCopied(null), 1500); }, () => {});
  };

  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <div className="flex gap-3">
      <span className="flex-shrink-0 w-7 h-7 rounded-full text-white text-[0.8125rem] font-bold flex items-center justify-center" style={{ backgroundColor: ui.accentBg }}>{n}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );

  const CopyBtn = ({ text, which, label }: { text: string; which: "handle" | "order"; label: string }) => (
    <button onClick={() => copy(text, which)} className="inline-flex min-h-11 items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-[oklch(0.96_0.003_260)] border border-[oklch(0.90_0.004_260)] text-[0.8125rem] font-semibold text-[oklch(0.30_0.01_260)] hover:bg-[oklch(0.94_0.004_260)] transition-colors">
      {copied === which ? <><Check className="w-3.5 h-3.5 text-[oklch(0.45_0.14_155)]" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> {label}</>}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Send your payment" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="relative p-5 pt-12 sm:p-8">
          <button onClick={onClose} aria-label="Close" className="absolute top-2 right-2 flex h-11 w-11 items-center justify-center rounded-full text-[oklch(0.60_0.01_260)] hover:bg-[oklch(0.96_0.003_260)] hover:text-[oklch(0.30_0.01_260)]">
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2.5 mb-1">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: ui.accentBg }}>
                <ui.Icon className="w-5 h-5" />
              </span>
              <span className="text-[1.5rem] font-bold text-[oklch(0.13_0.01_260)]">{ui.label}</span>
            </div>
            <p className="text-[0.9375rem] font-semibold text-[oklch(0.45_0.01_260)]">Complete your {ui.label} payment in 3 steps</p>
          </div>

          {/* Send exactly */}
          <div className="rounded-2xl bg-[oklch(0.16_0.02_260)] px-6 py-4 text-center mb-7">
            <p className="text-[0.6875rem] font-bold tracking-widest uppercase text-white/50 mb-0.5">Send exactly</p>
            <p className="text-[2.25rem] font-bold leading-none" style={{ color: ui.accent }}>${data.amount}</p>
          </div>

          {/* Steps */}
          <div className="space-y-5">
            <Step n={1}>
              <p className="text-[0.6875rem] font-bold tracking-wider uppercase text-[oklch(0.55_0.01_260)]">{ui.step1}</p>
              <p className="text-[1.125rem] font-bold text-[oklch(0.13_0.01_260)] break-all">{data.handle}</p>
              <CopyBtn text={data.handle} which="handle" label={ui.copyLabel} />
              {data.instructions && <p className="text-[0.75rem] text-[oklch(0.50_0.01_260)] mt-2 whitespace-pre-line">{data.instructions}</p>}
            </Step>

            <Step n={2}>
              <p className="text-[0.6875rem] font-bold tracking-wider uppercase text-[oklch(0.55_0.01_260)]">{ui.noteLabel}</p>
              <p className="text-[1.125rem] font-bold font-mono text-[oklch(0.13_0.01_260)] break-all">{data.orderId}</p>
              <CopyBtn text={data.orderId} which="order" label="Copy order ID" />
              {/* Supportive, accurate framing — the old "Missing order ID =
                  automatic refund" threat suppressed completion at the exact
                  send-money step (and wasn't even how the flow works). */}
              <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-[oklch(0.42_0.10_45)] mt-2">
                This ID is how we match your transfer to your order — pop it in the memo and you're set.
              </p>
            </Step>

            <Step n={3}>
              <p className="text-[0.6875rem] font-bold tracking-wider uppercase text-[oklch(0.55_0.01_260)]">Tap the button below</p>
              <p className="text-[0.9375rem] font-semibold text-[oklch(0.30_0.01_260)]">We'll confirm your order by email within minutes.</p>
            </Step>
          </div>

          {/* CTA */}
          <button onClick={onSent} className="flex items-center justify-center gap-2 w-full mt-7 py-3.5 rounded-xl text-white text-[1rem] font-bold transition-opacity hover:opacity-90" style={{ backgroundColor: ui.accentBg }}>
            <CheckCircle2 className="w-5 h-5" /> I've Sent the Payment
          </button>

          <p className="text-center text-[0.8125rem] text-[oklch(0.55_0.01_260)] mt-4">
            Questions? <a href="mailto:hello@vitumlab.com" className="font-semibold" style={{ color: ui.accent }}>hello@vitumlab.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
