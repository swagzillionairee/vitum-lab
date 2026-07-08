import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, ArrowRight, Copy, Check, Clock } from "lucide-react";
import SEO from "@/components/SEO";
import { authedFetch } from "@/lib/api";

interface ManualCfg { enabled: boolean; handle: string; instructions: string }

const METHOD_LABEL: Record<string, { label: string; memo: string }> = {
  zelle: { label: "Zelle", memo: "memo / note" },
  cashapp: { label: "Cash App", memo: "note" },
  venmo: { label: "Venmo", memo: "note" },
  ach: { label: "bank transfer", memo: "transfer memo" },
};

export default function OrderSuccess() {
  const [orderId, setOrderId] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [handle, setHandle] = useState<ManualCfg | null>(null);
  const [copied, setCopied] = useState<"order" | "handle" | null>(null);
  const [sentState, setSentState] = useState<"idle" | "sending" | "sent">("idle");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOrderId(params.get("order") ?? "");
    setIsFree(params.get("free") === "1");
    const isAwaiting = params.get("awaiting") === "1";
    setAwaiting(isAwaiting);
    const m = params.get("method") ?? "";
    setMethod(m);
    setAmount(params.get("amt") ?? "");
    const exp = params.get("exp");
    const expMs = exp ? new Date(exp).getTime() : NaN;
    if (Number.isFinite(expMs)) setExpiresAt(expMs);
    // For a manual transfer, pull the send-to handle from the public config.
    if (isAwaiting && m) {
      fetch("/api/public/site")
        .then((r) => r.json())
        .then((d) => { const p = d.payments?.[m]; if (p?.handle) setHandle(p as ManualCfg); })
        .catch(() => {});
    }
  }, []);

  const copy = (text: string, which: "order" | "handle") => {
    navigator.clipboard?.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  // Tick a countdown to the reservation's expiry (minute resolution).
  useEffect(() => {
    if (!awaiting || !expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [awaiting, expiresAt]);

  const label = METHOD_LABEL[method]?.label ?? "your selected method";
  const memo = METHOD_LABEL[method]?.memo ?? "memo";
  const remainMs = expiresAt ? expiresAt - now : null;
  const countdown = remainMs != null && remainMs > 0
    ? `${Math.floor(remainMs / 86400000)}d ${Math.floor((remainMs % 86400000) / 3600000)}h`
    : null;

  // "I've sent the payment" from the success page (in case they closed the
  // checkout modal) — same alert-the-payment-inbox call as the modal button.
  const markSent = () => {
    if (sentState !== "idle" || !orderId) return;
    setSentState("sending");
    authedFetch("/api/account/payment-sent", { method: "POST", body: JSON.stringify({ orderId }) })
      .then(() => setSentState("sent"))
      .catch(() => setSentState("sent")); // best-effort; the order is already placed
  };

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.002_260)] flex items-center justify-center px-6 py-12">
      <SEO title={awaiting ? "Complete Your Payment" : "Order Confirmed"} description="Your Vitum Lab order." />
      <div className="bg-white rounded-2xl border border-[oklch(0.91_0.004_260)] shadow-[0_4px_24px_oklch(0.13_0.01_260/0.08)] max-w-md w-full p-10 text-center">
        <div className="flex justify-center mb-6">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${awaiting ? "bg-[oklch(0.95_0.04_85)]" : "bg-[oklch(0.95_0.04_155)]"}`}>
            {awaiting
              ? <Clock className="w-8 h-8 text-[oklch(0.55_0.12_85)]" />
              : <CheckCircle2 className="w-8 h-8 text-[oklch(0.45_0.14_155)]" />}
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[oklch(0.13_0.01_260)] mb-2">
          {awaiting ? "Almost Done — Send Your Payment" : isFree ? "Order Confirmed" : "Payment Received"}
        </h1>
        <p className="text-[oklch(0.45_0.01_260)] text-[0.9375rem] leading-relaxed mb-6">
          {awaiting
            ? `Your order is reserved. Send your payment via ${label} using the details below — we'll confirm and ship as soon as it arrives.`
            : isFree
              ? "Your order is confirmed and is being prepared for shipment. A confirmation email is on its way."
              : "Your payment is being confirmed. This usually takes a few minutes."}
        </p>

        {/* Reservation countdown */}
        {awaiting && countdown && (
          <div className="inline-flex items-center gap-1.5 mb-6 rounded-full bg-[oklch(0.95_0.04_85)] px-3.5 py-1.5 text-[0.8125rem] font-semibold text-[oklch(0.45_0.12_70)]">
            <Clock className="w-3.5 h-3.5" /> Reserved — expires in {countdown}
          </div>
        )}

        {/* Manual-payment instructions */}
        {awaiting && (
          <div className="bg-[oklch(0.97_0.02_200)] border border-[oklch(0.88_0.05_200)] rounded-xl p-5 mb-6 text-left space-y-3">
            {amount && (
              <div className="flex items-baseline justify-between">
                <span className="text-[0.8125rem] text-[oklch(0.42_0.03_200)]">Amount to send</span>
                <span className="text-[1.25rem] font-bold text-[oklch(0.20_0.04_200)]">${amount}</span>
              </div>
            )}
            {handle?.handle ? (
              <div>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[oklch(0.45_0.08_200)] mb-1">Send {label} to</p>
                <div className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2.5 border border-[oklch(0.90_0.03_200)]">
                  <span className="font-mono text-[0.9375rem] font-bold text-[oklch(0.20_0.04_200)] break-all">{handle.handle}</span>
                  <button onClick={() => copy(handle.handle, "handle")} className="flex items-center gap-1 text-[0.75rem] font-semibold text-[oklch(0.42_0.11_200)] flex-shrink-0 hover:underline">
                    {copied === "handle" ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[0.8125rem] text-[oklch(0.42_0.03_200)]">Check your email for the {label} payment details.</p>
            )}
            {handle?.instructions && (
              <p className="text-[0.75rem] text-[oklch(0.42_0.03_200)] whitespace-pre-line">{handle.instructions}</p>
            )}
            <p className="text-[0.75rem] text-[oklch(0.42_0.03_200)] pt-1 border-t border-[oklch(0.90_0.03_200)]">
              ⚠️ Put your <span className="font-semibold">order number</span> in the {memo} so we can match your payment.
            </p>
          </div>
        )}

        {orderId && (
          <div className="bg-[oklch(0.97_0.003_260)] rounded-xl px-5 py-4 mb-6 text-left">
            <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-[oklch(0.52_0.01_260)] mb-1">
              {awaiting ? "Order Number — include this in your payment" : "Order Reference"}
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[0.875rem] font-bold text-[oklch(0.13_0.01_260)] break-all">{orderId}</span>
              <button onClick={() => copy(orderId, "order")} className="flex items-center gap-1 text-[0.75rem] text-[oklch(0.40_0.16_260)] font-semibold hover:underline flex-shrink-0">
                {copied === "order" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === "order" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* "I've sent the payment" — lets a customer who closed the checkout
            modal still ping us to verify their transfer. */}
        {awaiting && (
          sentState === "sent" ? (
            <div className="flex items-center justify-center gap-2 mb-6 rounded-xl bg-[oklch(0.96_0.03_155)] border border-[oklch(0.85_0.06_155)] px-4 py-3 text-[0.875rem] font-semibold text-[oklch(0.35_0.12_155)]">
              <CheckCircle2 className="w-4 h-4" /> Thanks! We'll confirm once your payment lands.
            </div>
          ) : (
            <button
              onClick={markSent}
              disabled={sentState === "sending"}
              className="flex items-center justify-center gap-2 w-full mb-6 py-3.5 rounded-xl bg-[oklch(0.42_0.14_155)] text-white text-[0.9375rem] font-bold hover:bg-[oklch(0.37_0.14_155)] transition-colors disabled:opacity-60"
            >
              <CheckCircle2 className="w-5 h-5" /> {sentState === "sending" ? "Sending…" : "I've Sent the Payment"}
            </button>
          )
        )}

        <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-8">
          {awaiting
            ? "Once we receive your payment you'll get a confirmation email. Questions? Contact "
            : isFree
              ? "A confirmation email has been sent. If you have any questions contact "
              : "Once payment is fully confirmed, you will receive an email confirmation. If you have any questions contact "}
          <a href="mailto:hello@vitumlab.com" className="text-[oklch(0.40_0.16_260)] hover:underline font-semibold">hello@vitumlab.com</a>.
        </p>

        <Link href="/shop" className="inline-flex items-center gap-2 btn-primary">
          Continue Shopping <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
