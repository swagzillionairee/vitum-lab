/*
 * tagada.ts — TagadaPay (primary card processor) server helpers.
 *
 * Vitum Lab keeps its server-authoritative pricing and charges the exact
 * computed amountDue through Tagada (card processing runs on Finix), using
 * Tagada's headless checkout session + automatic 3DS on the client. This file
 * holds the webhook verification + event helpers; the checkout-session / charge
 * helpers (which pull in @tagadapay/node-sdk) land with the client flow.
 *
 * Webhooks: Tagada issues a per-endpoint secret (`tagada.webhooks.create().secret`)
 * and the merchant verifies the HMAC itself. The exact header name / scheme is
 * env-configurable and confirmed against the sandbox when the client flow lands.
 */
import crypto from "node:crypto";

/** Webhook event types that mean "the customer paid → confirm the order." */
export function isTagadaPaidEvent(eventType: string | undefined | null): boolean {
  const t = (eventType ?? "").toLowerCase();
  return t === "order/paid" || t === "payment/succeeded";
}

/** Header Tagada signs webhooks with (Node lower-cases header names). */
export const TAGADA_SIG_HEADER = (process.env.TAGADA_WEBHOOK_SIG_HEADER || "tagada-signature").toLowerCase();

/**
 * Verify a Tagada webhook via HMAC-SHA256 (hex) of the raw body. When no
 * TAGADA_WEBHOOK_SECRET is configured we accept (pre-configuration / dev). A
 * signature header may be prefixed (e.g. `sha256=<hex>`) — we compare against
 * the trailing token. Timing-safe comparison.
 */
export function verifyTagadaWebhook(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.TAGADA_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature) return false;
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.includes("=") ? signature.slice(signature.lastIndexOf("=") + 1) : signature;
  const a = Buffer.from(computed);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
