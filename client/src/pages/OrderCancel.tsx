import { Link } from "wouter";
import { XCircle, ArrowLeft, ArrowRight } from "lucide-react";
import SEO from "@/components/SEO";

export default function OrderCancel() {
  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-6">
      <SEO title="Payment Cancelled" description="Your payment was cancelled. Your cart is still saved." />
      <div className="bg-white rounded-2xl border border-[oklch(0.91_0.004_260)] shadow-[0_4px_24px_oklch(0.13_0.01_260/0.08)] max-w-md w-full p-10 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-[oklch(0.97_0.02_30)] flex items-center justify-center">
            <XCircle className="w-8 h-8 text-[oklch(0.55_0.18_30)]" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-[oklch(0.13_0.01_260)] mb-2">Payment Cancelled</h1>
        <p className="text-[oklch(0.45_0.01_260)] text-[0.9375rem] leading-relaxed mb-8">
          No payment was taken. Your cart items are still saved — you can return and complete your order whenever you're ready.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/" className="inline-flex items-center gap-2 btn-secondary">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <Link href="/shop" className="inline-flex items-center gap-2 btn-primary">
            Return to Shop <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
