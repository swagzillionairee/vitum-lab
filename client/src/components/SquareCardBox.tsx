/*
 * SquareCardBox.tsx — Square Web Payments SDK card entry.
 * Loads Square's hosted SDK (secure iframed card fields — the raw PAN never
 * touches our page or server), tokenizes on "Pay" into a single-use source_id,
 * and hands it to onPay. The server charges the exact server-computed amount.
 *
 * Client env (set in Vercel, VITE_ prefix → rebuild):
 *   VITE_SQUARE_APPLICATION_ID  — Square application id (sandbox or production)
 *   VITE_SQUARE_LOCATION_ID     — location id
 *   VITE_SQUARE_ENVIRONMENT     — "production" | "sandbox" (default sandbox)
 */
import { useEffect, useRef, useState } from "react";
import { Lock, Loader2 } from "lucide-react";

const APP_ID = import.meta.env.VITE_SQUARE_APPLICATION_ID as string | undefined;
const LOCATION_ID = import.meta.env.VITE_SQUARE_LOCATION_ID as string | undefined;
const SQ_ENV = ((import.meta.env.VITE_SQUARE_ENVIRONMENT as string) || "sandbox").toLowerCase();
const SDK_URL = SQ_ENV === "production"
  ? "https://web.squarecdn.com/v1/square.js"
  : "https://sandbox.web.squarecdn.com/v1/square.js";

// Load the Square SDK once, shared across mounts.
let sdkPromise: Promise<any> | null = null;
function loadSquareSdk(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).Square) return Promise.resolve((window as any).Square);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => (window as any).Square ? resolve((window as any).Square) : reject(new Error("Square SDK failed to load"));
    s.onerror = () => reject(new Error("Square SDK failed to load"));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export default function SquareCardBox({ disabled, busy, onPay, onError, onUnavailable }: {
  amountDue: number;
  disabled: boolean;
  busy: boolean;
  onPay: (squareToken: string) => void;
  onError: (msg: string) => void;
  /** Called when the card form can never become ready (missing client config /
   *  SDK load failure) — lets the checkout drop the Card tile instead of
   *  showing a dead form. */
  onUnavailable?: () => void;
}) {
  const cardRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState("");
  const [tokenizing, setTokenizing] = useState(false);

  useEffect(() => {
    mounted.current = true;
    if (!APP_ID || !LOCATION_ID) {
      setInitError("Card payments aren't configured yet.");
      onUnavailable?.();
      return;
    }
    let card: any = null;
    (async () => {
      try {
        const Square = await loadSquareSdk();
        if (!mounted.current) return;
        const payments = Square.payments(APP_ID, LOCATION_ID);
        card = await payments.card();
        if (!mounted.current) { try { await card.destroy(); } catch { /* noop */ } return; }
        await card.attach(containerRef.current);
        cardRef.current = card;
        setReady(true);
      } catch (e) {
        console.error("Square init failed:", e);
        if (mounted.current) {
          setInitError("Couldn't load the secure card form. Please refresh or choose another method.");
          onUnavailable?.();
        }
      }
    })();
    return () => {
      mounted.current = false;
      const c = cardRef.current ?? card;
      if (c) { try { c.destroy(); } catch { /* noop */ } }
      cardRef.current = null;
    };
  }, []);

  const pay = async () => {
    if (!cardRef.current) { onError("The card form isn't ready yet — please wait a moment."); return; }
    setTokenizing(true);
    onError("");
    try {
      const result = await cardRef.current.tokenize();
      if (!mounted.current) return; // user switched method mid-tokenize
      if (result.status === "OK" && result.token) {
        onPay(result.token);
      } else {
        const msg = result.errors?.[0]?.message as string | undefined;
        onError(msg || "Please check your card details and try again.");
      }
    } catch (e) {
      console.error("Square tokenize failed:", e);
      onError("We couldn't read that card — please check the details and try again.");
    } finally {
      if (mounted.current) setTokenizing(false);
    }
  };

  const working = busy || tokenizing;

  if (initError) {
    return <p className="text-[0.8125rem] text-red-600 py-2">{initError}</p>;
  }

  return (
    <div className="space-y-3">
      {/* Square injects its secure card iframe here. */}
      <div ref={containerRef} className="min-h-[46px]" />
      {!ready && (
        <div className="flex items-center gap-2 text-[0.8125rem] text-[oklch(0.52_0.01_260)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading secure card form…
        </div>
      )}
      <button
        onClick={pay}
        disabled={disabled || working || !ready}
        className="flex items-center justify-center gap-2 w-full btn-primary py-3.5 text-[0.9375rem] disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {working ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : <><Lock className="w-4 h-4" /> Pay securely</>}
      </button>
      <p className="text-[0.6875rem] text-[oklch(0.55_0.01_260)] text-center">Encrypted &amp; processed by Square. We never see your full card number.</p>
    </div>
  );
}
