/*
 * payram.ts — PayRam (self-hosted, primary card/crypto processor) API client +
 * webhook verification. PayRam is used at checkout when PAYMENT_PROCESSOR=payram;
 * otherwise NowPayments creates the invoice (create-crypto-payment.ts).
 *
 * Two integration details are intentionally env-configurable until confirmed
 * from the PayRam dashboard/docs, so going live needs no code change:
 *   - the API-key header  → PAYRAM_API_KEY_HEADER (default "API-Key", per PayRam
 *     docs; for an Authorization: Bearer-style API set it to "Authorization" +
 *     PAYRAM_API_KEY_SCHEME).
 *   - whether webhooks are signed → PAYRAM_WEBHOOK_SECRET + PAYRAM_WEBHOOK_SIG_HEADER.
 *
 * API shape (per PayRam merchant docs):
 *   POST {PAYRAM_API_URL}/api/v1/payram-payment-session
 *     { amount, currency, invoiceId, merchantUserId } -> { reference_id, url }
 *   Webhook (project-configured URL): POST { reference_id, invoice_id, status,
 *     amount, currency, filled_amount }  ->  respond { received: true }
 */
import crypto from "node:crypto";

export type PayramSession = { url: string; referenceId: string | null };

export type PayramWebhook = {
  reference_id?: string;
  invoice_id?: string;
  status?: string;
  amount?: string | number;
  currency?: string;
  filled_amount?: string | number;
};

function apiUrl(): string {
  const url = process.env.PAYRAM_API_URL;
  if (!url) throw new Error("PAYRAM_API_URL is not set");
  return url.replace(/\/+$/, "");
}

/**
 * Auth header(s) for PayRam API calls. PayRam uses an `API-Key: <key>` header
 * (per docs); override with PAYRAM_API_KEY_HEADER (+ PAYRAM_API_KEY_SCHEME when
 * using an "Authorization" header) if your build differs.
 */
function authHeaders(): Record<string, string> {
  const key = process.env.PAYRAM_API_KEY;
  if (!key) throw new Error("PAYRAM_API_KEY is not set");
  const header = process.env.PAYRAM_API_KEY_HEADER || "API-Key";
  if (header.toLowerCase() === "authorization") {
    const scheme = process.env.PAYRAM_API_KEY_SCHEME ?? "Bearer";
    return { Authorization: scheme ? `${scheme} ${key}` : key };
  }
  return { [header]: key };
}

/** Create a hosted PayRam payment session and return its redirect URL. */
export async function createPaymentSession(params: {
  amount: number;
  invoiceId: string;
  merchantUserId: string;
  currency?: string;
}): Promise<PayramSession> {
  const res = await fetch(`${apiUrl()}/api/v1/payram-payment-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      amount: String(params.amount),
      // The session endpoint expects a crypto/stablecoin currency (ETH, USDC,
      // USDT…), not fiat — USDC maps ~1:1 to our USD prices.
      currency: params.currency || process.env.PAYRAM_CURRENCY || "USDC",
      invoiceId: params.invoiceId,
      merchantUserId: params.merchantUserId,
    }),
  });
  if (!res.ok) {
    throw new Error(`PayRam ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { url?: string; reference_id?: string };
  if (!data.url) throw new Error("PayRam response missing payment url");
  return { url: data.url, referenceId: data.reference_id ?? null };
}

/** A PayRam payment counts as paid once fully (or over) filled. */
export function isPayramPaidStatus(status: string | undefined | null): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "FILLED" || s === "OVER_FILLED";
}

/** Lower-cased header name PayRam signs webhooks with (Node lower-cases headers). */
export const PAYRAM_SIG_HEADER = (process.env.PAYRAM_WEBHOOK_SIG_HEADER || "x-payram-signature").toLowerCase();

/**
 * Verify a PayRam webhook. If PAYRAM_WEBHOOK_SECRET is unset we accept (the node
 * may not sign webhooks — confirm in the dashboard); when set, require an
 * HMAC-SHA256 hex digest of the raw body to match the signature header.
 */
export function verifyPayramWebhook(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.PAYRAM_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature) return false;
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(computed);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
