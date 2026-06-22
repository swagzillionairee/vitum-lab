import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabase-admin.js";
import { isSitewideActive } from "../_lib/pricing.js";
import { paidIpnAction } from "../_lib/orderLifecycle.js";
import { isPayramPaidStatus, verifyPayramWebhook, PAYRAM_SIG_HEADER, type PayramWebhook } from "../_lib/payram.js";
import { ORDER_COLS, confirmPaidOrder, sendConfirmationEmails, recordLatePayment, type PaymentMeta } from "../_lib/fulfillment.js";

// bodyParser off so the PayRam webhook can read the raw body for signature
// verification. The GET routes below don't use req.body, so this is harmless.
export const config = { api: { bodyParser: false } };

// Public (no-auth) endpoints: the site-wide sale banner, customer order
// tracking, and the PayRam payment webhook. Consolidated into one catch-all to
// stay within the Vercel function limit.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathname = (req.url ?? "").split("?")[0];
  const route = pathname.replace(/^\/api\/public\/?/, "").split("/")[0];

  // ── /api/public/payram-webhook — PayRam payment status callbacks ────────────
  // Mirrors nowpayments-webhook: a fully-filled payment confirms the order
  // (decrement stock, emails, loyalty/referral). Idempotent across retries.
  if (route === "payram-webhook") {
    if (req.method !== "POST") return res.status(405).json({ received: false });

    // Raw body (bodyParser is off for this function) for signature parity.
    const chunks: Buffer[] = [];
    for await (const chunk of req as any) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf8");

    const sig = req.headers[PAYRAM_SIG_HEADER] as string | undefined;
    if (!verifyPayramWebhook(rawBody, sig)) {
      return res.status(401).json({ received: false });
    }

    let payload: PayramWebhook;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ received: false });
    }

    const status = String(payload.status ?? "").toUpperCase();
    const orderId = payload.invoice_id ?? null;
    const referenceId = payload.reference_id ?? null;
    console.log(`ℹ️  PayRam webhook — invoice ${orderId ?? "?"} / ref ${referenceId ?? "?"}: ${status}`);

    // Match on our invoiceId (= order id); fall back to the stored reference id.
    let order: any = null;
    if (orderId) {
      const { data } = await supabaseAdmin.from("orders").select(ORDER_COLS).eq("id", orderId).maybeSingle();
      order = data;
    }
    if (!order && referenceId) {
      const { data } = await supabaseAdmin.from("orders").select(ORDER_COLS).eq("payment_id", referenceId).maybeSingle();
      order = data;
    }
    if (!order) return res.status(200).json({ received: true });

    // Only a fully (or over) filled payment confirms the order. OPEN / VERIFYING
    // / PARTIALLY_FILLED just acknowledge — a later FILLED event does the work.
    if (isPayramPaidStatus(status)) {
      const meta: PaymentMeta = {
        payCurrency: payload.currency ?? null,
        payAmount: payload.filled_amount ?? payload.amount ?? null,
        paymentId: referenceId,
      };
      const action = paidIpnAction(order.status);
      try {
        if (action === "late_payment") {
          const note = `⚠️ Payment received (PayRam "${status}", ref ${referenceId ?? "unknown"}) AFTER this order was ${order.status}. Not fulfilled automatically — refund the customer or fulfill manually.`;
          await recordLatePayment(order, meta, note);
        } else {
          if (action === "fulfill") await confirmPaidOrder(order, meta);
          await sendConfirmationEmails(order);
        }
      } catch (err) {
        console.error("PayRam webhook processing error:", err);
      }
    }

    return res.status(200).json({ received: true });
  }

  // ── /api/public/site — public store config (drives the site-wide sale banner) ──
  if (route === "site") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const { data: s } = await supabaseAdmin.from("store_settings").select("*").maybeSingle();
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
    return res.json({
      sitewide: isSitewideActive(s)
        ? {
            active: true,
            percent: Number(s!.sitewide_percent),
            label: (s!.sitewide_label as string | null) ?? null,
            ends_at: (s!.sitewide_ends_at as string | null) ?? null,
          }
        : { active: false },
      quantity_tiers: (s?.quantity_tiers as { min_qty: number; percent: number }[] | null) ?? [],
    });
  }

  // ── /api/public/track?order=ID&email=EMAIL — public order tracking ──────────
  if (route === "track") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const orderId = String(req.query?.order ?? "").trim();
    const email = String(req.query?.email ?? "").trim().toLowerCase();
    if (!orderId || !email) return res.status(400).json({ error: "Order number and email are required." });

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, email, items, net_amount, shipping_amount, status, fulfillment_status, tracking_number, carrier, created_at, confirmed_at, shipped_at, delivered_at, cancelled_at, cancel_reason",
      )
      .eq("id", orderId)
      .maybeSingle();

    // Generic 404 on a miss OR an email mismatch — never reveal which failed,
    // and require the email to match so an order number alone isn't enough.
    if (!order || String(order.email ?? "").trim().toLowerCase() !== email) {
      return res.status(404).json({ error: "No order found for that order number and email." });
    }

    const { email: _omit, ...safe } = order;
    return res.json({ order: safe });
  }

  return res.status(404).json({ error: "Not found" });
}
