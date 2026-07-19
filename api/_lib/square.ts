/*
 * square.ts — Square card charging (Web Payments SDK tokenizes the card in the
 * browser → a single-use `source_id`; we charge the server-computed amountDue
 * here via the Payments API). Raw REST (no SDK dependency), same style as the
 * NowPayments integration.
 *
 * Env (Vercel):
 *   SQUARE_ACCESS_TOKEN   — server access token (production or sandbox)
 *   SQUARE_LOCATION_ID    — the location to attribute the payment to
 *   SQUARE_ENVIRONMENT    — "production" | "sandbox" (default sandbox)
 * Client build (VITE_ — see SquareCardBox):
 *   VITE_SQUARE_APPLICATION_ID, VITE_SQUARE_LOCATION_ID, VITE_SQUARE_ENVIRONMENT
 */

import { deferEmail, notifyAdmin } from "./email.js";

const SQUARE_VERSION = "2025-01-23";

/** True only when the server has everything it needs to charge a card. */
export function squareConfigured(): boolean {
  return !!(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID);
}

function squareBase(): string {
  return (process.env.SQUARE_ENVIRONMENT ?? "sandbox").toLowerCase() === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

export type SquareChargeResult =
  | { status: "succeeded"; paymentId: string }
  | { status: "failed"; error: string; paymentId?: string };

/**
 * Charge the exact amountDue (USD) against a Web-Payments `source_id`. The order
 * id is the idempotency key, so a retried request never double-charges. Returns
 * "succeeded" ONLY on a captured (COMPLETED) payment.
 */
export async function chargeSquare(params: {
  sourceId: string;
  amountDue: number;
  orderId: string;
  email?: string;
}): Promise<SquareChargeResult> {
  if (!squareConfigured()) return { status: "failed", error: "Card payments aren't configured." };

  const res = await fetch(`${squareBase()}/v2/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_id: params.sourceId,
      idempotency_key: params.orderId, // order id (e.g. "KFD-837291") — unique per order
      amount_money: { amount: Math.round(params.amountDue * 100), currency: "USD" },
      location_id: process.env.SQUARE_LOCATION_ID,
      autocomplete: true, // capture immediately (not auth-only)
      buyer_email_address: params.email,
      reference_id: params.orderId,
      note: `Vitum Lab order ${params.orderId}`,
    }),
  });

  const body: any = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Square returns { errors: [{ detail, code, category }] }.
    const detail = body?.errors?.[0]?.detail as string | undefined;
    const code = body?.errors?.[0]?.code as string | undefined;
    console.error("Square charge failed:", res.status, code, detail);
    return { status: "failed", error: friendlyDecline(code, detail), paymentId: body?.payment?.id };
  }

  const payment = body?.payment ?? {};
  const paymentId = String(payment?.id ?? "");
  const status = String(payment?.status ?? "").toUpperCase();

  // COMPLETED = funds captured. APPROVED (auth-only) shouldn't happen with
  // autocomplete:true, but refuse it rather than ship an uncaptured hold.
  if (status === "COMPLETED") return { status: "succeeded", paymentId };
  console.warn(`Square payment ${paymentId} returned status ${status} (not COMPLETED) — not confirming.`);
  // A non-COMPLETED success response is an anomaly a human must reconcile in
  // the Square dashboard (possible dangling APPROVED hold on a real card).
  deferEmail(
    notifyAdmin(
      "Square payment anomaly — manual review needed",
      `Payment ${paymentId} for order ${params.orderId} returned status ${status} instead of COMPLETED. ` +
        `The order was NOT confirmed. Check the payment in the Square dashboard — an APPROVED hold may need voiding or capturing.`,
    ),
  );
  return { status: "failed", error: "Your card couldn't be charged. Please try another card.", paymentId };
}

// Map the most common Square decline codes to customer-safe copy.
function friendlyDecline(code?: string, detail?: string): string {
  switch (code) {
    case "CARD_DECLINED":
    case "GENERIC_DECLINE":
      return "Your card was declined. Please try another card.";
    case "INSUFFICIENT_FUNDS":
      return "Your card was declined for insufficient funds.";
    case "CVV_FAILURE":
      return "The card security code (CVV) didn't match. Please re-enter it.";
    case "ADDRESS_VERIFICATION_FAILURE":
      return "The billing ZIP couldn't be verified. Please check it and try again.";
    case "CARD_EXPIRED":
    case "INVALID_EXPIRATION":
      return "That card is expired or the expiry is invalid.";
    default:
      return detail || "Your card couldn't be charged. Please try another card.";
  }
}
