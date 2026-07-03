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
  // Fail CLOSED: with no configured secret we cannot authenticate the payload, so
  // reject rather than accept. (A missing/cleared TAGADA_WEBHOOK_SECRET must never
  // silently disable webhook auth and let a forged "paid" event confirm an order.)
  if (!secret) {
    console.error("⚠️ TAGADA_WEBHOOK_SECRET is not set — rejecting Tagada webhook (fail-closed).");
    return false;
  }
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
  const resp: any = await tagada.products.list({ storeId: tagadaStoreId(), page: 1, per_page: 100, includeVariants: true });
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

// ─────────────────────────────────────────────────────────────────────────────
// Slice 2b — the actual charge. The client tokenizes the card with core-js
// (store-agnostic) and sends us the token; we vault it into a payment instrument
// for our store and charge the EXACT server-computed amountDue via payments
// .process (amount is server-authoritative — the client never sends a price).
// ⚠️ SANDBOX-CONFIRM: the 3DS redirect field + status casing on the process
// result are confirmed against Tagada test mode (see CLAUDE.md Slice 2b).
// ─────────────────────────────────────────────────────────────────────────────

export type ChargeResult =
  | { status: "succeeded"; paymentId: string }
  | { status: "redirect"; url: string; paymentId: string }
  | { status: "processing"; paymentId: string }
  | { status: "failed"; error: string; paymentId: string };

/** Charge `amountDue` (dollars) to a client-tokenized card. Tagada amounts are cents. */
export async function chargeCard(params: {
  amountDue: number;
  tagadaToken: string;
  email: string;
  returnUrl: string;
}): Promise<ChargeResult> {
  const tagada = await tagadaClient();
  const storeId = tagadaStoreId();

  // 1) Vault the token → a payment instrument scoped to our store.
  const inst: any = await tagada.paymentInstruments.createFromToken({
    tagadaToken: params.tagadaToken,
    storeId,
    customerData: { email: params.email },
  });
  const paymentInstrumentId: string = inst?.paymentInstrument?.id ?? inst?.paymentInstrumentId ?? inst?.id ?? "";
  if (!paymentInstrumentId) throw new Error("Tagada createFromToken returned no payment instrument id");

  // 2) Charge the exact amountDue (cents). returnUrl is where 3DS bounces back.
  const res: any = await tagada.payments.process({
    amount: Math.round(params.amountDue * 100),
    currency: "USD",
    storeId,
    paymentInstrumentId,
    returnUrl: params.returnUrl,
  });
  const payment: any = res?.payment ?? res;
  const paymentId = String(payment?.id ?? "");
  const status = String(payment?.status ?? "").toLowerCase();

  // Only a real CAPTURE counts as paid. The charge runs in Tagada's auto-capture
  // ("purchase") mode, which settles as captured/succeeded/paid (the July 2026 live
  // test returned "succeeded"). A bare "authorized" is a hold, NOT captured funds,
  // so it must never confirm/ship — it is handled explicitly below. If Tagada is
  // ever run in auth-then-capture mode, add an explicit capture call here rather
  // than relaxing this check.
  if (status === "captured" || status === "succeeded" || status === "paid") {
    return { status: "succeeded", paymentId };
  }
  const redirectUrl =
    payment?.requireActionData?.redirectUrl ??
    payment?.nextAction?.redirectUrl ??
    payment?.redirectUrl ??
    res?.redirectUrl;
  if (redirectUrl) return { status: "redirect", url: String(redirectUrl), paymentId };

  // Async settlement — the processor accepted the charge but the final result
  // lands later (Tagada webhook order/paid | payment/succeeded, or admin
  // Re-check). This is NOT a decline: leave the order pending rather than telling
  // the customer their card failed.
  if (status === "pending" || status === "processing" || status === "in_progress") {
    return { status: "processing", paymentId };
  }

  // Uncaptured authorization (hold, not a capture) — refuse rather than fulfill.
  // The hold auto-expires and the customer can retry; configure Tagada for
  // purchase/auto-capture to avoid landing here.
  if (status === "authorized") {
    console.warn(`⚠️ Tagada payment ${paymentId} returned "authorized" (auth ≠ capture) — refusing to confirm an uncaptured hold.`);
    return { status: "failed", error: "Your payment couldn't be completed (authorized but not captured). Please try again or contact support.", paymentId };
  }

  return { status: "failed", error: "Your card was declined. Please try another card.", paymentId };
}

/** Normalized reconciliation state for an existing Tagada payment. */
export type TagadaPaymentState = "paid" | "authorized" | "failed" | "refunded" | "pending" | "unknown";

/**
 * Retrieve a Tagada payment by id and normalize its status for admin
 * reconciliation (the "Re-check" action). Tagada's canonical PaymentStatus is
 * captured | authorized | declined | error | voided | cancelled | refunded |
 * partially_refunded | pending; the dashboard/CSV export surfaces "succeeded"
 * as a display alias for a capture (accepted here too). `amount` is in cents,
 * mirroring payments.process.
 *
 * NOTE: unlike the synchronous charge path, "authorized" (a hold, not a
 * capture) is deliberately NOT treated as paid here — an admin re-check must
 * never confirm/ship on an uncaptured authorization; it surfaces as its own
 * state for the owner to resolve in the Tagada dashboard.
 */
export async function getTagadaPaymentStatus(
  paymentId: string,
): Promise<{ state: TagadaPaymentState; raw: string; amount: number | null; currency: string | null }> {
  const tagada = await tagadaClient();
  const res: any = await tagada.payments.retrieve(paymentId);
  const p: any = res?.payment ?? res;
  const raw = String(p?.status ?? "").toLowerCase();
  const amount = typeof p?.amount === "number" ? p.amount : null;
  const currency = p?.currency ? String(p.currency) : null;
  let state: TagadaPaymentState = "unknown";
  if (raw === "captured" || raw === "succeeded" || raw === "paid") state = "paid";
  else if (raw === "authorized") state = "authorized";
  else if (raw === "declined" || raw === "error" || raw === "voided" || raw === "cancelled" || raw === "failed") state = "failed";
  else if (raw === "refunded" || raw === "partially_refunded") state = "refunded";
  else if (raw === "pending") state = "pending";
  return { state, raw, amount, currency };
}
