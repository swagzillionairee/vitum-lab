import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, ArrowRight, Copy, Check } from "lucide-react";
import SEO from "@/components/SEO";

export default function OrderSuccess() {
  const [orderId, setOrderId] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOrderId(params.get("order") ?? "");
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(orderId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.002_260)] flex items-center justify-center px-6">
      <SEO
        title="Order Confirmed"
        description="Your crypto payment has been received by Vitum Lab."
      />
      <div className="bg-white rounded-2xl border border-[oklch(0.91_0.004_260)] shadow-[0_4px_24px_oklch(0.13_0.01_260/0.08)] max-w-md w-full p-10 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-[oklch(0.95_0.04_155)] flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-[oklch(0.45_0.14_155)]" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-[oklch(0.13_0.01_260)] mb-2">
          Payment Received
        </h1>
        <p className="text-[oklch(0.45_0.01_260)] text-[0.9375rem] leading-relaxed mb-6">
          Your crypto payment is being confirmed on the blockchain. This
          typically takes a few minutes depending on the network and coin
          selected.
        </p>

        {orderId && (
          <div className="bg-[oklch(0.97_0.003_260)] rounded-xl px-5 py-4 mb-6 text-left">
            <p className="text-[0.6875rem] font-semibold tracking-widest uppercase text-[oklch(0.52_0.01_260)] mb-1">
              Order Reference
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[0.875rem] font-bold text-[oklch(0.13_0.01_260)]">
                {orderId}
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-[0.75rem] text-[oklch(0.40_0.16_260)] font-semibold hover:underline"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        <p className="text-[0.8125rem] text-[oklch(0.52_0.01_260)] mb-8">
          Once payment is fully confirmed, you will receive an email
          confirmation. If you have any questions contact{" "}
          <a
            href="mailto:hello@vitumlab.com"
            className="text-[oklch(0.40_0.16_260)] hover:underline font-semibold"
          >
            hello@vitumlab.com
          </a>
          .
        </p>

        <Link
          href="/shop"
          className="inline-flex items-center gap-2 btn-primary"
        >
          Continue Shopping <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
