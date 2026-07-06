/*
 * TagadaCardBox.tsx — inline card entry for /checkout when TagadaPay is the
 * active processor (VITE_TAGADA_CHECKOUT_ENABLED). The card is tokenized in the
 * browser via @tagadapay/core-js (raw PAN never touches our server), then the
 * token is handed to Checkout.handlePay, which charges the exact server-computed
 * amountDue. 3DS/redirect + fulfillment are handled server-side.
 */
import { useEffect, useRef, useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { useCardTokenization } from "@tagadapay/core-js/react";

const TGD_ENV = ((import.meta.env.VITE_TAGADA_ENV as string) || "development") as
  | "production"
  | "development"
  | "local"
  | "default";

/**
 * Normalize a free-form expiry entry to the strict `MM/YY` the tokenizer's
 * validator requires (/^(0[1-9]|1[0-2])\/\d{2}$/). Handles "03 / 30", "0330",
 * and "03/2030" alike — the spaces our old "MM / YY" placeholder invited were
 * rejected by that regex and surfaced as an opaque "Failed to tokenize card".
 */
function normalizeExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const mm = digits.slice(0, 2);
  let yy = digits.slice(2);
  if (yy.length > 2) yy = yy.slice(-2); // 4-digit year → last two
  return yy ? `${mm}/${yy}` : mm;
}

export default function TagadaCardBox({
  amountDue,
  disabled,
  busy,
  onPay,
  onError,
}: {
  amountDue: number;
  disabled: boolean;
  busy: boolean;
  onPay: (tagadaToken: string) => void;
  onError: (msg: string) => void;
}) {
  const { tokenizeCard, isLoading } = useCardTokenization({ environment: TGD_ENV, autoInitialize: true });
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "" });
  const [tokenizing, setTokenizing] = useState(false);

  // If the user switches payment method mid-tokenize, this box unmounts but the
  // in-flight tokenize promise still resolves — it must NOT fire onPay then, or
  // a card order gets created on top of whatever the user actually chose.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const inputBase =
    "border border-[oklch(0.88_0.004_260)] rounded-lg px-3 py-2.5 text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-[oklch(0.40_0.16_260)] focus:border-transparent";

  const pay = async () => {
    if (!card.number.trim() || !card.expiry.trim() || !card.cvc.trim()) {
      onError("Please enter your card number, expiry, and CVC.");
      return;
    }
    setTokenizing(true);
    onError("");
    try {
      const { tagadaToken } = await tokenizeCard({
        cardNumber: card.number.replace(/\s+/g, ""),
        expiryDate: normalizeExpiry(card.expiry),
        cvc: card.cvc.trim(),
      });
      if (!mounted.current) return; // user switched method mid-tokenize — drop it
      onPay(tagadaToken);
    } catch (e) {
      // The core-js SDK wraps the provider (BasisTheory) failure. Log the
      // underlying error + code so a misconfig is diagnosable in devtools — the
      // most common one being VITE_TAGADA_ENV not set to "production" for a live
      // key, which tokenizes the card against the sandbox vault and fails.
      const err = e as { message?: string; code?: string; originalError?: unknown };
      console.error("Tagada card tokenization failed:", err?.code, err?.message, err?.originalError);
      onError(
        err?.message
          ? `${err.message}${err.code ? ` (${err.code})` : ""}`
          : "We couldn't read that card — please check the details and try again.",
      );
    } finally {
      setTokenizing(false);
    }
  };

  const working = busy || tokenizing;

  return (
    <div className="space-y-2.5">
      <input
        inputMode="numeric"
        autoComplete="cc-number"
        placeholder="Card number"
        value={card.number}
        onChange={(e) => setCard({ ...card, number: e.target.value })}
        className={`${inputBase} w-full`}
      />
      <div className="flex gap-3">
        <input
          autoComplete="cc-exp"
          placeholder="MM/YY"
          value={card.expiry}
          onChange={(e) => setCard({ ...card, expiry: e.target.value })}
          className={`${inputBase} flex-1 min-w-0`}
        />
        <input
          inputMode="numeric"
          autoComplete="cc-csc"
          placeholder="CVC"
          value={card.cvc}
          onChange={(e) => setCard({ ...card, cvc: e.target.value })}
          className={`${inputBase} w-24`}
        />
      </div>
      <button
        onClick={pay}
        disabled={disabled || working || isLoading}
        className="flex items-center justify-center gap-2 w-full btn-primary py-3.5 text-[0.9375rem] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {working ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> Processing…
          </>
        ) : (
          <>
            <Lock className="w-4 h-4" /> Pay ${amountDue.toFixed(2)}
          </>
        )}
      </button>
      <p className="text-[0.625rem] text-center text-[oklch(0.70_0.01_260)]">Secured by TagadaPay · card processing on Finix.</p>
    </div>
  );
}
