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

// ─────────────────────────────────────────────────────────────────────────────
// Slice 2a — node-SDK bootstrap helpers (register webhook, list catalog variant
// ids). @tagadapay/node-sdk is LAZILY imported here so functions that only need
// verifyTagadaWebhook (the webhook receiver) never bundle the SDK. The
// custom-amount charge flow (Slice 2b) is built once the exact charge/3DS
// mechanism is confirmed against the Tagada sandbox — the naive session-discount
// reconciliation was rejected in review (the node Checkout resource cannot read
// a session total, and a session-priced charge stays client-mutable).
// ─────────────────────────────────────────────────────────────────────────────

let _tagada: unknown = null;

/** Lazily construct the Tagada node client (server key from Vercel). */
export async function tagadaClient(): Promise<any> {
  if (_tagada) return _tagada;
  const apiKey = process.env.TAGADA_API_KEY;
  if (!apiKey) throw new Error("TAGADA_API_KEY is not configured");
  const mod: any = await import("@tagadapay/node-sdk");
  const Tagada = mod.default ?? mod.Tagada ?? mod;
  _tagada = new Tagada(apiKey);
  return _tagada;
}

function tagadaStoreId(): string {
  const s = process.env.VITE_TAGADA_STORE_ID;
  if (!s) throw new Error("VITE_TAGADA_STORE_ID is not configured");
  return s;
}

/**
 * One-off: register the checkout-fulfillment webhook at BASE_URL/api/public/
 * tagada-webhook. Returns the signing secret ONCE — paste it into Vercel as
 * TAGADA_WEBHOOK_SECRET, then redeploy. Re-running creates a duplicate webhook.
 */
export async function registerTagadaWebhook(): Promise<{ id: string; url: string; secret: string; eventTypes: string[] }> {
  const tagada = await tagadaClient();
  const baseUrl = process.env.BASE_URL || "https://vitumlab.com";
  const eventTypes = ["order/paid", "payment/succeeded", "order/failed", "payment/failed", "payment/refunded", "order/refunded"];
  const wh = await tagada.webhooks.create({
    storeId: tagadaStoreId(),
    url: `${baseUrl}/api/public/tagada-webhook`,
    eventTypes,
    description: "Vitum Lab checkout fulfillment",
  });
  return { id: wh.id, url: wh.url, secret: wh.secret, eventTypes };
}

/** List the store's products + variant ids/skus/prices — used to build the
 *  cartCode → Tagada variantId map for the checkout flow. */
export async function listTagadaProducts(): Promise<
  Array<{ productId: string; name: string; variants: Array<{ id: string; sku: string | null; price: number | null; name?: string }> }>
> {
  const tagada = await tagadaClient();
  const resp: any = await tagada.products.list({ storeId: tagadaStoreId() });
  const products: any[] = resp?.data ?? resp?.items ?? (Array.isArray(resp) ? resp : []);
  return products.map((p: any) => ({
    productId: p.id,
    name: p.name,
    variants: (p.variants ?? []).map((v: any) => ({
      id: v.id,
      sku: v.sku ?? null,
      price: v.price ?? null,
      name: v.name,
    })),
  }));
}
