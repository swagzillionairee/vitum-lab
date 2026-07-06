import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabase-admin.js";
import { isSitewideActive } from "../_lib/pricing.js";
import { paidIpnAction } from "../_lib/orderLifecycle.js";
import { isTagadaPaidEvent, isTagadaRefundEvent, verifyTagadaWebhook, TAGADA_SIG_HEADER } from "../_lib/tagada.js";
import { ORDER_COLS, confirmPaidOrder, sendConfirmationEmails, recordLatePayment, refundClawback, type PaymentMeta } from "../_lib/fulfillment.js";

// bodyParser off so the Tagada webhook can read the raw body for signature
// verification. The GET routes below don't use req.body, so this is harmless.
export const config = { api: { bodyParser: false } };

// Public (no-auth) endpoints: the site-wide sale banner, customer order
// tracking, and the TagadaPay payment webhook. Consolidated into one catch-all
// to stay within the Vercel function limit.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pathname = (req.url ?? "").split("?")[0];
  const route = pathname.replace(/^\/api\/public\/?/, "").split("/")[0];

  // ── /api/public/tagada-webhook — TagadaPay payment callbacks ────────────────
  // A paid event (order/paid | payment/succeeded) confirms the matching order
  // (decrement stock, emails, loyalty/referral) via the shared fulfillment path.
  // Idempotent across retries. Inert until the checkout flow (Slice 2) registers
  // the webhook + starts stamping the Tagada id on orders; exact payload paths
  // are finalized against the sandbox with the client flow.
  if (route === "tagada-webhook") {
    if (req.method !== "POST") return res.status(405).json({ received: false });

    const chunks: Buffer[] = [];
    for await (const chunk of req as any) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf8");

    const sig = req.headers[TAGADA_SIG_HEADER] as string | undefined;
    if (!verifyTagadaWebhook(rawBody, sig)) return res.status(401).json({ received: false });

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ received: false });
    }

    const type = String(event?.type ?? event?.eventType ?? "");
    const data = event?.data ?? event;
    // We round-trip our order id via checkout metadata; the Tagada order/payment
    // id is stored on orders.payment_id at session creation (Slice 2).
    const ourOrderId = data?.metadata?.orderId ?? data?.order?.metadata?.orderId ?? null;
    const tagadaId = data?.order?.id ?? data?.payment?.id ?? data?.id ?? null;
    console.log(`ℹ️  Tagada webhook — ${type} (order ${ourOrderId ?? "?"} / tagada ${tagadaId ?? "?"})`);

    const isRefund = isTagadaRefundEvent(type);
    if (!isTagadaPaidEvent(type) && !isRefund) return res.status(200).json({ received: true });

    let order: any = null;
    if (ourOrderId) {
      const { data: o } = await supabaseAdmin.from("orders").select(ORDER_COLS).eq("id", ourOrderId).maybeSingle();
      order = o;
    }
    if (!order && tagadaId) {
      const { data: o } = await supabaseAdmin.from("orders").select(ORDER_COLS).eq("payment_id", String(tagadaId)).maybeSingle();
      order = o;
    }
    if (!order) return res.status(200).json({ received: true });

    // Refund/chargeback → revert the order to cancelled so rewards, affiliate
    // commission, and the referral bounty are all clawed back (they exclude
    // cancelled orders). Idempotent across retries.
    if (isRefund) {
      try {
        await refundClawback(order, `Refunded via TagadaPay ("${type}")`);
      } catch (err) {
        console.error("Tagada refund clawback error:", err);
      }
      return res.status(200).json({ received: true });
    }

    const meta: PaymentMeta = {
      payCurrency: data?.currency ?? "USD",
      payAmount: data?.amount ?? null,
      paymentId: tagadaId != null ? String(tagadaId) : null,
    };
    const action = paidIpnAction(order.status);
    try {
      if (action === "late_payment") {
        await recordLatePayment(order, meta, `⚠️ Tagada "${type}" received AFTER this order was ${order.status}. Not fulfilled automatically — refund or fulfill manually.`);
      } else if (action === "fulfill") {
        // Mandatory amount-guard: confirm ONLY if the captured amount matches the
        // order's server-computed amountDue (net + shipping − credit, in cents).
        // Server-authoritative backstop against a manipulated/underpaid charge.
        const dueCents = Math.round(
          (Number(order.net_amount ?? 0) + Number(order.shipping_amount ?? 0) - Number(order.credit_applied ?? 0)) * 100,
        );
        const capturedCents = Number(meta.payAmount);
        // ⚠️ SANDBOX-CONFIRM: the guard treats data.amount as CENTS (chargeCard
        // sends cents). Log raw vs expected so the first live payment confirms the
        // unit before the global flag is flipped — a dollars payload would read
        // 100× low and (correctly, fail-closed) get flagged rather than fulfilled.
        console.log(`ℹ️  Tagada amount-guard — captured(raw)=${meta.payAmount} → ${capturedCents} vs dueCents=${dueCents} (order ${order.id})`);
        if (!Number.isFinite(capturedCents) || Math.abs(capturedCents - dueCents) > 1) {
          await recordLatePayment(order, meta, `⚠️ Tagada "${type}" captured ${meta.payAmount} but order amountDue is ${dueCents} cents — NOT fulfilled. Review before shipping.`);
        } else {
          const claimed = await confirmPaidOrder(order, meta);
          if (claimed) {
            await sendConfirmationEmails(order);
          } else {
            // Lost the pending→confirmed claim. Re-read: a duplicate webhook that
            // lost to its twin (now confirmed) still resends idempotent emails; but
            // if the hourly expiry cancelled the order a moment before the payment
            // landed, alert the admin instead of telling the customer "confirmed".
            const { data: now } = await supabaseAdmin.from("orders").select("status").eq("id", order.id).maybeSingle();
            if (now?.status === "confirmed" || now?.status === "finished") {
              await sendConfirmationEmails(order);
            } else {
              await recordLatePayment(order, meta, `⚠️ Tagada "${type}" payment landed while this order was being ${now?.status ?? "removed"} (expiry race). Not fulfilled automatically — refund or fulfill manually.`);
            }
          }
        }
      } else {
        // Already confirmed (duplicate / synchronous-confirm backup) — resend only.
        await sendConfirmationEmails(order);
      }
    } catch (err) {
      console.error("Tagada webhook processing error:", err);
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
      // Configurable pill shown next to the homepage "Featured Products" heading.
      featured_banner:
        s?.featured_banner_active && s?.featured_banner_text
          ? {
              active: true,
              text: s.featured_banner_text as string,
              color: (s.featured_banner_color as string | null) ?? "#7c3aed",
            }
          : { active: false },
      // Self-serve referral program config (drives the public /referral page).
      referral_program: {
        active: !!s?.referral_program_active,
        buyer_discount: Number(s?.referral_buyer_discount ?? 10),
        bounty_amount: Number(s?.referral_bounty_amount ?? 100),
        bounty_orders: Number(s?.referral_bounty_orders ?? 5),
        min_order: Number(s?.referral_min_order ?? 0),
      },
      // Whether card checkout (TagadaPay) is live — sourced from the single
      // server flag so the storefront shows the "Pay with card" option without a
      // separate client build flag to keep in sync.
      tagada_enabled: process.env.TAGADA_CHECKOUT_ENABLED === "true",
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
